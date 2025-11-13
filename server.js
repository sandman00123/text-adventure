//fetch('/api/purchases/confirm',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({receiptId:'dev-sub-ultimate-'+Date.now(),kind:'subscription',sku:'ultimate',giftDays:7})}).then(r=>r.json()).then(console.log)

// server.js — FULL FILE (fixed routes + persistent history)
// Features:
// 1) Side-quest scheduling per 10-turn block (70% => 1, 30% => 2; max 2; randomized turns)
// 2) Seamless endgame (hidden progress; chance ramps after turn 35; NPC-triggered; 2–3 steps; epilogue; continue world)
// 3) Health/Danger system via AI risk scoring (0–5). Health starts at 10. Death = permanent end; failure ≠ end
// 4) Persistent History: POST /api/save-story, GET /api/history, GET /api/history/:id (saved to data/saved_stories.json)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';   // add this import ONCE (skip if you already have it)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { applyWildcardWordMode } from './nlp/wildcard.js';
import { createClient } from '@supabase/supabase-js';   // [ADD at line 16]
// ---------------------------------------
// ---- ENERGY & TIER CONFIG ----
import { getTierOrDefault } from './config/tierConfig.js';
import { applyTimeRefill, getEffectiveMaxCapacity, trySpend } from './services/energy.js';
// --------------------------------


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));


// ---------- Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// ---------- OpenAI (optional)
console.log(
  "Using OpenAI key prefix:",
  (process.env.OPENAI_API_KEY || "").slice(0, 10)
);
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
// --- Supabase Admin (server-side) ---                         // [ADD below line 35]
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

let supabaseAdmin = null;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn('[WARN] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in .env. Auth will be guest-only.');
} else {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
}

// Optional auth: if a Bearer token exists, attach req.user; else continue as guest.
async function optionalAuth(req, res, next) {
  try {
    if (!supabaseAdmin) { req.user = null; return next(); }
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) { req.user = null; return next(); }
    const token = authHeader.slice(7);
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) { req.user = null; return next(); }
    req.user = data.user;  // { id, email, ... }
    next();
  } catch {
    req.user = null;
    next();
  }
}

/* ------------------------------------------------------------------------------------- */
/* ---------- USER STORE (persistent map) ---------- */
const _tempUsers = new Map(); // key: userId -> user record

// Load existing users from disk into the map (once at boot)
(() => {
  const initial = readUsersFile();
  for (const [id, u] of Object.entries(initial)) {
    _tempUsers.set(id, u);
  }
})();

function snapshotUsers() {
  const obj = {};
  for (const [id, u] of _tempUsers.entries()) obj[id] = u;
  return obj;
}

function getOrCreateUser(userId) {
  if (!_tempUsers.has(userId)) {
    const tier = 'free';
    _tempUsers.set(userId, {
      id: userId,
      tier,
      energy: null, // init on first applyTimeRefill
      boost: { percent: 0, expiresAt: null },  // non-stackable (0 or 20)
      entitlements: { adsRemoved: false, mic: false, tts: false, sarcasm: false, gore: false, adult: false },
      session: { turnsSinceLastImage: 0, nextImageAt: 0 },
      lastDailyGiftAt: null,
      lastAdClaimAt: null,
    });
    // Save immediately when a brand-new user is created
    saveUsersDebounced(snapshotUsers());
  }
  return _tempUsers.get(userId);
}
 // Normalize tone prefs against owned entitlements
 function normalizePrefs(prefs, ent) {
  
   const p = prefs || {};
   return {
     sarcasm: !!(p.sarcasm && ent?.sarcasm),
     gore:    !!(p.gore    && ent?.gore),
     adult:   !!(p.adult   && ent?.adult),
   };
}

/* ------------------------------------------------- */

// ---------- Data paths
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true }); // ensure data/ exists
const GENRES_PATH = path.join(DATA_DIR, 'genres.json');
const MAIN_QUESTS_ALL_PATH = path.join(DATA_DIR, 'main_quests.json');
const EVENTS_ALL_PATH      = path.join(DATA_DIR, 'events.json');
const PERSONALITIES_CANDIDATES = [
  path.join(DATA_DIR, 'personalties.json'),
  path.join(DATA_DIR, 'personalities.json')
];

// ---------- Persistent history file (disk)
const SAVED_STORIES_PATH = path.join(DATA_DIR, 'saved_stories.json');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
function readSavedStories() {
  try {
    const txt = fs.readFileSync(SAVED_STORIES_PATH, 'utf8');
    const json = JSON.parse(txt);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}
function writeSavedStories(arr) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SAVED_STORIES_PATH, JSON.stringify(arr, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write saved stories:', e);
    return false;
  }
}
// ---------- Users (disk) ----------
function readUsersFile() {
  try {
    const txt = fs.readFileSync(USERS_PATH, 'utf8');
    const obj = JSON.parse(txt);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}
function writeUsersFile(obj) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USERS_PATH, JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write users.json:', e);
    return false;
  }
}
// Debounced saver so we don't hammer disk
const saveUsersDebounced = (() => {
  let timer = null;
  return (obj) => {
    clearTimeout(timer);
    timer = setTimeout(() => { writeUsersFile(obj); }, 500);
  };
})();

// ---------- Small utils
function readJSON(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function extractPlaceholders(template) {
  const m = template.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
  return m.map(s => s.slice(1, -1));
}
function applyTemplate(template, vars) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (vars?.[k] ?? `{${k}}`));
}
function randomUniqueInts(k, minIncl, maxIncl) {
  const span = maxIncl - minIncl + 1;
  k = Math.min(Math.max(0, k), span);
  const pool = [];
  for (let i = minIncl; i <= maxIncl; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, k);
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const rndInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// ---------- Genres (allowed list)
const Genres = (() => {
  const j = readJSON(GENRES_PATH, { genres: [] }) || {};
  const arr = Array.isArray(j.genres) ? j.genres : j;
  const set = new Set(arr);
  const uiSlug  = (key) => key.replace(/_/g, '-');
  const fileKey = (ui)  => ui.replace(/-/g, '_');
  return { set, uiSlug, fileKey };
})();

// ---------- Load packs from consolidated files (supports your new format)
function loadGenrePacks(genreKey) {
  // Read the consolidated files
  const mqAll = readJSON(MAIN_QUESTS_ALL_PATH, { main_quests_by_genre: {} }) || {};
  const evAll = readJSON(EVENTS_ALL_PATH,      { events: {} }) || {};

  // Support your declared structure
  const mqMap =
    mqAll.main_quests_by_genre || mqAll.mainQuestsByGenre || {}; // tolerate camelCase just in case
  const evMap =
    evAll.events || evAll.events_by_genre || {};                  // tolerate events_by_genre just in case

  // Try a few key variants, just in case (underscore, hyphen, space)
  const candidates = [
    genreKey,                          // e.g., "post_apocalypse"
    genreKey.replace(/_/g, '-'),       // "post-apocalypse"
    genreKey.replace(/_/g, ' ')        // "post apocalypse"
  ];

  function pickArray(map) {
    for (const k of candidates) {
      const v = map && map[k];
      if (Array.isArray(v)) return v;
    }
    return [];
  }

  const mainQuests = pickArray(mqMap);
  const events     = pickArray(evMap);

  return { mainQuests, events };
}

// ---------- Load personalities
function loadPersonalities() {
  for (const p of PERSONALITIES_CANDIDATES) {
    const obj = readJSON(p, null);
    if (obj && Array.isArray(obj)) return obj;
    if (obj && Array.isArray(obj.personalities)) return obj.personalities;
  }
  return [];
}
const PERSONALITIES = loadPersonalities();

// ---------- Sessions (in-memory)
const sessions = Object.create(null);
const newId = () => 's_' + Math.random().toString(36).slice(2, 10);

// ---------- Persistent history (in-memory cache mirrored to disk)
let savedStories = readSavedStories();

// ---------- AI helpers
async function aiFillVariables({ genreUi, template, priorVars }) {
  const names = extractPlaceholders(template);
  if (!names.length) return { vars: { ...priorVars } };
  if (!openai) {
    const fallback = {};
    for (const n of names) fallback[n] = priorVars?.[n] || n.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return { vars: { ...(priorVars || {}), ...fallback } };
  }
  const system = `You fill variables for a text-adventure template.
Return JSON only: keys are the variable names, values are short, setting-appropriate strings.
Respect any prior variables for consistency.`;
  const user = JSON.stringify({ genre: genreUi, template, prior_vars: priorVars || {} });
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.8,
    max_tokens: 200
  });
  let obj = {};
  try { obj = JSON.parse(r.choices?.[0]?.message?.content || '{}'); } catch {}
  return { vars: { ...(priorVars || {}), ...obj } };
}

