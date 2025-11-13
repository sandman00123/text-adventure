// public/game.js — fixed so story appends + shows "You:" and avoids missing resume endpoint

const log = document.getElementById('log');
const mainQuest = document.getElementById('main-quest');
const startBtn = document.getElementById('btn-start');
const genreSel = document.getElementById('genre-select');
const sendBtn = document.getElementById('send');
const actionInput = document.getElementById('action');
// (no module imports) we use authHeaders() + localStorage token  // [REPLACE line 9]


function getToken() {
  return localStorage.getItem('token');
}
function authHeaders() {
  const token = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function getAdventureIdFromHash() {
  const params = new URLSearchParams(location.hash.replace('#', ''));
  return params.get('adventure');
}
function setAdventureIdInHash(id) {
  const params = new URLSearchParams(location.hash.replace('#', ''));
  params.set('adventure', String(id));
  location.hash = params.toString();
}

// --- API calls ---
async function startAdventure() {
  if (window._startLocked) return;               // guard: ignore double-clicks
window._startLocked = true;                    // lock
const btn = document.getElementById('btn-start');
if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }
  console.log('startAdventure invoked');
  const genre = (genreSel?.value || '').trim();
  if (!genre) { alert('Please choose a genre.'); return; }

  const data = await AIUX.withLoader(() =>
    fetch('/api/start', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ genre, prefs: getPrefs() })
    }).then(r => r.json())
  );
  const btn2 = document.getElementById('btn-start');
if (btn2) btn2.style.display = 'none';

  window.currentSessionId = data.sessionId || data.adventure_id;
console.log('Session started:', window.currentSessionId);

  if (data?.error) { alert(data.error); return; }

  const newId = (data.sessionId ?? data.adventure_id);
  if (newId) setAdventureIdInHash(newId);

  // Show quest + opening
  if (mainQuest) mainQuest.textContent = `Main Quest: ${data.main_quest || '—'}`;
  const opening = data.opening ?? data.first?.text ?? '';
  await AIUX.renderStory(opening || '(No opening text)', { cps: 45 });

  // Enable input
  sendBtn?.removeAttribute('disabled');
  actionInput?.removeAttribute('disabled');
}
window.startAdventure = startAdventure;

async function postTurn(adventureId, action) {
  return await AIUX.withLoader(() =>
    fetch('/api/next', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ sessionId: String(adventureId), action, prefs: getPrefs() })
    }).then(r => r.json())
  );
}

if (window.refreshEnergyUI) window.refreshEnergyUI();
if (window.refreshEntitlements) window.refreshEntitlements();

// --- Initial load ---
if (actionInput) actionInput.placeholder = '';

async function init() {
  const adventureId = getAdventureIdFromHash();

  if (!adventureId) {
    await AIUX.renderStory('Pick a genre and press Start to begin.', { cps: 45 });
    sendBtn?.setAttribute('disabled', 'true');
    actionInput?.setAttribute('disabled', 'true');
    return;
  }

  // We are **not** calling a missing resume endpoint.
  // Just let the player continue with the next action.
  await AIUX.renderStory('Adventure loaded. Continue with your next action.', { cps: 45 });
  sendBtn?.removeAttribute('disabled');
  actionInput?.removeAttribute('disabled');
}

document.addEventListener('DOMContentLoaded', () => {
  const startBtnNow = document.getElementById('btn-start');
  if (startBtnNow) startBtnNow.addEventListener('click', startAdventure);
});


// ── STORE: helper functions ─────────────────────────────────────────────
function uid() { return 'dev-' + Date.now() + '-' + Math.floor(Math.random()*1e6); }

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  return r.json();
}

