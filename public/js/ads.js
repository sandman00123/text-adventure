(function () {
  // ---- CONFIG ----
  // If true, we’ll check /api/store and hide ads when beta=true
  const RESPECT_BETA = true;

  // Your AdSense IDs:
  const AD_CLIENT = 'ca-pub-7169143289133717'; // <-- REPLACE with your real ca-pub ID
  const LEFT_SLOT = '3495654779';             // <-- REPLACE with your left data-ad-slot
  const RIGHT_SLOT = '6222600907';            // <-- REPLACE with your right data-ad-slot

  // ---- helpers ----
  function create(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'style' && typeof attrs[k] === 'object') {
        Object.assign(el.style, attrs[k]);
      } else if (k in el) {
        el[k] = attrs[k];
      } else {
        el.setAttribute(k, attrs[k]);
      }
    }
    for (const c of children) {
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else if (c) el.appendChild(c);
    }
    return el;
  }

  async function isBetaMode() {
    if (!RESPECT_BETA) return false;
    try {
      const r = await fetch('/api/store', { cache: 'no-store' });
      const j = await r.json();
      return !!(j && j.beta);
    } catch {
      // If store endpoint not available, assume not beta to show ads
      return false;
    }
  }

  function injectShell() {
    // avoid duplicates
    if (document.getElementById('ads-shell')) return null;

    // Shell + side containers (CSS already handles sizing/position)
    const shell = create('div', { id: 'ads-shell' }, []);
    const left  = create('div', { className: 'vertical-ad left' }, []);
    const right = create('div', { className: 'vertical-ad right' }, []);

    // Create AdSense <ins> blocks for left and right
    const leftIns = create('ins', {
      className: 'adsbygoogle',
      style: { display: 'block', width: '120px', height: '100%' },
      'data-ad-client': AD_CLIENT,
      'data-ad-slot': LEFT_SLOT,
      'data-ad-format': 'auto',
      'data-full-width-responsive': 'false'
    });

    const rightIns = create('ins', {
      className: 'adsbygoogle',
      style: { display: 'block', width: '120px', height: '100%' },
      'data-ad-client': AD_CLIENT,
      'data-ad-slot': RIGHT_SLOT,
      'data-ad-format': 'auto',
      'data-full-width-responsive': 'false'
    });

    left.appendChild(leftIns);
    right.appendChild(rightIns);

    shell.appendChild(left);
    shell.appendChild(right);
    document.body.appendChild(shell);

    // Tell AdSense to render both ads
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('AdSense not loaded or failed to initialize:', e);
    }

    return shell;
  }

  // ---- main ----
  document.addEventListener('DOMContentLoaded', async () => {
    const beta = await isBetaMode();
    if (beta) {
      // In beta, do not show side ads at all
      return;
    }
    injectShell();
  });
})();