function inferGoalType(text) {
  const s = (text || '').toLowerCase();
  if (/\b(rescue|save|recover)\b/.test(s)) return 'rescue';
  if (/\b(defend|protect|defense|guard)\b/.test(s)) return 'defense';
  if (/\b(spy|infiltrat|stealth)\b/.test(s)) return 'spywork';
  if (/\b(revenge|vengeance|retaliat)\b/.test(s)) return 'revenge';
  if (/\b(escort|deliver|convoy)\b/.test(s)) return 'escort';
  if (/\b(negotiate|truce|alliance)\b/.test(s)) return 'diplomacy';
  if (/\b(salvage|repair|rebuild|generator|engine)\b/.test(s)) return 'engineering';
  if (/\b(map|chart|scout|route)\b/.test(s)) return 'exploration';
  if (/\b(medicine|fever|vaccine|cure)\b/.test(s)) return 'medical';
  return 'general';
}
function choosePersonality(mainQuestLine) {
  if (!Array.isArray(PERSONALITIES) || !PERSONALITIES.length) return null;
  const t = inferGoalType(mainQuestLine);
  const pool = PERSONALITIES.filter(p => Array.isArray(p.goalAffinity) && p.goalAffinity.includes(t));
  return (pool.length ? pick(pool) : pick(PERSONALITIES));
}
function traitsToStyle(traits = {}) {
  const entries = Object.entries(traits);
  if (!entries.length) return '';
  const top = entries
    .map(([k, v]) => [k, Number(v) || 0, Math.abs((Number(v)||0) - 5.5)])
    .sort((a, b) => b[2] - a[2])
    .slice(0, 5)
    .map(([k, v]) => `${k}:${v}`);
  return top.join(', ');
}
async function aiOpening({ genreUi, mainQuest, vars, personality, prefs }) {
  if (!openai) {
    const p = personality ? ` You’ll soon meet someone with traits [${traitsToStyle(personality.traits)}].` : '';
    return `Wind scrapes over broken concrete. ${mainQuest}.${p}`;
  }
     const sys = `You are a fast-paced, fun text-adventure narrator, make it short and precise.
Write a fresh opener for the given genre anchored to the main quest.

STYLE:
- Keep it energetic and easy to read (~10th-grade).
- Avoid genre clichés and obvious trope signals.
- Focus on concrete action or tactile details; minimal exposition (unless the user's actions indicate they want otherwise).
- 2–4 sentences total, about 50–80 words.
- You may hint at (or lightly foreshadow) an NPC aligned with the provided personality, but don’t dump traits.
- End with a natural nudge for the player to act.
- Each run should feel new in cadence and angle.

Apply optional tone_prefs if provided:
'sarcasm' = everything that is done and said in response is funny and crazy (not mean),
'gore' = describe injuries in detail. Increase intensity of the game (not gratuitous),
'adult' = stronger language/mature themes.
Different setting each run. End with a natural prompt for the player to act.

🚫 VERY IMPORTANT:
- NEVER restate, quote, summarize, or describe the player's input or actions in any form.
- Assume the player’s action already happened. Only describe **the world’s reaction, consequences, and next situation** that follow.
- Start directly with what happens next — not with "You" or any paraphrase of the player's command.`

  const user = JSON.stringify({
    genre: genreUi, main_quest: mainQuest, variables: vars,
    npc_personality_label: personality?.label || null,
    npc_personality_traits: personality?.traits || null,
    tone_prefs: { sarcasm: !!prefs?.sarcasm, gore: !!prefs?.gore, adult: !!prefs?.adult },
  });
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.85,
    max_tokens: 100,
    presence_penalty: 0.6,
  });
  return (r.choices?.[0]?.message?.content?.trim() || mainQuest);
}

function chooseSideEventTemplate(events, personality) {
  if (!Array.isArray(events) || !events.length) return null;
  if (!personality?.sideQuestBias) return pick(events);
  const bias = personality.sideQuestBias;
  const scored = events.map((tpl) => {
    const t = (tpl || '').toLowerCase();
    let w = 1.0;
    for (const [tag, weight] of Object.entries(bias)) {
      if (t.includes(tag.toLowerCase())) w += Math.max(0, Number(weight) || 0);
    }
    return { tpl, w };
  });
  const total = scored.reduce((sum, x) => sum + x.w, 0);
  let r = Math.random() * total;
  for (const s of scored) { if ((r -= s.w) <= 0) return s.tpl; }
  return scored[scored.length - 1].tpl;
}

// ----- Endgame helpers
function progressDeltaForAction(action) {
  const a = (action || '').toLowerCase();
  let delta = 1;
  if (/\b(rescue|save|escort|deliver|search|track|repair|build|decode|negotiate|sneak|defend|guard|map|scout|treat|heal|cure|fix)\b/.test(a)) delta += 2;
  if (/\b(ignore|wait|sleep|wander|look around)\b/.test(a)) delta += 0;
  return delta;
}
function endgameChanceForTurn(turns) {
  if (turns < 35) return 0;
  const extra = turns - 35;
  return clamp(0.10 + 0.02 * extra, 0, 0.60);
}
function constructEndgameTrigger(S) {
  const who = S.personality?.label || 'A figure you’ve been following';
  const reason = `Because of your earlier efforts (“${S.main_quest}”), their plan finally comes together.`;
  const stepsTotal = Math.random() < 0.5 ? 2 : 3;
  return { who, reason, stepsTotal };
}

