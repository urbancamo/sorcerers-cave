import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { GS_QUIT, GS_ESCAPED, GS_DEAD, AF_DESTROYED, AF_UNRESOLVED, type GameState } from "./state";
import { DIR_S, DIR_E, DIR_N, DIR_W, packCoord } from "./coords";
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

  it("a stair-up card DRAWN onto level 1 is a valid cave exit (not just the Gateway)", () => {
    // Rule: "any stairway leading up from the first level is an exit from the Cave." Move north off the
    // Gateway onto a freshly-drawn NESU card (39) — its stair-up survives, so the party can exit there.
    const s = makeState({ largePack: [39], largeIdx: 0, turn: 1 });
    const moved = reduce(s, { type: "move", dir: DIR_N }).state; // draws card 39 onto level 1
    expect(moved.level).toBe(1);
    expect(legalActions(moved)).toContainEqual({ type: "exitCave" });
    const { state, events } = reduce(moved, { type: "exitCave" });
    expect(state.gs).toBe(GS_ESCAPED);
    expect(events).toContainEqual({ type: "gameOver", gs: GS_ESCAPED });
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

  // Gap A (bug fix 2026-08-04, SC-4-18a): `withdraw` used to be the one landing path that skipped
  // the shared arrival resolution every other move uses — silently setting phase="explore" no
  // matter what was sitting at the destination. It now routes through `resolveArea`, so all three
  // of the following re-open correctly, in one change.
  it("Gap A: withdrawing into an abandoned, not-yet-permanent encounter re-opens it, not explore", () => {
    const s = makeState({
      phase: "encounter",
      strangers: [3], // a fresh Troll at the CURRENT area — will be parked here on withdraw
      treasures: [],
      areas: [
        // area 0 = `prev`: previously tested once indifferent (Woman id 6) and abandoned mid-encounter
        // via the leave window, without ever reaching permanent pacification.
        { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [100 + 6], flags: 0, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 1,
      prev: 0,
    });
    const { state, events } = reduce(s, { type: "withdraw" });
    expect(state.partyArea).toBe(0);
    expect(state.phase).toBe("encounter"); // re-opened — NOT a silent explore
    expect(state.strangers).toEqual([6]); // the abandoned Woman reloaded into the live working set
    expect(events).toContainEqual({ type: "moved", area: 0, level: 1 });
    // Fresh re-entry: must test/attack (or withdraw again) before any free leave — no residual window.
    expect(state.indiffLeaveOpen).not.toBe(true);
    const acts = legalActions(state);
    expect(acts.some((a) => a.type === "test")).toBe(true);
    expect(acts.some((a) => a.type === "attack")).toBe(true);
    expect(acts.some((a) => a.type === "move")).toBe(false);
    // The Troll left behind at the departed area parks exactly as an ordinary withdraw would leave it.
    expect(state.areas[1]!.contents).toContain(100 + 3);
  });

  it("Gap A: withdrawing into a hostileAreas tile (retreated from before) triggers an on-sight fight", () => {
    const s = makeState({
      phase: "encounter",
      strangers: [3],
      treasures: [],
      areas: [
        { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [100 + 6], flags: 0, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 1,
      prev: 0,
      hostileAreas: [0], // this party retreated from area 0's strangers before
    });
    const { state, events } = reduce(s, { type: "withdraw" });
    expect(state.partyArea).toBe(0);
    expect(state.phase).toBe("fight"); // attacks on sight — no encounter menu offered
    expect(state.fight?.surprise).toBe(-1);
    expect(events).toContainEqual({ type: "fightStarted", surprise: -1 });
  });

  it("Gap A: withdrawing into a Spell-remapped tile reveals it (clears AF_UNRESOLVED)", () => {
    const s = makeState({
      phase: "encounter",
      strangers: [3],
      treasures: [],
      areas: [
        { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: AF_UNRESOLVED, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 1,
      prev: 0,
    });
    const { state } = reduce(s, { type: "withdraw" });
    expect(state.partyArea).toBe(0);
    expect((state.areas[0]!.flags & AF_UNRESOLVED) === 0).toBe(true); // revealed on arrival
  });
});

// Gap D (bug fix 2026-08-04, SC-4-18a): "they remember forever how many times your party has
// approached them ... even if you went away in between" — the indifference count is DURABLE per
// area, restored on re-entry rather than reset to 0. Uses Test Mode's testNextReaction to force
// each test's outcome deterministically, and two pre-placed, already-connected areas (home <-> the
// stranger's chamber) so the party can walk back and forth without drawing any new tile.
describe("reduce — Gap D: durable, cross-visit indifference count", () => {
  function twoAreaState(): GameState {
    return makeState({
      areas: [
        { card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // home: E door only
        { card: 24, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [100 + 6], flags: 0, indiffCount: 0 }, // chamber: W door, a parked Woman (id 6)
      ],
      partyArea: 0,
      prev: 0,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }], // Man — no charisma bonus
    });
  }
  function forceIndifferentTest(s: GameState) {
    return reduce({ ...s, testMode: true, testNextReaction: "indifferent" }, { type: "test" }).state;
  }

  it("a second, separate approach resumes the count instead of restarting at 0", () => {
    let s = reduce(twoAreaState(), { type: "move", dir: DIR_E }).state; // first approach
    expect(s.phase).toBe("encounter");
    expect(s.strangers).toEqual([6]);
    expect(s.indiffStreak ?? 0).toBe(0); // never approached before

    s = forceIndifferentTest(s);
    expect(s.indiffStreak).toBe(1);
    expect(s.indiffCounts).toEqual({ 1: 1 });
    expect(s.indiffLeaveOpen).toBe(true);

    s = reduce(s, { type: "move", dir: DIR_W }).state; // leave via the window — successful, not a dead end
    expect(s.phase).toBe("explore");
    expect(s.partyArea).toBe(0);

    s = reduce(s, { type: "move", dir: DIR_E }).state; // a SEPARATE later approach
    expect(s.phase).toBe("encounter");
    expect(s.strangers).toEqual([6]); // the same stranger, remembered
    expect(s.indiffStreak).toBe(1); // RESUMED at 1, not reset to 0
    expect(s.indiffLeaveOpen).not.toBe(true); // must retest before any free leave, regardless
    const acts = legalActions(s);
    expect(acts.some((a) => a.type === "test")).toBe(true);
    expect(acts.some((a) => a.type === "move")).toBe(false);
  });

  it("three SEPARATE indifferent approaches (leaving and returning each time) reach permanent pacification", () => {
    let s = reduce(twoAreaState(), { type: "move", dir: DIR_E }).state;
    for (let visit = 1; visit <= 3; visit++) {
      s = forceIndifferentTest(s);
      if (visit < 3) {
        expect(s.indiffStreak).toBe(visit);
        expect(s.phase).toBe("encounter"); // not yet permanent — still in the same encounter
        s = reduce(s, { type: "move", dir: DIR_W }).state; // leave via the window
        expect(s.phase).toBe("explore");
        s = reduce(s, { type: "move", dir: DIR_E }).state; // approach again, separately
        expect(s.indiffStreak).toBe(visit); // resumed count from the prior separate approach
      }
    }
    expect(s.indiffStreak).toBe(3);
    expect(s.pacifiedAreas).toContain(1);
    expect(s.phase).toBe("explore"); // permanently settled — free to pass, guards parked
    expect(legalActions(s).some((a) => a.type === "test")).toBe(false);
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

  it("testing an always-hostile leader (the Sorcerer) starts a fight with surprise to the strangers", () => {
    const s = makeState({ phase: "encounter", strangers: [11], areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }] });
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

  it("a Unicorn-led reaction marks its event `certain` — the die is genuinely rolled (seed advances) but has no informational content, since hostileMax/indiffMax are both 0 (bug fix 2026-08-02)", () => {
    const s = makeState({
      phase: "encounter",
      party: [{ creatureId: 6, status: 0, dragonKills: 0, treasure: [] }], // Woman present
      strangers: [13], // Unicorn alone — its leaderPri (0) is lowest, so grouping with anything
      // else would make a DIFFERENT creature the leader; this fixture isolates the Unicorn case.
      treasures: [],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const before = s.seed;
    const { state, events } = reduce(s, { type: "test" });
    expect(events).toContainEqual({ type: "reaction", outcome: "friendly", roll: expect.any(Number), certain: true });
    expect(state.seed).not.toBe(before); // still a genuine roll — determinism/replay parity is untouched
  });

  it("a non-Unicorn reaction never carries `certain`", () => {
    const s = makeState({
      phase: "encounter", strangers: [11], // Sorcerer — hostile on every roll (SC-8.5-1), not deterministic-by-coincidence like the Unicorn
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { events } = reduce(s, { type: "test" });
    const reaction = events.find((e) => e.type === "reaction");
    expect(reaction).toMatchObject({ outcome: "hostile" });
    expect((reaction as { certain?: true }).certain).toBeUndefined();
  });

  it("a friendly result recruits EVERY stranger regardless of party size (original rules: no party cap)", () => {
    // 13 living members already (more than the old 12-cap) + a friendly Unicorn with a Woman present.
    // The original rules impose no party-size limit — a friendly group is always added in full.
    const party = [
      { creatureId: 6, status: 0 as const, dragonKills: 0, treasure: [] }, // living Woman (Unicorn loyalty)
      ...Array.from({ length: 12 }, () => ({ creatureId: 0, status: 0 as const, dragonKills: 0, treasure: [] })), // 12 Heroes
    ];
    const s = makeState({
      phase: "encounter", party, strangers: [13], treasures: [],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { state, events } = reduce(s, { type: "test" });
    expect(state.party.some((m) => m.creatureId === 13 && m.status === 1)).toBe(true); // the Unicorn still joins
    expect(events).toContainEqual(expect.objectContaining({ type: "strangersJoined", count: 1 }));
    expect(state.party.length).toBe(14); // no slot was refused
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

  it("after ONE indifferent result the party may already move on by any doorway, leaving the treasure", () => {
    // Rules check (docs/specs/sorcerers-cave-rules.md, §Encountering Strangers): "If the strangers
    // are indifferent, in its next turn the party may test them again, or attack them, or leave the
    // chamber by any doorway without picking up any treasure found there." That's ONE indifferent
    // result, not three — the "three rolls" rule (§Solitaire Play) only governs whether a LATER
    // re-entry needs re-testing, not whether the party may leave at all. Same seed/party/stranger as
    // the "three indifferent" test above (a single indifferent roll here, not looped to pacify).
    const s = makeState({
      phase: "encounter", strangers: [6], treasures: [1], seed: 9,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [39], largeIdx: 0, // card 39 has a south door, to connect back from a move North off card 31
    });
    const t = reduce(s, { type: "test" });
    expect(t.events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "indifferent" }));
    expect(t.state.indiffStreak).toBe(1);
    expect(t.state.phase).toBe("encounter"); // not pacified yet — just one test in
    const acts = legalActions(t.state);
    expect(acts.some((a) => a.type === "move" && a.dir === DIR_N)).toBe(true); // already free to leave
    expect(acts.some((a) => a.type === "test")).toBe(true);  // may still test again instead
    expect(acts.some((a) => a.type === "attack")).toBe(true); // or attack instead

    const m = reduce(t.state, { type: "move", dir: DIR_N });
    expect(m.events).not.toContainEqual({ type: "blocked" });
    expect(m.state.partyArea).not.toBe(t.state.partyArea); // actually relocated
    expect(m.state.phase).not.toBe("encounter"); // no longer stuck with these strangers
    // the indifferent stranger AND its treasure stay behind, guarded, exactly as a withdraw would leave them
    expect(m.state.areas[0]!.contents).toEqual(expect.arrayContaining([200 + 1, 100 + 6]));
    expect(m.state.party[0]!.treasure).toEqual([]); // nothing looted
  });

  it("a dead end while trying to leave an indifferent encounter re-opens the SAME encounter, not explore", () => {
    // Rules check (§Encountering Strangers): "if it finds itself delayed by a dead end… it must in
    // the same turn either test the strangers again or attack them." Card 1 has only a North exit
    // (no south-facing door back), so drawing it off a move North is guaranteed to dead-end.
    const s = makeState({
      phase: "encounter", strangers: [6], treasures: [1], seed: 9,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [1], largeIdx: 0, // card 1: North exit only — no door back South — a guaranteed dead end
    });
    const t = reduce(s, { type: "test" });
    expect(t.state.indiffStreak).toBe(1);

    const m = reduce(t.state, { type: "move", dir: DIR_N });
    expect(m.events).toContainEqual({ type: "deadEnd", dir: DIR_N });
    expect(m.state.partyArea).toBe(t.state.partyArea); // never actually left
    expect(m.state.phase).toBe("encounter");           // pulled straight back into the SAME encounter
    expect(m.state.strangers).toEqual([6]);             // still live, not parked away
    expect(m.state.treasures).toEqual([1]);
    expect(m.state.areas[t.state.partyArea]!.contents).toEqual([]); // nothing was parked here after all
    expect(m.state.areas.length).toBe(t.state.areas.length + 1);   // the face-down frontier tile still placed…
    expect(m.state.areas[m.state.areas.length - 1]!.faceUp).toBe(false); // …and stays face-down (§Exploring the Cave)
    // Gap C (bug fix 2026-08-04): the dead end forfeits the leave window — the party must retest
    // (or attack, or withdraw) rather than simply trying another doorway blind.
    expect(m.state.indiffLeaveOpen).not.toBe(true);
    const acts = legalActions(m.state);
    expect(acts.some((a) => a.type === "test")).toBe(true);    // free to test again
    expect(acts.some((a) => a.type === "attack")).toBe(true);  // or attack
    expect(acts.some((a) => a.type === "withdraw")).toBe(true); // withdraw stays available too
    expect(acts.some((a) => a.type === "move")).toBe(false);   // but NOT another free leave attempt
  });

  it("Gap C: choosing to test again after an indifferent result also forfeits the leave window", () => {
    // "If the party chooses to remain in the chamber ... it must in the same turn either test the
    // strangers again or attack them" — testing again is exactly "remaining," and the window from
    // the FIRST test doesn't linger once a second decision has been made.
    const s = makeState({
      phase: "encounter", strangers: [6], treasures: [1], seed: 9,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const t = reduce(s, { type: "test" });
    expect(t.state.indiffStreak).toBe(1);
    expect(t.state.indiffLeaveOpen).toBe(true);
    expect(legalActions(t.state).some((a) => a.type === "move")).toBe(true);
    // Choosing to test again (rather than moving) — this seed/party/stranger reliably lands
    // indifferent again (proven by the "three indifferent results" test above using the identical
    // fixture), so the window recomputes fresh from THIS test's own outcome: streak 2, reopened.
    const t2 = reduce(t.state, { type: "test" });
    expect(t2.state.indiffStreak).toBe(2);
    expect(t2.state.indiffLeaveOpen).toBe(true);
    expect(legalActions(t2.state).some((a) => a.type === "move")).toBe(true);
  });

  it("before any test, the party may NOT move on — must withdraw, attack, or test first", () => {
    const s = makeState({
      phase: "encounter", strangers: [6], treasures: [1],
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [39], largeIdx: 0,
    });
    expect(s.indiffStreak ?? 0).toBe(0);
    expect(legalActions(s).some((a) => a.type === "move")).toBe(false);
    expect(reduce(s, { type: "move", dir: DIR_N }).events).toContainEqual({ type: "blocked" });
  });

  it("a pacified chamber re-entry lets you traverse (explore) AND offers Attack; treasure stays guarded", () => {
    // Tunnel A (exit E) → chamber B (card 31), already pacified for this party with a guarded stranger+treasure.
    const A = { card: 2, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const B = { card: 31, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [100 + 6, 200 + 1], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore", areas: [A, B], partyArea: 0, prev: 0,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }], pacifiedAreas: [1],
    });
    const r = reduce(s, { type: "move", dir: DIR_E });
    expect(r.state.partyArea).toBe(1);
    expect(r.state.phase).toBe("explore");            // free to traverse through any exit
    const acts = legalActions(r.state);
    expect(acts.some((a) => a.type === "move")).toBe(true);          // can move on through (traversal)
    expect(acts.some((a) => a.type === "attack")).toBe(true);        // can also attack the guards
    expect(acts.some((a) => a.type === "test")).toBe(false);         // testing is futile (permanently indifferent)
    expect(acts.some((a) => a.type === "takeTreasure")).toBe(false); // treasure stays guarded
    expect(r.state.areas[1]!.contents).toEqual(expect.arrayContaining([100 + 6, 200 + 1])); // guards + loot parked on the tile

    // Choosing Attack un-parks the guards and starts the fight.
    const f = reduce(r.state, { type: "attack" });
    expect(f.state.phase).toBe("fight");
    expect(f.state.strangers).toEqual([6]);
    expect(f.state.treasures).toEqual([1]); // the guarded treasure is in play to be won
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
        { creatureId: 0, status: 2, dragonKills: 0, treasure: [], stoneArea: 0 },  // petrified Hero (stoned in this area)
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
    expect(events).toContainEqual({ type: "deadEnd", dir: DIR_N, retreat: true }); // retreat flavor (SC-4-42)
    // No further retreat is allowed this round — only fighting on (the round is resolved via the
    // resolveRound action, which is built by the fight UI rather than offered in legalActions). §Retreat
    expect(state.fight!.retreatBlocked).toBe(true);
    expect(legalActions(state).some((a) => a.type === "retreat")).toBe(false);
  });

  it("retreating when no tile can be drawn (deck exhausted) also fails with a notice, not a silent bounce", () => {
    const s = arena({
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }],
      strangers: [3],
      areas: [{ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      partyArea: 0, prev: 0,
      fight: { surprise: 0, round: 2, focus: 0 },
      largePack: [], largeIdx: 0, // nothing left to draw — the way north can't open
    });
    const { state, events } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(events).toContainEqual({ type: "deadEnd", dir: DIR_N, retreat: true }); // retreat flavor (SC-4-42) // a notice fires (was a silent "blocked")
    expect(state.fight!.retreatBlocked).toBe(true);                 // and retreat is locked, not left dangling
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

  // Re-enter a Deep Pool (index 1, with `dropped` treasure) by moving SOUTH into it from the north tile.
  const reenterPool = (party: object[], dropped: number[]) => makeState({
    areas: [
      { card: 175, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      { card: 287, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, dropped },
    ],
    partyArea: 0, prev: 0, party: party as any,
  });

  it("re-entering a Deep Pool WITH a capable Giant recovers the dropped treasure into pickup", () => {
    const s = reenterPool([{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }], [1, 2]); // a Giant
    const { state, events } = reduce(s, { type: "move", dir: 3 }); // DIR_S into the pool
    expect(state.partyArea).toBe(1);
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([1, 2]);
    expect(state.areas[1]!.dropped).toEqual([]);
    expect(events).toContainEqual({ type: "treasureReclaimed", count: 2 });
  });

  it("re-entering a Deep Pool WITHOUT a Giant leaves the treasure in the pool (recoverable only by a Giant)", () => {
    const s = reenterPool([{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }], [1, 2]); // a Man — no Giant
    const { state, events } = reduce(s, { type: "move", dir: 3 });
    expect(state.partyArea).toBe(1);
    expect(state.phase).toBe("explore");
    expect(state.treasures).toEqual([]);
    expect(state.areas[1]!.dropped).toEqual([1, 2]); // untouched — sinks back into the pool
    expect(events).not.toContainEqual(expect.objectContaining({ type: "treasureReclaimed" }));
    expect(events).toContainEqual({ type: "enteredSpecial", special: SPECIAL_DEEP_POOL });
  });

  it("a Giant with no spare capacity cannot recover — the treasure stays in the pool", () => {
    // Giant (150 kg) already full with six Silver (6×25) → no room to fish anything out.
    const s = reenterPool([{ creatureId: 12, status: 0, dragonKills: 0, treasure: [0, 0, 0, 0, 0, 0] }], [1]);
    const { state } = reduce(s, { type: "move", dir: 3 });
    expect(state.phase).toBe("explore");
    expect(state.areas[1]!.dropped).toEqual([1]);
  });

  it("a Deep Pool recovery is a Giant-only pickup: an ordinary member cannot take the treasure", () => {
    const mid = reduce(reenterPool([
      { creatureId: 12, status: 0, dragonKills: 0, treasure: [] }, // Giant (mi 0)
      { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },  // Man (mi 1)
    ], [1]), { type: "move", dir: 3 }).state;
    expect(mid.phase).toBe("pickup");
    const acts = legalActions(mid);
    expect(acts).toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 });     // the Giant may take it
    expect(acts).not.toContainEqual({ type: "takeTreasure", ti: 0, mi: 1 }); // the Man may not
    expect(reduce(mid, { type: "takeTreasure", ti: 0, mi: 1 }).events).toContainEqual({ type: "blocked" });
    const after = reduce(mid, { type: "takeTreasure", ti: 0, mi: 0 }).state;
    expect(after.party[0]!.treasure).toEqual([1]);
  });

  it("treasure a Giant can't fit is left back in the pool on leaving", () => {
    // Giant carrying five Silver (125 kg, 25 kg spare) can fish out only one of three dropped items.
    const s = reenterPool([{ creatureId: 12, status: 0, dragonKills: 0, treasure: [0, 0, 0, 0, 0] }], [0, 1, 2]);
    const mid = reduce(s, { type: "move", dir: 3 }).state;
    expect(mid.phase).toBe("pickup");
    expect(mid.treasures).toEqual([0, 1, 2]);
    const took = reduce(mid, { type: "takeTreasure", ti: 0, mi: 0 }).state; // Giant takes one → full
    expect(took.phase).toBe("pickup");
    const done = reduce(took, { type: "leaveTreasure" }).state;
    expect(done.phase).toBe("explore");
    expect(done.areas[1]!.dropped).toEqual([1, 2]); // the two it couldn't carry sink back into the pool
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

  it("re-offers treasure dropped in a tunnel when the party returns (not stranded)", () => {
    // Card 5 = NS tunnel (north+south doors, no chamber bit). Man carrying Gold.
    const s = makeState({
      largePack: [5], largeIdx: 0, turn: 1,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [1] }],
    });
    // Enter the tunnel (explore — no encounter/pickup) and drop the Gold on its floor.
    const inTunnel = reduce(s, { type: "move", dir: DIR_S }).state;
    expect(inTunnel.phase).toBe("explore");
    const dropped = reduce(inTunnel, { type: "dropTreasure", mi: 0, idx: 0 }).state;
    expect(dropped.areas[dropped.partyArea]!.contents).toContain(201); // 200 + Gold(1)

    // Leave north to the Gateway, then return south to the same tunnel.
    const back = reduce(dropped, { type: "move", dir: DIR_N }).state;
    const { state: reentered } = reduce(back, { type: "move", dir: DIR_S });

    // The Gold must be reclaimable again — a pickup is offered, not left stranded on the floor.
    expect(reentered.phase).toBe("pickup");
    expect(reentered.treasures).toContain(1);
    expect(legalActions(reentered)).toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 });
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

  it("returning to a chamber with a Wizard + Magic Staff frees the members left as stone there (§Medusa)", () => {
    // Two connected chambers; a Man is stone in area A (index 0). The party (with a Wizard holding the
    // Magic Staff) is in B (index 1) and moves back south into A.
    const A = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const B = { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore", areas: [A, B], partyArea: 1, prev: 0, level: 1,
      party: [
        { creatureId: 8, status: 0, dragonKills: 0, treasure: [9] },            // Wizard with the Magic Staff
        { creatureId: 5, status: 2, dragonKills: 0, treasure: [], stoneArea: 0 }, // Man, left as stone in A
      ],
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S }); // B(50,49) → A(50,50)
    expect(state.partyArea).toBe(0);
    expect(state.party[1]!.status).toBe(0);            // revived
    expect(state.party[1]!.stoneArea).toBeUndefined(); // pin cleared
    expect(events).toContainEqual({ type: "memberRevived", creatureId: 5 });
  });

  it("without a Wizard + Magic Staff, stone members left in a chamber stay stone on return", () => {
    const A = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const B = { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore", areas: [A, B], partyArea: 1, prev: 0, level: 1,
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [] },             // a Hero, no staff
        { creatureId: 5, status: 2, dragonKills: 0, treasure: [], stoneArea: 0 }, // Man, stone in A
      ],
    });
    const { state } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.party[1]!.status).toBe(2); // still stone
  });

  it("withdraw is blocked when an earthquake has collapsed the way back (§Earthquake)", () => {
    // The party came from A (now earthquake-rubble) into B, where strangers wait. Withdraw would walk
    // back into the collapsed area — it must be refused and not offered.
    const A = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: AF_DESTROYED, indiffCount: 0 };
    const B = { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "encounter", areas: [A, B], partyArea: 1, prev: 0, level: 1,
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }], strangers: [3],
    });
    expect(legalActions(s).some((a) => a.type === "withdraw")).toBe(false);
    expect(reduce(s, { type: "withdraw" }).events).toContainEqual({ type: "blocked" });
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

  it("retakeDropped returns each fighter's dropped treasure, as distributed before", () => {
    const s = makeState({
      phase: "pickup", treasures: [1, 2], // Gold + Gems reclaimed onto the floor after the win
      party: [
        { creatureId: 12, status: 0, dragonKills: 0, treasure: [] }, // Giant — dropped the Gold
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },  // Man  — dropped the Gems
      ],
      fightDrops: [{ mi: 0, tid: 1 }, { mi: 1, tid: 2 }],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    expect(legalActions(s)).toContainEqual({ type: "retakeDropped" });
    const { state, events } = reduce(s, { type: "retakeDropped" });
    expect(state.party[0]!.treasure).toEqual([1]); // Giant got the Gold back
    expect(state.party[1]!.treasure).toEqual([2]); // Man got the Gems back
    expect(state.treasures).toEqual([]);           // floor cleared
    expect(events).toContainEqual({ type: "droppedRetaken", count: 2 });
    expect(state.phase).toBe("explore");           // nothing left to pick up → moved on
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
