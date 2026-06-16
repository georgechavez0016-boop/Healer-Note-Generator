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

// Cooldown durations in seconds — used to prevent the same spell appearing
// more times in the note than the CD physically allows.
export const SPELL_COOLDOWNS: Record<number, number> = {
  // Restoration Druid
  740:    180, // Tranquility
  33891:  180, // Incarnation: Tree of Life
  391528: 120, // Convoke the Spirits
  197721:  60, // Flourish
  // Mistweaver Monk
  115310: 180, // Revival
  322118: 180, // Invoke Yu'lon
  325197: 180, // Invoke Chi-Ji
  443028:  60, // Celestial Conduit
  388615: 180, // Restoral
  // Preservation Evoker
  359816: 120, // Dream Flight
  363534: 240, // Rewind
  370537: 120, // Stasis
  370960: 120, // Emerald Communion
  406732:  60, // Spatial Paradox
  374227: 120, // Zephyr / Breath of Eons
  // Restoration Shaman
  98008:  180, // Spirit Link Totem
  114052: 180, // Healing Tide Totem
  207399: 300, // Ancestral Protection Totem
  108281: 120, // Ancestral Guidance
  320674:  60, // Chain Harvest
  374968:  45, // Primordial Wave
  16191:  180, // Mana Tide Totem
  // Holy Priest
  64843:  180, // Divine Hymn
  64901:   60, // Symbol of Hope
  265202: 600, // Holy Word: Salvation
  200183: 120, // Apotheosis
  47788:  180, // Guardian Spirit
  // Discipline Priest
  62618:  180, // Power Word: Barrier
  47536:   90, // Rapture
  246287:  90, // Evangelism
  271466: 180, // Luminous Barrier
  324724:  60, // Unholy Nova
  // Holy Paladin
  31821:  180, // Aura Mastery
  200652:  90, // Tyr's Deliverance
  375576:  60, // Divine Toll
  105809: 180, // Holy Avenger
  200025: 180, // Beacon of Virtue
  414127:  60, // Barrier of Faith
};

// Wowhead icon slugs for all tracked healer CDs — used as fallback when WCL doesn't return icon data
export const SPELL_ICONS: Record<number, string> = {
  // Restoration Druid
  740:    'spell_nature_tranquility',
  33891:  'ability_druid_treeoflife',
  391528: 'ability_druid_convokespirits',
  197721: 'ability_druid_flourish',
  // Mistweaver Monk
  115310: 'spell_monk_revival',
  322118: 'ability_monk_invokelutenstatue',
  325197: 'ability_monk_invoketigerstatue',
  443028: 'ability_monk_celestialconduit',
  388615: 'ability_monk_restoral',
  // Preservation Evoker
  359816: 'ability_evoker_dreamflight',
  363534: 'ability_evoker_rewind',
  370537: 'ability_evoker_stasis',
  370960: 'ability_evoker_emeraldcommunion',
  406732: 'ability_evoker_spatialparadox',
  374227: 'ability_evoker_breathofeons',
  // Restoration Shaman
  98008:  'spell_shaman_spiritlink',
  114052: 'ability_shaman_healingtide',
  207399: 'spell_nature_reincarnation',
  108281: 'ability_shaman_ancestralguidance',
  320674: 'ability_venthyr_chainharvestgeneric',
  374968: 'ability_shaman_primordialwave',
  16191:  'spell_nature_manaregentotem',
  // Holy Priest
  64843:  'spell_holy_divinehymn',
  64901:  'spell_holy_symbolofhope',
  265202: 'ability_priest_holywordsalvation',
  200183: 'ability_priest_apotheosis',
  47788:  'spell_holy_guardianspirit',
  // Discipline Priest
  62618:  'spell_holy_powerwordbarrier',
  47536:  'spell_holy_rapture',
  246287: 'ability_priest_evangelism',
  271466: 'ability_priest_luminousbarrier',
  // Holy Paladin
  31821:  'spell_holy_auramastery',
  200652: 'ability_paladin_tyrsdeliverance',
  375576: 'ability_paladin_divinetoll',
  105809: 'ability_paladin_holyavenger',
  200025: 'ability_paladin_beaconofvirtue',
  414127: 'ability_paladin_barrieroffaith',
};

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
