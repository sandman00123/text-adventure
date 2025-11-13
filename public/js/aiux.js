// public/js/aiux.js — loader + typewriter bridge
(function () {
  const byId = (id) => document.getElementById(id);

  function showLoader() {
    const el = byId('ai-loader');
    if (el) el.style.display = 'inline-flex';
  }
  function hideLoader() {
    const el = byId('ai-loader');
    if (el) el.style.display = 'none';
  }

  async function renderStory(text, opts = { cps: 45 }) {
    const el = byId('log');
    if (!el) return;
    await window.Typewriter.typeText(el, text || '', opts);
  }

  async function withLoader(task) {
    showLoader();
    try { return await task(); }
    finally { hideLoader(); }
  }

  window.AIUX = { showLoader, hideLoader, renderStory, withLoader };
})();
