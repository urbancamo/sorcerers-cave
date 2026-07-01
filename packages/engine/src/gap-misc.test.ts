import { describe, it, expect } from "vitest";
import { makeState } from "./testkit";
import { reduce } from "./reduce";
import { enterChamber } from "./chamber";
import { applyHazards } from "./hazards";
import { reconcileUnicorns } from "./effects";
import { validatePlan, previewPlan, resolvePlannedRound } from "./combatPlan";
import { packCoord } from "./coords";
import {
  HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP,
} from "./data/hazards";
import type { BattlePlan } from "./state";
import type { GameEvent } from "./actions";

// --- shared helpers (mirrors combatPlan.test.ts) ---
const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });
const fightS = (over: Parameters<typeof makeState>[0] = {}) =>
  makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, ...over });
const rolls = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: "combatRoll" }> => e.type === "combatRoll");
const clone = (s: ReturnType<typeof makeState>) => ({ ...s, fight: s.fight ? { ...s.fight } : null, strangers: [...s.strangers], party: s.party.map((m) => ({ ...m })) });

describe("phase field (§SC-4-3)", () => {
  it("SC-4-3: a fresh makeState() is in the explore phase", () => {
    expect(makeState().phase).toBe("explore");
  });

  it("SC-4-3: reduce handles a state in each of explore|encounter|fight|pickup|gameOver without throwing", () => {
    // explore: a plain move with no exit is a no-op (blocked), not a throw.
    expect(() => reduce(makeState({ phase: "explore" }), { type: "move", dir: 1 })).not.toThrow();
    // encounter: withdraw is a valid action to route through this phase.
    expect(() => reduce(makeState({ phase: "encounter" }), { type: "withdraw" })).not.toThrow();
    // fight: resolveRound with an empty plan routes through the fight phase.
    expect(() => reduce(fightS({ party: [member(0)], strangers: [3] }), { type: "resolveRound", matches: [] })).not.toThrow();
    // pickup: leaveTreasure routes through the pickup phase.
    expect(() => reduce(makeState({ phase: "pickup", treasures: [0] }), { type: "leaveTreasure" })).not.toThrow();
    // gameOver: gs is not GS_PLAYING → reduce short-circuits without acting.
    expect(() => reduce(makeState({ phase: "gameOver", gs: 2 }), { type: "move", dir: 1 })).not.toThrow();
  });
});