function getPrefs() {
  const s = document.getElementById('pref-sarcasm');
  const g = document.getElementById('pref-gore');
  const a = document.getElementById('pref-adult');
  return {
    sarcasm: !!(s && s.checked),
    gore:    !!(g && g.checked),
    adult:   !!(a && a.checked),
  };
}
// ── STORE: upgrade passes (standard/premium/ultimate) ───────────────────
document.querySelectorAll('.btn-upgrade').forEach(btn => {
  btn.addEventListener('click', async () => {
    const sku = btn.getAttribute('data-sku');
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Processing...';
    try {
      const out = await postJSON('/api/purchases/confirm', {
        receiptId: uid(),
        kind: 'subscription',
        sku,
        giftDays: 7
      });
      console.log('upgrade:', out);
      if (window.refreshEnergyUI) window.refreshEnergyUI();
      if (window.refreshEntitlements) window.refreshEntitlements();
      btn.textContent = 'Done!';
      setTimeout(() => { btn.textContent = original; }, 900);
    } catch (e) {
      console.warn('upgrade failed', e);
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = original; }, 1200);
    } finally {
      btn.disabled = false;
    }
  });
});

// ── STORE: one-time unlocks (remove_ads/mic/tts/mic_tts_bundle) ─────────
document.querySelectorAll('.btn-one').forEach(btn => {
  btn.addEventListener('click', async () => {
    const sku = btn.getAttribute('data-one');
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Processing...';
    try {
      const out = await postJSON('/api/purchases/confirm', {
        receiptId: uid(),
        kind: 'one_time',
        sku,
        giftDays: 7
      });
      console.log('one-time:', out);
      if (window.refreshEnergyUI) window.refreshEnergyUI();
      if (window.refreshEntitlements) window.refreshEntitlements();
      btn.textContent = 'Unlocked!';
      setTimeout(() => { btn.textContent = original; }, 1000);
    } catch (e) {
      console.warn('one-time failed', e);
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = original; }, 1200);
    } finally {
      btn.disabled = false;
    }
  });
});

// ── STORE: instant refill ───────────────────────────────────────────────
const $refill = document.getElementById('btn-instant-refill');
if ($refill) {
  $refill.addEventListener('click', async () => {
    const original = $refill.textContent;
    $refill.disabled = true; $refill.textContent = 'Refilling...';
    try {
      const out = await postJSON('/api/purchases/refill', { receiptId: uid(), giftDays: 7 });
      console.log('refill:', out);
      if (window.refreshEnergyUI) window.refreshEnergyUI();
      $refill.textContent = 'Full!';
      setTimeout(() => { $refill.textContent = original; }, 1000);
    } catch (e) {
      console.warn('refill failed', e);
      $refill.textContent = 'Failed';
      setTimeout(() => { $refill.textContent = original; }, 1200);
    } finally {
      $refill.disabled = false;
    }
  });
}

// ── STORE MODAL OPEN/CLOSE ─────────────────────────────────────────────────────
const $store = document.getElementById('store-modal');
const $openStore = document.getElementById('open-store');
const $closeStore = document.getElementById('close-store');

if ($openStore && $store) $openStore.addEventListener('click', () => { $store.style.display = 'flex'; });
if ($closeStore && $store) $closeStore.addEventListener('click', () => { $store.style.display = 'none'; });
if ($store) $store.addEventListener('click', (e) => { if (e.target === $store) $store.style.display = 'none'; });

// ── MIC / TTS BUTTONS ON COMPOSER ─────────────────────────────────────────────
const $mic = document.getElementById('btn-mic');
const $tts = document.getElementById('btn-tts');
// ---- MIC helpers (Web Speech Recognition) ----
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let _rec = null;
let _micTranscript = '';
window._micListening = false;

function micSupported() {
  return !!SpeechRecognition;
}
function micUI(on) {
  // button style
  if ($mic) {
    $mic.dataset.active = on ? '1' : '0';
    $mic.style.background = on ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)';
      // Pulse the action input only while the mic is recording
  if (actionInput) actionInput.classList.toggle('listening-live', !!on);
  }
  // input + send button
  if (on) {
    if (actionInput) {
      actionInput.placeholder = 'Listening… speak now';
    }
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.title = 'Stop Mic to send';
    }
  } else {
    if (actionInput) {
      actionInput.placeholder = '';
    }
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.title = '';
    }
  }
}

