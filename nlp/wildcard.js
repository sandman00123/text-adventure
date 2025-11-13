// nlp/wildcard.js
import fs from 'fs';
import path from 'path';
import config from '../config/wildcardConfig.js';
import { SYNONYMS, DESCRIPTORS } from './synonyms.postapoc.js';

// Resolve data files (we’ll try to use your files if present)
const ROOT = process.cwd();
const DATA_NLP_DIR = path.join(ROOT, 'data', 'nlp');
const STOP_WORDS_PATH = path.join(DATA_NLP_DIR, 'stop_words.json');
const EXAMPLES_PATH   = path.join(DATA_NLP_DIR, 'postapoc_spice_examples.json');

// Lazy-load stop words & examples with safe fallbacks
let STOP = new Set([
  "a","about","above","after","again","against","all","am","an","and","any","are","as","at","be","because",
  "been","before","being","below","between","both","but","by","could","did","do","does","doing","down",
  "during","each","few","for","from","further","had","has","have","having","he","her","here","hers",
  "herself","him","himself","his","how","i","if","in","into","is","it","its","itself","me","more","most",
  "my","myself","no","nor","not","of","off","on","once","only","or","other","our","ours","ourselves","out",
  "over","own","same","she","should","so","some","such","than","that","the","their","theirs","them",
  "themselves","then","there","these","they","this","those","through","to","too","under","until","up","very",
  "was","we","were","what","when","where","which","while","who","whom","why","with","would","you","your",
  "yours","yourself","yourselves"
]);
try {
  if (fs.existsSync(STOP_WORDS_PATH)) {
    const arr = JSON.parse(fs.readFileSync(STOP_WORDS_PATH, 'utf8'));
    if (Array.isArray(arr)) STOP = new Set(arr.map(s => String(s).toLowerCase()));
  }
} catch {}

let EXAMPLES = [];
try {
  if (fs.existsSync(EXAMPLES_PATH)) {
    const arr = JSON.parse(fs.readFileSync(EXAMPLES_PATH, 'utf8'));
    if (Array.isArray(arr)) EXAMPLES = arr;
  }
} catch {}

// Pull adjectives we see used in examples (spiced vs base) to enrich descriptors
const exampleDescriptors = (() => {
  const out = new Set();
  for (const e of EXAMPLES) {
    const b = String(e.base || '');
    const s = String(e.spiced || '');
    // naive diff: look for tokens in spiced not present in base
    const bset = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
    for (const tok of s.toLowerCase().split(/\W+/)) {
      if (!tok || bset.has(tok)) continue;
      if (tok.length >= 4) out.add(tok);
    }
  }
  return Array.from(out);
})();

const DESCRIPTOR_POOL = [...new Set([...DESCRIPTORS, ...exampleDescriptors])];

// Utilities
const isNumberLike = (w) => /\d/.test(w);
const isAllCaps = (w) => w.length > 1 && w === w.toUpperCase();
const isCapitalized = (w) => /^[A-Z][a-z]/.test(w);
const lower = (s) => s.toLowerCase();
const keepCase = (src, repl) => {
  if (isAllCaps(src)) return repl.toUpperCase();
  if (/^[A-Z]/.test(src)) return repl.charAt(0).toUpperCase() + repl.slice(1);
  return repl;
};

