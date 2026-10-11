import { describe, it, expect } from "vitest";
import { ALL_CREATURES, CREATURES, selectionCost } from "./data/creatures";
import { smallPackSibyl } from "./data/smallPack";
import { buildSmallPack } from "./decks";
import { newGame } from "./setup";
import { buildMpGame, partyView } from "./multi";
import { C_SIBYL, SIBYL_CODE } from "./sibyl";

/**
 * The Sibyl (SC-SIB-1): an optional small-pack card added by `variants.sibyl`. These tests pin the
 * data row, the deck composition and the variant plumbing — the rules live in sibyl-meeting /
 * sibyl-examine tests.
 */
const count = (pack: readonly number[], code: number) => pack.filter((c) => c === code).length;

describe("Sibyl data (SC-SIB-1)", () => {
  it("is creature 21 with all-zero stats, never selectable, never hostile, 1-4 indifferent / 5-6 friendly", () => {
    expect(C_SIBYL).toBe(21);
    expect(SIBYL_CODE).toBe(121);
    expect(ALL_CREATURES[21]).toEqual({
      id: 21, name: "Sibyl", fs: 0, mp: 0, carry: 0, cost: null, points: 0, flags: 0,
      hostileMax: 0, indiffMax: 4, leaderPri: 0,
    });
    expect(CREATURES).toHaveLength(14); // the pinned base table is untouched
    expect(selectionCost(21)).toBeNull();
    expect(selectionCost(21, { extensionKit: true })).toBeNull();
  });

  it("smallPackSibyl is the single card, code 121", () => {
    expect(smallPackSibyl()).toEqual([121]);
  });
});

describe("Sibyl deck composition", () => {
  it("variant off: no Sibyl card, and the pack is identical to before the variant existed", () => {
    expect(count(buildSmallPack(5).pack, 121)).toBe(0);
    expect(buildSmallPack(5, { sibyl: false })).toEqual(buildSmallPack(5));
  });

  it("variant on: exactly one Sibyl card (72 base, 102 with the kit)", () => {
    const base = buildSmallPack(5, { sibyl: true }).pack;
    expect(base).toHaveLength(72);
    expect(count(base, 121)).toBe(1);
    const kit = buildSmallPack(5, { sibyl: true, extensionKit: true }).pack;
    expect(kit).toHaveLength(102);
    expect(count(kit, 121)).toBe(1);
  });

  it("newGame stores the flag and deals the card into the chamber pile", () => {
    const g = newGame(7, [4, 6], { sibyl: true });
    expect(g.variants?.sibyl).toBe(true);
    expect(count(g.smallPack, 121)).toBe(1);
    expect(g.hasSibyl).toBeUndefined();
    expect(g.sibylMet).toBeUndefined();
  });

  it("a Sibyl-off newGame is unchanged: no variants key at all", () => {
    expect(newGame(7, [4, 6]).variants).toBeUndefined();
  });

  it("multiplayer: buildMpGame deals her into the shared pack and the composed party view carries the flag", () => {
    const seats = [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }];
    const mp = buildMpGame(11, seats, { sibyl: true });
    expect(mp.variants).toEqual({ sibyl: true });
    expect(count(mp.cave.smallPack, 121)).toBe(1);
    expect(partyView(mp, 0).variants).toEqual({ sibyl: true });
    const both = buildMpGame(11, seats, { sibyl: true, extensionKit: true });
    expect(partyView(both, 0).variants).toEqual({ extensionKit: true, sibyl: true });
  });
});
