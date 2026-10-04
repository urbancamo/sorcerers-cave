import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { previewPlan, strangerFS, strangerMP, enemyRollBonus } from "./combatPlan";
import { gearOf } from "./strangerGear";
import { makeState } from "./testkit";
import { DIR_N, packCoord } from "./coords";
import type { GameState, PartyMember } from "./state";

const HERO = 0, MAN = 5, WOMAN = 6, DWARF = 7, WIZARD = 8, SORCERER = 11, WITCH = 18, THIEF = 19, OGRE = 2;
const SWORD = 3, STAFF = 9, RING = 10, EYE = 13, GOLD = 5, AXE = 17, SHIELD = 20;
const member = (creatureId: number, treasure: number[] = []): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure });

/** A fight already under way, with `gear` already borne by the strangers (aligned by index). */
const inFight = (strangers: number[], gear: number[][], over: Partial<GameState> = {}): GameState =>
  makeState({
    phase: "fight", strangers, party: [member(HERO), member(MAN)],
    fight: { surprise: 0, round: 2, focus: 0, gear: gear.some((g) => g.length) ? gear : undefined }, ...over,
  });

describe("what a stranger bears counts in the fight", () => {
  it("a Sword adds +2 to a Hero and +1 to a Man or Thief (as a Man)", () => {
    const s = inFight([HERO, MAN, THIEF, OGRE], [[SWORD], [SWORD], [SWORD], [SWORD]]);
    expect([0, 1, 2, 3].map((i) => strangerFS(s, i))).toEqual([5 + 2, 3 + 1, 2 + 1, 5]);
  });

  it("an Axe adds +3 to a Dwarf and +1 to a Woman", () => {
    const s = inFight([DWARF, WOMAN], [[AXE], [AXE]]);
    expect([strangerFS(s, 0), strangerFS(s, 1)]).toEqual([1 + 3, 2 + 1]);
  });

  it("a Staff adds magic: +2 to a Wizard, +1 to a Witch (a Priest-class creature), +2 to the Sorcerer", () => {
    const s = inFight([WIZARD, WITCH, SORCERER], [[STAFF], [STAFF], [STAFF]]);
    expect([0, 1, 2].map((i) => strangerMP(s, i))).toEqual([5 + 2, 4 + 1, 9 + 2]);
  });

  it("the preview totals include the bearer's bonus, listed as an enemy-side modifier", () => {
    const armed = inFight([HERO], [[SWORD]], { party: [member(MAN)] });
    const bare = inFight([HERO], [[]], { party: [member(MAN)] });
    const a = previewPlan(armed, { matches: [{ front: [0], backers: [], strangers: [0] }] }).matches[0]!;
    const b = previewPlan(bare, { matches: [{ front: [0], backers: [], strangers: [0] }] }).matches[0]!;
    expect(a.enemyStr - b.enemyStr).toBe(2);
    expect(a.modifiers).toContainEqual(expect.objectContaining({ label: "Magic Sword · Hero", value: 2, side: "enemy", roll: false }));
  });

  it("an Eye on the floor switches every borne artefact off", () => {
    const s = inFight([HERO], [[SWORD]], { treasures: [EYE] });
    expect(strangerFS(s, 0)).toBe(5);
  });

  it("a Ring on a stranger adds 1 to every stranger die roll, and is nullified by the Eye", () => {
    const ring = inFight([MAN, WOMAN], [[RING], []]);
    expect(enemyRollBonus(ring)).toBe(1);
    expect(enemyRollBonus(inFight([MAN], [[]]))).toBe(0);
    expect(enemyRollBonus(inFight([MAN], [[RING]], { treasures: [EYE] }))).toBe(0);
    const a = previewPlan(ring, { matches: [{ front: [0], backers: [], strangers: [0] }] }).matches[0]!;
    expect(a.modifiers).toContainEqual(expect.objectContaining({ label: "The Ring · Man", value: 1, side: "enemy", roll: true }));
  });

  it("a Shield on a stranger nullifies the magic of the party members matched against it", () => {
    const party = [member(WIZARD), member(HERO)];
    const shielded = inFight([MAN], [[SHIELD]], { party });
    const open = inFight([MAN], [[]], { party });
    const plan = { matches: [{ front: [1], backers: [0], strangers: [0] }] };
    const a = previewPlan(shielded, plan).matches[0]!;
    const b = previewPlan(open, plan).matches[0]!;
    expect(b.partyStr).toBe(5 + 5); // Hero 5 + Wizard's background magic 5
    expect(a.partyStr).toBe(5); // the Wizard's power is nullified
    expect(a.modifiers).toContainEqual(expect.objectContaining({ label: "Magic Shield · Man", side: "party" }));
  });
});