async function aiContinue({ genreUi, mainQuest, vars, history, action, personality, sideTemplate, endgame, prefs }) {
  const npcHook = sideTemplate ? applyTemplate(sideTemplate, vars) : null;
  const endgameContext = endgame?.active ? {
    stage: endgame.stepsDone + 1, total: endgame.stepsTotal,
    who: endgame.triggeredBy, reason: endgame.reason
  } : null;

  if (!openai) {
    let base = `You do "${action}". The world reacts.`;
    if (endgameContext) base += ` ${endgameContext.who} advances the final plan (${endgameContext.stage}/${endgameContext.total}): ${endgameContext.reason}`;
    else if (npcHook) base += ` An NPC brings up: ${npcHook}`;
    base += ` (Main quest: ${mainQuest})`;
    return { text: base, sideQuestDetected: Boolean(npcHook) };
  }

     const sys = `You are a fast-paced, fun text-adventure narrator.
368: Continue the story in a concise, energetic way grounded in prior context and the player's action.
369: STYLE:
370: - Keep it clear (~10th-grade), avoid clichés and obvious trope signals.
371: - Minimal exposition; keep momentum with concrete actions or tactile details.
372: - 2–4 sentences, about 60–90 words total.
373: - If a side-quest hook exists, introduce it diegetically (no UI terms).
374: - If endgame is active, progress or acknowledge steps naturally.
375: - Keep NPC behavior consistent with the provided personality.
Apply optional tone_prefs if provided: 'sarcasm' = dry witty asides (not mean), 'gore' = brief vivid injury detail (not gratuitous), 'adult' = occasional stronger language/mature themes.
Keep NPC behavior aligned with the given personality.
376: - - Do NOT repeat or rephrase the player's action; only describe the world’s reaction to it.`;

  const soFar = history.filter(h => h.role === 'assistant').map(h => h.content).join('\n\n');
  const userPayload = {
    genre: genreUi, main_quest: mainQuest, variables: vars,
    story_so_far: soFar, player_action: action,
    npc_personality_label: personality?.label || null,
    npc_personality_traits: personality?.traits || null,
    side_quest_hook: npcHook || null, endgame: endgameContext,
    tone_prefs: { sarcasm: !!prefs?.sarcasm, gore: !!prefs?.gore, adult: !!prefs?.adult },
  };
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(userPayload) }],
    temperature: 0.9,
    presence_penalty: 0.6,
    max_tokens: 100, 
  });
  const text = r.choices?.[0]?.message?.content?.trim() || '';
  return { text: text || `You proceed. (Main quest: ${mainQuest})`, sideQuestDetected: Boolean(npcHook) };
}

async function aiEpilogue({ genreUi, mainQuest, vars, personality, endgame }) {
  if (!openai) {
    return `Epilogue: ${endgame.triggeredBy} brings closure. ${endgame.reason} The dust settles, but the world remains open if you choose to continue.`;
  }
  const sys = `Write a short epilogue (80–120 words), tying the ending to earlier events.
use clear sentences (~10th-grade reading level).
It should feel complete, but leave a subtle door open for future adventures in the same world.`;
  const user = JSON.stringify({
    genre: genreUi, main_quest: mainQuest, variables: vars,
    npc_personality_label: personality?.label || null,
    endgame_triggered_by: endgame?.triggeredBy || null,
    reason: endgame?.reason || null
  });
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.9,
    max_tokens: 220
  });
  return (r.choices?.[0]?.message?.content?.trim() || 'Epilogue.');
}
function postEpilogueHookText() {
  return `Months later, a new thread tugs at the edges of your world. Supplies shift hands, rumors harden into warnings, and a familiar call sign flickers back to life…`;
}

// ---------- Risk & Health
async function aiRiskScore(action, context) {
  const a = String(action || '').trim();
  if (!a) return 0;
  if (/\b(jump into|walk into|enter|charge into)\b.*\b(fire|firestorm|reactor|acid|void|airlock|radiation|minefield)\b/i.test(a)) {
    return 999;
  }
  if (!openai) {
    const s = a.toLowerCase();
    if (/\b(sneak|careful|hide|observe|wait|listen)\b/.test(s)) return 0;
    if (/\b(run|dash|hurry|push|climb|cross|enter)\b/.test(s)) return 2;
    if (/\b(fight|attack|charge|shoot|ambush|explode|detonate)\b/.test(s)) return 4;
    return 1;
  }
  const sys = `Rate physical risk of the player's action (0=safe..5=extremely dangerous). Return ONLY an integer 0-5.`;
  const user = JSON.stringify({ action: a, context });
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.0,
    max_tokens: 5
  });
  const raw = (r.choices?.[0]?.message?.content || '').trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 1;
}
function damageFromRisk(risk, opts = {}) {
  if (risk >= 999) return { instantDeath: true, dmg: 999 };
  let min = 0, max = 0, applyProb = 1.0;
  if (risk <= 1) { min = 0; max = 1; applyProb = 0.5; }
  else if (risk <= 3) { min = 2; max = 3; applyProb = 0.8; }
  else { min = 4; max = 5; applyProb = 1.0; }
  if (opts.sidequestTurn) { max = Math.min(5, max + 1); applyProb = Math.min(1, applyProb + 0.1); }
  if (Math.random() > applyProb) return { instantDeath: false, dmg: 0 };
  return { instantDeath: false, dmg: rndInt(min, max) };
}
/* ---------- PURCHASE IDEMPOTENCY (Step 5) ---------- */
// Use a global set so hot-reloads/double-pastes don't re-declare.
if (!globalThis.__TA_RECEIPTS__) {
  globalThis.__TA_RECEIPTS__ = new Set(); // of receiptId strings
}
const _usedReceipts = globalThis.__TA_RECEIPTS__;

function markReceiptUsed(receiptId) {
  if (!receiptId) return false;
  const key = String(receiptId);
  if (_usedReceipts.has(key)) return false;
  _usedReceipts.add(key);
  return true;
}
/* --------------------------------------------------- */
/* ---------- GIFT HELPERS (Step 5) ---------- */
function startOrExtendGift(user, extendDays = 7) {
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const addMs = Math.max(1, Number(extendDays)) * msPerDay;

  if (!user.boost || typeof user.boost !== 'object') {
    user.boost = { percent: 0, expiresAt: null };
  }

  // NON-STACKABLE: percent always 0 or 20
  user.boost.percent = 20;

  const currentExp = user.boost.expiresAt ? new Date(user.boost.expiresAt).getTime() : 0;
  const base = Math.max(now, currentExp); // extend from later of (now, current expiry)
  const newExp = base + addMs;

  user.boost.expiresAt = new Date(newExp).toISOString();
  return { percent: 20, expiresAt: user.boost.expiresAt };
}
/* ------------------------------------------- */
/* ---------- IMAGE HELPERS (Step 6) ---------- */
function clampTextForPrompt(s, max = 480) {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}
function ensureGeneratedDir() {
  const dir = path.join(__dirname, 'public', 'generated');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
/* ------------------------------------------- */

// ---------- Routes
// --- Store config (shared JSON) ---
const STORE_JSON_PATH = path.join(__dirname, 'public', 'config', 'store.json');
function readStoreJson() {
  try {
    const raw = fs.readFileSync(STORE_JSON_PATH, 'utf8');
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') throw new Error('bad json');
    return j;
  } catch (e) {
    // sane defaults if file missing
    return {
      beta: true,
      currency: 'USD',
      tiers: { standard: 0, premium: 0, ultimate: 0 },
      one_time: { remove_ads: 0, mic: 0, tts: 0, mic_tts_bundle: 0, sarcasm: 0, gore: 0, adult: 0, refill: 0 }
    };
  }
}

app.get('/api/store', (req, res) => {
  try {
    const j = readStoreJson();
    res.json({ ok: true, beta: !!j.beta, currency: j.currency || 'USD', tiers: j.tiers || {}, one_time: j.one_time || {} });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'STORE_CONFIG_FAILED' });
  }
});