// A corridor tile with an East exit (card 2 = E) that the party moves off into a freshly drawn
// chamber (large-pack card carries a West reverse-door so the move connects).
function moveIntoChamber(over: Parameters<typeof makeState>[0] = {}) {
  const corridor = { card: 2, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
  return makeState({
    areas: [corridor],
    partyArea: 0,
    prev: 0,
    party: [member(0)],
    largePack: [8 | 16], // NSEW-less chamber with a West door (8) + chamber bit (16) — enter from the East
    largeIdx: 0,
    level: 2, // draw min(level,4)=2 small cards on first visit
    smallPack: [110, 201], // a Dragon (110) + Gold (201) to draw on first visit
    smallIdx: 0,
    indiffStreak: 2, // pre-set streak that must be cleared on chamber (re)entry
    ...over,
  });
}

describe("chamber (re)entry resets working sets & indiffStreak (§SC-7.1-7)", () => {
  it("SC-7.1-7: a reduce move into a chamber clears indiffStreak and draws a fresh working set", () => {
    const { state } = reduce(moveIntoChamber(), { type: "move", dir: 2 }); // East into the chamber
    expect(state.indiffStreak).toBe(0);        // the pre-set streak was reset on entry
    expect(state.strangers).toEqual([10]);     // the freshly drawn Dragon (110 − 100)
    expect(state.treasures).toEqual([1]);      // the freshly drawn Gold (201 − 200)
    expect(state.smallIdx).toBe(2);            // both small-pack cards consumed by the draw
  });
});

describe("indiffStreak clears on chamber entry (§SC-8.4-5)", () => {
  it("SC-8.4-5: enterChamber resets a pre-set indiffStreak to 0", () => {
    const s = makeState({
      level: 1,
      areas: [{ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
      indiffStreak: 2,
      smallPack: [110],
      smallIdx: 0,
    });
    enterChamber(s);
    expect(s.indiffStreak).toBe(0);
  });
});

describe("hazard priority order (§SC-7.2-1)", () => {
  it("SC-7.2-1: with Earthquake + Trap co-present, Earthquake fires before Trap", () => {
    // Earthquake collapses the previous area; the Trap (no Dwarf) drops the party. Both fire, in order.
    const s = makeState({
      areas: [
        { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 51), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 1,
      prev: 0,
      party: [member(5)], // a Man — no Dwarf, so the Trap springs
      hazards: [HAZARD_TRAP, HAZARD_EARTHQUAKE], // listed Trap-first to prove order is by priority, not input
    });
    const { events, fell } = applyHazards(s);
    expect(fell).toBe(true); // the Trap sprang
    const fired = events.filter((e): e is Extract<GameEvent, { type: "hazardFired" }> => e.type === "hazardFired").map((e) => e.hazard);
    // Earthquake (2) resolves before Trap (1) despite Trap appearing first in state.hazards.
    expect(fired).toEqual([HAZARD_EARTHQUAKE, HAZARD_TRAP]);
    expect(fired.indexOf(HAZARD_EARTHQUAKE)).toBeLessThan(fired.indexOf(HAZARD_TRAP));
  });

  it("SC-7.2-1: the full priority order is Earthquake→Medusa→Ghouls→Mutiny→Trap", () => {
    expect([HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP]).toEqual([2, 3, 4, 0, 1]);
  });
});

describe("Unicorn departs when the last Woman falls (§SC-8.5-5)", () => {
  it("SC-8.5-5: reconcileUnicorns removes an allied Unicorn once no Woman lives", () => {
    const s = makeState({
      party: [
        { creatureId: 6, status: 3, dragonKills: 0, treasure: [] },  // the Woman has just been slain
        { creatureId: 13, status: 1, dragonKills: 0, treasure: [] }, // the allied Unicorn
      ],
    });
    const events = reconcileUnicorns(s);
    expect(s.party.some((m) => m.creatureId === 13)).toBe(false); // the Unicorn has departed
    expect(events).toContainEqual({ type: "unicornDeparted", creatureId: 13 });
  });

  it("SC-8.5-5: a fight round that fells the last Woman makes the Unicorn depart on finalize", () => {
    // Woman + allied Unicorn vs a Dragon. The Woman (front) is out-strengthed and falls; on the
    // post-round finalize (reduce's resolveRound → finalizeRound → reconcileUnicorns) the Unicorn leaves.
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      party: [
        { creatureId: 6, status: 0, dragonKills: 0, treasure: [] },  // Woman (front)
        { creatureId: 13, status: 1, dragonKills: 0, treasure: [] }, // allied Unicorn (idle)
      ],
      strangers: [10], // a Dragon
      seed: 5,
    });
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(state.party.find((m) => m.creatureId === 6)!.status).toBe(3); // the Woman fell
    expect(state.party.some((m) => m.creatureId === 13)).toBe(false);    // the Unicorn departed
    expect(events).toContainEqual({ type: "unicornDeparted", creatureId: 13 });
  });
});

describe("validatePlan groupTooBig (§SC-9.1-4)", () => {
  it("SC-9.1-4: rejects a front of 3 with reason groupTooBig", () => {
    const s = fightS({ party: [member(0), member(2), member(7)], strangers: [3] });
    const r = validatePlan(s, { matches: [{ front: [0, 1, 2], backers: [], strangers: [0] }] });
    expect(r).toEqual({ ok: false, reason: "groupTooBig" });
  });

  it("SC-9.1-4: rejects engaging 3 strangers with reason groupTooBig", () => {
    const s = fightS({ party: [member(0)], strangers: [3, 5, 7] });
    const r = validatePlan(s, { matches: [{ front: [0], backers: [], strangers: [0, 1, 2] }] });
    expect(r).toEqual({ ok: false, reason: "groupTooBig" });
  });
});

describe("Spectre is never auto-attached as a gang-up foe (§SC-9.4-3)", () => {
  it("SC-9.4-3: an out-numbered lone fighter does not get a leftover Spectre ganged onto it", () => {
    // Lone Hero engages a Troll while a Spectre + Man also stand present. Out-numbered, the engine
    // gangs the strongest hand-to-hand foe (the Man) onto the Hero — but NEVER the Spectre.
    const s = clone(fightS({ party: [member(0)], strangers: [9, 3, 5], seed: 5 })); // Spectre, Troll, Man
    const pv = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [1] }] }); // engage the Troll (idx 1)
    expect(pv.matches).toHaveLength(1);
    expect(pv.matches[0]!.strangers).not.toContain(0); // the Spectre (idx 0) is not folded in
    expect(pv.matches[0]!.attached).not.toContain(0);  // and was not auto-attached by the engine
    expect(pv.matches[0]!.enemyBackers).not.toContain(0); // nor pulled in as a background caster
    expect(pv.idle).toContain(0); // the Spectre stands idle instead of ganging up
  });
});

