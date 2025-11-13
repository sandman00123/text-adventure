(function () {
  // ---- CONFIG ----
  // If true, we’ll check /api/store and hide ads when beta=true
  const RESPECT_BETA = true;

  // Placeholder images for now (replace with real ad code later)
  const LEFT_BANNERS = [
    '/images/ad-left-placeholder.jpg'
  ];
  const RIGHT_BANNERS = [
    '/images/ad-right-placeholder.jpg'
  ];

  // Optional rotation (ms). Set to 0 to disable rotation.
  const ROTATE_EVERY_MS = 0; // e.g., 30000 for 30s

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

    const shell = create('div', { id: 'ads-shell' }, []);
    const left  = create('div', { className: 'vertical-ad left' }, []);
    const right = create('div', { className: 'vertical-ad right' }, []);

    // initial images
    const leftImg  = create('img', { src: LEFT_BANNERS[0] || '', alt: 'Ad Left' });
    const rightImg = create('img', { src: RIGHT_BANNERS[0] || '', alt: 'Ad Right' });

    left.appendChild(leftImg);
    right.appendChild(rightImg);

    shell.appendChild(left);
    shell.appendChild(right);
    document.body.appendChild(shell);

    // optional rotation
    if (ROTATE_EVERY_MS > 0) {
      let li = 0, ri = 0;
      setInterval(() => {
        if (LEFT_BANNERS.length > 1) {
          li = (li + 1) % LEFT_BANNERS.length;
          leftImg.src = LEFT_BANNERS[li];
        }
        if (RIGHT_BANNERS.length > 1) {
          ri = (ri + 1) % RIGHT_BANNERS.length;
          rightImg.src = RIGHT_BANNERS[ri];
        }
      }, ROTATE_EVERY_MS);
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
