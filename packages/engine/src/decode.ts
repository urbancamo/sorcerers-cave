export interface DecodedArea {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
  chamber: boolean;
  stairUp: boolean;
  stairDown: boolean;
  special: number; // 0..11 (SPECIAL_* in data/areaCards) — widened to 4 bits for the kit (SC-EXT-3)
}

/** Decode an area-card value into its exits, stairs, chamber flag and special type (spec §3.1).
 *  The `special` field is 4 bits (mask 15), widened from the original 3 bits (mask 7) to fit the
 *  extension kit's six new special-area codes (6-11): every base AREA_CARDS value is below 1024
 *  (bit 10 clear), so this widening decodes all 61 base cards identically to the old mask
 *  (SC-EXT-3, pinned by kit-data.test.ts). */
export function decodeArea(value: number): DecodedArea {
  return {
    n: (value & 1) !== 0,
    e: (value & 2) !== 0,
    s: (value & 4) !== 0,
    w: (value & 8) !== 0,
    chamber: (value & 16) !== 0,
    stairUp: (value & 32) !== 0,
    stairDown: (value & 64) !== 0,
    special: (value >> 7) & 15,
  };
}
