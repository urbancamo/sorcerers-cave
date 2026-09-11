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

// Test Mode (§Test Mode): the one deck card value each real special decodes to — verified against
// AREA_CARDS/EXT_AREA_CARDS by test-mode.test.ts. Every entry happens to be a full 4-exit chamber
// card already, so a test-mode placement (map.ts) needs no orientation trick to connect.
export const SPECIAL_CANONICAL_CARD: Readonly<Record<number, number>> = {
  [SPECIAL_DEEP_POOL]: 287,
  [SPECIAL_VIPER_PIT]: 415,
  [SPECIAL_TOMB]: 543,
  [SPECIAL_GREAT_HALL]: 671,
  [SPECIAL_CHASM]: 799,
  [SPECIAL_BELL_ROPE]: 927,
  [SPECIAL_LAIR]: 1055,
  [SPECIAL_WHIRLPOOL]: 1183,
  [SPECIAL_GALLERY]: 1311,
  [SPECIAL_WELL]: 1439,
};

// Test Mode (§Test Mode, SC-Test-8): pseudo-"special" ids that let `testPlaceArea` place a PLAIN
// area tile — one ordinary chamber, and one tunnel per distinct exit combination that actually
// exists in the deck (every 2-, 3- and 4-way junction of N/E/S/W) — rather than only a real
// rulebook special. Numbered to continue directly after SPECIAL_WELL (11) so `testPlaceArea`'s
// range check stays a single contiguous interval (TILE_MIN..TILE_MAX); a placed plain tile always
// decodes `special: 0` (SPECIAL_NONE) — these ids exist only as this action's own tile selector,
// never as a real `DecodedArea.special` value. TILE_TUNNEL_ES is the one shape that exists ONLY on
// an extension-kit tile (x05-3, value 6) — every other id below has a same-shape base `AREA_CARDS`
// entry too — so it alone needs the kit-only gate in reduce.ts, regardless of its numeric position.
export const TILE_CHAMBER = 12;
export const TILE_TUNNEL_NE = 13;
export const TILE_TUNNEL_NS = 14;
export const TILE_TUNNEL_NW = 15;
export const TILE_TUNNEL_EW = 16;
export const TILE_TUNNEL_SW = 17;
export const TILE_TUNNEL_NES = 18;
export const TILE_TUNNEL_NEW = 19;
export const TILE_TUNNEL_NSW = 20;
export const TILE_TUNNEL_ESW = 21;
export const TILE_TUNNEL_NESW = 22;
export const TILE_TUNNEL_ES = 23; // extension-kit only (tile x05-3)

// Select any area tile — up/down variants (2026-09-11, SC-Test-9): a tunnel junction can be printed
// with a stairUp and/or stairDown in ADDITION to its lateral exits — e.g. the ESW tunnel exists as a
// plain card (14), one with a stair up (46), and one with a stair down (78). These ids name every
// such (shape, stairs) combination that actually exists in the deck, appended after the plain-shape
// ids above rather than interleaved, so those existing ids never renumber. Only tunnels with at
// least one printed stair variant get one; TILE_TUNNEL_NW and the kit-only TILE_TUNNEL_ES have none
// (every NW/ES tile in the deck is plain), so they gain no `_U`/`_D`/`_UD` siblings. Every value
// below comes from a BASE `AREA_CARDS` entry (verified by test-mode.test.ts), so none of these are
// kit-only, unlike TILE_TUNNEL_ES.
export const TILE_TUNNEL_NE_D = 24;
export const TILE_TUNNEL_NS_D = 25;
export const TILE_TUNNEL_EW_U = 26;
export const TILE_TUNNEL_SW_D = 27;
export const TILE_TUNNEL_NES_U = 28;
export const TILE_TUNNEL_NES_D = 29;
export const TILE_TUNNEL_NEW_U = 30;
export const TILE_TUNNEL_NEW_D = 31;
export const TILE_TUNNEL_NSW_U = 32;
export const TILE_TUNNEL_NSW_D = 33;
export const TILE_TUNNEL_ESW_U = 34;
export const TILE_TUNNEL_ESW_D = 35;
export const TILE_TUNNEL_NESW_U = 36;
export const TILE_TUNNEL_NESW_D = 37;
export const TILE_TUNNEL_NESW_UD = 38;

export const TILE_MIN = TILE_CHAMBER;
export const TILE_MAX = TILE_TUNNEL_NESW_UD;

// The one plain (no stairs, no special) deck card value for each pseudo-id above — verified
// against AREA_CARDS/EXT_AREA_CARDS by test-mode.test.ts, same pattern as SPECIAL_CANONICAL_CARD.
export const AREA_TILE_CANONICAL_CARD: Readonly<Record<number, number>> = {
  [TILE_CHAMBER]: 31, // NESW chamber — all four exits, so it connects on its own merits like a special
  [TILE_TUNNEL_NE]: 3,
  [TILE_TUNNEL_NS]: 5,
  [TILE_TUNNEL_NW]: 9,
  [TILE_TUNNEL_EW]: 10,
  [TILE_TUNNEL_SW]: 12,
  [TILE_TUNNEL_NES]: 7,
  [TILE_TUNNEL_NEW]: 11,
  [TILE_TUNNEL_NSW]: 13,
  [TILE_TUNNEL_ESW]: 14,
  [TILE_TUNNEL_NESW]: 15,
  [TILE_TUNNEL_ES]: 6,
  // Up/down variants (SC-Test-9) — same shapes as above, with a printed stairUp and/or stairDown.
  [TILE_TUNNEL_NE_D]: 67,
  [TILE_TUNNEL_NS_D]: 69,
  [TILE_TUNNEL_EW_U]: 42,
  [TILE_TUNNEL_SW_D]: 76,
  [TILE_TUNNEL_NES_U]: 39,
  [TILE_TUNNEL_NES_D]: 71,
  [TILE_TUNNEL_NEW_U]: 43,
  [TILE_TUNNEL_NEW_D]: 75,
  [TILE_TUNNEL_NSW_U]: 45,
  [TILE_TUNNEL_NSW_D]: 77,
  [TILE_TUNNEL_ESW_U]: 46,
  [TILE_TUNNEL_ESW_D]: 78,
  [TILE_TUNNEL_NESW_U]: 47,
  [TILE_TUNNEL_NESW_D]: 79,
  [TILE_TUNNEL_NESW_UD]: 111,
};
