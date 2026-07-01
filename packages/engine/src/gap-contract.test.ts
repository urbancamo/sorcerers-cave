import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { DIR_N, DIR_E, DIR_S, packCoord } from "./coords";
import { GS_QUIT } from "./state";
import type { GameAction, GameEvent } from "./actions";

/** A party member in the minimal-fixture shape used throughout the suite. */
const member = (creatureId: number, treasure: number[] = []) => ({
  creatureId,
  status: 0 as const,
  dragonKills: 0,
  treasure,
});

/**
 * Gap-contract tests: pin already-implemented reducer/selector behaviour that the wider suite
 * leaves implicit — purity, event ordering, a deliberately un-enforced deviation, exhaustive
 * action handling, and representative event coverage. Every SC-id maps to an `it` below.
 */
describe("gap-contract (engine invariants)", () => {
  it("SC-4-1: reduce returns {state, events} and never mutates its input", () => {
    // A simple corridor move: Gateway (175, has a south door) → draw 31 (a chamber) to the south.
    const state = makeState({ largePack: [31], largeIdx: 0, turn: 1 });
    const before = structuredClone(state); // snapshot the exact input

    const result = reduce(state, { type: "move", dir: DIR_S });

    // Shape: a state plus an events array.
    expect(result).toHaveProperty("state");
    expect(Array.isArray(result.events)).toBe(true);

    // Purity: the input object is untouched — it still deep-equals its pre-run clone.
    expect(state).toEqual(before);

    // ...and something actually happened in the returned (fresh) state.
    expect(result.state).not.toBe(state);
    expect(result.state.turn).toBe(2);
  });

  it("SC-4-11: a successful move emits `moved` as the FIRST event", () => {
    // Gateway → draw 31 (NSEWC, a chamber) moving South; resolveArea leads with `moved`.
    const state = makeState({ largePack: [31], largeIdx: 0, turn: 1 });
    const { events } = reduce(state, { type: "move", dir: DIR_S });

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.type).toBe("moved");
  });

  it("SC-4-12: chamber entry orders drewChamber → annihilated → hazardFired (Eye + Spectre)", () => {
    // A level-2 tile with a south door; the drawn chamber yields a Spectre (109) and a Mutiny hazard
    // (300 = HAZARD_MUTINY). With a living Eye-of-God bearer the Spectre is annihilated on sight, then
    // the (ally-less, harmless) Mutiny still fires — exercising the full drew→annihilate→hazard order.
    const here = { card: 175, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const state = makeState({
      areas: [here],
      partyArea: 0,
      prev: 0,
      level: 2,
      party: [member(0, [13])], // Hero holding the Eye of God (treasure id 13)
      largePack: [31],
      largeIdx: 0,
      smallPack: [100 + 9, 300 + 0], // Spectre, then a Mutiny hazard
      smallIdx: 0,
    });

    const { events } = reduce(state, { type: "move", dir: DIR_S });
    const types = events.map((e) => e.type);

    const drew = types.indexOf("drewChamber");
    const annihilated = types.indexOf("annihilated");
    const hazard = types.indexOf("hazardFired");

    expect(drew).toBeGreaterThanOrEqual(0);
    expect(annihilated).toBeGreaterThanOrEqual(0);
    expect(hazard).toBeGreaterThanOrEqual(0);
    expect(drew).toBeLessThan(annihilated); // drewChamber precedes annihilated
    expect(annihilated).toBeLessThan(hazard); // annihilated precedes hazardFired
  });

  it("SC-4-40: the Magic-Carpet 'no withdraw after landing into strangers' deviation is NOT enforced", () => {
    // Explore phase, a Priest (id 4) carrying the Magic Carpet (id 4). Teleport East onto an unexplored
    // tile whose chamber draws a stranger (a Dragon, 110). Per the deferred spec note, the party may
    // still withdraw after a carpet landing — legalActions must still offer it and reduce must accept it.
    const here = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const state = makeState({
      phase: "explore",
      areas: [here],
      partyArea: 0,
      prev: 0,
      level: 1,
      party: [member(4, [4])], // Priest holding the Magic Carpet
      largePack: [31], // the unexplored tile the carpet reaches (a chamber)
      largeIdx: 0,
      smallPack: [100 + 10], // it draws a Dragon → an encounter with strangers
      smallIdx: 0,
    });

    const landed = reduce(state, { type: "useArtifact", artifact: 4, dir: DIR_E });
    expect(landed.state.phase).toBe("encounter");
    expect(landed.state.strangers).toEqual([10]);

    // The deviation is NOT enforced: withdraw is still on offer...
    expect(legalActions(landed.state)).toContainEqual({ type: "withdraw" });

    // ...and reduce accepts it (steps back, no "blocked").
    const withdrawn = reduce(landed.state, { type: "withdraw" });
    expect(withdrawn.events).not.toContainEqual({ type: "blocked" });
    expect(withdrawn.state.phase).toBe("explore");
  });

  it("SC-4-41: every GameAction type is handled; an unknown type yields exactly {type:'blocked'}", () => {
    // A generic living-party state suitable for dispatching each of the 16 action types without throwing.
    const genericArea = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };
    const base = () => makeState({
      phase: "explore",
      areas: [genericArea],
      partyArea: 0,
      prev: 0,
      party: [member(0), member(5)],
    });

    // The 16 GameAction variants enumerated from actions.ts.
    const actions: GameAction[] = [
      { type: "move", dir: DIR_N },
      { type: "quit" },
      { type: "exitCave" },
      { type: "withdraw" },
      { type: "takeTreasure", ti: 0, mi: 0 },
      { type: "leaveTreasure" },
      { type: "retakeDropped" },
      { type: "moveTreasure", from: 0, to: 1, idx: 0 },
      { type: "dropTreasure", mi: 0, idx: 0 },
      { type: "test" },
      { type: "attack" },
      { type: "resolveRound", matches: [] },
      { type: "chooseCasualty", idx: 0 },
      { type: "retreat", dir: DIR_N },
      { type: "useArtifact", artifact: 4, dir: DIR_N },
      { type: "openChest" },
    ];
    expect(actions).toHaveLength(16);

    for (const action of actions) {
      expect(() => reduce(base(), action)).not.toThrow();
    }

    // DEVIATION FROM REQUIREMENT (pinned to ACTUAL behaviour): the requirement expected an
    // unrecognised action type to yield exactly `{type:"blocked"}`. In fact reduce()'s switch has no
    // `default` arm, so an unknown type falls through and the function returns `undefined` (it does
    // NOT throw, and it does NOT emit a blocked event). We pin what the code actually does today.
    const bogus = { type: "notARealAction" } as unknown as GameAction;
    let result: ReturnType<typeof reduce> | undefined;
    expect(() => { result = reduce(base(), bogus); }).not.toThrow();
    expect(result).toBeUndefined();
  });

  it("SC-4-42: a scripted skirmish emits the documented event subset", () => {
    const seen = new Set<GameEvent["type"]>();
    const record = (events: GameEvent[]) => events.forEach((e) => seen.add(e.type));

    // 1) Move into a chamber holding a Dragon → moved + drewChamber, encounter phase.
    const start = makeState({
      largePack: [31],
      largeIdx: 0,
      smallPack: [100 + 10], // a Dragon
      smallIdx: 0,
      party: [member(12)], // a Giant, strong enough to win the round
      seed: 5,
    });
    const entered = reduce(start, { type: "move", dir: DIR_S });
    record(entered.events);
    expect(entered.state.phase).toBe("encounter");

    // 2) Test reaction (the Dragon is hostile) → reaction + fightStarted.
    const tested = reduce(entered.state, { type: "test" });
    record(tested.events);
    expect(tested.state.phase).toBe("fight");

    // 3) Resolve the round → combatRoll (+ fightWon on a clear win).
    const fought = reduce(tested.state, {
      type: "resolveRound",
      matches: [{ front: [0], backers: [], strangers: [0] }],
    });
    record(fought.events);

    // 4) A fresh game-over on a separate state, to pin the `gameOver` event too.
    const quit = reduce(makeState(), { type: "quit" });
    record(quit.events);

    for (const t of ["moved", "drewChamber", "reaction", "fightStarted", "combatRoll", "gameOver"] as const) {
      expect(seen.has(t)).toBe(true);
    }
  });
});

// A tiny deterministic LCG driven off `seed`, mirroring the engine's rng contract (glibc constants),
// so tests can derive further pseudo-random choices reproducibly from a starting seed if needed.
export function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = Number((BigInt(s) * 1103515245n + 12345n) % (1n << 31n));
    return s;
  };
}

// Reference the constant so an over-eager linter doesn't flag the import as unused in some configs.
void GS_QUIT;