// List all available genres for the UI (hyphenated slugs)
app.get('/api/genres', (req, res) => {
  try {
    // Convert file keys like "post_apocalypse" -> "post-apocalypse"
    const keys = Array.from(Genres.set || []);
    const uiList = keys.map(k => k.replace(/_/g, '-'));
    return res.json({ ok: true, genres: uiList });
  } catch (e) {
    console.error('Error in GET /api/genres:', e);
    return res.status(500).json({ ok: false, error: 'GENRES_LIST_FAILED' });
  }
});

/* ---------- PURCHASE: INSTANT REFILL (Step 5) ---------- */
/**
 * POST /api/purchases/refill
 * body: { receiptId?: string, giftDays?: number }
 * - Idempotent by receiptId (optional for dev; recommended in prod).
 * - Refills to effectiveMax (AFTER gift extension is applied).
 * - Applies non-stackable +20% gift by extending expiresAt (default +7 days).
 */
 app.post('/api/purchases/refill', optionalAuth, (req, res) => {
  try {
    const userId = req.user?.id ? String(req.user.id) : String(req.query.userId || 'demo');
    const user = getOrCreateUser(userId);

    // Initialize energy bucket if needed
    if (!user.energy) {
      const tier0 = getTierOrDefault(user.tier);
      user.energy = { current: tier0.cap, maxBase: tier0.cap, lastUpdateAt: Date.now() };
    }

    // ---- Idempotency (optional but good)
    const receiptId = (req.body && typeof req.body.receiptId === 'string') ? req.body.receiptId.trim() : '';
    if (receiptId && !markReceiptUsed(receiptId)) {
      return res.status(409).json({ ok: false, error: 'RECEIPT_ALREADY_USED' });
    }

    // Apply passive refill up to now (pre)
    applyTimeRefill(user);

    // Extend gift first (so refill goes to *boosted* cap)
    const giftDays = Number.isFinite(Number(req.body?.giftDays)) ? Number(req.body.giftDays) : 7;
    const gift = startOrExtendGift(user, giftDays);

    // Recompute effective cap with gift active
    const effectiveMax = getEffectiveMaxCapacity(user);

    // Refill to cap
    user.energy.current = effectiveMax;

    saveUsersDebounced(snapshotUsers());

    return res.json({
      ok: true,
      action: 'refill',
      gift,
      energy: {
        current: user.energy.current,
        effectiveMax,
        image_url: imageUrl || null,
      }
    });
  } catch (err) {
    console.error('Error in POST /api/purchases/refill:', err);
    return res.status(500).json({ ok: false, error: 'REFILL_FAILED' });
  }
});
/* -------------------------------------------------------- */
/* ---------- PURCHASE: CONFIRM (Step 5) ---------- */
/**
 * POST /api/purchases/confirm
 * body: {
 *   receiptId: string,          // idempotency key from your payment provider
 *   kind: 'subscription'|'one_time',
 *   sku:  string                // 'standard'|'premium'|'ultimate' OR 'remove_ads'|'mic'|'tts'|'mic_tts_bundle'
 *   giftDays?: number           // optional override; default 7
 * }
 *
 * Effects:
 * - subscription: sets user.tier to the chosen tier; updates base cap to tier.cap
 * - one_time: toggles entitlements (remove ads, mic, tts)
 * - always extends non-stackable +20% gift by +giftDays
 */
 app.post('/api/purchases/confirm', optionalAuth, (req, res) => {
  try {
    const userId = req.user?.id ? String(req.user.id) : String(req.query.userId || 'demo');
    const user = getOrCreateUser(userId);

    // Idempotency
    const receiptId = (req.body && typeof req.body.receiptId === 'string') ? req.body.receiptId.trim() : '';
    if (!receiptId) {
      return res.status(400).json({ ok: false, error: 'MISSING_RECEIPT_ID' });
    }
    if (!markReceiptUsed(receiptId)) {
      return res.status(409).json({ ok: false, error: 'RECEIPT_ALREADY_USED' });
    }

    const kind = String(req.body?.kind || '').toLowerCase();
    const sku  = String(req.body?.sku  || '').toLowerCase();
    const giftDays = Number.isFinite(Number(req.body?.giftDays)) ? Number(req.body.giftDays) : 7;

    // Initialize energy if needed
    if (!user.energy) {
      const tier0 = getTierOrDefault(user.tier);
      user.energy = { current: tier0.cap, maxBase: tier0.cap, lastUpdateAt: Date.now() };
    }

    // Apply passive refill pre-change
    applyTimeRefill(user);

    // Remember previous effective cap BEFORE changes (tier or gift)
    const prevEffectiveMax = getEffectiveMaxCapacity(user);

    let changed = {};

    if (kind === 'subscription') {
      // Track previous max capacity so we can refill only on expansion
const _prevMaxEnergy = (user.energy && typeof user.energy.maxBase === 'number') ? user.energy.maxBase : 0;
      // Preserve any one-time entitlements across tier changes
const _prevOneTimes = {
  sarcasm: !!user.entitlements?.sarcasm,
  gore:    !!user.entitlements?.gore,
  adult:   !!user.entitlements?.adult,
  remove_ads: !!user.entitlements?.adsRemoved,
  mic:     !!user.entitlements?.mic,
  tts:     !!user.entitlements?.tts,
};
      // --- Change tier
      const nextTier = getTierOrDefault(sku); // sku should be 'standard'|'premium'|'ultimate'
      user.tier = nextTier.key;

      // Update base cap to new tier.cap
      user.energy.maxBase = nextTier.cap;

      // Sync entitlements mirror
      user.entitlements.adsRemoved = !nextTier.ads;  // true when the tier has no ads
      user.entitlements.mic = !!nextTier.mic;
      user.entitlements.tts = !!nextTier.tts;

      // Re-apply preserved one-time entitlements (tier should not revoke purchases)
user.entitlements.sarcasm   = user.entitlements.sarcasm || _prevOneTimes.sarcasm;
user.entitlements.gore      = user.entitlements.gore    || _prevOneTimes.gore;
user.entitlements.adult     = user.entitlements.adult   || _prevOneTimes.adult;
// If your product strategy says remove_ads/mic/tts can be both tier OR one-time,
// prefer true if either grants it (already true because of || above)
user.entitlements.adsRemoved = user.entitlements.adsRemoved || _prevOneTimes.remove_ads;
user.entitlements.mic        = user.entitlements.mic        || _prevOneTimes.mic;
user.entitlements.tts        = user.entitlements.tts        || _prevOneTimes.tts;

// If capacity increased due to tier upgrade, fully refill to new max
if (user?.energy && typeof user.energy.maxBase === 'number') {
  const _newMax = user.energy.maxBase;
  if (_newMax > _prevMaxEnergy) {
    user.energy.current = _newMax;
  }
}

      changed = { tier: user.tier, maxBase: user.energy.maxBase, entitlements: { ...user.entitlements } };
    } else if (kind === 'one_time') {
      // --- Toggle specific entitlements
      if (sku === 'remove_ads') user.entitlements.adsRemoved = true;
      if (sku === 'mic')        user.entitlements.mic = true;
      if (sku === 'tts')        user.entitlements.tts = true;
      if (sku === 'mic_tts_bundle') { user.entitlements.mic = true; user.entitlements.tts = true; }
      if (sku === 'sarcasm')    user.entitlements.sarcasm = true;
      if (sku === 'gore')       user.entitlements.gore = true;
      if (sku === 'adult')      user.entitlements.adult = true;

      changed = { entitlements: { ...user.entitlements } };
    } else {
      return res.status(400).json({ ok: false, error: 'INVALID_KIND' });
    }

    // Gift: extend non-stackable +20% by giftDays
    const gift = startOrExtendGift(user, giftDays);

    // Recompute effective cap with (potentially) new tier + gift
    const effectiveMax = getEffectiveMaxCapacity(user);
    if (user.energy.current > effectiveMax) {
      user.energy.current = effectiveMax;
    }

    saveUsersDebounced(snapshotUsers());

    return res.json({
      ok: true,
      action: 'confirm',
      receiptId,
      changed,
      gift,
      energy: {
        current: user.energy.current,
        effectiveMax,
        baseCap: user.energy.maxBase,
      }
    });
  } catch (err) {
    console.error('Error in POST /api/purchases/confirm:', err);
    return res.status(500).json({ ok: false, error: 'PURCHASE_CONFIRM_FAILED' });
  }
});
/* -------------------------------------------------------- */

