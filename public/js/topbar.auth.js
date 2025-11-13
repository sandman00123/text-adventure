// public/js/topbar.auth.js — Auth widget against /api/auth/*
(function () {
  const sel = (s, r = document) => r.querySelector(s);

  // Elements
  const toggleBtn = sel('#auth-toggle-btn');
  const panel = sel('#auth-panel');
  const tabLogin = sel('#tab-login');
  const tabSignup = sel('#tab-signup');
  const formLogin = sel('#form-login');
  const formSignup = sel('#form-signup');
  const userChip = sel('#user-chip');
  const userEmailSpan = sel('#user-email');
  const signoutBtn = sel('#signout-btn');

  function show(el) { el.style.display = 'block'; }
  function hide(el) { el.style.display = 'none'; }
  function openPanel() { show(panel); }
  function closePanel() { hide(panel); }
  function togglePanel() { panel.style.display === 'block' ? closePanel() : openPanel(); }

  function setTab(which) {
    const isLogin = which === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabSignup.classList.toggle('active', !isLogin);
    formLogin.classList.toggle('active', isLogin);
    formSignup.classList.toggle('active', !isLogin);
  }

  function getToken() { return localStorage.getItem('token'); }
  function setToken(t) { localStorage.setItem('token', t); }
  function clearToken() { localStorage.removeItem('token'); }
  function getEmail() { return localStorage.getItem('email'); }
  function setEmail(e) { localStorage.setItem('email', e); }
  function clearEmail() { localStorage.removeItem('email'); }

  function loggedInUI(email) {
    hide(toggleBtn);
    hide(panel);
    userEmailSpan.textContent = email || 'Signed in';
    userChip.style.display = 'inline-flex';
  }
  function loggedOutUI() {
    show(toggleBtn);
    hide(panel);
    userChip.style.display = 'none';
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    let data;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const msg = data?.message || data?.error || `Request failed: ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  toggleBtn?.addEventListener('click', togglePanel);
  tabLogin?.addEventListener('click', () => setTab('login'));
  tabSignup?.addEventListener('click', () => setTab('signup'));

  formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = sel('#login-email').value.trim();
    const password = sel('#login-password').value;
    try {
      const data = await postJSON('/api/auth/login', { email, password });
      setToken(data.token);
      setEmail(email);
      loggedInUI(email);
      document.dispatchEvent(new CustomEvent('auth:login', { detail: { email } }));
    } catch (err) {
      alert(err.message);
    }
  });

  formSignup?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = sel('#signup-email').value.trim();
    const password = sel('#signup-password').value;
    try {
      await postJSON('/api/auth/signup', { email, password });
      const data = await postJSON('/api/auth/login', { email, password });
      setToken(data.token);
      setEmail(email);
      loggedInUI(email);
      document.dispatchEvent(new CustomEvent('auth:login', { detail: { email } }));
    } catch (err) {
      alert(err.message);
    }
  });

  signoutBtn?.addEventListener('click', () => {
    clearToken();
    clearEmail();
    loggedOutUI();
    document.dispatchEvent(new CustomEvent('auth:logout'));
  });

  // Init
  (function init() {
    setTab('login');
    const token = getToken();
    const email = getEmail();
    if (token && email) { loggedInUI(email); } else { loggedOutUI(); }
    // Clean up any legacy auth blocks if present
    document.querySelectorAll('.legacy-auth-block').forEach(n => n.remove());
  })();
})();
