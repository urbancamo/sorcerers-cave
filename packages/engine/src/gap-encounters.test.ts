import { describe, it, expect } from "vitest";
import { reactionRoll } from "./reaction";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { DIR_E, packCoord } from "./coords";

// Coverage tests for encounter/reaction gaps. These pin ALREADY-IMPLEMENTED behaviour.
// Creature ids: Woman 6, W-Hero 1, Man 5, Troll 3, Wizard 8, Unicorn 13. Treasure: The Ring 10.
// Reaction thresholds (data/creatures.ts): Troll hostileMax 3 / indiffMax 4 (1-3 hostile, 4 indiff,
// 5-6 friendly); Unicorn hostileMax 0 / indiffMax 0 (always friendly). A Man party has no charisma,
// so the raw d6 equals the effective roll before curses.

const man = () => ({ creatureId: 5, status: 0 as const, dragonKills: 0, treasure: [] });

describe("reaction curses & The Ring (spec §8.3)", () => {
  it("SC-8.3-3: curses subtract from the reaction roll, shifting an outcome toward hostile", () => {
    // Troll leader (hostileMax 3), no-charisma party so raw d6 = effective roll. For any seed whose
    // raw roll is 4-6, curses:0 reads indifferent/friendly, but curses:3 lowers it to <=3 -> hostile.
    let shifts = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const clean = reactionRoll(makeState({ strangers: [3], party: [man()], curses: 0, seed }));
      const cursed = reactionRoll(makeState({ strangers: [3], party: [man()], curses: 3, seed }));
      // Same seed -> same raw die; only the effective (curse-lowered) roll differs.
      expect(cursed.roll).toBe(clean.roll);
      if (clean.roll >= 4) {
        // curses:0 is never hostile here (raw >= 4 > hostileMax 3); curses:3 always is (raw-3 <= 3).
        expect(clean.outcome).not.toBe("hostile");
        expect(cursed.outcome).toBe("hostile");
        shifts += 1;
      }
    }
    expect(shifts).toBeGreaterThan(0); // the sweep actually exercised the shift

    // A concrete witness: seed 1 rolls a raw 4 -> indifferent clean, hostile under 3 curses.
    expect(reactionRoll(makeState({ strangers: [3], party: [man()], curses: 0, seed: 1 })).outcome).toBe("indifferent");
    expect(reactionRoll(makeState({ strangers: [3], party: [man()], curses: 3, seed: 1 })).outcome).toBe("hostile");
  });

  it("SC-8.3-6: The Ring does not change the reaction (same seed/strangers -> same roll & outcome)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const without = reactionRoll(makeState({ strangers: [3], party: [man()], seed }));
      const withRing = reactionRoll(
        makeState({ strangers: [3], party: [{ ...man(), treasure: [10] }], seed }),
      );
      expect(withRing.roll).toBe(without.roll);
      expect(withRing.outcome).toBe(without.outcome);
    }
  });
});

describe("reaction — friendly join edge cases (spec §8.5)", () => {
  it("SC-8.5-4: a womanless party meets a friendly Unicorn — it guards, does not join, area pacified", () => {
    // Unicorn (id 13) is always friendly, but with no living Woman/W-Hero it will not join; it stays
    // guarding the area, which is pacified for this party, and phase returns to explore.
    const s = makeState({
      phase: "encounter",
      party: [man()], // no Woman/W-Hero
      strangers: [13],
      areas: [{ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const partyLen = s.party.length;
    const { state, events } = reduce(s, { type: "test" });
    expect(events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "friendly" }));
    expect(events).toContainEqual({ type: "unicornGuards", creatureId: 13 });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "strangersJoined", count: 1 }));
    expect(state.party.length).toBe(partyLen); // the Unicorn did NOT join
    expect(state.party.some((m) => m.creatureId === 13)).toBe(false);
    expect(state.pacifiedAreas).toContain(state.partyArea); // the area is pacified for this party
    expect(state.phase).toBe("explore"); // free to move on, leaving the guard behind
  });
});

describe("reaction — retreated-from areas attack on sight (spec §8.5 / §Retreat)", () => {
  it("SC-8.5-9: re-entering a hostileAreas chamber triggers an immediate fight with surprise -1", () => {
    // Tunnel A (card 2, exit E) -> chamber B (card 31) with a Troll parked in its contents. B's index
    // is recorded in hostileAreas, so on entry the party is attacked on sight — no encounter menu.
    const A = { card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const B = { card: 31, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [100 + 3], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore",
      areas: [A, B],
      partyArea: 0,
      prev: 0,
      party: [man()],
      hostileAreas: [1],
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });
    expect(state.partyArea).toBe(1);
    expect(state.phase).toBe("fight"); // attacked immediately, not an encounter
    expect(state.strangers).toEqual([3]);
    expect(events).toContainEqual({ type: "fightStarted", surprise: -1 }); // strangers get surprise
    // No encounter/reaction menu was offered on the way in.
    expect(events).not.toContainEqual(expect.objectContaining({ type: "reaction" }));
  });
});
