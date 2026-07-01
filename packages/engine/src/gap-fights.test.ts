import { describe, it, expect } from "vitest";
import { resolvePlannedRound } from "./combatPlan";
import { reduce } from "./reduce";
import { frontStrength } from "./combat";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { GS_DEAD } from "./state";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

// Reuse the helper style from combatPlan.test.ts.
const member = (creatureId: number, treasure: number[] = []): PartyMember =>
  ({ creatureId, status: 0, dragonKills: 0, treasure });
const fightS = (over: Parameters<typeof makeState>[0] = {}) =>
  makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, ...over });
// Deep-ish clone so a resolution mutates its own copy, not the test fixture.
const clone = (s: GameState): GameState =>
  ({ ...s, fight: s.fight ? { ...s.fight } : null, strangers: [...s.strangers], party: s.party.map((m) => ({ ...m })) });
const rolls = (events: GameEvent[]) =>
  events.filter((e): e is Extract<GameEvent, { type: "combatRoll" }> => e.type === "combatRoll");

// Direction bits (see coords.ts): N=1 E=2 S=4 W=8; card bits chamber=16 stairUp=32 stairDown=64.
const DIR_S = 3;
const DIR_N = 1;

// Creature ids: Hero0 Man5 Woman6 Dwarf7 Wizard8 Spectre9 Dragon10.
// Treasure ids: Magic Sword3, Strength Potion8, The Ring10, Eye of God13.

describe("SC-9.2-2 surprise from a fresh entry (§Surprise)", () => {
  it("SC-9.2-2: attacking straight from a fresh entry grants the party surprise +1", () => {
    // An encounter reached by an unused doorway: surpriseReady is set (reduce.ts:198). Attacking now
    // starts the fight with surprise +1 (reduce.ts startFight, line ~64-71 / 508).
    const s = makeState({ phase: "encounter", surpriseReady: true, strangers: [3] }); // a Troll
    const { state, events } = reduce(s, { type: "attack" });
    expect(events).toContainEqual({ type: "fightStarted", surprise: 1 });
    expect(state.fight!.surprise).toBe(1);
    expect(state.surpriseReady).toBe(false); // the surprise is now baked into the fight
  });

  it("SC-9.2-2: approaching to `test` first forfeits surprise (a later attack is surprise 0)", () => {
    // Man party (no charisma) vs a Troll at seed 1 → an indifferent reaction, so the party stays in
    // the encounter but has forfeited its surprise (reduce.ts:448). A follow-up attack is surprise 0.
    const s = makeState({
      phase: "encounter", surpriseReady: true, strangers: [3], seed: 1,
      party: [member(5)], // a Man (no charisma → raw reaction roll)
    });
    const afterTest = reduce(s, { type: "test" });
    expect(afterTest.events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "indifferent" }));
    expect(afterTest.state.phase).toBe("encounter");
    expect(afterTest.state.surpriseReady).toBe(false); // forfeited by testing
    const attacked = reduce(afterTest.state, { type: "attack" });
    expect(attacked.events).toContainEqual({ type: "fightStarted", surprise: 0 });
    expect(attacked.state.fight!.surprise).toBe(0);
  });
});

describe("SC-9.2-3 a hostile reaction opens the fight (§Reactions)", () => {
  it("SC-9.2-3: a hostile `test` starts the fight with surprise −1 to the strangers", () => {
    // Man party vs a Troll at seed 2 → a hostile reaction, which begins the fight with the strangers
    // enjoying surprise (reduce.ts:487 → startFight(-1)).
    const s = makeState({
      phase: "encounter", strangers: [3], seed: 2,
      party: [member(5)], // a Man (no charisma)
    });
    const { state, events } = reduce(s, { type: "test" });
    expect(events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "hostile" }));
    expect(events).toContainEqual({ type: "fightStarted", surprise: -1 });
    expect(state.fight!.surprise).toBe(-1);
  });
});