/* ---------- ENERGY: SPEND ENDPOINT (Step 2) ---------- */
/**
 * POST /api/energy/spend
 * body: { amount?: number }  // default 1
 * - Applies time-based refill first
 * - If current < amount => 402 INSUFFICIENT_ENERGY
 * - Else decrements and returns updated energy snapshot
 */
 app.post('/api/energy/spend', optionalAuth, (req, res) => {
  try {
    const amount = Number.isFinite(Number(req.body?.amount)) ? Number(req.body.amount) : 1;
    if (amount <= 0) return res.status(400).json({ ok: false, error: 'INVALID_AMOUNT' });

    const userId = req.user?.id ? String(req.user.id) : String(req.query.userId || 'demo');
    const user = getOrCreateUser(userId);

    // Ensure energy is initialized and refilled to now
    applyTimeRefill(user);

    if (user.energy.current < amount) {
      return res.status(402).json({
        ok: false,
        error: 'INSUFFICIENT_ENERGY',
        energy: {
          current: user.energy.current,
          effectiveMax: getEffectiveMaxCapacity(user),
        }
      });
    }

    user.energy.current -= amount;

    saveUsersDebounced(snapshotUsers());

    return res.json({
      ok: true,
      spent: amount,
      energy: {
        current: user.energy.current,
        effectiveMax: getEffectiveMaxCapacity(user),
      }
    });
  } catch (err) {
    console.error('Error in POST /api/energy/spend:', err);
    return res.status(500).json({ ok: false, error: 'ENERGY_SPEND_FAILED' });
  }
});
/* ----------------------------------------------------- */
/* ---------- ENERGY: DAILY GIFT (Step 3) ---------- */
/**
 * POST /api/energy/claim-daily
 * - One claim per 24h (rolling window).
 * - Gift amount is tier-based (TIER_CONFIG.*.dailyGift).
 * - Clamped to effectiveMax (includes +20% gift if active).
 */
 app.post('/api/energy/claim-daily', optionalAuth, (req, res) => {
  try {
    const userId = req.user?.id ? String(req.user.id) : String(req.query.userId || 'demo');
    const user = getOrCreateUser(userId);

    // Initialize energy on first call
    if (!user.energy) {
      const tier0 = getTierOrDefault(user.tier);
      user.energy = { current: tier0.cap, maxBase: tier0.cap, lastUpdateAt: Date.now() };
    }

    // Apply passive refill first
    applyTimeRefill(user);

    const tier = getTierOrDefault(user.tier);
    const now = Date.now();
    const last = user.lastDailyGiftAt ? new Date(user.lastDailyGiftAt).getTime() : 0;

    // rolling 24h window
    const elapsedMs = now - last;
    const canClaim = elapsedMs >= 24 * 60 * 60 * 1000 || last === 0;

    if (!canClaim) {
      const msRemaining = (24 * 60 * 60 * 1000) - elapsedMs;
      return res.status(429).json({
        ok: false,
        error: 'DAILY_ALREADY_CLAIMED',
        retryAfterMs: msRemaining,
        energy: {
          current: user.energy.current,
          effectiveMax: getEffectiveMaxCapacity(user),
        }
      });
    }

    // Amount from tier config
    const amount = Number(tier.dailyGift || 0);
    const effectiveMax = getEffectiveMaxCapacity(user);
    const before = user.energy.current;
    user.energy.current = Math.min(effectiveMax, before + amount);
    const actuallyAdded = user.energy.current - before;

    user.lastDailyGiftAt = new Date(now).toISOString();

    saveUsersDebounced(snapshotUsers());

    return res.json({
      ok: true,
      claimed: actuallyAdded,
      configuredAmount: amount,
      nextClaimInMs: 24 * 60 * 60 * 1000,
      energy: {
        current: user.energy.current,
        effectiveMax,
      }
    });
  } catch (err) {
    console.error('Error in POST /api/energy/claim-daily:', err);
    return res.status(500).json({ ok: false, error: 'DAILY_CLAIM_FAILED' });
  }
});
/* -------------------------------------------------- */
/* ---------- ENERGY: WATCH AD (Step 4) ---------- */
/**
 * POST /api/ads/claim
 * body: { token?: string }
 * - Free tier only (others get no ads).
 * - Cooldown (default 10 minutes) between claims.
 * - +5 energy, clamped to effectiveMax.
 * - This is a stub: in production, verify `token` from your ad provider.
 */
 app.post('/api/ads/claim', optionalAuth, (req, res) => {
  try {
    const userId = req.user?.id ? String(req.user.id) : String(req.query.userId || 'demo');
    const user = getOrCreateUser(userId);

    // Initialize energy on first call
    if (!user.energy) {
      const tier0 = getTierOrDefault(user.tier);
      user.energy = { current: tier0.cap, maxBase: tier0.cap, lastUpdateAt: Date.now() };
    }

    // Apply passive refill first
    applyTimeRefill(user);

    const tier = getTierOrDefault(user.tier);
    if (tier.key !== 'free') {
      return res.status(403).json({ ok: false, error: 'ADS_NOT_AVAILABLE_FOR_TIER' });
    }

    // --- Cooldown enforcement (10 minutes)
    const now = Date.now();
    const last = user.lastAdClaimAt ? new Date(user.lastAdClaimAt).getTime() : 0;
    const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
    const elapsed = now - last;
    if (elapsed < COOLDOWN_MS) {
      return res.status(429).json({
        ok: false,
        error: 'AD_COOLDOWN',
        retryAfterMs: COOLDOWN_MS - elapsed,
        energy: {
          current: user.energy.current,
          effectiveMax: getEffectiveMaxCapacity(user),
        }
      });
    }

    // --- (Stub) "verify" ad token (accept anything non-empty in dev)
    const token = (req.body && typeof req.body.token === 'string') ? req.body.token.trim() : '';
    if (token.length === 0) {
      // If you want to skip token in dev, comment this block out
      // return res.status(400).json({ ok: false, error: 'MISSING_AD_TOKEN' });
    }

    // --- Grant +5, clamped
    const effectiveMax = getEffectiveMaxCapacity(user);
    const before = user.energy.current;
    const AD_AMOUNT = 5;
    user.energy.current = Math.min(effectiveMax, before + AD_AMOUNT);
    const actuallyAdded = user.energy.current - before;

    // Record time
    user.lastAdClaimAt = new Date(now).toISOString();
    
    saveUsersDebounced(snapshotUsers());

    return res.json({
      ok: true,
      claimed: actuallyAdded,
      configuredAmount: AD_AMOUNT,
      cooldownMs: COOLDOWN_MS,
      energy: {
        current: user.energy.current,
        effectiveMax,
      }
    });
  } catch (err) {
    console.error('Error in POST /api/ads/claim:', err);
    return res.status(500).json({ ok: false, error: 'AD_CLAIM_FAILED' });
  }
});
/* -------------------------------------------------- */

