// public/js/history.js
(function(){
  const escapeHTML = (s) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const $ = (id) => document.getElementById(id);
  // --- auth helpers for History page ---
function getToken() {
  try { return localStorage.getItem('token') || null; } catch { return null; }
}
function authHeaders(opts = {}) {
  const h = new Headers();
  h.set('Accept', 'application/json');
  if (!opts.acceptOnly) h.set('Content-Type', 'application/json');
  const t = getToken();
  if (t) h.set('Authorization', 'Bearer ' + t);
  return h;
}

  document.addEventListener('DOMContentLoaded', () => {
    // Wire History button on the main page
    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
      historyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/history.html';
      });
    }

    // If we're on history.html, render the page
    const listEl = $('stories');
    const statusEl = $('historyStatus');
    if (listEl) {
      loadSummaries(listEl, statusEl);
      wireModal();
    }
  });

  async function loadSummaries(listEl, statusEl){
    try {
      setStatus(statusEl, 'Loading…');
      const res = await fetch('/api/history', { headers: authHeaders({ acceptOnly: true }) });
      if (res.status === 401) {
        setStatus(statusEl, 'Please sign in to view your saved history.');
        return;
      }      
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data || data.ok !== true) throw new Error(data?.error || 'Bad payload');

      const stories = Array.isArray(data.stories) ? data.stories : [];
      listEl.innerHTML = '';
      if (!stories.length) {
        setStatus(statusEl, 'No stories saved yet.');
        return;
      }
      statusEl.hidden = true;
      listEl.hidden = false;

      // Render summary cards
      for (const s of stories) {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <h3>${escapeHTML(s.genre || 'unknown')} — ${escapeHTML(s.main_quest || '(untitled quest)')}</h3>
          <div class="meta">
            <span>Turns: ${Number(s.turns ?? 0)}</span>
            <span class="badge ${s.completed ? 'ok' : ''}">${s.completed ? 'Completed' : 'Incomplete'}</span>
            <span class="badge ${s.dead ? 'err' : ''}">${s.dead ? 'Dead' : 'Alive'}</span>
            <span id="tuc-${s.id}" class="badge">Turns to completion: …</span>
          </div>
          <div class="row">
            <button class="btn viewStoryBtn" data-id="${s.id}" data-title="${escapeHTML(s.genre || '')} — ${escapeHTML(s.main_quest || '')}">View full story</button>
          </div>
        `;
        listEl.appendChild(card);

        // Asynchronously compute "turns until completion" (TUC)
        computeTurnsToCompletion(s.id).then(tuc => {
          const el = document.getElementById(`tuc-${s.id}`);
          if (el) el.textContent = `Turns to completion: ${tuc ?? 'Unknown'}`;
        }).catch(()=>{
          const el = document.getElementById(`tuc-${s.id}`);
          if (el) el.textContent = `Turns to completion: Unknown`;
        });
      }

      // Delegate for "View full story"
      listEl.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('.viewStoryBtn');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const title = btn.getAttribute('data-title') || 'Story';
        try {
          const r = await fetch(`/api/history/${encodeURIComponent(id)}`, { headers: authHeaders({ acceptOnly: true }) });
          const dj = await r.json();
          if (!dj.ok) { alert('Failed to load story'); return; }
          openModal(title, dj.story);
        } catch (e) {
          console.error(e);
          alert('Error loading story detail.');
        }
      });

    } catch (err) {
      console.error('History load error:', err);
      setStatus(statusEl, 'Error loading history. Make sure the server is running and /api/history exists.');
    }
  }

  async function computeTurnsToCompletion(id){
    try {
      const r = await fetch(`/api/history/${encodeURIComponent(id)}`);
      const dj = await r.json();
      if (!dj.ok || !dj.story) return null;
      const hist = Array.isArray(dj.story.history) ? dj.story.history : [];

      // Find the first assistant message that looks like an epilogue
      let epIndex = hist.findIndex(h => h.role === 'assistant' && /^Epilogue\b/i.test(String(h.content||'')));
      if (epIndex === -1) {
        // Heuristic fallback: last assistant entry that contains key closure words
        epIndex = hist.findIndex(h => h.role === 'assistant' && /\b(epilogue|the end|in the aftermath|in the days that followed)\b/i.test(String(h.content||'')));
      }
      if (epIndex === -1) return null;

      // Count user turns up to that point
      let users = 0;
      for (let i=0;i<=epIndex;i++){
        if (hist[i]?.role === 'user') users++;
      }
      return users;
    } catch {
      return null;
    }
  }

  // ---------- Modal & chat rendering
  function wireModal(){
    const modalBack = $('storyModal');
    const closeBtn = $('closeModalBtn');
    if (!modalBack || !closeBtn) return;
    closeBtn.addEventListener('click', () => modalBack.style.display = 'none');
    modalBack.addEventListener('click', (e) => { if (e.target === modalBack) modalBack.style.display = 'none'; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modalBack.style.display = 'none'; });
  }

  function openModal(title, story){
    const modalBack = $('storyModal');
    const chatView = $('chatView');
    const titleEl = $('storyTitle');
    if (!modalBack || !chatView || !titleEl) return;

    titleEl.textContent = title || 'Story';
    chatView.innerHTML = '';

    const hist = Array.isArray(story.history) ? story.history : [];
    for (const h of hist) {
      const role = String(h.role || '').toLowerCase();
      const content = escapeHTML(h.content || '');
      const msg = document.createElement('div');
      msg.className = 'msg ' + (role === 'user' ? 'from-user' : role === 'assistant' ? 'from-assistant' : 'from-system');

      const label = document.createElement('span');
      label.className = 'role';
      label.textContent = role;
      const body = document.createElement('div');
      body.innerHTML = content.replace(/\n/g, '<br>');

      msg.appendChild(label);
      msg.appendChild(body);
      chatView.appendChild(msg);
    }

    modalBack.style.display = 'flex';
  }

  function setStatus(el, msg){
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }
})();
