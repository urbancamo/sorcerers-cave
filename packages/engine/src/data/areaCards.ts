export const SPECIAL_NONE = 0;
export const SPECIAL_GATEWAY = 1;
export const SPECIAL_DEEP_POOL = 2;
export const SPECIAL_VIPER_PIT = 3;
export const SPECIAL_TOMB = 4;
export const SPECIAL_GREAT_HALL = 5;

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