function tokenizeSentences(text) {
  // split but keep delimiters
  const parts = String(text).split(/([.!?]+["')\]]*\s+)/);
  const res = [];
  for (let i = 0; i < parts.length; i += 2) {
    const sent = parts[i] || '';
    const tail = parts[i + 1] || '';
    if (sent.trim().length) res.push(sent + tail);
    else if (tail.trim().length) res.push(tail);
  }
  return res.length ? res : [text];
}

function tokenizeWords(s) {
  // preserve punctuation separately to reassemble
  const tokens = [];
  const regex = /([A-Za-z0-9'-]+|[^A-Za-z0-9\s])/g;
  let m;
  while ((m = regex.exec(s)) !== null) tokens.push(m[0]);
  return tokens;
}

function joinTokens(tokens) {
  // simple rule: attach punctuation w/o extra spaces
  let out = '';
  for (const t of tokens) {
    if (/^[A-Za-z0-9'-]+$/.test(t)) {
      if (out && /[A-Za-z0-9]$/.test(out)) out += ' ';
      out += t;
    } else {
      out += t;
    }
  }
  return out;
}

function eligibleWord(tok, idx, tokens, isFirst) {
  if (!/^[A-Za-z][A-Za-z0-9'-]*$/.test(tok)) return false;
  const L = lower(tok);
  if (STOP.has(L)) return false;
  if (L.length < config.minWordLength) return false;
  if (isNumberLike(tok)) return false;
  // Skip capitalized mid-sentence => likely name
  if (!isFirst && isCapitalized(tok)) return false;
  // Skip protected terms (case-insensitive substring match)
  for (const p of (config.protectedTerms || [])) {
    if (tok.toLowerCase().includes(p.toLowerCase())) return false;
  }
  return true;
}

function chooseSynonym(wordLower) {
  const candidates = SYNONYMS[wordLower];
  if (!candidates || !candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function nounDescriptor(nounLower) {
  const adj = DESCRIPTOR_POOL[Math.floor(Math.random() * DESCRIPTOR_POOL.length)];
  if (!adj) return null;
  // avoid banned clichés in descriptor
  if (config.banList?.some(b => adj.includes(b))) return null;
  return `${adj} ${nounLower}`;
}

function looksLikeNounContext(idx, toks) {
  // crude heuristics: after article/determiner or before punctuation/end
  const prev = (toks[idx - 1] || '').toLowerCase();
  if (['the','a','an','this','that','these','those','some','any'].includes(prev)) return true;
  const next = toks[idx + 1] || '';
  if (!next || /[^A-Za-z0-9]/.test(next)) return true;
  return false;
}

function updateRecent(session, word) {
  if (!session) return;
  if (!Array.isArray(session.wildcardRecent)) session.wildcardRecent = [];
  session.wildcardRecent.push(word.toLowerCase());
  const max = config.recentWindowSize || 50;
  while (session.wildcardRecent.length > max) session.wildcardRecent.shift();
}
function seenRecently(session, word) {
  if (!session || !Array.isArray(session.wildcardRecent)) return false;
  return session.wildcardRecent.includes(word.toLowerCase());
}

// MAIN: apply wildcard replacements to text
export function applyWildcardWordMode(text, opts = {}) {
  if (!config.enabled) return text;
  const sentences = tokenizeSentences(text);
  const out = [];

  for (const s of sentences) {
    const tokens = tokenizeWords(s);
    const isFirstWordCap = /^[A-Z]/.test((tokens.find(t => /^[A-Za-z]/.test(t)) || ''));
    let swaps = 0;

    for (let i = 0; i < tokens.length; i++) {
      if (swaps >= (config.maxSwapsPerSentence || 1)) break;

      const tok = tokens[i];
      if (!eligibleWord(tok, i, tokens, i === 0 && isFirstWordCap)) continue;

      // 25% chance roll
      if (Math.random() >= (config.wordChance || 0.25)) continue;

      const baseLower = lower(tok);

      // Try synonym first
      let replLower = chooseSynonym(baseLower);

      // If no synonym, try descriptor injection for nouns
      if (!replLower && looksLikeNounContext(i, tokens)) {
        const nd = nounDescriptor(baseLower);
        if (nd && nd.split(/\s+/).length <= 3) {
          // replace single noun token with two-token "adj noun"
          const adjNoun = nd.split(' ');
          // Preserve case on the first word if needed
          adjNoun[0] = keepCase(tok, adjNoun[0]);
          tokens.splice(i, 1, ...adjNoun);
          swaps += 1;
          // record recent words
          updateRecent(opts.session, adjNoun[0]);
          updateRecent(opts.session, adjNoun[1]);
          continue;
        }
      }

      if (!replLower) continue; // nothing to do

      // Guardrails: avoid clichés and recently used spices
      if (config.banList?.some(b => replLower.includes(b))) continue;
      if (seenRecently(opts.session, replLower)) continue;

      const finalWord = keepCase(tok, replLower);
      tokens[i] = finalWord;

      swaps += 1;
      updateRecent(opts.session, replLower);
    }

    out.push(joinTokens(tokens));
  }

  return out.join(' ');
}
