export type HealerSpec =
  | 'RestorationDruid'
  | 'MistweaverMonk'
  | 'PreservationEvoker'
  | 'RestorationShaman'
  | 'HolyPriest'
  | 'DisciplinePriest'
  | 'HolyPaladin';

// Maps WCL class+spec strings to our internal spec type
export const WCL_SPEC_MAP: Record<string, HealerSpec> = {
  'Druid-Restoration':  'RestorationDruid',
  'Monk-Mistweaver':    'MistweaverMonk',
  'Evoker-Preservation':'PreservationEvoker',
  'Shaman-Restoration': 'RestorationShaman',
  'Priest-Holy':        'HolyPriest',
  'Priest-Discipline':  'DisciplinePriest',
  'Paladin-Holy':       'HolyPaladin',
};

export const SPEC_LABELS: Record<HealerSpec, string> = {
  RestorationDruid:  'Restoration Druid',
  MistweaverMonk:    'Mistweaver Monk',
  PreservationEvoker:'Preservation Evoker',
  RestorationShaman: 'Restoration Shaman',
  HolyPriest:        'Holy Priest',
  DisciplinePriest:  'Discipline Priest',
  HolyPaladin:       'Holy Paladin',
};

// Major cooldown spell IDs per spec
export const MAJOR_COOLDOWNS: Record<HealerSpec, number[]> = {
  RestorationDruid: [
    740,    // Tranquility
    33891,  // Incarnation: Tree of Life
    391528, // Convoke the Spirits
    197721, // Flourish
  ],
  MistweaverMonk: [
    115310, // Revival
    322118, // Invoke Yu'lon the Jade Serpent
    325197, // Invoke Chi-Ji the Red Crane
    443028, // Celestial Conduit (TWW)
    388615, // Restoral
  ],
  PreservationEvoker: [
    359816, // Dream Flight
    363534, // Rewind
    370537, // Stasis
    370960, // Emerald Communion
    406732, // Spatial Paradox (TWW)
    374227, // Breath of Eons
  ],
  RestorationShaman: [
    98008,  // Spirit Link Totem
    114052, // Healing Tide Totem
    207399, // Ancestral Protection Totem
    108281, // Ancestral Guidance
    320674, // Chain Harvest
    374968, // Primordial Wave (TWW)
  ],
  HolyPriest: [
    64843,  // Divine Hymn
    64901,  // Symbol of Hope
    265202, // Holy Word: Salvation
    200183, // Apotheosis
    47788,  // Guardian Spirit
  ],
  DisciplinePriest: [
    62618,  // Power Word: Barrier
    47536,  // Rapture
    246287, // Evangelism
    271466, // Luminous Barrier (Atonement AoE)
    324724, // Unholy Nova (Kyrian - legacy, may still appear)
  ],
  HolyPaladin: [
    31821,  // Aura Mastery
    200652, // Tyr's Deliverance
    375576, // Divine Toll
    105809, // Holy Avenger
    200025, // Beacon of Virtue
    414127, // Barrier of Faith (TWW)
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
  // Restoration Druid
  740:    'Tranquility',
  33891:  'Incarnation: Tree of Life',
  391528: 'Convoke the Spirits',
  197721: 'Flourish',
  // Mistweaver Monk
  115310: 'Revival',
  322118: "Invoke Yu'lon",
  325197: 'Invoke Chi-Ji',
  443028: 'Celestial Conduit',
  388615: 'Restoral',
  // Preservation Evoker
  359816: 'Dream Flight',
  363534: 'Rewind',
  370537: 'Stasis',
  370960: 'Emerald Communion',
  406732: 'Spatial Paradox',
  374227: 'Breath of Eons',
  // Restoration Shaman
  98008:  'Spirit Link Totem',
  114052: 'Healing Tide Totem',
  207399: 'Ancestral Protection Totem',
  108281: 'Ancestral Guidance',
  320674: 'Chain Harvest',
  374968: 'Primordial Wave',
  // Holy Priest
  64843:  'Divine Hymn',
  64901:  'Symbol of Hope',
  265202: 'Holy Word: Salvation',
  200183: 'Apotheosis',
  47788:  'Guardian Spirit',
  // Discipline Priest
  62618:  'Power Word: Barrier',
  47536:  'Rapture',
  246287: 'Evangelism',
  271466: 'Luminous Barrier',
  324724: 'Unholy Nova',
  // Holy Paladin
  31821:  'Aura Mastery',
  200652: "Tyr's Deliverance",
  375576: 'Divine Toll',
  105809: 'Holy Avenger',
  200025: 'Beacon of Virtue',
  414127: 'Barrier of Faith',
};
