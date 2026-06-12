export interface DecodedArea {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
  chamber: boolean;
  stairUp: boolean;
  stairDown: boolean;
  special: number; // 0..5 (SPECIAL_* in data/areaCards)
}

/** Decode an area-card value into its exits, stairs, chamber flag and special type (spec §3.1). */
export function decodeArea(value: number): DecodedArea {
  return {
    n: (value & 1) !== 0,
    e: (value & 2) !== 0,
    s: (value & 4) !== 0,
    w: (value & 8) !== 0,
    chamber: (value & 16) !== 0,
    stairUp: (value & 32) !== 0,
    stairDown: (value & 64) !== 0,
    special: (value >> 7) & 7,
  };
}
