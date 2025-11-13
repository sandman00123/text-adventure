// public/beta/beta.js
(function () {
  // Helpful marker in DevTools so you know the beta module loaded
  console.info('[Beta] beta.js loaded');

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function findStartRow() {
    // Prefer the real Start button by id
    const startBtn = document.getElementById('btn-start');
    if (!startBtn) return null;
    // Grab a reasonable container to insert after
    return startBtn.closest('.row') || startBtn.parentElement || null;
  }

  ready(() => {
    const row = findStartRow();
    if (!row) {
      console.warn('[Beta] Could not locate Start button row; Beta button not injected.');
      return;
    }

    // Avoid duplicates if hot reloads happen
    if (document.getElementById('btn-beta-note')) return;

    const startBtn = document.getElementById('btn-start');

    // Create the Beta button
    const betaBtn = document.createElement('button');
    betaBtn.id = 'btn-beta-note';
    betaBtn.type = 'button';
    betaBtn.textContent = 'Beta Info';
    betaBtn.className = (startBtn && startBtn.className) ? startBtn.className : 'btn-ui';

    // Place right after the Start button
    if (startBtn && startBtn.insertAdjacentElement) {
      startBtn.insertAdjacentElement('afterend', betaBtn);
    } else {
      row.appendChild(betaBtn);
    }

    // Simple modal for the note
    function openModal(html) {
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.55)',
        zIndex: '9999', display: 'flex', alignItems: 'center', justifyContent: 'center'
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) document.body.removeChild(overlay);
      });

      const card = document.createElement('div');
      Object.assign(card.style, {
        maxWidth: '640px', width: '90%', background: '#1b1b1b', color: '#fff',
        borderRadius: '14px', boxShadow: '0 12px 30px rgba(0,0,0,0.35)', padding: '20px', lineHeight: '1.5'
      });

      const content = document.createElement('div');
      content.innerHTML = html;

      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Close';
      close.className = 'btn-ui';
      close.style.marginTop = '16px';
      close.addEventListener('click', () => document.body.removeChild(overlay));

      card.appendChild(content);
      card.appendChild(close);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    }

    // Click handler: load beta note HTML (safe if missing)
    betaBtn.addEventListener('click', async () => {
      try {
        const r = await fetch('/beta/beta-note.html', { cache: 'no-store' });
        if (!r.ok) throw new Error('Missing beta-note.html');
        const html = await r.text();
        openModal(html);
      } catch {
        openModal('<h2>Beta</h2><p>No beta note found.</p>');
      }
    });
  });
})();
