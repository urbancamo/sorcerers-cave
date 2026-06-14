import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { GS_QUIT, GS_ESCAPED } from "./state";
import { DIR_S, packCoord } from "./coords";
import { makeState } from "./testkit";
import { legalActions } from "./selectors";
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

  it("moving into a chamber with a stranger enters the encounter phase", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [110], smallIdx: 0 });
    const { state } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.phase).toBe("encounter");
    expect(state.strangers).toEqual([10]);
    expect(legalActions(state)).toContainEqual({ type: "withdraw" });
    expect(legalActions(state)).toContainEqual({ type: "attack" });
    expect(legalActions(state)).toContainEqual({ type: "test" });
    expect(legalActions(state)).toContainEqual({ type: "quit" });
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
  it("attack starts a fight with surprise to the party", () => {
    const s = makeState({ phase: "encounter", strangers: [10], areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "attack" });
    expect(state.phase).toBe("fight");
    expect(state.fight).toMatchObject({ surprise: 1, round: 1 });
    expect(events).toContainEqual({ type: "fightStarted", surprise: 1 });
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

  it("three indifferent results make the area permanently indifferent (no more test)", () => {
    // Man-stranger (id 5) is always indifferent.
    let s = makeState({ phase: "encounter", strangers: [5], areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }] });
    for (let i = 0; i < 3; i++) s = reduce(s, { type: "test" }).state;
    expect(s.areas[0]!.indiffCount).toBe(3);
    expect(legalActions(s)).not.toContainEqual({ type: "test" });
    expect(reduce(s, { type: "test" }).events).toContainEqual({ type: "blocked" });
  });
});

describe("reduce — fight dispatch (C-2 §9.5)", () => {
  const arena = (over: object) => makeState({
    phase: "fight",
    fight: { surprise: 1, round: 1, focus: 0 },
    areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    ...over,
  });

  it("fightOn that wipes the strangers wins the fight and exits combat", () => {
    const s = arena({ party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }], strangers: [7], seed: 5 });
    const { state, events } = reduce(s, { type: "fightOn" });
    expect(state.strangers).toEqual([]);
    expect(state.fight).toBeNull();
    expect(state.phase).toBe("explore");
    expect(events).toContainEqual({ type: "fightWon" });
  });

  it("fightOn that wipes the party ends the game as DEAD", () => {
    // A lone Dwarf (FS 1) vs a Dragon (FS 6) with surprise to the strangers — the Dwarf dies.
    const s = arena({
      party: [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [] }],
      strangers: [10],
      fight: { surprise: -1, round: 1, focus: 0 },
      seed: 5,
    });
    const { state } = reduce(s, { type: "fightOn" });
    expect(state.party.every((m) => m.status === 3)).toBe(true);
    expect(state.gs).toBe(2); // GS_DEAD
    expect(state.phase).toBe("gameOver");
  });

  it("focusTarget sets the focus; retreat leaves combat with strangers persisted", () => {
    const s = arena({
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }],
      strangers: [3, 10],
      prev: 0,
    });
    expect(reduce(s, { type: "focusTarget", idx: 1 }).state.fight!.focus).toBe(1);
    const r = reduce(s, { type: "retreat" }).state;
    expect(r.phase).toBe("explore");
    expect(r.fight).toBeNull();
    expect(r.areas[0]!.contents).toEqual(expect.arrayContaining([103, 110]));
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
