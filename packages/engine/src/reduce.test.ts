import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { GS_QUIT, GS_ESCAPED, GS_DEAD } from "./state";
import { DIR_S, DIR_E, DIR_N, packCoord } from "./coords";
import { makeState } from "./testkit";
import { legalActions } from "./selectors";
import type { GameEvent, GameAction } from "./actions";
import { SPECIAL_VIPER_PIT, SPECIAL_DEEP_POOL } from "./data/areaCards";

describe("reduce (spec §4 turn dispatch)", () => {
  it("quit ends the game and emits gameOver(QUIT)", () => {
    const { state, events } = reduce(makeState(), { type: "quit" });
    expect(state.gs).toBe(GS_QUIT);
    expect(events).toContainEqual({ type: "gameOver", gs: GS_QUIT });
  });

  it("exitCave escapes when on level 1 with a stair-up (the Gateway)", () => {
    const { state, events } = reduce(makeState(), { type: "exitCave" });
    expect(state.gs).toBe(GS_ESCAPED);
    expect(events).toContainEqual({ type: "gameOver", gs: GS_ESCAPED });
  });

  it("exitCave is blocked when the current card has no stair-up", () => {
    // Card 31 = NSEWC, no stair-up.
    const s = makeState({ areas: [{ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "exitCave" });
    expect(state.gs).toBe(0);
    expect(events).toContainEqual({ type: "blocked" });
  });

  it("a successful move increments the turn and emits moved + drewChamber", () => {
    // Draw 31 (NSEWC, a chamber) moving South from the Gateway.
    const s = makeState({ largePack: [31], largeIdx: 0, turn: 1 });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.turn).toBe(2);
    expect(state.partyArea).toBe(1);
    expect(events).toContainEqual({ type: "moved", area: 1, level: 1 });
    expect(events).toContainEqual({ type: "drewChamber", strangers: [], treasures: [], hazards: [] });
  });

  it("a dead-end move does not advance the turn and emits deadEnd", () => {
    // Draw 12 (SW, no north door) moving South -> dead-end.
    const s = makeState({ largePack: [12], largeIdx: 0, turn: 1 });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.turn).toBe(1);
    expect(events).toContainEqual({ type: "deadEnd", dir: DIR_S });
  });

  it("ignores actions once the game is over", () => {
    const over = makeState({ gs: GS_QUIT });
    const { state, events } = reduce(over, { type: "move", dir: DIR_S });
    expect(state).toBe(over);
    expect(events).toEqual([]);
  });
});

describe("reduce — chamber resolution (C-1)", () => {
  it("moving into a chamber with only treasure enters the pickup phase", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [201], smallIdx: 0 });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([1]);
    expect(events).toContainEqual({ type: "drewChamber", strangers: [], treasures: [1], hazards: [] });
    expect(legalActions(state)).toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 });
  });

  it("taking the last treasure returns to the explore phase and persists nothing", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [201], smallIdx: 0 });
    const afterMove = reduce(s, { type: "move", dir: DIR_S }).state;
    const { state } = reduce(afterMove, { type: "takeTreasure", ti: 0, mi: 0 });
    expect(state.phase).toBe("explore");
    expect(state.party[0]!.treasure).toEqual([1]);
    expect(state.treasures).toEqual([]);
  });

  it("leaving treasure parks it on the chamber and clears the live working set", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [201], smallIdx: 0 });
    const afterMove = reduce(s, { type: "move", dir: DIR_S }).state;
    const { state } = reduce(afterMove, { type: "leaveTreasure" });
    expect(state.phase).toBe("explore");
    expect(state.treasures).toEqual([]);                  // working set cleared (so it stops following the party)
    expect(state.areas[state.partyArea]!.contents).toContain(201); // it stays in the chamber it was left
  });

  it("a trap fall into strangers offers no withdraw (one-way drop, no way back up)", () => {
    const s = makeState({
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }], // Man, no dwarf
      largePack: [31, 31], // upper chamber to enter, lower chamber to fall into
      largeIdx: 0,
      smallPack: [300 + 1, 110, 200], // upper draws a trap; level-2 chamber draws a Dragon + Silver
      smallIdx: 0,
    });
    const { state } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.phase).toBe("encounter");
    expect(state.level).toBe(2);
    expect(state.fellThroughTrap).toBe(true);
    const acts = legalActions(state);
    expect(acts).not.toContainEqual({ type: "withdraw" }); // cannot retreat back up the trap
    expect(acts).toContainEqual({ type: "attack" });
    expect(acts).not.toContainEqual({ type: "quit" }); // quit is via the HUD Quit button, not an in-menu action
    // a blocked withdraw is a no-op
    expect(reduce(state, { type: "withdraw" }).events).toContainEqual({ type: "blocked" });
  });

  it("moving into a chamber with a stranger enters the encounter phase", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [110], smallIdx: 0 });
    const { state } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.phase).toBe("encounter");
    expect(state.strangers).toEqual([10]);
    expect(legalActions(state)).toContainEqual({ type: "withdraw" });
    expect(legalActions(state)).toContainEqual({ type: "attack" });
    expect(legalActions(state)).toContainEqual({ type: "test" });
    expect(legalActions(state)).not.toContainEqual({ type: "quit" }); // abandoning is via the HUD Quit button
  });

  it("withdraw steps back to the previous area and leaves the strangers behind", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [110], smallIdx: 0 });
    const afterMove = reduce(s, { type: "move", dir: DIR_S }).state;
    const { state } = reduce(afterMove, { type: "withdraw" });
    expect(state.phase).toBe("explore");
    expect(state.partyArea).toBe(0);
    expect(state.areas[1]!.contents).toContain(110);
  });
});