describe("SC-9.3-3 Strength Potion end-to-end (§9.3)", () => {
  it("SC-9.3-3: using potion (id 8) sets potionActive and adds +2 to frontStrength", () => {
    const base = fightS({ party: [member(0, [8])], strangers: [3] }); // Hero carrying the Potion
    const before = frontStrength(base.party[0]!, base); // Hero FS 5
    expect(before).toBe(5);
    const { state, events } = reduce(base, { type: "useArtifact", artifact: 8, target: 0 });
    expect(events).toContainEqual({ type: "artifactUsed", artifact: 8 });
    expect(state.party[0]!.potionActive).toBe(true);
    expect(state.party[0]!.treasure).not.toContain(8); // consumed
    expect(frontStrength(state.party[0]!, state)).toBe(before + 2); // +2 vs baseline
  });

  it("SC-9.3-3: the potion boost is cleared when the fight ends", () => {
    // Hero (FS 5 + potion 2 = 7) vs a Troll (FS 4); at seed 1 the party wins and the fight ends,
    // clearing potionActive (finalizeRound, reduce.ts:93).
    const base = fightS({ party: [member(0, [8])], strangers: [3], seed: 1 });
    const boosted = reduce(base, { type: "useArtifact", artifact: 8, target: 0 });
    expect(boosted.state.party[0]!.potionActive).toBe(true);
    const { state, events } = reduce(boosted.state, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(events).toContainEqual({ type: "fightWon" });
    expect(state.party[0]!.potionActive).toBe(false); // cleared when the fight ended
  });
});

describe("SC-9.4-5 Ring stops the un-fightable-Spectre auto-slay (§Spectre / §The Ring)", () => {
  it("SC-9.4-5: an idle un-fightable Spectre cannot slay a Ring-invincible strongest member", () => {
    // Level 4, a lone Ogre (FS 5, no magic) holding The Ring, facing an un-fightable Spectre. The empty
    // plan is legal (combatPlan.ts:44-46); normally the strongest is auto-slain, but the Ring bearer is
    // invincible so a deathPrevented fires instead (combatPlan.ts:246-258).
    const s = clone(fightS({ level: 4, party: [member(2, [10])], strangers: [9] })); // Ogre+Ring vs Spectre
    const events = resolvePlannedRound(s, { matches: [] });
    expect(events).toContainEqual({ type: "deathPrevented", creatureId: 2 });
    expect(events.some((e) => e.type === "memberDied")).toBe(false);
    expect(events.some((e) => e.type === "spectreSlew")).toBe(false);
    expect(s.party[0]!.status).not.toBe(3); // the Ogre survives
  });
});

describe("SC-9.5-3 Ring-invincibility on a lost match (§The Ring)", () => {
  it("SC-9.5-3: a single fighter who LOSES while Ring-invincible yields deathPrevented", () => {
    // Level 4: a lone Dwarf (FS 1) with The Ring loses to a Dragon (FS 6). Seed 3 forces the loss
    // (partyTotal 1+4+1=6 < enemyTotal 6+2=8), but the killing roll is ignored (reduce.ts / combatPlan
    // ringInvincible at line 288-289).
    const s = clone(fightS({ level: 4, party: [member(7, [10])], strangers: [10], seed: 3 })); // Dwarf+Ring vs Dragon
    const events = resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    const roll = rolls(events)[0]!;
    expect(roll.enemyTotal).toBeGreaterThan(roll.partyTotal); // the Dwarf lost the match
    expect(events).toContainEqual({ type: "deathPrevented", creatureId: 7 });
    expect(events).not.toContainEqual({ type: "memberDied", creatureId: 7 });
    expect(s.party[0]!.status).not.toBe(3);
  });
});

describe("SC-9.5-5 chooseCasualty die (§A Round of Fighting)", () => {
  // A pending pair [0,1] who lost a match together; chooseCasualty rolls one die: 4-6 honours the
  // player's pick (gotPreference), 1-3 kills the other (reduce.ts:524-546).
  const pending = (seed: number) =>
    fightS({
      seed,
      party: [member(5), member(6)], // Man, Woman
      strangers: [10], // a Dragon (already engaged; irrelevant once queued)
      fight: { surprise: 0, round: 2, focus: 0, casualtyQueue: [[0, 1]] },
    });

  it("SC-9.5-5: a 4-6 roll kills the player's pick (gotPreference true)", () => {
    const { state, events } = reduce(pending(1), { type: "chooseCasualty", idx: 0 }); // seed 1 → die 4
    expect(events).toContainEqual(expect.objectContaining({ type: "casualtyChosen", roll: 4, gotPreference: true }));
    expect(state.party[0]!.status).toBe(3); // the chosen Man falls
    expect(state.party[1]!.status).not.toBe(3);
  });

  it("SC-9.5-5: a 1-3 roll kills the OTHER of the pair (gotPreference false)", () => {
    const { state, events } = reduce(pending(2), { type: "chooseCasualty", idx: 0 }); // seed 2 → die 1
    expect(events).toContainEqual(expect.objectContaining({ type: "casualtyChosen", roll: 1, gotPreference: false }));
    expect(state.party[1]!.status).toBe(3); // the other (Woman) falls instead
    expect(state.party[0]!.status).not.toBe(3);
  });
});

describe("SC-9.5-6 retreat legality (§Retreat)", () => {
  // A two-area corridor so a retreat has somewhere to go: [0] chamber tile (S exit back North to [1]).
  const retreatState = (over: Partial<GameState> = {}) =>
    fightS({
      strangers: [3], // a Troll
      partyArea: 1,
      prev: 0,
      areas: [
        { card: 4, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // north tile with a South door (reverse)
        { card: 1, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // party tile with a North door
      ],
      ...over,
    });

  it("SC-9.5-6: retreat is blocked on round 1 (round <= 1)", () => {
    const s = retreatState({ fight: { surprise: 0, round: 1, focus: 0 } });
    const { events } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("SC-9.5-6: retreat is blocked after a one-way trap fall (fellThroughTrap)", () => {
    const s = retreatState({ fight: { surprise: 0, round: 2, focus: 0 }, fellThroughTrap: true });
    const { events } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("SC-9.5-6: retreat is allowed after >= 1 round by an available doorway", () => {
    const s = retreatState({ fight: { surprise: 0, round: 2, focus: 0 } });
    const { state, events } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(events).not.toContainEqual({ type: "blocked" });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "deadEnd" }));
    expect(state.fight).toBe(null); // the fight ended — the party fled
    expect(state.partyArea).toBe(0); // moved into the north tile
  });
});

describe("SC-9.5-7 a blocked retreat is a dead end (§Retreat)", () => {
  it("SC-9.5-7: retreating into a dead end emits deadEnd and sets fight.retreatBlocked", () => {
    // The party tile has only a South door; the drawn tile there has no reverse (North) door → dead end.
    const s = fightS({
      strangers: [3],
      fight: { surprise: 0, round: 2, focus: 0 },
      areas: [
        { card: 4, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // S door only
      ],
      largePack: [4], // drawn South tile: card 4 = S door only, no North reverse → does not connect
      largeIdx: 0,
    });
    const { state, events } = reduce(s, { type: "retreat", dir: DIR_S });
    expect(events).toContainEqual({ type: "deadEnd", dir: DIR_S });
    expect(state.fight!.retreatBlocked).toBe(true);
  });
});

describe("SC-9.5-8 a successful retreat marks the fled area hostile (§Retreat)", () => {
  it("SC-9.5-8: the strangers are left behind and the fled area is recorded hostile-on-sight", () => {
    const s = fightS({
      strangers: [3], // a Troll left behind
      partyArea: 1,
      prev: 0,
      fight: { surprise: 0, round: 2, focus: 0 },
      areas: [
        { card: 4, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // north tile with a South door (reverse)
        { card: 1, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // party tile with a North door
      ],
    });
    const { state } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(state.strangers).toEqual([]); // cleared from the working set
    expect(state.hostileAreas).toContain(1); // the fled area is now hostile-on-sight
    expect(state.areas[1]!.contents).toContain(100 + 3); // the Troll parked back on the fled tile
  });
});

describe("SC-9.5-9 finalizeRound end conditions (§A Round of Fighting)", () => {
  it("SC-9.5-9: clearing all strangers emits fightWon and moves on", () => {
    // Hero (FS 5) beats a lone Troll (FS 4) at seed 1 → the strangers clear → fightWon.
    const s = fightS({ party: [member(0)], strangers: [3], seed: 1 });
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(state.strangers).toEqual([]);
    expect(events).toContainEqual({ type: "fightWon" });
    expect(state.phase).not.toBe("fight"); // → pickup / explore
    expect(state.gs).not.toBe(GS_DEAD);
  });

  it("SC-9.5-9: wiping the party sets gs DEAD and emits gameOver", () => {
    // A lone Woman (FS 2) loses to a Dragon (FS 6) at seed 2 → the whole party falls → game over.
    const s = fightS({ party: [member(6)], strangers: [10], seed: 2 });
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(state.party.every((m) => m.status === 3)).toBe(true);
    expect(state.gs).toBe(GS_DEAD);
    expect(events).toContainEqual({ type: "gameOver", gs: GS_DEAD });
  });
});

describe("SC-9.5-10 a pending casualty blocks a new round (§A Round of Fighting)", () => {
  it("SC-9.5-10: dispatching resolveRound while a casualty is pending is blocked", () => {
    const s = fightS({
      party: [member(5), member(6)], // Man, Woman
      strangers: [10],
      fight: { surprise: 0, round: 2, focus: 0, casualtyQueue: [[0, 1]] },
    });
    const { events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(events).toEqual([{ type: "blocked" }]);
  });
});
