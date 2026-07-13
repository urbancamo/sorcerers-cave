import { describe, it, expect } from "vitest";
import {
  declarePvp, setDefenderLine, setAttackerEngage, setDefenderCasters, resolveRoundPvp,
  retreatPvp, proposeStop, acceptStop, expirePvp, pvpView,
  type PvpFightSession, type PvpEngagement,
} from "./multi-fight";
import type { CaveState, PartyState, MpGameState } from "./multi";
import type { PartyMember, PlacedArea } from "./state";
import { packCoord, DIR_N, DIR_E } from "./coords";

// Builders copied from multi.test.ts (kept local — this suite may not edit existing files).
const member = (creatureId: number, treasure: number[] = [], over: Partial<PartyMember> = {}): PartyMember =>
  ({ creatureId, status: 0, dragonKills: 0, treasure, ...over });

const partyAt = (seat: number, over: Partial<PartyState> = {}): PartyState => ({
  seat, color: ["green", "blue", "yellow", "red"][seat]!, name: "Party " + seat, status: "exploring", kills: 0,
  gs: 0, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
  partyArea: 0, level: 1, prev: 0, prev2: 0, party: [member(0)], strangers: [], treasures: [], hazards: [], fight: null,
  ...over,
});

const area = (card: number, coord: number): PlacedArea =>
  ({ card, coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 });

// A controlled playing game with a hand-built cave (card 31 = NESW+chamber start) and 2 seats.
const playing = (cave: Partial<CaveState>, parties: PartyState[], order = [0, 1]): MpGameState => ({
  phase: "playing",
  cave: {
    areas: [area(31, packCoord(1, 50, 50))],
    largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0, seed: 1, ...cave,
  },
  parties, order, pickOrder: [...order].reverse(), active: 0, turnCount: 0,
});

// seat 0 attacks seat 1 at t=0 with a 1000 ms window. `surprise` sets a differing attacker prev.
function declared(att: PartyMember[], def: PartyMember[], opts: {
  surprise?: boolean; level?: number; areas?: PlacedArea[]; seed?: number;
} = {}) {
  const lvl = opts.level ? { level: opts.level } : {};
  const mp = playing({ seed: opts.seed ?? 1, ...(opts.areas ? { areas: opts.areas } : {}) }, [
    partyAt(0, { party: att, prev: opts.surprise ? 2 : 0, ...lvl }),
    partyAt(1, { party: def, ...lvl }),
  ]);
  return declarePvp(mp, 0, 1, 0, 1000);
}

const pvp = (mp: MpGameState) => mp.session as PvpFightSession;

// Run the three layout steps and resolve one round (no backers).
function fullRound(state: MpGameState, line: string[], engs: PvpEngagement[]) {
  let r = setDefenderLine(state, 1, line, 0, 1000);
  r = setAttackerEngage(r.state, 0, engs, [], 0, 1000);
  r = setDefenderCasters(r.state, 1, [], 0, 1000);
  return resolveRoundPvp(r.state, 0, 1000);
}

// LCG d6 stream from cave seed 1 (pinned): 4, 2, 2, 4, 6, 2.