describe("reduce — stranger encounters (C-2 §8)", () => {
  it("attack from a fresh entry starts a fight with surprise to the party", () => {
    const s = makeState({ phase: "encounter", surpriseReady: true, strangers: [10], areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "attack" });
    expect(state.phase).toBe("fight");
    expect(state.fight).toMatchObject({ surprise: 1, round: 1 });
    expect(events).toContainEqual({ type: "fightStarted", surprise: 1 });
  });

  it("attack with no fresh-entry surprise (e.g. after a delay) gets no advantage", () => {
    const s = makeState({ phase: "encounter", surpriseReady: false, strangers: [10], areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "attack" });
    expect(state.fight).toMatchObject({ surprise: 0 });
    expect(events).toContainEqual({ type: "fightStarted", surprise: 0 });
  });

  it("testing a Dragon (always hostile) starts a fight with surprise to the strangers", () => {
    const s = makeState({ phase: "encounter", strangers: [10], areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "test" });
    expect(state.phase).toBe("fight");
    expect(state.fight!.surprise).toBe(-1);
    expect(events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "hostile" }));
  });

  it("a friendly result recruits the strangers as allies", () => {
    // Unicorn (id 13) is always friendly, and joins when a Woman is present (§ Unicorn).
    const s = makeState({
      phase: "encounter",
      party: [{ creatureId: 6, status: 0, dragonKills: 0, treasure: [] }], // Woman — required for Unicorn loyalty
      strangers: [13],
      treasures: [],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { state, events } = reduce(s, { type: "test" });
    expect(state.party.some((m) => m.creatureId === 13 && m.status === 1)).toBe(true);
    expect(state.strangers).toEqual([]);
    expect(state.phase).toBe("explore");
    expect(events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "friendly" }));
  });

  it("three indifferent results pacify the chamber for that party: guarded treasure, free to leave", () => {
    // Woman-stranger (id 6): seed 9 with a no-charisma party (a Man) rolls indifferent three times.
    let s = makeState({
      phase: "encounter", strangers: [6], treasures: [1], seed: 9,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    let lastEvents: GameEvent[] = [];
    for (let i = 0; i < 3; i++) { const r = reduce(s, { type: "test" }); s = r.state; lastEvents = r.events; }
    expect(lastEvents).toContainEqual({ type: "pacified" }); // the 3rd indifferent announces it
    expect(s.indiffStreak).toBe(3);
    expect(s.pacifiedAreas).toContain(0);
    expect(s.phase).toBe("explore"); // free to move out by any valid exit
    const acts = legalActions(s);
    expect(acts).not.toContainEqual({ type: "test" });               // no more testing
    expect(acts.some((a) => a.type === "takeTreasure")).toBe(false); // treasure protected — cannot loot
    expect(acts.some((a) => a.type === "move")).toBe(true);          // may leave by a doorway
    // the indifferent stranger AND the treasure stay guarded in the chamber
    expect(s.areas[0]!.contents).toEqual(expect.arrayContaining([200 + 1, 100 + 6]));
    expect(s.party[0]!.treasure).toEqual([]);                        // nothing looted
    expect(reduce(s, { type: "test" }).events).toContainEqual({ type: "blocked" });
  });

  it("a pacified chamber stays indifferent on re-entry (no encounter, treasure still guarded)", () => {
    // Tunnel A (exit E) → chamber B (card 31), already pacified for this party with a guarded stranger+treasure.
    const A = { card: 2, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const B = { card: 31, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [100 + 6, 200 + 1], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore", areas: [A, B], partyArea: 0, prev: 0,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }], pacifiedAreas: [1],
    });
    const r = reduce(s, { type: "move", dir: DIR_E });
    expect(r.state.partyArea).toBe(1);
    expect(r.state.phase).toBe("explore"); // walked straight in, no encounter
    expect(legalActions(r.state).some((a) => a.type === "takeTreasure")).toBe(false);
    expect(r.state.areas[1]!.contents).toEqual(expect.arrayContaining([200 + 1, 100 + 6])); // still guarded
  });

  it("Medusa turning the whole party to stone ends the game (petrifiedOut + gameOver)", () => {
    // Tunnel A (exit E) → draw a chamber (card 24 = W door + chamber) that yields a Medusa; the lone
    // Man is petrified (seed picked so the gaze roll is <= 2), leaving no one alive.
    const A = { card: 2, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore", areas: [A], partyArea: 0, prev: 0,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
      largePack: [24], smallPack: [300 + 3], seed: 2,
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });
    expect(state.party.every((m) => m.status === 2)).toBe(true); // all stone
    expect(state.gs).toBe(GS_DEAD);
    expect(state.phase).toBe("gameOver");
    expect(events).toContainEqual({ type: "petrifiedOut" });
    expect(events).toContainEqual({ type: "gameOver", gs: GS_DEAD });
  });

  it("Healing Balm can revive a fallen member during pickup (loot still on the floor)", () => {
    const s = makeState({
      phase: "pickup", treasures: [1], // treasure on the floor after a fight
      party: [
        { creatureId: 6, status: 0, dragonKills: 0, treasure: [6] }, // Woman holding the Healing Balm
        { creatureId: 0, status: 3, dragonKills: 0, treasure: [] },  // fallen Hero
      ],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    expect(legalActions(s)).toContainEqual({ type: "useArtifact", artifact: 6, target: 1 }); // offered in pickup
    const { state } = reduce(s, { type: "useArtifact", artifact: 6, target: 1 });
    expect(state.party[1]!.status).toBe(0);       // Hero revived
    expect(state.party[0]!.treasure).toEqual([]); // balm consumed (no longer visible)
  });

  it("Magic Staff can free a petrified member during pickup (Wizard, staff not consumed)", () => {
    const s = makeState({
      phase: "pickup", treasures: [1],
      party: [
        { creatureId: 8, status: 0, dragonKills: 0, treasure: [9] }, // Wizard holding the Magic Staff
        { creatureId: 0, status: 2, dragonKills: 0, treasure: [] },  // petrified Hero
      ],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    expect(legalActions(s)).toContainEqual({ type: "useArtifact", artifact: 9, target: 1 });
    const { state } = reduce(s, { type: "useArtifact", artifact: 9, target: 1 });
    expect(state.party[1]!.status).toBe(0);       // Hero freed from stone
    expect(state.party[0]!.treasure).toEqual([9]); // staff kept (reusable)
  });
});

describe("reduce — fight dispatch (C-2 §9.5)", () => {
  const arena = (over: object) => makeState({
    phase: "fight",
    fight: { surprise: 1, round: 1, focus: 0 },
    areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    ...over,
  });

  it("a round that wipes the strangers wins the fight and exits combat", () => {
    const s = arena({ party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }], strangers: [7], seed: 5 });
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(state.strangers).toEqual([]);
    expect(state.fight).toBeNull();
    expect(state.phase).toBe("explore");
    expect(events).toContainEqual({ type: "fightWon" });
  });

  it("a round that wipes the party ends the game as DEAD", () => {
    // A lone Dwarf (FS 1) vs a Dragon (FS 6) with surprise to the strangers — the Dwarf dies.
    const s = arena({
      party: [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [] }],
      strangers: [10],
      fight: { surprise: -1, round: 1, focus: 0 },
      seed: 5,
    });
    const { state } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(state.party.every((m) => m.status === 3)).toBe(true);
    expect(state.gs).toBe(2); // GS_DEAD
    expect(state.phase).toBe("gameOver");
  });

  it("retreat (after a round) flees by a doorway, leaving strangers behind", () => {
    const s = arena({
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }],
      strangers: [3, 10],
      areas: [
        { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // chamber (NESW)
        { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // known tile to the north
      ],
      partyArea: 0, prev: 1,
      fight: { surprise: 0, round: 2, focus: 0 }, // a round has already been fought (retreat now allowed)
    });
    const r = reduce(s, { type: "retreat", dir: DIR_N }).state;
    expect(r.phase).toBe("explore");
    expect(r.partyArea).toBe(1); // fled north into the known tile
    expect(r.fight).toBeNull();
    expect(r.areas[0]!.contents).toEqual(expect.arrayContaining([103, 110])); // strangers left in the chamber
    expect(r.hostileAreas).toContain(0); // the strangers we fled stay hostile to us (§Retreat)
  });

  it("re-entering a chamber you retreated from is met with an immediate fight (§Retreat)", () => {
    const A = { card: 2, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }; // tunnel, exit E
    const B = { card: 31, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [100 + 3], flags: 0, indiffCount: 0 }; // Troll parked
    const s = makeState({
      phase: "explore", areas: [A, B], partyArea: 0, prev: 0,
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }],
      hostileAreas: [1],
    });
    const r = reduce(s, { type: "move", dir: DIR_E }).state;
    expect(r.partyArea).toBe(1);
    expect(r.phase).toBe("fight"); // attacked on sight — no test/encounter offered
    expect(r.fight).not.toBeNull();
    expect(r.strangers).toEqual([3]);
  });

  it("retreating toward a dead end fails — the party must fight another round (§Retreat)", () => {
    const s = arena({
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }],
      strangers: [3],
      areas: [{ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      partyArea: 0, prev: 0,
      fight: { surprise: 0, round: 2, focus: 0 },
      largePack: [1], largeIdx: 0, // card 1 = N-only → no S reverse-door → a dead end to the north
    });
    const { state, events } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(state.phase).toBe("fight");        // still fighting
    expect(state.fight).not.toBeNull();
    expect(state.strangers).toEqual([3]);     // strangers remain
    expect(events).toContainEqual({ type: "deadEnd", dir: DIR_N });
    // No further retreat is allowed this round — only fighting on (the round is resolved via the
    // resolveRound action, which is built by the fight UI rather than offered in legalActions). §Retreat
    expect(state.fight!.retreatBlocked).toBe(true);
    expect(legalActions(state).some((a) => a.type === "retreat")).toBe(false);
  });

  it("chooseCasualty falls on the player's pick with a 4-6, otherwise the other (§9)", () => {
    const s = arena({
      party: [
        { creatureId: 7, status: 0, dragonKills: 0, treasure: [] }, // idx 0
        { creatureId: 7, status: 0, dragonKills: 0, treasure: [] }, // idx 1
      ],
      strangers: [10], // a Dragon still stands → the fight continues after the choice
      fight: { surprise: 0, round: 2, focus: 0, casualtyQueue: [[0, 1]] },
      prev: 0,
      seed: 5,
    });
    // While a casualty is pending, only that choice is offered and resolving a round is blocked.
    expect(legalActions(s)).toEqual([{ type: "chooseCasualty", idx: 0 }, { type: "chooseCasualty", idx: 1 }]);
    expect(reduce(s, { type: "resolveRound", matches: [] }).events).toEqual([{ type: "blocked" }]);

    const r = reduce(s, { type: "chooseCasualty", idx: 0 }); // prefer member 0 to fall
    const ev = r.events.find((e): e is Extract<GameEvent, { type: "casualtyChosen" }> => e.type === "casualtyChosen")!;
    expect(ev).toBeDefined();
    const deadIdx = r.state.party.findIndex((m) => m.status === 3);
    expect(deadIdx).toBe(ev.roll >= 4 ? 0 : 1); // 4-6 honours the preference (0); else the other (1)
    expect(ev.gotPreference).toBe(ev.roll >= 4);
    expect(r.state.phase).toBe("fight"); // one Dwarf remains, Dragon still there
    expect(r.state.fight?.casualtyQueue).toBeUndefined();
  });

  it("Lotus Dust has no effect on a Spectre (card)", () => {
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      strangers: [9], // a Spectre
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [5] }], // Man holds Lotus Dust (id 5)
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 5, target: 0 });
    expect(events).toEqual([{ type: "blocked" }]);
    expect(state.strangers).toEqual([9]); // Spectre unaffected
    expect(state.party[0]!.treasure).toContain(5); // Lotus Dust not spent
  });

  it("Lotus Dust weakens the Sorcerer instead of putting him to sleep (card)", () => {
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      strangers: [11], // the Sorcerer
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [5] }], // Hero holds Lotus Dust (id 5)
    });
    const r = reduce(s, { type: "useArtifact", artifact: 5, target: 0 });
    expect(r.state.strangers).toEqual([11]); // not slept — he remains
    expect(r.state.lotusOnSorcerer).toBe(true); // but marked for −2 Strength
    expect(r.state.party[0]!.treasure).not.toContain(5); // the dust is spent
  });

  it("blocks retreat before any round has been fought (§Retreat)", () => {
    const s = arena({
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }],
      strangers: [3, 10],
      prev: 0,
      fight: { surprise: 0, round: 1, focus: 0 },
    });
    const { state, events } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(state.phase).toBe("fight"); // still fighting
    expect(events).toEqual([{ type: "blocked" }]);
  });
});

