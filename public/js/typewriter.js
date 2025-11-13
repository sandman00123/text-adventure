// public/js/typewriter.js — simple character-by-character typer
window.Typewriter = (function () {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function typeText(el, fullText, opts = {}) {
    const cps = Math.max(1, opts.cps || 45);
    const delay = 1000 / cps;
    el.textContent = '';
    for (let i = 0; i < fullText.length; i++) {
      el.textContent += fullText[i];
      // NOTE: if you want faster dev-testing, lower the delay or skip sleep
      await sleep(delay);
    }
  }

  return { typeText };
})();