describe("declarePvp (I-9)", () => {
  it("creates the session with the defender's layout window and surprise per pvpSurprise", () => {
    const r = declared([member(12)], [member(7)], { surprise: true }); // attacker arrived another way
    expect(r.events).toContainEqual({ type: "fightStarted", surprise: 1 });
    const s = pvp(r.state);
    expect(s).toMatchObject({
      kind: "pvp", area: 0, attacker: [0], defender: [1], round: 1, activeSide: "attacker",
      surprise: 1, stage: "defenderLine", defenderLine: [], engagements: [], stopProposedBy: null,
    });
    expect(s.window).toEqual({ seat: 1, deadline: 1000, kind: "pvpLayout" });
  });

  it("gives no surprise when the attacker followed the defender in", () => {
    const r = declared([member(12)], [member(7)]); // same prev — following
    expect(pvp(r.state).surprise).toBe(0);
  });

  it("is blocked where the area mask forbids it (strangers parked on the tile)", () => {
    const parked = area(31, packCoord(1, 50, 50));
    parked.contents = [110]; // a parked Dragon
    const mp = playing({ areas: [parked] }, [partyAt(0), partyAt(1)]);
    const r = declarePvp(mp, 0, 1, 0, 1000);
    expect(r.events).toEqual([{ type: "blocked" }]);
    expect(r.state).toBe(mp);
  });

  it("is blocked when a session is already live, or the seats are not co-located", () => {
    const first = declared([member(12)], [member(7)]);
    expect(declarePvp(first.state, 0, 1, 0, 1000).events).toEqual([{ type: "blocked" }]);
    const apart = playing({}, [partyAt(0), partyAt(1, { partyArea: 5 })]);
    expect(declarePvp(apart, 0, 1, 0, 1000).events).toEqual([{ type: "blocked" }]);
  });

  it("drops BOTH commands' heavy treasure to the floor at declaration; artefacts are kept (§388)", () => {
    const r = declared([member(12, [1, 3])], [member(12, [2])]); // Gold+Sword vs Gems
    expect(r.state.cave.areas[0]!.contents).toEqual([201, 202]); // both heavies parked on the tile
    expect(r.state.parties[0]!.party[0]!.treasure).toEqual([3]); // the Magic Sword stays in hand
    expect(pvp(r.state).drops).toEqual([
      { seat: 0, id: "0:0", tid: 1 },
      { seat: 1, id: "1:0", tid: 2 },
    ]);
    expect(r.events.filter((e) => e.type === "heavyDownForFight")).toHaveLength(2);
  });
});

describe("setDefenderLine (I-10 step 1)", () => {
  it("every living non-caster must stand in the line", () => {
    const r = declared([member(0), member(5)], [member(0), member(4)]); // Hero+Man vs Hero+Priest
    const bad = setDefenderLine(r.state, 1, ["1:1"], 0, 1000); // the Hero left out
    expect(bad.events).toEqual([{ type: "planRejected", reason: "nonCasterMustStandInLine" }]);
  });

  it("a caster may deploy behind only with the numerical advantage", () => {
    const even = declared([member(0), member(5)], [member(0), member(4)]); // 2 vs 2
    const bad = setDefenderLine(even.state, 1, ["1:0"], 0, 1000); // priest held back — no edge
    expect(bad.events).toEqual([{ type: "planRejected", reason: "casterBehindNeedsAdvantage" }]);

    const edge = declared([member(0), member(5)], [member(0), member(4), member(5)]); // 2 vs 3
    const ok = setDefenderLine(edge.state, 1, ["1:0", "1:2"], 0, 1000); // priest behind is now legal
    const s = pvp(ok.state);
    expect(s.stage).toBe("attackerEngage");
    expect(s.defenderLine).toEqual(["1:0", "1:2"]);
    expect(s.window).toEqual({ seat: 0, deadline: 1000, kind: "pvpLayout" }); // window flips to the attacker
  });
});