describe("reduce — special-area crossings (C-3 §10)", () => {
  // A Deep Pool (287 = NSEWC + special 2) at the start, the Gateway to its north.
  function poolStart(party: object[], over: object = {}) {
    return makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // north neighbour
        { card: 287, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // Deep Pool
      ],
      partyArea: 1,
      prev: 0, // we arrived from the north area (index 0)
      party: party as any,
      ...over,
    });
  }

  it("crossing a Deep Pool without a Giant drops heavy treasure into the pool", () => {
    // Leave the pool SOUTH (a fresh draw), i.e. NOT back north to where we came from.
    const s = poolStart([{ creatureId: 5, status: 0, dragonKills: 0, treasure: [1] }], { largePack: [31], largeIdx: 0 });
    const { state, events } = reduce(s, { type: "move", dir: 3 }); // DIR_S
    expect(state.party[0]!.treasure).toEqual([]); // Gold dropped
    expect(state.areas[1]!.dropped).toEqual([1]);
    expect(events).toContainEqual({ type: "crossedSpecial", special: SPECIAL_DEEP_POOL });
  });

  it("going back the way you came does NOT trigger the crossing", () => {
    const s = poolStart([{ creatureId: 5, status: 0, dragonKills: 0, treasure: [1] }]);
    const { state, events } = reduce(s, { type: "move", dir: 1 }); // DIR_N -> back to index 0
    expect(state.party[0]!.treasure).toEqual([1]); // kept — no crossing
    expect(events).not.toContainEqual({ type: "crossedSpecial", special: SPECIAL_DEEP_POOL });
  });

  it("re-entering a Deep Pool with dropped treasure enters the pickup phase to reclaim it", () => {
    const s = makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: 287, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, dropped: [1, 2] },
      ],
      partyArea: 0, // start north of the pool
      prev: 0,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
    });
    const { state, events } = reduce(s, { type: "move", dir: 3 }); // DIR_S into the pool (175 has a south door; 287 has a north door)
    expect(state.partyArea).toBe(1);
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([1, 2]);
    expect(state.areas[1]!.dropped).toEqual([]);
    expect(events).toContainEqual({ type: "treasureReclaimed", count: 2 });
  });

  it("crossing a Viper Pit with the Charmed Flute is always safe", () => {
    const s = makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: 415, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // Viper Pit (415 = special 3)
      ],
      partyArea: 1, prev: 0,
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [12] }], // Hero with Charmed Flute
      largePack: [31], largeIdx: 0,
    });
    const { state } = reduce(s, { type: "move", dir: 3 }); // cross south
    expect(state.party[0]!.status).toBe(0); // alive
    expect(state.gs).toBe(0); // still playing
  });
});

