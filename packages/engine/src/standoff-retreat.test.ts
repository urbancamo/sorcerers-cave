import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { newGame } from "./setup";
import { legalActions } from "./selectors";
import { driveStrangers } from "./strangerDriver";
import { matchModifiers } from "./revisedRound";
import type { GameState } from "./state";
import type { GameAction } from "./actions";

// Bug report QOPN (25-OCT-2026, test mode, twelve Dwarfs): a Dwarf was lost in a fight, the party retreated into a Spectre and attacked, the Spectre
// slew a Dwarf and the fight was a standoff ("no match can be decided any more"). The next retreat ran into a dead end, and that left the
// party with no action at all: a failed retreat locks retreat until a round is fought, and a standoff fights no rounds.
const STEPS: GameAction[] = [
  { type: "testPlaceArea", dir: 1, special: 12 },
  { type: "testSetChamber", strangers: [0], treasures: [], hazards: [] },
  { type: "testForceReaction", outcome: "hostile" },
  { type: "move", dir: 1 },
  { type: "test" },
  { type: "deploy", creatures: [0, 2] },
  { type: "strangersEngage", strategyId: "standard", strategyVersion: 1, pairs: [{ party: 0, stranger: 0 }] },
  { type: "redeploy", moves: [{ creature: 2, match: 0, back: false }] },
  { type: "chooseCasualty", idx: 2 },
  { type: "retreat", dir: 1 },
  { type: "attack" },
  { type: "strangersDeploy", strategyId: "standard", strategyVersion: 1, creatures: [0] },
];

const C_SPECTRE = 9;

describe("a failed retreat in a standoff", () => {
  const standoff = (): GameState => {
    let s: GameState = { ...newGame(1792934533360, Array(12).fill(7), undefined, true), variants: { combatRevision: true, forcedRedraw: true, sorcererTeleport: true, trapRules: true } };
    for (const a of STEPS) s = reduce(s, a).state;
    return s;
  };

  it("fights another round, so another of the party falls, and then lets it try again", () => {
    const s = standoff();
    expect(s.fight?.rev?.standoff).toBe(true);
    const living = (g: GameState) => g.party.filter((m) => m.status === 0).length;
    const before = legalActions(s).filter((a) => a.type === "retreat");
    expect(before.length).toBeGreaterThan(1);
    const dead = before.find((a) => reduce(s, a).events.some((e) => e.type === "deadEnd"));
    expect(dead, "this seed has a dead-end doorway to try").toBeDefined();
    const r = reduce(s, dead!);
    expect(r.state.fight?.pending).toMatchObject({ by: "strangers", kind: "deploy" });   // the round is under way: the strangers draw up their line
    const done = driveStrangers(r.state);                                                   // (the driver answers for them, as the server does)
    expect(r.events.map((e) => e.type)).toContain("deadEnd");
    expect(done.applied.flatMap((a) => a.events).map((e) => e.type)).toContain("spectreSlew");
    r.state = done.state;
    expect(living(r.state)).toBe(living(s) - 1);
    expect(r.state.phase).toBe("fight");                                                    // back on the combat screen
    expect(legalActions(r.state).filter((a) => a.type === "retreat").length).toBeGreaterThan(0);
    expect(r.state.fight?.retreatBlocked).toBeFalsy();
  });

  it("still locks retreat after a failed attempt in an ordinary fight (a round must be fought)", () => {
    let s = standoff();
    s = structuredClone(s);
    delete s.fight!.rev!.standoff;
    const dead = legalActions(s).find((a) => a.type === "retreat" && reduce(s, a).events.some((e) => e.type === "deadEnd"));
    expect(dead).toBeDefined();
    expect(reduce(s, dead!).state.fight?.retreatBlocked).toBe(true);
  });
});

describe("the Magic Shield note", () => {
  it("is not shown for a Spectre nobody is facing yet, when no one carries a shield", () => {
    let s: GameState = { ...newGame(1, [7, 7]), variants: { combatRevision: true }, phase: "encounter", strangers: [C_SPECTRE], treasures: [] };
    s = reduce(s, { type: "attack" }).state;
    const bd = matchModifiers(s, { pf: [], pb: [], sf: [0], sb: [] });
    expect(bd.chips.some((c) => /shield/i.test(c.label))).toBe(false);
  });
});
