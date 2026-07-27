import { describe, it, expect } from "vitest";
import { validatePicks, newGame } from "./setup";
import { selectionCost } from "./data/creatures";

const KIT = { extensionKit: true };

/**
 * Extension kit (SC-EXT-29, design US-01/§1.3 "Kit-on party selection"): `validatePicks` and
 * `newGame` route selection cost + stock through the variant-aware helpers (`selectionCost`,
 * `startingStock`, data/creatures.ts) so a kit-on game can field Witch/Scholar/Thief/Lion/Wolf and
 * the revised Ogre(4)/Troll(3) costs, while a kit-off game stays byte-identical to today (only ids
 * 0-7 selectable, Ogre 5 / Troll 4) — closing the gap left by setup.ts still being BASE-ONLY.
 */
describe("validatePicks — kit-off (byte-identity, SC-EXT-1)", () => {
  it("still accepts every base-game legal party exactly as before", () => {
    expect(validatePicks([0])).toBe(true); // Hero, cost 6
    expect(validatePicks([4, 6])).toBe(true); // Priest + Woman
  });
  it("rejects a kit-only creature (Witch, id 18) even though it has a defined cost in ALL_CREATURES", () => {
    expect(validatePicks([18])).toBe(false);
    expect(validatePicks([18], undefined)).toBe(false);
    expect(validatePicks([18], {})).toBe(false);
    expect(validatePicks([18], { extensionKit: false })).toBe(false);
  });
  it("rejects every other kit-only creature (Lion 16, Scholar 17, Thief 19, Wolf 20) kit-off", () => {
    for (const id of [16, 17, 19, 20]) expect(validatePicks([id])).toBe(false);
  });
  it("keeps Ogre at 5 and Troll at 4 (no kit-on discount) kit-off", () => {
    expect(validatePicks([2, 7])).toBe(true); // Ogre 5 + Dwarf 1 = 6
    expect(validatePicks([3, 7])).toBe(true); // Troll 4 + Dwarf 1 = 5
    expect(validatePicks([2, 2])).toBe(false); // 5 + 5 = 10 > 6 kit-off (no discount)
  });
});

describe("validatePicks — kit-on (SC-EXT-29)", () => {
  it("accepts Witch + Wolf under budget 6 (5 + 1 = 6) only when the kit is on", () => {
    expect(validatePicks([18, 20], KIT)).toBe(true);
    expect(validatePicks([18, 20])).toBe(false); // same picks, kit-off: invalid (unselectable ids)
  });
  it("accepts every kit starter alone, at its official cost", () => {
    expect(validatePicks([16], KIT)).toBe(true); // Lion, cost 2
    expect(validatePicks([17], KIT)).toBe(true); // Scholar, cost 3
    expect(validatePicks([18], KIT)).toBe(true); // Witch, cost 5
    expect(validatePicks([19], KIT)).toBe(true); // Thief, cost 3
    expect(validatePicks([20], KIT)).toBe(true); // Wolf, cost 1
  });
  it("still rejects Apprentice (14) and Demon (15) — never selectable, kit-on or off", () => {
    expect(validatePicks([14], KIT)).toBe(false);
    expect(validatePicks([15], KIT)).toBe(false);
  });
  it("applies the Ogre 5→4 / Troll 4→3 kit-on revision", () => {
    expect(validatePicks([2, 20], KIT)).toBe(true); // Ogre (4 kit-on) + Wolf (1) = 5
    expect(validatePicks([2, 20])).toBe(false); // same picks kit-off: Wolf unselectable
    expect(validatePicks([3, 3], KIT)).toBe(true); // two Trolls, 3+3=6 kit-on only
    expect(validatePicks([3, 3])).toBe(false); // 4+4=8 > 6 kit-off
  });
  it("honours kit stock limits — Witch×3, Lion/Scholar/Thief/Wolf×1", () => {
    expect(validatePicks([16, 16], KIT)).toBe(false); // only 1 Lion in stock
    expect(validatePicks([18, 18], KIT)).toBe(false); // 2 Witches, 10 pts > budget anyway
  });
  it("raises Woman/Dwarf stock 3→4 kit-on (4 Dwarves, cost 1 each = 4, within budget)", () => {
    expect(validatePicks([7, 7, 7, 7], KIT)).toBe(true); // 4 in stock kit-on
    expect(validatePicks([7, 7, 7, 7])).toBe(false); // only 3 in stock kit-off
  });
});

describe("newGame — kit-on selection removes kit codes from the small pack", () => {
  it("picking the Witch removes one 118 from the small pack, and the pack is 101 - party size", () => {
    const g = newGame(1, [18, 20], KIT); // Witch + Wolf, cost 6
    expect(g.smallPack).toHaveLength(101 - 2);
    expect(g.smallPack.filter((c) => c === 118)).toHaveLength(2); // 3 in the deck, 1 removed
    expect(g.smallPack.filter((c) => c === 120)).toHaveLength(0); // the lone Wolf, fully removed
  });
  it("kit-on picks of base ids still remove the right small-pack codes", () => {
    const g = newGame(1, [7, 7, 7, 7], KIT); // 4 Dwarves (kit stock)
    expect(g.smallPack.filter((c) => c === 107)).toHaveLength(0); // 3 base + 1 kit copy, all 4 removed
    expect(g.smallPack).toHaveLength(101 - 4);
  });
  it("throws on an invalid kit-on selection (over budget)", () => {
    expect(() => newGame(1, [18, 18], KIT)).toThrow();
  });
  it("kit-off newGame is unaffected: rejects a kit id in picks", () => {
    expect(() => newGame(1, [18])).toThrow();
  });
});

describe("selectionCost hardening — kit ids are unselectable (null) when the kit is off", () => {
  it("returns null for every kit creature id (14-20) with no variants / kit off", () => {
    for (const id of [14, 15, 16, 17, 18, 19, 20]) {
      expect(selectionCost(id)).toBeNull();
      expect(selectionCost(id, { extensionKit: false })).toBeNull();
    }
  });
  it("still resolves the real costs for base ids 0-7 unaffected by the guard", () => {
    expect(selectionCost(0)).toBe(6);
    expect(selectionCost(7)).toBe(1);
  });
});
