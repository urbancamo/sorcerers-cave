import { describe, it, expect } from "vitest";
import {
  decodeArea, newGame,
  SPECIAL_CANONICAL_CARD, SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_TOMB, SPECIAL_GREAT_HALL,
  SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL,
} from "./index";

describe("SPECIAL_CANONICAL_CARD", () => {
  it("has exactly one entry per real special (2-11), each decoding back to that special", () => {
    const ids = [
      SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_TOMB, SPECIAL_GREAT_HALL,
      SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL,
    ];
    expect(Object.keys(SPECIAL_CANONICAL_CARD).map(Number).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    for (const id of ids) {
      expect(decodeArea(SPECIAL_CANONICAL_CARD[id]!).special).toBe(id);
    }
  });

  it("every canonical card has all four exits, so a test placement always connects on its own merits", () => {
    for (const card of Object.values(SPECIAL_CANONICAL_CARD)) {
      const d = decodeArea(card);
      expect(d.n && d.e && d.s && d.w).toBe(true);
    }
  });
});

describe("newGame testMode flag", () => {
  it("is absent by default (byte-identical to today)", () => {
    const s = newGame(1, [0]);
    expect(s.testMode).toBeUndefined();
    expect("testMode" in s).toBe(false);
  });

  it("is set to true (never false) when requested", () => {
    const s = newGame(1, [0], undefined, true);
    expect(s.testMode).toBe(true);
  });
});