/* ---------- PLAYER PROFILE & ENERGY (TIME REFILL) ---------- */
/**
 * GET /api/player?userId=demo
 * - Applies time-based refill server-side (Step 1).
 * - Returns energy, tier, and effectiveMax (cap incl. +20% gift if active).
 *
 * NOTE: For now we accept userId from query to make testing easy.
 * Later, replace this with your auth session (e.g., req.user.id).
 */
 app.get('/api/player', optionalAuth, (req, res) => {
  try {
    // Prefer authenticated user if present; fallback to query or 'demo'
    const userId = req.user?.id ? String(req.user.id) : String(req.query.userId || 'demo');
    const user = getOrCreateUser(userId);

    // Initialize base cap from tier once (if user.energy is null)
    if (!user.energy) {
      const tier = getTierOrDefault(user.tier);
      user.energy = { current: tier.cap, maxBase: tier.cap, lastUpdateAt: Date.now() };
    }

    // Apply refill and compute effective cap
    const refill = applyTimeRefill(user);
    const tier = getTierOrDefault(user.tier);

    return res.json({
      ok: true,
      userId,
      tier: tier.key,
      tierLabel: tier.label,
      energy: {
        current: user.energy.current,
        effectiveMax: refill.effectiveMax,
        baseCap: user.energy.maxBase,
        refillMinsPerEnergy: tier.refillMinsPerEnergy,
        gainedThisCall: refill.gained,
        lastUpdateAt: user.energy.lastUpdateAt,
      },
      gift: {
        // Non-stackable: active only when percent===20 and not expired
        active: user.boost?.percent === 20 && user.boost?.expiresAt && (new Date(user.boost.expiresAt).getTime() > Date.now()),
        percent: user.boost?.percent || 0,        // 0 or 20
        expiresAt: user.boost?.expiresAt || null, // null if inactive
      },
      entitlements: user.entitlements,
    });
  } catch (err) {
    console.error('Error in GET /api/player:', err);
    return res.status(500).json({ ok: false, error: 'PLAYER_FETCH_FAILED' });
  }
});
/* ----------------------------------------------------------- */

// START
app.post('/api/start', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || null; // null means guest
    const genreUi = String(req.body?.genre || '').trim() || 'post-apocalypse';
    const genreKey = genreUi.replace(/-/g, '_');
    if (!Genres.set.has(genreKey)) return res.status(400).json({ error: `Unsupported genre: ${genreUi}` });

    const { mainQuests, events } = loadGenrePacks(genreKey);
    if (!mainQuests.length) return res.status(400).json({ error: `No main quests found for genre ${genreUi}` });

    const chosen = pick(mainQuests);
    const filled = await aiFillVariables({ genreUi, template: chosen.quest, priorVars: null });
    const vars = filled.vars;
    const mainQuestLine = applyTemplate(chosen.quest, vars);

    // Resolve prefs against owned entitlements
    const playerId = req.user?.id || 'demo';
    const user = getOrCreateUser(playerId);
    const prefs = normalizePrefs((req.body && req.body.prefs) || {}, user.entitlements);

    const personality = choosePersonality(mainQuestLine);
    const opening = await aiOpening({ genreUi, mainQuest: mainQuestLine, vars, personality, prefs });

    const sid = newId();
    const spicedOpening = applyWildcardWordMode(opening, { session: null });

    sessions[sid] = {
      id: sid, genreUi, genreKey, main_quest: mainQuestLine, vars, events,
      personality: personality || null,
      history: [
        { role: 'system', content: `Main quest: ${mainQuestLine}` },
        { role: 'assistant', content: spicedOpening }
      ],
      turns: 0, sideQuestSlots: [],
      progress: 0,
      endgame: {
        active: false, stepsTotal: 0, stepsDone: 0, triggeredBy: null,
        reason: null, startedTurn: null, completed: false,
        epilogueShown: false, postEpilogueReady: false
      },
      wildcardRecent: [],
      health: 10, dead: false,
      imagesCount: 0,
      turnsSinceLastImage: 0,
      nextImageAt: Math.floor(1), // 4, 5, or 6
    };

     res.json({
   ok: true,
   sessionId: sid,
   genre: genreUi,
   main_quest: mainQuestLine,
   // keep the old nested shape for backwards-compat:
   first: { text: spicedOpening },
   // NEW: flat fields so the client can TTS immediately without parsing:
  opening_text: spicedOpening,
  tts_text: spicedOpening, // <— read this on your TTS button after /api/start
});

  } catch (err) {
    console.error('Error in /api/start:', err);
    res.status(500).json({ error: 'Failed to start adventure' });
  }
});