function micStop() {
  try { if (_rec) _rec.stop(); } catch {}
  window._micListening = false;
  micUI(false);
}
function micStart() {
  if (!micSupported()) return;
  _rec = new SpeechRecognition();
  _rec.continuous = true;
  _rec.interimResults = true;
  _rec.lang = 'en-US'; // change if you support more languages

  _micTranscript = '';
  window._micListening = true;
  micUI(true);

  _rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0]?.transcript || '';
      if (e.results[i].isFinal) _micTranscript += chunk + ' ';
      else interim += chunk;
    }
    // show live text in the input
    if (actionInput) actionInput.value = (_micTranscript + interim).trim();
  };
  _rec.onerror = (e) => {
    console.warn('mic error:', e?.error || e);
    micStop();
  };
  _rec.onend = () => {
    // recognition ended naturally or by stop()
    window._micListening = false;
    micUI(false);
  };

  try { _rec.start(); } catch (err) {
    console.warn('mic start failed:', err);
    micStop();
  }
}

// Safety: stop mic when tab hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden && window._micListening) micStop();
});

// ---- TTS helpers (SpeechSynthesis) ----
let _ttsUtter = null;
let _ttsSpeaking = false;

function ttsSupported() {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function ttsStop() {
  if (window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch {}
  }
  _ttsUtter = null;
  _ttsSpeaking = false;
  const $ttsBtn = document.getElementById('btn-tts');
  if ($ttsBtn) $ttsBtn.style.background = 'rgba(255,255,255,0.06)';
}

function ttsSpeak(text) {
  if (!ttsSupported() || !text) return;
  // Stop any current speech
  try { window.speechSynthesis.cancel(); } catch {}
  _ttsUtter = new SpeechSynthesisUtterance(text);
  // Optional tuning:
  _ttsUtter.rate = 1.0;   // (0.1 - 10)
  _ttsUtter.pitch = 1.0;  // (0 - 2)
  _ttsUtter.onend = () => { _ttsSpeaking = false; const b=document.getElementById('btn-tts'); if (b) b.style.background='rgba(255,255,255,0.06)'; };
  _ttsUtter.onerror = () => { _ttsSpeaking = false; const b=document.getElementById('btn-tts'); if (b) b.style.background='rgba(255,255,255,0.06)'; };
  window.speechSynthesis.speak(_ttsUtter);
  _ttsSpeaking = true;
  const $ttsBtn = document.getElementById('btn-tts');
  if ($ttsBtn) $ttsBtn.style.background = 'rgba(59,130,246,0.22)';
}

if ($mic) {
  // If browser does NOT support mic, disable now
  if (!micSupported()) {
    $mic.disabled = true;
    $mic.style.opacity = '0.5';
    $mic.style.cursor = 'not-allowed';
    $mic.title = 'Mic not supported in this browser';
  }

  $mic.addEventListener('click', () => {
    if (!micSupported()) return;
    if ($mic.disabled) return; // entitlement gate will set disabled
    if (window._micListening) micStop();
    else micStart();
  });
}
if ($tts) {
  // If browser does NOT support TTS, disable the button now
  if (!ttsSupported()) {
    $tts.disabled = true;
    $tts.style.opacity = '0.5';
    $tts.style.cursor = 'not-allowed';
    $tts.title = 'TTS not supported in this browser';
  }

  $tts.addEventListener('click', () => {
    if (!ttsSupported()) return;
    // Gate by entitlement/tier (your refreshEntitlements also manages disabled state)
    if ($tts.disabled) return;

    if (_ttsSpeaking) {
      // currently speaking -> stop
      ttsStop();
      return;
    }
    const text = (window._lastReplyText || '').trim();
    if (!text) {
      // fallback: try last story text in DOM
      const last = document.querySelector('.story .assistant:last-child, .story .line:last-child');
      const fallback = last ? (last.textContent || '').trim() : '';
      ttsSpeak(fallback || 'No reply to speak yet.');
    } else {
      ttsSpeak(text);
    }
  });
}

// ── ENTITLEMENT-DRIVEN ENABLE/DISABLE ─────────────────────────────────────────
window.refreshEntitlements = async function () {
  try {
    const r = await fetch('/api/player', { credentials: 'include' });
    const j = await r.json();
    const ent = j.entitlements || {};
    // Tone toggles ownership gates
const s = document.getElementById('pref-sarcasm');
const g = document.getElementById('pref-gore');
const a = document.getElementById('pref-adult');
const setGate = (el, owned, titleOwned, titleLocked) => {
  if (!el) return;
  el.disabled = !owned;
  const label = el.closest('label');
  if (label) label.style.opacity = owned ? '1' : '0.5';
  if (label) label.title = owned ? titleOwned : titleLocked;
};
setGate(s, !!ent.sarcasm, 'Sarcastic quips enabled', 'Buy Sarcasm in Store to enable');
setGate(g, !!ent.gore,    'Gore allowed (brief, non-gratuitous)', 'Buy Gore in Store to enable');
setGate(a, !!ent.adult,   '18+ tone enabled (mature themes/strong language)', 'Buy 18+ in Store to enable');

    const tier = String(j.tier || '').toLowerCase();
    

    const micAllowed = ent.mic || tier === 'premium' || tier === 'ultimate';
    const ttsAllowed = ent.tts || tier === 'premium' || tier === 'ultimate'; 
    const isFree = tier === 'free';
const adBtn = document.getElementById('energy-watch-ad');
if (adBtn) adBtn.style.display = isFree ? '' : 'none';

    if ($mic) {
            // Also block if the browser lacks support
      if (!micSupported()) { $mic.disabled = true; $mic.title = 'Mic not supported in this browser'; $mic.style.cursor='not-allowed'; $mic.style.opacity='0.5'; }
      $mic.disabled = !micAllowed;
      $mic.style.opacity = micAllowed ? '1' : '0.5';
      $mic.style.cursor = micAllowed ? 'pointer' : 'not-allowed';
      $mic.title = micAllowed ? 'Mic available' : 'Mic locked — upgrade in Store';
      // If mic is not allowed, make sure no "Listening" visuals remain
if (!micAllowed) {
  if (window._micListening) micStop();          // hard stop if somehow running
  if (actionInput) actionInput.placeholder = ''; // clear "Listening… speak now"
  if ($mic) {                                    // ensure button is visually not "active"
    $mic.dataset.active = '0';
    $mic.style.background = 'rgba(255,255,255,0.06)';
  }
}
    }
    if ($tts) {
      $tts.disabled = !ttsAllowed;
      $tts.style.opacity = ttsAllowed ? '1' : '0.5';
      $tts.style.cursor = ttsAllowed ? 'pointer' : 'not-allowed';
      $tts.title = ttsAllowed ? 'TTS available' : 'TTS locked — upgrade in Store';
    }
  } catch (e) {
    console.warn('refreshEntitlements failed', e);
  }
};

// call once on load
if (window.refreshEntitlements) window.refreshEntitlements();

 sendBtn?.addEventListener('click', async () => {
   // If input is already locked (text/image still generating), ignore clicks/Enter
   if (sendBtn.disabled) return;
 
   if (window._micListening) micStop();
   const adventureId = getAdventureIdFromHash();
   if (!adventureId) { alert('Start an adventure first.'); return; }
 
   const action = (actionInput?.value || '').trim();
   if (!action) return;
   actionInput.value = '';
 
   // 0) Lock input while the story + image are generating
   sendBtn.disabled = true;
   actionInput.disabled = true;
 
   // 1) Immediately show your line in the log, with spacing before & after
   if (AIUX.renderStory) await AIUX.renderStory('\n', { cps: 45 });  // blank line before
   if (AIUX.renderUser) AIUX.renderUser(action);
   if (AIUX.renderStory) await AIUX.renderStory('\n', { cps: 45 });  // blank line after
 
   // 2) Ask server for the next story chunk
   let out;
   try {
     out = await postTurn(adventureId, action);
   } catch (err) {
     console.error('postTurn error:', err);
     alert('Network error, please try again.');
     sendBtn.disabled = false;
     actionInput.disabled = false;
     return;
   }
 
   if (out?.error) {
     alert(out.error);
     sendBtn.disabled = false;
     actionInput.disabled = false;
     return;
   }
 
   window._sid   = out.adventure_id || out.sessionId || adventureId;
   window._jobId = out.image_job_id || null;
 
   // 3) Append ONLY the new reply (do not concatenate old text)
   const reply = out.reply || '(No reply text received)';
   ttsStop(); // stop any current speech before rendering a new reply
 
   // 3.6) Render the AI reply FIRST (so text appears immediately)
   await AIUX.renderStory(reply, { cps: 45 });
   window._lastReplyText = reply; // store latest assistant reply for TTS
 
   // 3.7) Create a placeholder + pulsing status UNDER that reply (no layout jump)
   const tail = document.getElementById('message-tail') || document.getElementById('log');
   const aiBlock = document.createElement('div');
   aiBlock.className = 'ai-block'; // styled in /css/game.css
 
   const placeholder = document.createElement('div');
   placeholder.className = 'ai-scene-placeholder'; // shimmer box
 
   const status = document.createElement('div');
   status.className = 'ai-image-status';    // pulsing chip
   status.textContent = 'Drawing scene…';
 
   aiBlock.appendChild(placeholder);
   aiBlock.appendChild(status);
   if (tail) tail.appendChild(aiBlock);
 
   // 3.8) Poll the server for the image (parallel job)
   let attempts = 0;
   async function pollImage() {
     try {
       attempts += 1;
       const r = await fetch(
         `/api/image_status?session=${encodeURIComponent(window._sid || adventureId)}&job_id=${encodeURIComponent(window._jobId || '')}`,
         { cache: 'no-store' }
       );
       const j = await r.json();
       if (j && j.ok && j.ready && j.image_url) {
         const img = document.createElement('img');
         img.src = j.image_url;
         img.alt = 'AI scene';
         img.loading = 'lazy';
         img.className = 'ai-scene-img'; // fades in via .visible
 
         placeholder.innerHTML = '';
         placeholder.appendChild(img);
         requestAnimationFrame(() => img.classList.add('visible')); // fade-in
 
         status.remove(); // remove the pulsing text
 
         // Unlock input once image is ready, unless the adventure is completed
         if (!window._adventureCompleted) {
           sendBtn.disabled = false;
           actionInput.disabled = false;
         }
         return; // done
       }
     } catch (err) {
       console.warn('poll image:', err);
     }
 
     // If we've tried for ~30 seconds, stop polling + unlock so player isn't stuck
     if (attempts >= 30) {
       status.textContent = 'Image took too long.';
       if (!window._adventureCompleted) {
         sendBtn.disabled = false;
         actionInput.disabled = false;
       }
       return;
     }
 
     setTimeout(pollImage, 1000); // try again in 1s
   }
 
   // Only poll if we actually have a job; otherwise unlock immediately after text
   if (window._jobId) {
     pollImage();
   } else {
     if (!window._adventureCompleted) {
       sendBtn.disabled = false;
       actionInput.disabled = false;
     }
   }
 
   // 3.5) Update the Energy HUD immediately after a successful turn
   if (window.refreshEnergyUI) window.refreshEnergyUI();
   if (window.refreshEntitlements) window.refreshEntitlements();
 
   // 4) If completed, show banner and keep input disabled
   if (out.completed) {
     await AIUX.renderStory('*** MAIN QUEST COMPLETED! ***', { cps: 45 });
     window._adventureCompleted = true;
     sendBtn.disabled = true;
     actionInput.disabled = true;
   }
 });

actionInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendBtn?.click();
  }
});

init();
// Handle "Save story to history" button
document.getElementById('saveStoryBtn').addEventListener('click', async () => {
  if (!window.currentSessionId) {
    alert('No active game session.');
    return;
  }
  if (!getToken()) { alert('Please sign in to save your history to your account.'); return; }
  try {
    const res = await fetch('/api/save-story', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ sessionId: window.currentSessionId })
    });
    const data = await res.json();
    if (data.ok) {
      alert('Story saved to history!');
    } else {
      alert('Failed to save: ' + data.error);
    }
  } catch (err) {
    alert('Error saving story.');
    console.error(err);
  }
  // ↓ Update the Energy HUD immediately after a successful turn
if (window.refreshEnergyUI) window.refreshEnergyUI();
if (window.refreshEntitlements) window.refreshEntitlements();

});

