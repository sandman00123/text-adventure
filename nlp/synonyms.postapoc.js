// nlp/synonyms.postapoc.js
// A compact, hand-tuned bank (verbs, nouns, adjectives, adverbs) for post-apocalypse.
// This is used BEFORE we ever consider descriptor-injection.

export const SYNONYMS = {
    // verbs
    "search": ["rummage","scour","probe","comb"],
    "searches": ["rummages","scours","probes","combs"],
    "searched": ["rummaged","scoured","probed","combed"],
    "searching": ["rummaging","scouring","probing","combing"],
  
    "carry": ["haul","lug","shoulder","drag"],
    "carries": ["hauls","lugs","shoulders","drags"],
    "carried": ["hauled","lugged","shouldered","dragged"],
    "carrying": ["hauling","lugging","shouldering","dragging"],
  
    "walk": ["trudge","limp","shuffle","stalk"],
    "walks": ["trudges","limps","shuffles","stalks"],
    "walked": ["trudged","limped","shuffled","stalked"],
    "walking": ["trudging","limping","shuffling","stalking"],
  
    "see": ["spot","sight","espy","notice"],
    "sees": ["spots","sights","espies","notices"],
    "saw": ["spotted","sighted","espied","noticed"],
  
    "say": ["murmur","rasp","mutter","growl"],
    "says": ["murmurs","rasps","mutters","growls"],
    "said": ["murmured","rasped","muttered","growled"],
  
    "look": ["peer","glance","scan","survey"],
    "looks": ["peers","glances","scans","surveys"],
    "looked": ["peered","glanced","scanned","surveyed"],
    "looking": ["peering","glancing","scanning","surveying"],
  
    // nouns
    "rifle": ["carbine","relic-rifle","boltgun","scrap-rifle"],
    "mall": ["shopping hull","arcade shell","atrium ruin","concourse"],
    "bus": ["coach","shuttle","transit husk","city carrier"],
    "road": ["causeway","strip","artery","span"],
    "city": ["grid","concrete hive","dead borough","civic shell"],
    "mask": ["respirator","filter rig","rag-mask","visor"],
    "armor": ["plates","patchwork mail","layered rig","scrap-mail"],
  
    // adjectives
    "broken": ["fractured","splintered","buckled","spidered"],
    "ruined": ["gutted","blasted","shattered","picked-over"],
    "small": ["meager","stingy","paltry","scant"],
    "silent": ["hushed","soundless","mute","dead-still"],
    "dark": ["lightless","sooted","pitch-black","coal-dim"],
  
    // adverbs
    "slowly": ["measuredly","wearily","haltingly","gingerly"],
    "quietly": ["softly","hushedly","mutedly","underbreath"]
  };
  
  // Descriptors we can inject for nouns if synonyms aren’t available.
  export const DESCRIPTORS = [
    "pitted","lichen-choked","sun-pocked","bone-white","oxide-veined",
    "frost-burned","burlap-wrapped","oil-caked","wire-lashed","tar-streaked",
    "silt-dusted","skeletonized","sputtering","buckled"
  ];
  