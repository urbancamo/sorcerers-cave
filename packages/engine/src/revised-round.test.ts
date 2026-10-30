import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { driveStrangers } from "./strangerDriver";
import { playRevisedFight, partyAction } from "./headless";
import { freeOf, legalMoves, legalPairs } from "./revisedRound";
import type { GameAction, GameEvent } from "./actions";
import type { GameState, PartyMember } from "./state";

const HERO = 0, OGRE = 2, TROLL = 3, PRIEST = 4, MAN = 5, WOMAN = 6, DWARF = 7, SPECTRE = 9, DRAGON = 10;
const member = (creatureId: number): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [] });
const REVISED = { combatRevision: true };

/** An encounter that becomes a revised fight the moment the party attacks (no surprise, so the party is the attacker). */
const encounter = (party: number[], strangers: number[], over: Partial<GameState> = {}): GameState =>
  makeState({ phase: "encounter", strangers, treasures: [], party: party.map(member), variants: REVISED, ...over });
const fight = (party: number[], strangers: number[], over: Partial<GameState> = {}): GameState =>
  driveStrangers(reduce(encounter(party, strangers, over), { type: "attack" }).state).state;

describe("the revised round engine: setting up", () => {
  it("is off unless the variant is on: the fight is the legacy one", () => {
    const s = reduce(makeState({ phase: "encounter", strangers: [OGRE], party: [member(HERO)] }), { type: "attack" }).state;
    expect(s.fight!.rev).toBeUndefined();
    expect(s.fight!.pending).toBeUndefined();
  });

  it("a party that attacks is the attacker, and the strangers deploy first", () => {
    const s = reduce(encounter([HERO, MAN], [OGRE, TROLL]), { type: "attack" }).state;
    expect(s.fight!.rev!.attacker).toBe("party");
    expect(s.fight!.pending).toEqual({ by: "strangers", kind: "deploy", min: 2 });
  });

  /** A fight the strangers start: a hostile reaction gives them the surprise (Test Mode scripts the reaction). */
  const ambushed = (party: number[], strangers: number[], over: Partial<GameState> = {}): GameState => {
    let s = encounter(party, strangers, { testMode: true, ...over });
    s = reduce(s, { type: "testForceReaction", outcome: "hostile" }).state;
    return reduce(s, { type: "test" }).state;
  };

  it("strangers who gained the surprise are the attacker, so the party deploys first", () => {
    const s = ambushed([HERO, MAN, WOMAN], [OGRE, TROLL]);
    expect(s.phase).toBe("fight");
    expect(s.fight!.rev!.attacker).toBe("strangers");
    expect(s.fight!.pending).toEqual({ by: "party", kind: "deploy", min: 2 });
  });

  it("the defender must deploy as many as the attacker has, and may deploy more", () => {
    const s = ambushed([HERO, MAN, WOMAN], [OGRE, TROLL]);
    expect(reduce(s, { type: "deploy", creatures: [0] }).events[0]).toMatchObject({ type: "planRejected" });
    expect(reduce(s, { type: "deploy", creatures: [0, 0] }).events[0]).toMatchObject({ type: "planRejected" });
    const ok = reduce(s, { type: "deploy", creatures: [0, 1, 2] });
    expect(ok.events[0]).toEqual({ type: "deployed", side: "party", creatures: [0, 1, 2] });
  });

  it("the roles never change: the strangers stay the attacker round after round", () => {
    const p = playRevisedFight(ambushed([HERO, MAN, WOMAN], [OGRE, TROLL], { seed: 9 }));
    expect(p.state.fight?.rev?.attacker ?? "strangers").toBe("strangers");
    expect(p.actions.filter((a) => a.type === "engage")).toHaveLength(0);          // the party never engages
    expect(p.actions.filter((a) => a.type === "strangersEngage").length).toBeGreaterThan(0);
  });

  it("the legacy resolveRound is refused in a revised fight", () => {
    const s = fight([HERO], [OGRE]);
    const r = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(r.events).toEqual([{ type: "blocked" }]);
  });
});