describe("setAttackerEngage (I-10 step 2)", () => {
  const lined = () => {
    const r = declared([member(0), member(5)], [member(0), member(4), member(5)]);
    return setDefenderLine(r.state, 1, ["1:0", "1:2"], 0, 1000).state;
  };

  it("must engage every line creature while a fighter is still free", () => {
    const bad = setAttackerEngage(lined(), 0, [{ attackers: ["0:0"], defenders: ["1:0"] }], [], 0, 1000);
    expect(bad.events).toEqual([{ type: "planRejected", reason: "mustEngageAll" }]);
  });

  it("never two against two", () => {
    const bad = setAttackerEngage(lined(), 0, [{ attackers: ["0:0", "0:1"], defenders: ["1:0", "1:2"] }], [], 0, 1000);
    expect(bad.events).toEqual([{ type: "planRejected", reason: "twoVsTwo" }]);
  });

  it("attacker casters may back only with the numerical advantage", () => {
    const r = declared([member(0), member(4)], [member(0), member(5)]); // Hero+Priest vs Hero+Man (2 v 2)
    const s1 = setDefenderLine(r.state, 1, ["1:0", "1:1"], 0, 1000).state;
    const bad = setAttackerEngage(s1, 0,
      [{ attackers: ["0:0"], defenders: ["1:0", "1:1"] }], [{ caster: "0:1", at: 0 }], 0, 1000);
    expect(bad.events).toEqual([{ type: "planRejected", reason: "backerNeedsAdvantage" }]);
  });

  it("a full engage advances to the defender's caster assignment", () => {
    const ok = setAttackerEngage(lined(), 0, [
      { attackers: ["0:0"], defenders: ["1:0"] },
      { attackers: ["0:1"], defenders: ["1:2"] },
    ], [], 0, 1000);
    const s = pvp(ok.state);
    expect(s.stage).toBe("defenderCasters");
    expect(s.window).toEqual({ seat: 1, deadline: 1000, kind: "pvpCasters" });
  });
});

describe("resolveRoundPvp (I-10)", () => {
  it("a 1v1 round: pinned totals (seed 1), the loser's strongest is slain, the wiped side ends", () => {
    // Giant (7) with surprise vs a lone Dwarf (1). Seed-1 rolls: attacker 4, defender 2.
    const r0 = declared([member(12)], [member(7)], { surprise: true });
    const r = fullRound(r0.state, ["1:0"], [{ attackers: ["0:0"], defenders: ["1:0"] }]);
    expect(r.events[0]).toEqual({
      type: "combatRoll", party: "Party 0", enemy: "Party 1",
      partyRoll: 4, enemyRoll: 2, partyTotal: 7 + 4 + 1, enemyTotal: 1 + 2, result: "partyWon",
    });
    expect(r.events).toContainEqual({ type: "memberDied", creatureId: 7 });
    expect(r.events).toContainEqual({ type: "fightWon" });
    expect(r.state.parties[1]!.party[0]!.status).toBe(3);
    expect(r.state.parties[1]!).toMatchObject({ status: "wiped", gs: 2, phase: "gameOver" });
    expect(r.state.parties[0]!).toMatchObject({ status: "exploring", phase: "explore" }); // nothing to loot
    expect(r.state.session).toBeNull();
  });

  it("the Ring's bearer cannot be chosen (deathPrevented) and round ownership alternates", () => {
    // Dwarf bearing The Ring on level 4: loses the match (12 v 4) but cannot die.
    const r0 = declared([member(12)], [member(7, [10])], { surprise: true, level: 4 });
    const r = fullRound(r0.state, ["1:0"], [{ attackers: ["0:0"], defenders: ["1:0"] }]);
    expect(r.events[0]).toMatchObject({ partyTotal: 12, enemyTotal: 1 + 2 + 1, result: "partyWon" }); // Ring +1 on the defender's roll
    expect(r.events).toContainEqual({ type: "deathPrevented", creatureId: 7 });
    const s = pvp(r.state);
    expect(s).toMatchObject({ round: 2, activeSide: "defender", stage: "defenderLine" }); // "the second in the defender's turn"
    expect(s.window).toEqual({ seat: 1, deadline: 1000, kind: "pvpLayout" }); // but the DEFENDER still lays out first
  });

  it("a wipe spills the fallen's carried items to the victor's pickup; borne items stay on the corpse", () => {
    // The Dwarf bears the Magic Sword (borne) and carries the Talisman.
    const r0 = declared([member(12)], [member(7, [3, 7], { borne: [3] })], { surprise: true });
    const r = fullRound(r0.state, ["1:0"], [{ attackers: ["0:0"], defenders: ["1:0"] }]);
    expect(r.events).toContainEqual({ type: "itemsSpilled", creatureId: 7, items: [7] });
    expect(r.events).toContainEqual({ type: "treasureReclaimed", count: 1 });
    expect(r.state.parties[1]!.party[0]!.treasure).toEqual([3]); // borne Sword goes down with the body
    expect(r.state.parties[0]!.treasures).toEqual([7]); // the Talisman is the winner's spoils
    expect(r.state.parties[0]!.phase).toBe("pickup");
    expect(r.state.cave.areas[0]!.contents).toEqual([]); // floor fully reclaimed
  });
});

