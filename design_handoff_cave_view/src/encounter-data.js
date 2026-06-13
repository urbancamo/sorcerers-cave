// encounter-data.js — rules data for the reveal beat (no DOM, no engine coupling)
// Hazard resolution order per spec §7.2
export const HAZARD_ORDER = ['Earthquake','Medusa','Ghouls','Mutiny','Trap'];
export const HAZARD_INFO = {
  Earthquake: { glyph:'⛰', line:'The passage behind you collapses into rubble.', kind:'quake' },
  Medusa:     { glyph:'𓁹', line:'Her gaze sweeps the chamber — roll for each member; 1–2 turns to stone.', kind:'medusa', roll:'medusa' },
  Ghouls:     { glyph:'☠', line:'Ghouls boil out of the dark and set upon the party.', kind:'ghouls', roll:'ghouls' },
  Mutiny:     { glyph:'⚔', line:'Your allies turn — they desert and join the strangers.', kind:'mutiny' },
  Trap:       { glyph:'▽', line:'The floor gives way. The party plunges a level deeper.', kind:'trap' },
};
// Stranger reaction/combat stats (spec §3.2) — keyed by creature name
export const CREATURE_STATS = {
  Hero:     { fs:5, mp:0, hostile:0, indiff:0, leader:7  },
  'W-Hero': { fs:4, mp:0, hostile:3, indiff:3, leader:7  },
  Dragon:   { fs:6, mp:0, hostile:6, indiff:6, leader:9,  note:'Always hostile.' },
  Wizard:   { fs:2, mp:5, hostile:1, indiff:5, leader:8,  note:'Casts from the dark.' },
  Ogre:     { fs:5, mp:0, hostile:4, indiff:5, leader:3,  note:'Brutish and strong.' },
  Troll:    { fs:4, mp:0, hostile:3, indiff:4, leader:2,  note:'Hunts in packs.' },
  Sorcerer: { fs:4, mp:9, hostile:6, indiff:6, leader:11, note:'The master himself.' },
  Spectre:  { fs:0, mp:5, hostile:5, indiff:6, leader:10, note:'Only magic can harm it.' },
  Giant:    { fs:7, mp:0, hostile:3, indiff:5, leader:4  },
  Unicorn:  { fs:0, mp:4, hostile:0, indiff:0, leader:0,  note:'Friendly to a Woman.' },
  Dwarf:    { fs:1, mp:0, hostile:0, indiff:0, leader:1  },
  Man:      { fs:3, mp:0, hostile:0, indiff:0, leader:5  },
  Woman:    { fs:2, mp:0, hostile:0, indiff:0, leader:5  },
  Priest:   { fs:2, mp:2, hostile:0, indiff:0, leader:6  },
};
