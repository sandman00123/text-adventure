// public/js/energy.ui.js
// Frontend HUD for the energy bar. Polls /api/player and updates the UI.
console.log('[EnergyHUD] loaded');

(function () {
    const $text = () => document.getElementById('energy-text');
    const $fill = () => document.getElementById('energy-fill');
    const $tier = () => document.getElementById('energy-tier-label');
    const $refill = () => document.getElementById('energy-refill');
    const $boost = () => document.getElementById('energy-boost');
    const $claim = () => document.getElementById('energy-claim-daily');
    const $watch = () => document.getElementById('energy-watch-ad');


function setClaimBusy(busy) {
  const btn = $claim();
  if (!btn) return;
  btn.disabled = !!busy;
  btn.style.opacity = busy ? '0.6' : '1';
  btn.style.cursor = busy ? 'not-allowed' : 'pointer';
}
function setWatchBusy(busy) {
    const btn = $watch();
    if (!btn) return;
    btn.disabled = !!busy;
    btn.style.opacity = busy ? '0.6' : '1';
    btn.style.cursor = busy ? 'not-allowed' : 'pointer';
  }
  
  
        async function fetchPlayer() {
      try {
        const options = { credentials: 'include' };

        // If game.js is loaded and authHeaders() exists, use it so the
        // request is tied to the signed-in Supabase user.
        if (typeof authHeaders === 'function') {
          options.headers = authHeaders();
        }

        const r = await fetch('/api/player', options);
        const j = await r.json().catch(() => null);
        return j && j.ok ? j : null;
      } catch (e) {
        console.warn('[EnergyHUD] fetchPlayer failed', e);
        return null;
      }
    }
  
    function applySnapshot(snap) {
      // snap = { energy:{current,effectiveMax,refillMinsPerEnergy}, tierLabel, gift:{active,...} }
      if (!snap) return;
      const ad = $watch?.();
    if (ad) {
        const tierKey = (snap.tier || '').toLowerCase();
        ad.style.display = tierKey === 'free' ? 'inline-block' : 'none';
        }

      const cur = Number(snap.energy?.current ?? 0);
      const max = Number(snap.energy?.effectiveMax ?? 0);
      const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((cur / max) * 100))) : 0;
  
      const t = $text();
      const f = $fill();
      const tl = $tier();
      const rf = $refill();
      const bs = $boost();
  
      if (t) t.textContent = `${cur} / ${max}`;
      if (f) f.style.width = `${pct}%`;
      if (tl) tl.textContent = `Tier: ${snap.tierLabel || '--'}`;
      if (rf) rf.textContent = `Refill: +1 / ${snap.energy?.refillMinsPerEnergy ?? '--'} min`;
      if (bs) {
        const active = Boolean(snap.gift?.active);
        bs.style.display = active ? 'inline' : 'none';
      }
      // Hide the "Watch ad" button for non-Free tiers
const adBtn = $watch?.();
if (adBtn) {
  const tierKey = String(snap.tier || '').toLowerCase();
  adBtn.style.display = tierKey === 'free' ? 'inline-block' : 'none';
  // Optional: tool tip to explain why hidden (if you later disable instead of hide)
  // adBtn.title = tierKey === 'free' ? 'Watch an ad for +5 energy' : 'No ads on this tier';
}

      // Optional: show amount in the button tooltip
const btn = $claim?.();
if (btn) {
  const amt = Number(snap.energy?.dailyGift || NaN);
  btn.title = isNaN(amt) ? 'Claim daily gift' : `Claim daily gift (+${amt})`;
}
    }
  
    async function refreshEnergyUI() {
      const data = await fetchPlayer();
      if (!data) return;
      applySnapshot({
        energy: data.energy,
        tier: data.tier,      
        tierLabel: data.tierLabel,
        gift: data.gift
      });
    }
  
    // Expose for other scripts to call after /api/next, purchases, etc.
    window.refreshEnergyUI = refreshEnergyUI;
  
    // Initial draw + gentle polling
    document.addEventListener('DOMContentLoaded', () => {
      refreshEnergyUI();
      // Poll every 30s so the bar grows over time without user actions
      setInterval(refreshEnergyUI, 30000);
        // Wire the "Claim daily" button
  const claimBtn = document.getElementById('energy-claim-daily');
  if (claimBtn) {
    claimBtn.addEventListener('click', async () => {
      try {
        setClaimBusy(true);
                const headers = (typeof authHeaders === 'function')
          ? authHeaders()
          : { 'Content-Type': 'application/json' };

        const r = await fetch('/api/energy/claim-daily', {
          method: 'POST',
          headers,
          credentials: 'include'
        });

        const j = await r.json().catch(() => null);

        if (r.ok && j && j.ok) {
          // success — refresh HUD to reflect new energy
          if (window.refreshEnergyUI) window.refreshEnergyUI();
          // brief visual feedback
          claimBtn.textContent = `Claimed +${j.claimed}`;
          setTimeout(() => (claimBtn.textContent = 'Claim daily'), 1500);
        } else {
          // already claimed or error
          const msg = j?.error === 'DAILY_ALREADY_CLAIMED'
            ? 'Already claimed. Try later.'
            : 'Claim failed.';
          claimBtn.textContent = msg;
          setTimeout(() => (claimBtn.textContent = 'Claim daily'), 1500);
        }
      } catch {
        claimBtn.textContent = 'Network error';
        setTimeout(() => (claimBtn.textContent = 'Claim daily'), 1500);
      } finally {
        setClaimBusy(false);
      }
    });
      // Wire the "Watch ad" button (stub: no SDK yet)
  const adBtn = document.getElementById('energy-watch-ad');
  if (adBtn) {
    console.log('[EnergyHUD] binding watch-ad button');
    adBtn.addEventListener('click', async () => {
      try {
        setWatchBusy(true);

        // In production: show ad, get token/receipt, send it here.
        // For now we send a dummy token so the server accepts it.
                const headers = (typeof authHeaders === 'function')
          ? authHeaders()
          : { 'Content-Type': 'application/json' };

        const r = await fetch('/api/ads/claim', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ token: 'dev-ok' })
        });

        const j = await r.json().catch(() => null);

        if (r.ok && j && j.ok) {
          if (window.refreshEnergyUI) window.refreshEnergyUI();
          adBtn.textContent = `+${j.claimed} added`;
          setTimeout(() => (adBtn.textContent = 'Watch ad (+5)'), 1500);
        } else {
          let msg = 'Ad failed';
          if (j?.error === 'AD_COOLDOWN') {
            const mins = Math.ceil((j.retryAfterMs || 0) / 60000);
            msg = `Try in ${mins}m`;
          } else if (j?.error === 'ADS_NOT_AVAILABLE_FOR_TIER') {
            msg = 'No ads on this tier';
          }
          adBtn.textContent = msg;
          setTimeout(() => (adBtn.textContent = 'Watch ad (+5)'), 1500);
        }
      } catch (e) {
        console.warn('watch-ad failed:', e);
        adBtn.textContent = 'Network error';
        setTimeout(() => (adBtn.textContent = 'Watch ad (+5)'), 1500);
      } finally {
        setWatchBusy(false);
      }
    });
  } else {
    console.warn('[EnergyHUD] watch-ad button not found');
  }

  }
    });
  })();
  