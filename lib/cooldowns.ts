export type HealerSpec =
  | 'RestorationDruid'
  | 'MistweaverMonk'
  | 'PreservationEvoker'
  | 'RestorationShaman';

// Maps WCL class+spec strings to our internal spec type
export const WCL_SPEC_MAP: Record<string, HealerSpec> = {
  'Druid-Restoration': 'RestorationDruid',
  'Monk-Mistweaver': 'MistweaverMonk',
  'Evoker-Preservation': 'PreservationEvoker',
  'Shaman-Restoration': 'RestorationShaman',
};

export const SPEC_LABELS: Record<HealerSpec, string> = {
  RestorationDruid: 'Restoration Druid',
  MistweaverMonk: 'Mistweaver Monk',
  PreservationEvoker: 'Preservation Evoker',
  RestorationShaman: 'Restoration Shaman',
};

// Major cooldown spell IDs per spec
export const MAJOR_COOLDOWNS: Record<HealerSpec, number[]> = {
  RestorationDruid: [
    740,    // Tranquility
    33891,  // Incarnation: Tree of Life
    391528, // Convoke the Spirits
    197721, // Flourish
    102693, // Rejuvenation (Soul of the Forest stacks - skip, too spammy)
  ],
  MistweaverMonk: [
    115310, // Revival / Restoral
    322118, // Invoke Yu'lon the Jade Serpent
    325197, // Invoke Chi-Ji the Red Crane
    443028, // August Dynasty / Celestial Conduit (TWW)
    388615, // Restoral (Dragonflight+)
  ],
  PreservationEvoker: [
    359816, // Dream Flight
    363534, // Rewind
    370537, // Stasis
    370960, // Emerald Communion
    406732, // Spatial Paradox (TWW talent)
    374227, // Breath of Eons / Echo variant
    374348, // Tip the Scales (sometimes used as CD marker)
  ],
  RestorationShaman: [
    98008,  // Spirit Link Totem
    114052, // Healing Tide Totem
    207399, // Ancestral Protection Totem
    108281, // Ancestral Guidance
    320674, // Chain Harvest
    374968, // Primordial Wave (TWW)
    16191,  // Mana Tide Totem
  ],
};

// Flat set of all tracked spell IDs for filter expressions
export const ALL_COOLDOWN_IDS: number[] = [
  ...new Set(Object.values(MAJOR_COOLDOWNS).flat()),
];

// Reverse map: spellId -> spec
export const SPELL_TO_SPEC: Record<number, HealerSpec> = {};
for (const [spec, spells] of Object.entries(MAJOR_COOLDOWNS)) {
  for (const id of spells) {
    SPELL_TO_SPEC[id] = spec as HealerSpec;
  }
}

export const SPELL_NAMES: Record<number, string> = {
  740: 'Tranquility',
  33891: 'Incarnation: Tree of Life',
  391528: 'Convoke the Spirits',
  197721: 'Flourish',
  102693: 'Rejuvenation',
  115310: 'Revival',
  322118: "Invoke Yu'lon",
  325197: 'Invoke Chi-Ji',
  443028: 'Celestial Conduit',
  388615: 'Restoral',
  359816: 'Dream Flight',
  363534: 'Rewind',
  370537: 'Stasis',
  370960: 'Emerald Communion',
  406732: 'Spatial Paradox',
  374227: 'Breath of Eons',
  374348: 'Tip the Scales',
  98008: 'Spirit Link Totem',
  114052: 'Healing Tide Totem',
  207399: 'Ancestral Protection Totem',
  108281: 'Ancestral Guidance',
  320674: 'Chain Harvest',
  374968: 'Primordial Wave',
  16191: 'Mana Tide Totem',
};