// NEXT
app.post('/api/next', optionalAuth, async (req, res) => {
  let imageUrl = null;
  try {
    const userId = req.user?.id || null; // null means guest
    const sid = String(req.body?.adventure_id || req.body?.sessionId || '').trim();
    const action = String(req.body?.action || '').trim();
    if (!sid || !sessions[sid]) return res.status(400).json({ error: 'Invalid or missing sessionId' });
    if (!action) return res.status(400).json({ error: 'Missing action' });

    const S = sessions[sid];
    if (!S.imageJobs) S.imageJobs = Object.create(null);  // per-session job map
    S.imageJobId = null;                                   // reset active job id for this turn

    if (S.dead) {
      return res.status(400).json({ error: 'Character is dead. Start a new session to play again.', dead: true, can_continue: false });
    }
        // ---------- ENERGY GATE (Step 2): spend 1 energy for this turn ----------
        {
          const playerId = userId || 'demo';
          const user = getOrCreateUser(playerId);
    
          // Initialize energy bucket if first time and apply refill to now
          if (!user.energy) {
            const tier = getTierOrDefault(user.tier);
            user.energy = { current: tier.cap, maxBase: tier.cap, lastUpdateAt: Date.now() };
          }
          applyTimeRefill(user);
    
          if (user.energy.current < 1) {
            return res.status(402).json({
              ok: false,
              error: 'INSUFFICIENT_ENERGY',
              energy: {
                current: user.energy.current,
                effectiveMax: getEffectiveMaxCapacity(user),
              }
            });
          }
    
          // Charge the player one energy to proceed
          user.energy.current -= 1;
        }
        // -----------------------------------------------------------------------

    // post-epilogue continuation reopen
    if (S.endgame.completed && S.endgame.epilogueShown && S.endgame.postEpilogueReady) {
      S.endgame = { active: false, stepsTotal: 0, stepsDone: 0, triggeredBy: null, reason: null, startedTurn: S.turns, completed: false, epilogueShown: false, postEpilogueReady: false };
      S.progress = Math.floor(S.progress * 0.25);
    }

    // turn & side-quest scheduling
    S.turns += 1;
    const blockTurn = ((S.turns - 1) % 10) + 1;
    if (blockTurn === 1) {
      const count = Math.random() < 0.7 ? 1 : 2;
      S.sideQuestSlots = randomUniqueInts(count, 1, 10).sort((a, b) => a - b);
    }

    // progress and possible endgame trigger
    S.progress += progressDeltaForAction(action);
    if (S.turns >= 35) S.progress += 1;
    const ENDGAME_THRESHOLD = 24;
    if (!S.endgame.active && !S.endgame.completed) {
      const chance = endgameChanceForTurn(S.turns);
      if (S.progress >= ENDGAME_THRESHOLD && Math.random() < chance) {
        const { who, reason, stepsTotal } = constructEndgameTrigger(S);
        S.endgame.active = true;
        S.endgame.stepsTotal = stepsTotal;
        S.endgame.stepsDone = 0;
        S.endgame.triggeredBy = who;
        S.endgame.reason = reason;
        S.endgame.startedTurn = S.turns;
      }
    }

    // side quest hook?
    let sideTemplate = null;
    const isSideQuestTurn = (!S.endgame.active && Array.isArray(S.sideQuestSlots) && S.sideQuestSlots.includes(blockTurn));
    if (isSideQuestTurn && Array.isArray(S.events) && S.events.length) {
      sideTemplate = chooseSideEventTemplate(S.events, S.personality);
      const filled = await aiFillVariables({ genreUi: S.genreUi, template: sideTemplate, priorVars: S.vars });
      S.vars = filled.vars;
      S.sideQuestSlots = S.sideQuestSlots.filter(n => n !== blockTurn);
    }

    // apply risk/health
    const riskScore = await aiRiskScore(action, { main_quest: S.main_quest, endgame_active: S.endgame.active, sidequest_turn: isSideQuestTurn });
    const dmgInfo = damageFromRisk(riskScore, { sidequestTurn: isSideQuestTurn });
    let deathNow = false, deathText = null;
    if (dmgInfo.instantDeath) {
      S.health = 0; S.dead = true; deathNow = true;
      deathText = `You act without regard for survival. The world answers, final and absolute. There is no coming back from this.`;
    } else if (dmgInfo.dmg > 0) {
      S.health = Math.max(0, S.health - dmgInfo.dmg);
      if (S.health <= 0) { S.dead = true; deathNow = true; deathText = `Your injuries overwhelm you. Darkness folds in as the noise of the wasteland fades.`; }
    }
    if (deathNow) {
      S.history.push({ role: 'user', content: action });
      S.history.push({ role: 'assistant', content: deathText });
      return res.json({ ok: true, reply: deathText, side_quest_detected: false, endgame_active: false, completed: false, dead: true, can_continue: false, turns: S.turns, health: S.health });
    }

    // endgame step progress?
    let progressEndgameThisTurn = false;
    if (S.endgame.active) {
      const a = action.toLowerCase();
      if (/\b(yes|accept|help|assist|fight|board|join|proceed|advance|go|run|charge|defend|negotiate|launch|activate|repair|broadcast|enter)\b/.test(a)) {
        progressEndgameThisTurn = true;
      }
    }

// Allow updating tone prefs mid-session (only if owned)
{
  const player = getOrCreateUser(userId || 'demo');
  S.prefs = normalizePrefs((req.body && req.body.prefs) || (S.prefs || {}), player.entitlements);
}

    // continue story
    // continue story
const { text } = await aiContinue({
  genreUi: S.genreUi, mainQuest: S.main_quest, vars: S.vars,
  history: S.history, action, personality: S.personality,
  sideTemplate, endgame: S.endgame.active ? { ...S.endgame } : null,
  prefs: S.prefs || { sarcasm:false, gore:false, adult:false }
});

// now spice the AI text (AFTER the call)
const spicedText = applyWildcardWordMode(text, { session: S });

// ---------- IMAGE GENERATION (parallel async job; per-turn job_id) ----------
try {
  const playerIdForImage = req.user?.id || 'demo';
  const userForImage = getOrCreateUser(playerIdForImage);
  const isUltimate = String(userForImage.tier || '').toLowerCase() === 'ultimate';

  S.turnsSinceLastImage = (S.turnsSinceLastImage || 0) + 1;

  if (isUltimate && S.turnsSinceLastImage >= (S.nextImageAt || 1)) {
    const prompt = clampTextForPrompt(
      `Scene from a ${S.genreUi} adventure.
       Main quest: ${S.main_quest}.
       Recent story: ${text}.
       Rendered in detailed cinematic style, natural lighting, realistic proportions.`
    );

    // Per-turn job id + initialize job entry as "pending"
    const jobId = `${S.id || sid}_${Date.now()}`;
    const fileName = `scene_${jobId}.webp`; // smaller transfer; still fine
    const filePath = path.join(ensureGeneratedDir(), fileName);

    // mark this turn's job as pending BEFORE launching
    S.imageJobs[jobId] = { ready: false, url: null, turn: S.turns };
    S.imageJobId = jobId;

    // run image generation AFTER we send the response
    (async () => {
      try {
        const img = await openai.images.generate({
          model: "gpt-image-1-mini",  // speed/price sweet spot
          prompt,
          size: "1024x1024"             // faster for gameplay; plenty sharp in UI
        });
        const b64 = img.data[0].b64_json;
        fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
        const publicUrl = `/generated/${fileName}`;

        // set this job as ready; DO NOT touch a global lastImageUrl
        S.imageJobs[jobId] = { ready: true, url: publicUrl, turn: S.turns };
        S.lastImageReadyAt = Date.now();
        console.log(`[AI IMAGE] Done → ${fileName} (job_id=${jobId})`);
      } catch (err) {
        console.warn('Image job failed:', err?.message || err);
        // keep entry but mark as not ready (client will keep polling until timeout)
      }
    })();

    // cadence for next image
    S.turnsSinceLastImage = 0;
    S.nextImageAt = 1;
  }
} catch (e) {
  console.warn('Image job launch failed:', e?.message || e);
}


    if (S.endgame.active && progressEndgameThisTurn) {
      S.endgame.stepsDone += 1;
      if (S.endgame.stepsDone >= S.endgame.stepsTotal) { S.endgame.active = false; S.endgame.completed = true; }
    }

    let epilogue = null, postEpilogueHook = null;
    if (S.endgame.completed && !S.endgame.epilogueShown) {
      epilogue = await aiEpilogue({ genreUi: S.genreUi, mainQuest: S.main_quest, vars: S.vars, personality: S.personality, endgame: S.endgame });
      S.endgame.epilogueShown = true;
      S.endgame.postEpilogueReady = true;
      postEpilogueHook = postEpilogueHookText();
    }

    S.history.push({ role: 'user', content: action });
    S.history.push({ role: 'assistant', content: spicedText });
    if (epilogue) S.history.push({ role: 'assistant', content: epilogue });
    
    res.json({
      ok: true,
      image_job_id: S.imageJobId || null,
      reply: spicedText,
      tts_text: spicedText,
      player_action: action,
      side_quest_detected: Boolean(sideTemplate),
      endgame_active: S.endgame.active,
      endgame_step: S.endgame.active ? S.endgame.stepsDone + 1 : 0,
      endgame_steps_total: S.endgame.active ? S.endgame.stepsTotal : 0,
      endgame_triggered_by: S.endgame.triggeredBy,
      endgame_reason: S.endgame.reason,
      completed: S.endgame.completed,
      epilogue: epilogue || null,
      can_continue: S.endgame.completed,
      post_epilogue_hook: postEpilogueHook,
      health: S.health,
      dead: S.dead,
      turns: S.turns,
      progress: S.progress,
      sideQuestsRemainingInBlock: Array.isArray(S.sideQuestSlots) ? S.sideQuestSlots.length : 0,
      // --- Energy snapshot (after spending 1 for this turn)
      energy_current: (() => {
        const playerId = req.user?.id || 'demo';
        const user = getOrCreateUser(playerId);
        return user.energy?.current ?? null;
      })(),
      energy_effectiveMax: (() => {
        const playerId = req.user?.id || 'demo';
        const user = getOrCreateUser(playerId);
        return getEffectiveMaxCapacity(user);
      })(),
          image_url: imageUrl || null,
    image_generated: Boolean(imageUrl),
    image_anchor_turn: imageUrl ? S.turns : null,  // <-- frontend: pin image here, append all future text below
    images_count: (S.imagesCount || 0),
    // image_filename: imageUrl ? imageUrl.split('/').pop() : null, // (optional helper)
    });

  } catch (err) {
    console.error('Error in /api/next:', err);
    res.status(500).json({ error: 'Failed to process turn' });
  }
});