describe("won fights reclaim dropped heavy treasure into pickup (§SC-9.5-2)", () => {
  it("SC-9.5-2: heavy treasure dropped to fight is reclaimed to the working set on a win → pickup", () => {
    // A Giant carrying Gold (heavy) drops it to fight, wins, and the Gold returns to the pickup floor.
    const s = makeState({
      phase: "fight",
      fight: { surprise: 1, round: 1, focus: 0 },
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [1] }], // Giant + Gold
      strangers: [7], // a Dwarf — the Giant beats it
      seed: 5,
      areas: [{ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { state } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(state.phase).toBe("pickup");            // a win with reclaimable loot opens the pickup
    expect(state.strangers).toEqual([]);           // the foe is dead
    expect(state.treasures).toContain(1);          // the dropped Gold is back on the floor, reclaimable
    expect(state.party[0]!.treasure).not.toContain(1); // it left the Giant's hands to fight
    expect(state.areas[0]!.contents).not.toContain(200 + 1); // and no longer sits parked as a floor code
  });
});

describe("Tomb of Kings / Great Hall have no crossing behaviour (§SC-10.3-1)", () => {
  it("SC-10.3-1: moving off a Great Hall onto an ordinary tile fires no crossedSpecial", () => {
    // card 671 = Great Hall (5<<7) + chamber (16) + NESW (15). Move East onto a plain corridor.
    const s = makeState({
      areas: [{ card: 671, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      partyArea: 0,
      prev: 0,
      level: 1,
      party: [member(0)],
      largePack: [8], // a plain corridor with a West reverse-door (no chamber, no special)
      largeIdx: 0,
    });
    const { state, events } = reduce(s, { type: "move", dir: 2 });
    expect(events.some((e) => e.type === "crossedSpecial")).toBe(false); // the Hall is not a crossing tile
    expect(state.phase).toBe("explore"); // a plain corridor → back to exploring, no encounter/pickup
  });

  it("SC-10.3-1: moving onto a Tomb of Kings resolves it as an ordinary chamber (no crossedSpecial)", () => {
    // card 543 = Tomb of Kings (4<<7) + chamber (16) + NESW (15). A move onto it draws a chamber.
    const s = makeState({
      areas: [{ card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      partyArea: 0,
      prev: 0,
      level: 1,
      party: [member(0)],
      largePack: [543], // the Tomb of Kings (its own West door 8 is set in card 543's low nibble)
      largeIdx: 0,
      smallPack: [201], // it draws a treasure like any chamber (Gold)
      smallIdx: 0,
    });
    const { state, events } = reduce(s, { type: "move", dir: 2 });
    expect(events.some((e) => e.type === "crossedSpecial")).toBe(false); // no crossing behaviour
    expect(events.some((e) => e.type === "drewChamber")).toBe(true);     // it drew a chamber like any other
    expect(state.phase).toBe("pickup"); // the drawn Gold sends the party to the ordinary pickup flow
  });
});