describe("reduce — treasure redistribution (party panel)", () => {
  it("moves a treasure between members when the recipient can carry it", () => {
    const s = makeState({
      phase: "explore",
      party: [
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [1] }, // Man with Gold (25kg)
        { creatureId: 2, status: 0, dragonKills: 0, treasure: [] },  // Ogre (carry 100)
      ],
    });
    const { state } = reduce(s, { type: "moveTreasure", from: 0, to: 1, idx: 0 });
    expect(state.party[0]!.treasure).toEqual([]);
    expect(state.party[1]!.treasure).toEqual([1]);
  });

  it("blocks a move that exceeds the recipient's carry capacity", () => {
    const s = makeState({
      phase: "explore",
      party: [
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [1] }, // Man with Gold
        { creatureId: 6, status: 0, dragonKills: 0, treasure: [0] }, // Woman (carry 25) already full with Silver
      ],
    });
    const { state, events } = reduce(s, { type: "moveTreasure", from: 0, to: 1, idx: 0 });
    expect(events).toContainEqual({ type: "blocked" });
    expect(state.party[0]!.treasure).toEqual([1]); // unchanged
  });

  it("drops a treasure onto the current chamber floor", () => {
    const s = makeState({
      phase: "explore",
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [1] }],
    });
    const { state } = reduce(s, { type: "dropTreasure", mi: 0, idx: 0 });
    expect(state.party[0]!.treasure).toEqual([]);
    expect(state.areas[state.partyArea]!.contents).toContain(200 + 1); // Gold left on the floor
  });

  it("re-offers treasure dropped during pickup so a Giant can clear room for the Chest", () => {
    // Giant (carry 150) carrying Silver+Gold+Gems (75kg) can't also lift the 100kg Chest.
    const s = makeState({
      phase: "pickup",
      treasures: [14], // Treasure Chest on the chamber floor
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [0, 1, 2] }],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    // The Chest is out of reach until room is freed.
    expect(legalActions(s).filter((a) => a.type === "takeTreasure")).toHaveLength(0);

    // Drop all three carried items to make room — each lands back on the live floor.
    let next = s;
    for (let i = 0; i < 3; i++) next = reduce(next, { type: "dropTreasure", mi: 0, idx: 0 }).state;
    expect(next.party[0]!.treasure).toEqual([]);
    expect(next.treasures).toEqual([14, 0, 1, 2]); // chest + the three dropped, all on the floor

    // Exactly one take for the Chest, plus one for each dropped item — all to the Giant.
    const takes = legalActions(next).filter((a): a is Extract<GameAction, { type: "takeTreasure" }> => a.type === "takeTreasure");
    expect(takes).toHaveLength(4);
    expect(takes.every((a) => a.mi === 0)).toBe(true);
    expect(takes.filter((a) => next.treasures[a.ti] === 14)).toHaveLength(1); // not three Chests
  });

  it("blocks redistribution during a fight", () => {
    const s = makeState({
      phase: "fight",
      party: [
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [1] },
        { creatureId: 2, status: 0, dragonKills: 0, treasure: [] },
      ],
      fight: { surprise: 0, round: 1, focus: 0 },
    });
    expect(reduce(s, { type: "moveTreasure", from: 0, to: 1, idx: 0 }).events).toContainEqual({ type: "blocked" });
    expect(reduce(s, { type: "dropTreasure", mi: 0, idx: 0 }).events).toContainEqual({ type: "blocked" });
  });

  it("forsaking the Eye of God (drop or transfer) curses the party", () => {
    const dropState = makeState({
      phase: "explore",
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [13] }], // Hero holding the Eye of God
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const dropped = reduce(dropState, { type: "dropTreasure", mi: 0, idx: 0 });
    expect(dropped.state.curses).toBe(1);
    expect(dropped.events).toContainEqual({ type: "eyeForsaken" });
    expect(dropped.state.party[0]!.treasure).toEqual([]);

    const moveState = makeState({
      phase: "explore",
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [13] },
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },
      ],
    });
    const moved = reduce(moveState, { type: "moveTreasure", from: 0, to: 1, idx: 0 });
    expect(moved.state.curses).toBe(1);
    expect(moved.events).toContainEqual({ type: "eyeForsaken" });
    expect(moved.state.party[1]!.treasure).toEqual([13]);
  });

  it("resolveRound: an illegal plan is rejected with a reason, no state change", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 },
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }], strangers: [9] }); // Man vs Spectre
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(events).toContainEqual({ type: "planRejected", reason: "spectreNeedsMagic" });
    expect(state).toBe(s); // unchanged
  });

  it("resolveRound: a legal plan resolves a round and clears the chamber", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 1, round: 1, focus: 0 }, seed: 5,
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }], strangers: [7], // Giant vs Dwarf
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(events).toContainEqual({ type: "strangerKilled", creatureId: 7 });
    expect(events).toContainEqual({ type: "fightWon" });
    expect(state.phase).toBe("explore");
  });

  it("resolveRound: blocked when not fighting", () => {
    expect(reduce(makeState({ phase: "explore" }), { type: "resolveRound", matches: [] }).events).toContainEqual({ type: "blocked" });
  });

  it("resolveRound: winning reclaims floor-dropped treasure into the pickup", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 1, round: 1, focus: 0 }, seed: 5,
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [1] }], strangers: [7], // Giant w/ Gold vs Dwarf
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(events).toContainEqual({ type: "fightWon" });
    expect(state.phase).toBe("pickup");          // there is treasure to reclaim → pickup, not straight to explore
    expect(state.treasures).toContain(1);        // the dropped Gold is reclaimable
    expect(state.areas[0]!.contents).not.toContain(200 + 1);
  });

  it("retreat leaves a slain member's treasure behind; the living keep theirs (§426)", () => {
    // Two pre-placed chamber tiles (card 31 = NESW) so the party can flee north into the known tile.
    const s = makeState({
      phase: "fight", fight: { surprise: 0, round: 2, focus: 0 }, partyArea: 0, prev: 1, level: 1,
      party: [
        { creatureId: 0, status: 3, dragonKills: 0, treasure: [3] }, // a slain Hero carrying the Magic Sword
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [7] }, // a living Man carrying the Talisman
      ],
      strangers: [3],
      areas: [
        { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
    });
    const { state } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(state.partyArea).toBe(1);                     // fled north into the known tile
    expect(state.areas[0]!.contents).toContain(200 + 3); // the slain Hero's Magic Sword is left behind
    expect(state.party[0]!.treasure).toEqual([]);        // ...and removed from the corpse
    expect(state.party[1]!.treasure).toEqual([7]);       // the living Man keeps his Talisman
  });

  it("opening the Treasure Chest on a curse roll lays a permanent curse on the party", () => {
    // seed 2 rolls a 1 (Curse) on the chest d6. The Giant that opened it carries the curse home.
    const s = makeState({
      phase: "explore",
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [14] }], // Giant holding the Chest
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      seed: 2,
    });
    const { state, events } = reduce(s, { type: "openChest" });
    expect(events).toContainEqual({ type: "chestOpened", result: 1 });
    expect(state.curses).toBe(1); // a permanent curse card — −1 to every roll, like the Eye of God
    expect(state.party[0]!.treasure).toEqual([]); // the chest is consumed
  });

  it("falling through a trap leaves the chamber's strangers/treasure behind — they don't follow you", () => {
    // A level-3 chamber drawn to the south yields a Trap + a Man + Gold; the (dwarfless) party falls
    // to the tunnel directly below. The Man and Gold must stay in the chamber, not leak onto the tunnel.
    const A0 = { card: 31, coord: packCoord(3, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore", areas: [A0], partyArea: 0, prev: 0, level: 3,
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }], // Hero — no dwarf, so the trap fires
      largePack: [31, 1], largeIdx: 0, // [chamber to the south, then a tunnel (card 1) below it]
      smallPack: [300 + 1, 100 + 5, 200 + 1], smallIdx: 0, // Trap, Man, Gold (3 draws at level 3)
      seed: 1,
    });
    const { state } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.fellThroughTrap).toBe(true);
    expect(state.level).toBe(4);
    expect(state.phase).toBe("explore");   // fell into a tunnel — at rest, not an encounter
    expect(state.strangers).toEqual([]);   // the Man did NOT follow the party down
    expect(state.treasures).toEqual([]);   // nor did the Gold
    const chamber = state.areas.find((a) => a.coord === packCoord(3, 50, 51))!;
    expect(chamber.contents).toEqual(expect.arrayContaining([100 + 5, 200 + 1])); // left behind in the chamber
  });

  it("the Woman-Hero can use the Healing Balm (she has all a woman's capabilities)", () => {
    const s = makeState({
      phase: "explore",
      party: [
        { creatureId: 1, status: 0, dragonKills: 0, treasure: [6] }, // Woman-Hero holding the Balm
        { creatureId: 0, status: 3, dragonKills: 0, treasure: [] },  // fallen Hero
      ],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    expect(legalActions(s)).toContainEqual({ type: "useArtifact", artifact: 6, target: 1 });
    const { state } = reduce(s, { type: "useArtifact", artifact: 6, target: 1 });
    expect(state.party[1]!.status).toBe(0); // revived
  });
});
