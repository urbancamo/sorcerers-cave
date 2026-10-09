// The 3-letter creature and treasure codes. These are the SAME codes as the game's line-printer log
// (apps/web/src/game/gameLog.ts), so a listing from the lab and a game log read alike; runlog.test.ts asserts they are equal.
export const CR3: Record<number, string> = {
  0: "HER", 1: "WHR", 2: "OGR", 3: "TRL", 4: "PRI", 5: "MAN", 6: "WMN", 7: "DWF", 8: "WIZ", 9: "SPC", 10: "DRG", 11: "SOR", 12: "GNT", 13: "UNI",
  14: "APR", 15: "DEM", 16: "LIO", 17: "SCH", 18: "WIT", 19: "THF", 20: "WLF",
};
export const TR3: Record<number, string> = {
  0: "SLV", 1: "GLD", 2: "GEM", 3: "SWD", 4: "CPT", 5: "LOT", 6: "BLM", 7: "TAL", 8: "POT", 9: "STF", 10: "RNG", 11: "RBY", 12: "FLT", 13: "EYE", 14: "CHT",
  15: "ELX", 16: "HLY", 17: "AXE", 18: "IDL", 19: "SCR", 20: "SHD", 21: "CRG",
};