describe("retreatPvp (I-11)", () => {
  // Ring-Dwarf carrying Gold survives round 1 → a fresh round-2 boundary with 201 on the floor.
  const atBoundary = () => {
    const areas = [area(31, packCoord(1, 50, 50)), area(4, packCoord(1, 50, 49))]; // an S-door tunnel north
    const r0 = declared([member(12)], [member(7, [1, 10])], { surprise: true, level: 4, areas });
    expect(r0.state.cave.areas[0]!.contents).toEqual([201]); // the Gold pre-dropped at declaration
    return fullRound(r0.state, ["1:0"], [{ attackers: ["0:0"], defenders: ["1:0"] }]).state;
  };

  it("a boundary retreat moves the side out, returns the flee grace, and leaves the floor to the victor", () => {
    const r = retreatPvp(atBoundary(), 1, DIR_N, 0);
    expect(r.fleeGrace).toEqual({ seat: 1, turns: 2 });
    expect(r.state.parties[1]!).toMatchObject({ partyArea: 1, prev: 0, level: 1 });
    expect(r.state.session).toBeNull();
    expect(r.events).toContainEqual({ type: "moved", area: 1, level: 1 });
    expect(r.events).toContainEqual({ type: "fightWon" });
    // §427: the fled side's dropped Gold stays behind — and becomes the victor's pickup.
    expect(r.state.parties[0]!.treasures).toEqual([1]);
    expect(r.state.parties[0]!.phase).toBe("pickup");
    expect(r.state.cave.areas[0]!.contents).toEqual([]);
  });

  it("is blocked into an undrawn exit, and blocked before a round has been fought", () => {
    const boundary = atBoundary();
    expect(retreatPvp(boundary, 1, DIR_E, 0).events).toEqual([{ type: "blocked" }]); // nothing drawn east
    const fresh = declared([member(12)], [member(7)]);
    expect(retreatPvp(fresh.state, 1, DIR_N, 0).events).toEqual([{ type: "blocked" }]); // round 1 is not a boundary
  });
});

describe("proposeStop / acceptStop", () => {
  const atBoundary = () => {
    const r0 = declared([member(12, [1])], [member(7, [2, 10])], { surprise: true, level: 4 });
    return fullRound(r0.state, ["1:0"], [{ attackers: ["0:0"], defenders: ["1:0"] }]).state;
  };

  it("both sides agree at a boundary: each retakes its OWN dropped treasure", () => {
    const p = proposeStop(atBoundary(), 0, 0);
    expect(pvp(p.state).stopProposedBy).toBe(0);
    const r = acceptStop(p.state, 1, 0);
    expect(r.state.session).toBeNull();
    expect(r.state.parties[0]!.party[0]!.treasure).toEqual([1]); // the Giant's Gold comes home
    expect(r.state.parties[1]!.party[0]!.treasure).toEqual([10, 2]); // the Dwarf keeps the Ring, retakes the Gems
    expect(r.state.cave.areas[0]!.contents).toEqual([]);
    expect(r.events.filter((e) => e.type === "droppedRetaken")).toEqual([
      { type: "droppedRetaken", count: 1 },
      { type: "droppedRetaken", count: 1 },
    ]);
    expect(r.state.parties.every((x) => x.status === "exploring" && x.phase === "explore")).toBe(true);
  });

  it("guards: no stop offer in round 1, and the proposer's own side cannot accept", () => {
    const fresh = declared([member(12)], [member(7)]);
    expect(proposeStop(fresh.state, 0, 0).events).toEqual([{ type: "blocked" }]);
    const p = proposeStop(atBoundary(), 0, 0);
    expect(acceptStop(p.state, 0, 0).events).toEqual([{ type: "blocked" }]); // same side
  });
});