describe("the revised round engine: the party's decisions are checked", () => {
  const stage = (): GameState => fight([HERO, MAN, WOMAN], [OGRE, TROLL]);

  it("asks the party to engage once the strangers have deployed", () => {
    const s = stage();
    expect(s.fight!.pending).toEqual({ by: "party", kind: "engage" });
    expect(s.fight!.rev!.deployed.strangers.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a decision that is not the one pending, and a client cannot answer for the strangers", () => {
    const s = stage();
    expect(reduce(s, { type: "deploy", creatures: [0] }).events).toEqual([{ type: "blocked" }]);
    const forged = reduce(s, { type: "strangersEngage", strategyId: "x", strategyVersion: 1, pairs: [] });
    expect(forged.events).toEqual([{ type: "blocked" }]);
  });

  it("rejects an engagement that leaves a pairable creature out", () => {
    const s = stage();
    const r = reduce(s, { type: "engage", pairs: [] });
    expect(r.events[0]).toMatchObject({ type: "planRejected" });
  });

  it("rejects pairing a creature twice or against a foe that is not deployed", () => {
    const s = stage();
    const dep = s.fight!.rev!.deployed.strangers;
    expect(reduce(s, { type: "engage", pairs: [{ party: 0, stranger: dep[0]! }, { party: 0, stranger: dep[1]! }] }).events[0]).toMatchObject({ type: "planRejected" });
    expect(reduce(s, { type: "engage", pairs: [{ party: 0, stranger: 99 }] }).events[0]).toMatchObject({ type: "planRejected" });
  });

  it("accepts a legal complete engagement and moves on", () => {
    const s = stage();
    const pairs = legalPairs(s, "party").slice(0, 0);
    expect(pairs).toEqual([]);
    const act = partyAction(s)!;
    const r = reduce(s, act);
    expect(r.events[0]).toMatchObject({ type: "engaged" });
  });
});

describe("the revised round engine: whole fights, headless", () => {
  const MIXES: [number[], number[]][] = [
    [[HERO, MAN], [OGRE, TROLL]],
    [[HERO, PRIEST, MAN, WOMAN], [OGRE, TROLL, DWARF]],
    [[HERO], [OGRE, TROLL, DWARF, MAN]],
    [[HERO, HERO, PRIEST, PRIEST], [DRAGON]],
    [[MAN, WOMAN], [SPECTRE]],
    [[PRIEST, MAN], [SPECTRE, OGRE]],
  ];

  it("every fight reaches an end, with no creature in two places and no front line over two", () => {
    for (const [party, strangers] of MIXES) for (let seed = 1; seed <= 25; seed++) {
      const played = playRevisedFight(encounter(party, strangers, { seed }) && reduce(encounter(party, strangers, { seed }), { type: "attack" }).state);
      expect(["won", "lost", "standoff"]).toContain(played.end);
      const rev = played.state.fight?.rev;
      if (!rev) continue;
      const seenP = new Set<number>(), seenS = new Set<number>();
      for (const m of rev.matches) {
        expect(m.pf.length).toBeLessThanOrEqual(2);
        expect(m.sf.length).toBeLessThanOrEqual(2);
        for (const i of [...m.pf, ...m.pb]) { expect(seenP.has(i)).toBe(false); seenP.add(i); }
        for (const i of [...m.sf, ...m.sb]) { expect(seenS.has(i)).toBe(false); seenS.add(i); expect(i).toBeLessThan(played.state.strangers.length); }
      }
    }
  });

  it("is deterministic: the same seed plays the same fight", () => {
    const start = (): GameState => reduce(encounter([HERO, PRIEST, MAN], [OGRE, TROLL, DWARF], { seed: 7 }), { type: "attack" }).state;
    const a = playRevisedFight(start()), b = playRevisedFight(start());
    expect(a.actions).toEqual(b.actions);
    expect(a.state).toEqual(b.state);
  });

  it("a replayed action log reproduces the fight exactly", () => {
    const start = reduce(encounter([HERO, PRIEST, MAN], [OGRE, TROLL, DWARF], { seed: 11 }), { type: "attack" }).state;
    const played = playRevisedFight(start);
    let s = start;
    for (const a of played.actions) { s = reduce(s, a).state; }
    expect(s).toEqual(played.state);
  });

  it("a stronger party wins and the fight settles into the pickup or exploration", () => {
    let won = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const p = playRevisedFight(reduce(encounter([HERO, HERO, OGRE, TROLL], [DWARF, MAN], { seed }), { type: "attack" }).state);
      if (p.end === "won") { won++; expect(p.events.some((e) => e.type === "fightWon")).toBe(true); expect(p.state.fight).toBeNull(); }
    }
    expect(won).toBeGreaterThan(20);
  });

  it("an unfightable Spectre slays the party's strongest once, then nobody can continue: a standoff, and the party may leave", () => {
    const p = playRevisedFight(reduce(encounter([MAN, WOMAN], [SPECTRE], { seed: 3 }), { type: "attack" }).state);
    expect(p.end).toBe("standoff");
    expect(p.events.filter((e) => e.type === "spectreSlew")).toHaveLength(1);
    expect(p.state.party.filter((m) => m.status === 3)).toHaveLength(1);
  });

  it("a caster can face the Spectre", () => {
    const s = fight([PRIEST, MAN], [SPECTRE]);
    expect(legalPairs({ ...s, fight: { ...s.fight!, rev: { ...s.fight!.rev!, deployed: { party: [], strangers: [0] } } } }, "party").map((p) => p.party)).toEqual([0]);
  });

  it("a fight in which two sides cannot hurt each other ends in a standoff, and the party may retreat", () => {
    // a Dwarf and a Woman against a lone Spectre they cannot face: the Spectre slays them; use two casters-less stalemate instead:
    // the Ring bearer below level 4 is mortal, so build a real stalemate with the Shield (Man bearing it vs a Spectre)
    const s = makeState({ phase: "encounter", strangers: [SPECTRE], party: [{ ...member(MAN), treasure: [20] }], variants: REVISED, seed: 5 });
    const p = playRevisedFight(reduce(s, { type: "attack" }).state);
    expect(p.end).toBe("standoff");
    expect(p.events.some((e) => e.type === "fightStandoff")).toBe(true);
    expect(p.state.fight!.rev!.standoff).toBe(true);
    // the party's only way out is to retreat, and the engine lets it try (round 1 has been fought)
    expect(p.state.fight!.round).toBeGreaterThan(1);
    expect(reduce(p.state, { type: "retreat", dir: 0 }).events).not.toContainEqual({ type: "blocked" });
  });

  it("exercises the strangers' casualty rule: a lost two-creature front line nominates and a die decides", () => {
    let seen = 0;
    for (let seed = 1; seed <= 60 && seen === 0; seed++) {
      const p = playRevisedFight(reduce(encounter([HERO, HERO, OGRE], [MAN, MAN, DWARF, WOMAN], { seed }), { type: "attack" }).state);
      const ev: GameEvent[] = p.events.filter((e) => e.type === "strangerCasualty");
      seen += ev.length;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("applies the same decisions to either side: the log carries the strangers' strategy id and version", () => {
    const p = playRevisedFight(reduce(encounter([HERO, MAN], [OGRE, TROLL], { seed: 2 }), { type: "attack" }).state);
    const sa = p.actions.filter((a: GameAction) => a.type.startsWith("strangers"));
    expect(sa.length).toBeGreaterThan(0);
    for (const a of sa) expect(a).toMatchObject({ strategyId: "standard", strategyVersion: 1 });
  });
});

describe("the review before the dice", () => {
  /** A fight the strangers start (surprise), the party deploying everyone: the strangers then pair up with no decision left for the party. */
  const ambushedAndDeployed = (seed: number): { s: GameState; log: GameEvent[] } => {
    let s = encounter([HERO, MAN], [OGRE, OGRE, OGRE], { testMode: true, seed });
    s = reduce(s, { type: "testForceReaction", outcome: "hostile" }).state;
    s = reduce(s, { type: "test" }).state;
    const r = reduce(s, { type: "deploy", creatures: [0, 1] });
    return { s: driveStrangers(r.state).state, log: r.events };
  };

  it("when the strangers pair up with the party, the party sees the arrangement before the round is rolled", () => {
    const { s, log } = ambushedAndDeployed(7);
    expect(s.fight!.rev!.review).toBe(true);
    expect(s.fight!.pending).toEqual({ by: "party", kind: "redeploy" });
    expect(s.fight!.rev!.matches).toHaveLength(2);                                       // the strangers' pairings are in place
    expect(log.some((e) => e.type === "combatRoll")).toBe(false);                        // nothing rolled yet
    expect(legalMoves(s, "party")).toEqual([]);                                          // the party may only look
    expect(reduce(s, { type: "redeploy", moves: [{ creature: 0, match: 0, back: false }] }).events[0]).toMatchObject({ type: "planRejected" });
    const go = reduce(s, { type: "redeploy", moves: [] });
    expect(go.events.some((e) => e.type === "combatRoll")).toBe(true);                   // fight on: now the dice
  });

  it("is not asked twice: a party that decided after the strangers acted has already seen how they stand", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = encounter([HERO, MAN, WOMAN], [OGRE, TROLL], { testMode: true, seed });
      s = reduce(s, { type: "testForceReaction", outcome: "hostile" }).state;
      s = reduce(s, { type: "test" }).state;
      s = driveStrangers(reduce(s, { type: "deploy", creatures: [0, 1, 2] }).state).state;
      if (s.fight?.pending?.kind === "redeploy" && !s.fight.rev!.review) {
        const r = reduce(s, { type: "redeploy", moves: [] });
        expect(r.state.fight?.rev?.review ?? false).toBe(false);
        return;
      }
    }
  });
});
