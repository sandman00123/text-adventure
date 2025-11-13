// public/js/app.js — optional dashboard helpers (signup/login/start/list)
const API = {
  signup: '/api/auth/signup',
  login: '/api/auth/login',
  start: '/api/start',
  list: '/api/adventures'
};

function setToken(t) { localStorage.setItem('token', t); }
function getToken() { return localStorage.getItem('token'); }

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken() || ''}` },
    body: JSON.stringify(body || {})
  });
  return res.json();
}

async function get(url) {
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken() || ''}` } });
  return res.json();
}

// Sign up
document.getElementById('btn-signup')?.addEventListener('click', async () => {
  const email = document.getElementById('su-email').value.trim();
  const password = document.getElementById('su-password').value.trim();
  const out = await post(API.signup, { email, password });
  if (out.token) { setToken(out.token); alert('Signed up!'); refreshList(); }
  else alert(out.error || 'Failed');
});

// Login
document.getElementById('btn-login')?.addEventListener('click', async () => {
  const email = document.getElementById('li-email').value.trim();
  const password = document.getElementById('li-password').value.trim();
  const out = await post(API.login, { email, password });
  if (out.token) { setToken(out.token); alert('Logged in!'); refreshList(); }
  else alert(out.error || 'Failed');
});

// Start
document.getElementById('btn-start')?.addEventListener('click', async () => {
  const genre = (document.getElementById('genre-select')?.value || '').trim();
  const out = await post(API.start, { genre });
  if (out.sessionId) {
    localStorage.setItem('current_adventure', String(out.sessionId));
    window.location.href = `/game.html#adventure=${out.sessionId}`;
  } else {
    alert(out.error || 'Failed to start');
  }
});

// List
async function refreshList() {
  const out = await get(API.list);
  const container = document.getElementById('adventure-list');
  if (!container) return;
  if (!out.adventures) { container.textContent = '—'; return; }
  container.innerHTML = '';
  out.adventures.forEach(a => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div><strong>ID:</strong> ${a.id}</div>
      <div><strong>Genre:</strong> ${a.genre}</div>
      <div><strong>Status:</strong> ${a.status}</div>
      <div><strong>Updated:</strong> ${a.updated_at}</div>
      <button data-id="${a.id}" class="resume">Resume</button>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll('.resume').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      window.location.href = `/game.html#adventure=${id}`;
    });
  });
}

document.getElementById('btn-refresh')?.addEventListener('click', refreshList);
refreshList();
// ===== Auto-load genres into the select dropdown =====
document.addEventListener('DOMContentLoaded', async () => {
  const select = document.getElementById('genre-select');
  if (!select) return;

  try {
    const res = await fetch('/api/genres');
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.genres)) {
      select.innerHTML = '<option value="">Failed to load genres</option>';
      return;
    }

    // Build option list from server data
    select.innerHTML = '<option value="">— pick —</option>';
    data.genres.forEach(genre => {
      const opt = document.createElement('option');
      opt.value = genre; // e.g. "post-apocalypse"
      opt.textContent = genre.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      select.appendChild(opt);
    });

  } catch (err) {
    console.error('Failed to fetch genres:', err);
    select.innerHTML = '<option value="">Failed to load genres</option>';
  }
});