describe("expirePvp (auto-defaults never dead-stop)", () => {
  // Attacker Giant+Man (2) vs defender Giant+Priest+Man (3): the defender has the edge.
  const start = () => declared([member(12), member(5)], [member(12), member(4), member(5)]).state;

  it("does not fire before the deadline", () => {
    const r = expirePvp(start(), 500, 1000);
    expect(r.fired).toBe(false);
    expect(r.state.session).not.toBeNull();
  });

  it("auto-defaults each stage in turn, then resolves the round (pinned seed-1 outcome)", () => {
    // Stage 1: line = all non-casters; the Priest deploys behind (numerical advantage).
    const e1 = expirePvp(start(), 2000, 1000);
    expect(e1.fired).toBe(true);
    const s1 = pvp(e1.state);
    expect(s1.stage).toBe("attackerEngage");
    expect(s1.defenderLine).toEqual(["1:0", "1:2"]);
    expect(s1.window).toEqual({ seat: 0, deadline: 3000, kind: "pvpLayout" });

    // Stage 2: greedy strongest-fights-strongest, no backers.
    const e2 = expirePvp(e1.state, 4000, 1000);
    expect(pvp(e2.state).stage).toBe("defenderCasters");
    expect(pvp(e2.state).engagements).toEqual([
      { attackers: ["0:0"], defenders: ["1:0"] }, // Giant v Giant
      { attackers: ["0:1"], defenders: ["1:2"] }, // Man v Man
    ]);

    // Stage 3: the Priest round-robins onto engagement 0, and the round auto-resolves.
    // Seed-1 rolls 4,2,2,4 → eng0: 7+4=11 v 7+2+2=11 (tie); eng1: 3+2=5 v 3+4=7 (defender slays the Man).
    const e3 = expirePvp(e2.state, 6000, 1000);
    expect(e3.fired).toBe(true);
    expect(e3.events).toContainEqual({
      type: "combatRoll", party: "Party 0", enemy: "Party 1",
      partyRoll: 4, enemyRoll: 2, partyTotal: 11, enemyTotal: 11, result: "tie",
    });
    expect(e3.events).toContainEqual({
      type: "combatRoll", party: "Party 0", enemy: "Party 1",
      partyRoll: 2, enemyRoll: 4, partyTotal: 5, enemyTotal: 7, result: "enemyWon",
    });
    expect(e3.events).toContainEqual({ type: "memberDied", creatureId: 5 });
    expect(pvp(e3.state)).toMatchObject({ round: 2, activeSide: "defender", stage: "defenderLine" });
    expect(pvp(e3.state).window).toEqual({ seat: 1, deadline: 7000, kind: "pvpLayout" });
  });
});

describe("pvpView", () => {
  it("previews per-engagement strength totals including assigned backers", () => {
    const e1 = expirePvp(declared([member(12), member(5)], [member(12), member(4), member(5)]).state, 2000, 1000);
    const e2 = expirePvp(e1.state, 4000, 1000);
    const done = setDefenderCasters(e2.state, 1, [{ caster: "1:1", at: 0 }], 0, 1000);
    const v = pvpView(pvp(done.state), done.state);
    expect(v.attackerName).toBe("Party 0");
    expect(v.defenderName).toBe("Party 1");
    expect(v.stage).toBe("resolved");
    expect(v.engagements[0]).toEqual({
      attackers: ["0:0"], defenders: ["1:0"],
      attackerNames: ["Giant"], defenderNames: ["Giant"],
      attackerStr: 7, defenderStr: 9, // Giant 7 + the backing Priest's MP 2
    });
    expect(v.engagements[1]).toMatchObject({ attackerStr: 3, defenderStr: 3 });
  });
});
