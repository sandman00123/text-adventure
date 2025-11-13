// config/wildcardConfig.js
export default {
    enabled: true,                 // Wildcard is standard (always on)
    wordChance: 0.25,              // 25% per eligible word
    maxSwapsPerSentence: 1,        // hard cap per sentence
    minWordLength: 4,              // ignore tiny words even if not in stop list
    recentWindowSize: 50,          // avoid repeating the same spice too often
    allowMetaphor: false,          // keep conservative; can turn on later
    genre: 'post-apocalypse',      // for now we only target this genre
  
    // Clichés we try to avoid overusing in the replacement itself
    banList: ['wasteland','rusted','ash-choked','scavenger','mutated'],
  
    // UI / game words we never touch
    protectedTerms: ['HP','XP','Turn','Main Quest','Your move']
  };
  