describe("Stranger Fight Preparations at the start of a fight", () => {
  const encounter = (strangers: number[], treasures: number[]): GameState =>
    makeState({ phase: "encounter", strangers, treasures, party: [member(HERO), member(MAN)] });

  it("attacking a chamber whose guards stand over artefacts equips the guards", () => {
    const { state, events } = reduce(encounter([HERO, OGRE], [SWORD, GOLD]), { type: "attack" });
    expect(state.phase).toBe("fight");
    expect(gearOf(state, 0)).toEqual([SWORD]);
    expect(state.treasures).toEqual([GOLD]);
    expect(events).toContainEqual({ type: "strangerEquipped", creatureId: HERO, artifact: SWORD });
  });

  it("nobody is equipped when no stranger can bear what lies there (state unchanged)", () => {
    const { state } = reduce(encounter([OGRE], [SWORD]), { type: "attack" });
    expect(state.fight!.gear).toBeUndefined();
    expect(state.treasures).toEqual([SWORD]);
  });

  it("an Eye of God among the treasure leaves the guards unarmed", () => {
    const { state } = reduce(encounter([HERO], [SWORD, EYE]), { type: "attack" });
    expect(state.fight!.gear).toBeUndefined();
  });
});

describe("what happens to a stranger's gear", () => {
  const plan = { type: "resolveRound" as const, matches: [{ front: [0], backers: [] as number[], strangers: [0] }] };

  it("a defeated bearer drops its artefacts onto the floor, where the winners may take them", () => {
    // Make the party certain to win: a huge-strength front fighter against a lone, armed Man.
    const s = inFight([MAN], [[SWORD]], { party: [member(HERO, [SWORD, AXE]), member(MAN)], seed: 7 });
    s.party[0]!.dragonKills = 10;
    const { state, events } = reduce(s, plan);
    expect(events.some((e) => e.type === "fightWon")).toBe(true);
    expect(state.treasures).toContain(SWORD);
    expect(state.fight).toBeNull();
  });

  it("the gear array stays aligned with the strangers as they die", () => {
    const s = inFight([MAN, WOMAN, OGRE], [[SWORD], [], []], { party: [member(HERO), member(HERO)] });
    s.party.forEach((m) => { m.dragonKills = 10; });
    const { state } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }, { front: [1], backers: [], strangers: [2] }] });
    expect(state.strangers).toEqual([WOMAN]);
    const g = state.fight?.gear;
    expect(g === undefined || g.length === state.strangers.length).toBe(true);
  });
});

describe("Ring, retreat, dice and re-equipping", () => {
  const strongParty = (): PartyMember[] => { const h = member(HERO); h.dragonKills = 10; return [h]; };
  const duel = { type: "resolveRound" as const, matches: [{ front: [0], backers: [] as number[], strangers: [0] }] };

  it("a defeated invulnerable Ring bearer (level 4+) disappears with the Ring, leaving other gear behind", () => {
    const s = inFight([MAN], [[RING, SWORD]], { party: strongParty(), level: 4, seed: 3 });
    const { state, events } = reduce(s, duel);
    expect(events).toContainEqual({ type: "strangerVanished", creatureId: MAN, artifact: RING });
    expect(state.treasures).toContain(SWORD);
    expect(state.treasures).not.toContain(RING);
  });

  it("above level 3 only: at level 3 a defeated Ring bearer simply drops the Ring", () => {
    const s = inFight([MAN], [[RING]], { party: strongParty(), level: 3, seed: 3 });
    const { state, events } = reduce(s, duel);
    expect(events.some((e) => e.type === "strangerVanished")).toBe(false);
    expect(state.treasures).toContain(RING);
  });

  it("the stranger's Ring bonus is added to its die roll in the combatRoll", () => {
    const base = inFight([MAN], [[]], { party: [member(HERO)], seed: 11 });
    const ring = inFight([MAN], [[RING]], { party: [member(HERO)], seed: 11 });
    const roll = (st: GameState) => reduce(st, duel).events.find((e) => e.type === "combatRoll") as { enemyRoll: number; enemyTotal: number };
    const a = roll(base), b = roll(ring);
    expect(b.enemyRoll).toBe(a.enemyRoll); // same dice
    expect(b.enemyTotal - a.enemyTotal).toBe(1);
  });

  it("retreating leaves the strangers' gear on the chamber floor with the other treasure", () => {
    const s = makeState({
      phase: "fight", party: [member(HERO)], strangers: [MAN], treasures: [GOLD],
      areas: [
        { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 0, prev: 1,
      fight: { surprise: 0, round: 2, focus: 0, gear: [[SWORD]] },
    });
    const r = reduce(s, { type: "retreat", dir: DIR_N }).state;
    expect(r.areas[0]!.contents).toEqual(expect.arrayContaining([100 + MAN, 200 + GOLD, 200 + SWORD]));
  });

  it("when a bearer falls, a surviving stranger who can use its artefact takes it up for the next round", () => {
    // One strong fighter engages only the Sword-bearing Hero; the Man is left unengaged (no free fighter remains).
    const s = inFight([HERO, MAN], [[SWORD], []], { party: strongParty(), seed: 9 });
    const { state, events } = reduce(s, duel);
    expect(state.strangers).toEqual([MAN]);
    expect(gearOf(state, 0)).toEqual([SWORD]);
    expect(state.treasures).not.toContain(SWORD);
    expect(events).toContainEqual({ type: "strangerEquipped", creatureId: MAN, artifact: SWORD });
  });
});
