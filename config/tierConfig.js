// config/tierConfig.js
// Centralized per-tier rules. Edit numbers here, not in business logic.

export const TIER_CONFIG = {
    free:     { key: 'free',     label: 'Free Pass',     cap: 30, refillMinsPerEnergy: 5.0, dailyGift: 3,  ads: true,  mic: false, tts: false, aiImages: false },
    standard: { key: 'standard', label: 'Standard Pass', cap: 45, refillMinsPerEnergy: 3.5, dailyGift: 8,  ads: false, mic: false, tts: false, aiImages: false },
    premium:  { key: 'premium',  label: 'Premium Pass',  cap: 60, refillMinsPerEnergy: 2.5, dailyGift: 15, ads: false, mic: true,  tts: true,  aiImages: false },
    ultimate: { key: 'ultimate', label: 'Ultimate Pass', cap: 85, refillMinsPerEnergy: 1.0, dailyGift: 20, ads: false, mic: true,  tts: true,  aiImages: true  },
  };
  
  // If an invalid tier sneaks in, fall back to Free.
  export function getTierOrDefault(tierKey) {
    if (!tierKey) return TIER_CONFIG.free;
    const key = String(tierKey).toLowerCase();
    return TIER_CONFIG[key] ?? TIER_CONFIG.free;
  }
  