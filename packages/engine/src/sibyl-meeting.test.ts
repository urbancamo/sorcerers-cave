import { describe, it, expect } from "vitest";
import { makeState } from "./testkit";
import { enterChamber } from "./chamber";
import { reactionRoll, forcedReactionRoll } from "./reaction";
import { C_SIBYL, SIBYL_CODE, sibylWaiting } from "./sibyl";

const man = () => ({ creatureId: 5, status: 0 as const, dragonKills: 0, treasure: [] });

describe("Sibyl placement (SC-SIB-2)", () => {
  it("reloads a parked Sibyl into the parked-awake slot, never into the strangers", () => {
    const s = makeState();
    s.areas[0]!.visited = true;
    s.areas[0]!.contents = [SIBYL_CODE, 100 + 5];
    enterChamber(s);
    expect(s.strangers).toEqual([5]);
    expect(s.lulled).toEqual([C_SIBYL]);
  });

  it("a freshly drawn Sibyl goes to the same slot", () => {
    const s = makeState({ smallPack: [SIBYL_CODE], smallIdx: 0 });
    enterChamber(s); // the Gateway: level 1 draws one card
    expect(s.strangers).toEqual([]);
    expect(s.lulled).toEqual([C_SIBYL]);
  });

  it("is not petrified by a Gallery (she arrives un-statued like the Spectre and Sorcerer)", () => {
    const s = makeState({ smallPack: [SIBYL_CODE], smallIdx: 0 });
    // SPECIAL_GALLERY (10) << 7 | NESW + chamber (31) — the same card encoding the kit tests use.
    s.areas[0]!.card = (10 << 7) | 31;
    enterChamber(s);
    expect(s.statues ?? []).toEqual([]);
    expect(s.lulled).toEqual([C_SIBYL]);
  });
});

describe("sibylWaiting (SC-SIB-4)", () => {
  it("is true only when she is here, unmet, and no other stranger remains", () => {
    expect(sibylWaiting(makeState({ lulled: [C_SIBYL] }))).toBe(true);
    expect(sibylWaiting(makeState({ lulled: [C_SIBYL], strangers: [5] }))).toBe(false);
    expect(sibylWaiting(makeState({ lulled: [C_SIBYL], sibylMet: true }))).toBe(false);
    expect(sibylWaiting(makeState({ lulled: [10] }))).toBe(false); // a lulled Dragon is not her
    expect(sibylWaiting(makeState())).toBe(false);
  });
});

describe("Sibyl reaction band (SC-SIB-3)", () => {
  it("with the leader overridden: 1-4 indifferent, 5-6 friendly, never hostile", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const r = reactionRoll(makeState({ party: [man()], seed }), undefined, C_SIBYL); // no charisma: roll = die
      expect(r.outcome).not.toBe("hostile");
      expect(r.outcome).toBe(r.roll <= 4 ? "indifferent" : "friendly");
      seen.add(r.outcome);
    }
    expect(seen).toEqual(new Set(["indifferent", "friendly"]));
  });

  it("a curse can never push her hostile (hostileMax 0)", () => {
    for (let seed = 1; seed <= 100; seed++) {
      expect(reactionRoll(makeState({ party: [man()], seed, curses: 5 }), undefined, C_SIBYL).outcome).not.toBe("hostile");
    }
  });

  it("forcedReactionRoll yields a display roll inside the requested band for her", () => {
    const s = makeState({ party: [man()] });
    expect(forcedReactionRoll(s, "indifferent", C_SIBYL)).toBe(1);
    expect(forcedReactionRoll(s, "friendly", C_SIBYL)).toBe(5);
  });

  it("without an override the leader is still the strongest stranger (unchanged)", () => {
    const r = reactionRoll(makeState({ strangers: [3], party: [man()], seed: 1 }));
    expect(r.outcome).toBe("indifferent"); // Troll, raw 4 at seed 1 (see gap-encounters.test.ts)
  });
});
