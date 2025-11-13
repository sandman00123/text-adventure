// services/energy.js
// Server-authoritative energy math, including non-stackable +20% gift capacity.

import { getTierOrDefault } from '../config/tierConfig.js';

// Non-stackable +20% boost check
export function isBoostActive(boost) {
  if (!boost || typeof boost.percent !== 'number') return false;
  if (boost.percent !== 20) return false; // non-stackable: only 0 or 20 allowed
  if (!boost.expiresAt) return false;
  const now = Date.now();
  const exp = typeof boost.expiresAt === 'number' ? boost.expiresAt : new Date(boost.expiresAt).getTime();
  return exp > now;
}

// Effective maximum capacity (base cap × 1.20 if gift active)
export function getEffectiveMaxCapacity(user) {
  const tier = getTierOrDefault(user?.tier);
  const baseCap = Number(user?.energy?.maxBase ?? tier.cap);
  const boosted = isBoostActive(user?.boost);
  const mult = boosted ? 1.20 : 1.0;
  return Math.max(0, Math.floor(baseCap * mult));
}

// Apply time-based refill in-place; return summary
export function applyTimeRefill(user) {
  const now = Date.now();
  const tier = getTierOrDefault(user?.tier);

  // Initialize bucket if missing
  if (!user.energy) {
    user.energy = { current: tier.cap, maxBase: tier.cap, lastUpdateAt: now };
  } else {
    if (typeof user.energy.maxBase !== 'number') user.energy.maxBase = tier.cap;
    if (!user.energy.lastUpdateAt) user.energy.lastUpdateAt = now;
    if (typeof user.energy.current !== 'number') user.energy.current = tier.cap;
  }

  const effectiveMax = getEffectiveMaxCapacity(user);

  const elapsedMs = Math.max(0, now - Number(user.energy.lastUpdateAt));
  const elapsedMinutes = elapsedMs / 60000;

  const minsPerEnergy = Number(tier.refillMinsPerEnergy);
  const gained = Math.floor(elapsedMinutes / minsPerEnergy);

  let actuallyGained = 0;
  if (gained > 0) {
    const newCurrent = Math.min(effectiveMax, Number(user.energy.current) + gained);
    actuallyGained = newCurrent - Number(user.energy.current);
    user.energy.current = newCurrent;
    user.energy.lastUpdateAt = now; // only move if we actually gained
  }

  // Clamp down if boost expired and we’re above cap
  if (user.energy.current > effectiveMax) user.energy.current = effectiveMax;

  return { gained: actuallyGained, current: user.energy.current, effectiveMax };
}

// Spend helper (used in Step 2)
export function trySpend(user, amount = 1) {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const { current } = applyTimeRefill(user);
  if (current < amount) return false;
  user.energy.current = current - amount;
  return true;
}
