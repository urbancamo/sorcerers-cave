export const SPECIAL_NONE = 0;
export const SPECIAL_GATEWAY = 1;
export const SPECIAL_DEEP_POOL = 2;
export const SPECIAL_VIPER_PIT = 3;
export const SPECIAL_TOMB = 4;
export const SPECIAL_GREAT_HALL = 5;

// Extension-kit specials (values 6-11) — the widened 4-bit `special` field (decode.ts, SC-EXT-3)
// accommodates them; every base AREA_CARDS value still decodes identically under the wider mask.
export const SPECIAL_CHASM = 6; // area-tile-x06-2
export const SPECIAL_BELL_ROPE = 7; // area-tile-x06-4
export const SPECIAL_LAIR = 8; // area-tile-x07-1
export const SPECIAL_WHIRLPOOL = 9; // area-tile-x07-2
export const SPECIAL_GALLERY = 10; // area-tile-x07-3
export const SPECIAL_WELL = 11; // area-tile-x07-4

/** The Gateway sits at index 21; it is removed from the pack and placed as the start. */
export const GATEWAY_INDEX = 21;

// 61 encoded card values in index order (Appendix A).
export const AREA_CARDS: readonly number[] = [
  111, 23, 77, 23, 79, 543, 671, 287, 31, 15, // 0-9
  29, 23, 9, 7, 11, 415, 9, 43, 75, 9, // 10-19
  9, 175, 39, 71, 14, 31, 27, 29, 67, 30, // 20-29
  14, 5, 69, 31, 23, 29, 30, 47, 46, 11, // 30-39
  3, 42, 31, 3, 78, 27, 10, 76, 15, 7, // 40-49 (idx 41: EWU=42; was 74/EWD, which has no tile)
  27, 45, 23, 13, 13, 12, 78, 10, 5, 12, // 50-59
  29, // 60
];

// 30 encoded extension tiles x01-1..x08-2 (manifest `tilesExtension` order), same bitfield as
// AREA_CARDS: bits 0-3 NESW, 16 chamber, 32 stairUp, 64 stairDown, special<<7 (widened to 4 bits,
// values 6-11 above). `buildLargePack` (decks.ts) appends this array before the shuffle when
// `variants.extensionKit` is set (SC-EXT-4).
export const EXT_AREA_CARDS: readonly number[] = [
  3, 23, 3, 23,            // x01: NE t, NES c, NE t, NES c
  39, 15, 71, 27,          // x02: NES t+U, NESW t, NES t+D, NEW c (x02-2/-3 reclassified tunnels, OQPX fix)
  31, 31, 31, 31,          // x03: NESW chambers
  9, 45, 31, 13,           // x04: NW t (QFAR fix), NSW t+U (OQPX fix), NESW c, NSW t
  14, 78, 6, 30,           // x05: ESW t, ESW t+D (x05-1/-2 reclassified tunnels, OQPX fix), ES t, ESW c
  12, 799, 46, 927,        // x06: SW t, chasm, ESW t+U (reclassified tunnel, OQPX fix), bell-rope
  1055, 1183, 1311, 1439,  // x07: lair, whirlpool, gallery, well
  10, 10,                  // x08: EW tunnels
];