app.post('/api/save-story', optionalAuth, async (req, res) => {
  try {
    // Require signed-in user for cloud save
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ ok: false, error: 'Sign in to save history by email.' });

    const sid = String(req.body?.sessionId || '').trim();
    if (!sid || !sessions[sid]) {
      return res.status(400).json({ ok: false, error: 'Invalid or missing sessionId' });
    }
    const S = sessions[sid];

    const row = {
      user_id: userId,
      session_id: sid,
      genre: S.genreUi,
      main_quest: S.main_quest,
      personality: S.personality?.label || null,
      turns: S.turns,
      completed: Boolean(S.endgame?.completed),
      dead: Boolean(S.dead),
      history: JSON.parse(JSON.stringify(S.history)) // JSONB safe clone
    };

    if (!supabaseAdmin) return res.status(500).json({ ok: false, error: 'Supabase not configured on server.' });

    const { data, error } = await supabaseAdmin.from('stories').insert(row).select('id,saved_at').single();
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ ok: false, error: 'Failed to persist story' });
    }

    return res.json({ ok: true, message: 'Story saved to your account history.', storyId: data.id, savedAt: data.saved_at });
  } catch (e) {
    console.error('Error in /api/save-story:', e);
    return res.status(500).json({ ok: false, error: 'Failed to save story' });
  }
});


app.get('/api/history', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ ok: false, error: 'Sign in to view your history.' });

    if (!supabaseAdmin) return res.status(500).json({ ok: false, error: 'Supabase not configured on server.' });

    const { data, error } = await supabaseAdmin
      .from('stories')
      .select('id,saved_at,genre,main_quest,turns,completed,dead')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false });

    if (error) {
      console.error('Supabase select error:', error);
      return res.status(500).json({ ok: false, error: 'Failed to load history' });
    }

    const summaries = (data || []).map(s => ({
      id: s.id,
      savedAt: s.saved_at,
      genre: s.genre,
      main_quest: s.main_quest,
      turns: s.turns,
      completed: s.completed,
      dead: s.dead
    }));

    return res.json({ ok: true, stories: summaries });
  } catch (e) {
    console.error('Error in /api/history:', e);
    return res.status(500).json({ ok: false, error: 'Failed to load history' });
  }
});

app.get('/api/history/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ ok: false, error: 'Sign in to view your story.' });

    const storyId = String(req.params.id || '').trim();
    if (!storyId) return res.status(400).json({ ok: false, error: 'Missing story id' });

    if (!supabaseAdmin) return res.status(500).json({ ok: false, error: 'Supabase not configured on server.' });

    const { data, error } = await supabaseAdmin
      .from('stories')
      .select('*')
      .eq('id', storyId)
      .eq('user_id', userId)
      .single();

    if (error || !data) return res.status(404).json({ ok: false, error: 'Story not found' });
    return res.json({ ok: true, story: data });
  } catch (e) {
    console.error('Error in /api/history/:id', e);
    return res.status(500).json({ ok: false, error: 'Failed to load story' });
  }
});

// ---------- Start server
app.listen(PORT, () => {
  console.log(`Story server running on http://localhost:${PORT}`);
  console.log(`POST /api/start to create a session.`);
});

// --- check image job status (scoped by job_id) ---
app.get('/api/image_status', (req, res) => {
  const sid = String(req.query.session || '').trim();
  const jobId = String(req.query.job_id || '').trim();
  const S = sessions[sid];
  if (!S) return res.json({ ok: true, ready: false, image_url: null });

  // Require job_id so each turn only picks up its own image
  if (!jobId || !S.imageJobs || !S.imageJobs[jobId]) {
    return res.json({ ok: true, ready: false, image_url: null });
  }

  const entry = S.imageJobs[jobId];
  return res.json({
    ok: true,
    ready: !!entry.ready,
    image_url: entry.ready ? entry.url : null,
    turn: entry.turn
  });
});

