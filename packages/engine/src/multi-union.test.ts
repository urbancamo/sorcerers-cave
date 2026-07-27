import { describe, it, expect } from "vitest";
import {
  proposeUnion, respondUnion, expireUnionProposal, leaveUnion, dissolveUnion, allocateRecruit,
  divideParty, hostileDetachmentAt, unionPostAction, mpScore, activeUnionOf,
} from "./multi-union";
import { declarePvp, setDefenderLine, setAttackerEngage } from "./multi-fight";
import { mpReduce, partyView, currentSeat, type CaveState, type PartyState, type MpGameState } from "./multi";
import type { Union, UnionProposal } from "./multi-session";
import type { PartyMember, PlacedArea } from "./state";
import { scoreGame } from "./score";
import { packCoord } from "./coords";

// Builders copied from multi.test.ts (kept local — this suite may not edit existing files).
const member = (creatureId: number, treasure: number[] = [], over: Partial<PartyMember> = {}): PartyMember =>
  ({ creatureId, status: 0, dragonKills: 0, treasure, ...over });

const partyAt = (seat: number, over: Partial<PartyState> = {}): PartyState => ({
  seat, color: ["green", "blue", "yellow", "red"][seat]!, name: "Party " + seat, status: "exploring", kills: 0,
  gs: 0, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
  partyArea: 0, level: 1, prev: 0, prev2: 0, party: [member(0)], strangers: [], treasures: [], hazards: [], fight: null,
  ...over,
});

const area = (card: number, coord: number, contents: number[] = []): PlacedArea =>
  ({ card, coord, faceUp: true, visited: true, contents, flags: 0, indiffCount: 0 });

// A controlled playing game with a hand-built cave (card 31 = NESW+chamber start).
const playing = (cave: Partial<CaveState>, parties: PartyState[], order = parties.map((p) => p.seat)): MpGameState => ({
  phase: "playing",
  cave: {
    areas: [area(31, packCoord(1, 50, 50))],
    largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0, seed: 1, ...cave,
  },
  parties, order, pickOrder: [...order].reverse(), active: 0, turnCount: 0,
});

const union = (over: Partial<Union> = {}): Union =>
  ({ id: 1, commander: 0, members: [0, 1], recruits: [], onLoan: [{ fromSeat: 1, idx: 1 }], ...over });

const proposal = (mp: MpGameState): UnionProposal => mp.session as UnionProposal;

// Form a 2-seat union THROUGH mpReduce routing (propose on-thread, respond off-turn).
function formed2(cave: Partial<CaveState> = {}): MpGameState {
  const mp = playing(cave, [partyAt(0), partyAt(1)]);
  const p = mpReduce(mp, 0, { type: "proposeUnion", commander: 0, invited: [1] }, 0, 1000);
  return mpReduce(p.state, 1, { type: "respondUnion", accept: true }, 0, 1000).state;
}

describe("union formation (I-6)", () => {
  it("proposal → accept/accept forms the union, loans members and charges the forfeit", () => {
    const mp = playing({}, [partyAt(0), partyAt(1), partyAt(2)]);
    const r = proposeUnion(mp, 0, 0, [1, 2], 0, 1000);
    expect(r.ok).toBe(true);
    expect(proposal(r.state)).toMatchObject({ kind: "unionProposal", commander: 0, invited: [1, 2], accepted: [0] });
    expect(proposal(r.state).window).toEqual({ seat: 1, deadline: 1000, kind: "unionRespond" });

    const r2 = respondUnion(r.state, 1, true, 100, 1000);
    expect(proposal(r2.state).window).toEqual({ seat: 2, deadline: 1100, kind: "unionRespond" }); // walks on

    const r3 = respondUnion(r2.state, 2, true, 200, 1000);
    expect(r3.state.session).toBeNull();
    const u = r3.state.unions![0]!;
    expect(u).toMatchObject({ commander: 0, members: [0, 1, 2], recruits: [] });
    expect(u.onLoan).toEqual([{ fromSeat: 1, idx: 1 }, { fromSeat: 2, idx: 2 }]);
    // The loans: subordinates' living members now live in the commander's array.
    expect(r3.state.parties[0]!.party).toHaveLength(3);
    expect(r3.state.parties[1]!.party).toHaveLength(0);
    expect(r3.state.parties[2]!.party).toHaveLength(0);
    // Each non-commander owes the one-turn joining fee.
    expect(r3.state.parties[1]!.forfeitTurnsOwed).toBe(1);
    expect(r3.state.parties[2]!.forfeitTurnsOwed).toBe(1);
    expect(r3.state.parties[0]!.forfeitTurnsOwed).toBeUndefined();
  });

  it("a refusal drops the invitee; the union still forms with those who said yes", () => {
    const mp = playing({}, [partyAt(0), partyAt(1), partyAt(2)]);
    const r = proposeUnion(mp, 0, 0, [1, 2], 0, 1000);
    const r2 = respondUnion(r.state, 1, false, 0, 1000);
    const r3 = respondUnion(r2.state, 2, true, 0, 1000);
    expect(r3.state.unions![0]!.members).toEqual([0, 2]);
    expect(r3.state.parties[1]!.party).toHaveLength(1); // untouched, no forfeit
    expect(r3.state.parties[1]!.forfeitTurnsOwed).toBeUndefined();
  });

  it("everyone refusing (or a lone acceptance) forms nothing", () => {
    const mp = playing({}, [partyAt(0), partyAt(1)]);
    const r = proposeUnion(mp, 0, 0, [1], 0, 1000);
    const r2 = respondUnion(r.state, 1, false, 0, 1000);
    expect(r2.state.session).toBeNull();
    expect(r2.state.unions ?? []).toHaveLength(0);
  });

  it("the nominated commander refusing kills the whole proposal", () => {
    const mp = playing({}, [partyAt(0), partyAt(1), partyAt(2)]);
    const r = proposeUnion(mp, 0, 1, [1, 2], 0, 1000); // seat 0 nominates seat 1 as commander
    const r2 = respondUnion(r.state, 1, false, 0, 1000);
    expect(r2.state.session).toBeNull();
    expect(r2.state.unions ?? []).toHaveLength(0);
  });

  it("expiry auto-refuses the awaited invitee and walks the window on (§1.3)", () => {
    const mp = playing({}, [partyAt(0), partyAt(1), partyAt(2)]);
    const r = proposeUnion(mp, 0, 0, [1, 2], 0, 1000);
    const e1 = expireUnionProposal(r.state, 1000, 1000);
    expect(e1.fired).toBe(true);
    expect(proposal(e1.state).invited).toEqual([2]); // 1 refused by timeout
    expect(proposal(e1.state).window).toEqual({ seat: 2, deadline: 2000, kind: "unionRespond" });
    const e2 = expireUnionProposal(e1.state, 5000, 1000);
    expect(e2.fired).toBe(true);
    expect(e2.state.session).toBeNull();
    expect(e2.state.unions ?? []).toHaveLength(0); // only the proposer was left — no union
  });

  it("rejects a proposal to seats that are not co-located or already united", () => {
    const north = area(31, packCoord(1, 50, 49));
    const apart = playing({ areas: [area(31, packCoord(1, 50, 50)), north] }, [partyAt(0), partyAt(1, { partyArea: 1 })]);
    expect(proposeUnion(apart, 0, 0, [1], 0, 1000).reason).toBe("notColocated");
    const already = playing({}, [partyAt(0), partyAt(1, { party: [] }), partyAt(2)]);
    already.unions = [union()];
    expect(proposeUnion(already, 2, 2, [1], 0, 1000).reason).toBe("alreadyUnited");
  });
});

describe("union turn logic & combined force (I-6/I-7)", () => {
  it("the forfeited turn is consumed silently, then subordinate turns are skipped", () => {
    const formed = formed2();
    expect(currentSeat(formed)).toBe(0); // the commander proposed on his own turn and keeps it
    const a = mpReduce(formed, 0, { type: "endTurn" }).state;
    expect(currentSeat(a)).toBe(0); // seat 1's slot came round, was consumed by the forfeit
    expect(a.parties[1]!.forfeitTurnsOwed).toBeUndefined();
    const b = mpReduce(a, 0, { type: "endTurn" }).state;
    expect(currentSeat(b)).toBe(0); // forfeit paid — now the slot is skipped as a subordinate's
    // The subordinate can never act solo while united.
    expect(mpReduce(b, 1, { type: "move", dir: 1 }).events).toEqual([{ type: "blocked" }]);
  });

  it("the commander's move carries the whole union with him", () => {
    const north = area(31, packCoord(1, 50, 49));
    const formed = formed2({ areas: [area(31, packCoord(1, 50, 50)), north] });
    const r = mpReduce(formed, 0, { type: "move", dir: 1 }); // DIR_N
    expect(r.state.parties[0]!.partyArea).toBe(1);
    expect(r.state.parties[1]!.partyArea).toBe(1); // the subordinate travelled along
    expect(r.state.parties[1]!.level).toBe(1);
  });

  it("the combined roster fights strangers through the commander's composed view", () => {
    const mp = playing({ seed: 5 }, [
      partyAt(0, { phase: "fight", fight: { surprise: 1, round: 1, focus: 0 }, party: [member(0), member(12)], strangers: [7] }),
      partyAt(1, { party: [] }),
    ]);
    mp.unions = [union()];
    expect(partyView(mp, 0).party).toHaveLength(2); // own Hero + the loaned Giant
    const r = mpReduce(mp, 0, { type: "resolveRound", matches: [{ front: [0, 1], backers: [], strangers: [0] }] });
    expect(r.state.parties[0]!.kills).toBe(1); // FS 5+7 vs the Dwarf's 1 — the union wins
    expect(r.state.parties[0]!.party.every((m) => m.status === 0)).toBe(true);
  });

  it("trading is barred while united (the loan model keeps party arrays append-only)", () => {
    const formed = formed2();
    expect(mpReduce(formed, 0, { type: "proposeTrade", to: 1 }, 0).events).toEqual([{ type: "blocked" }]);
  });
});

describe("leaving & dissolving (I-7)", () => {
  it("leaveUnion returns the seat's members with their treasure, co-located; the rump union dissolves", () => {
    const mp = playing({}, [partyAt(0, { party: [member(0), member(7, [1], { mpTag: "loan:1" })] }), partyAt(1, { party: [] })]);
    mp.unions = [union()];
    const r = leaveUnion(mp, 1, 0);
    expect(r.ok).toBe(true);
    expect(r.state.parties[1]!.party).toEqual([member(7, [1])]); // home again, loot aboard
    expect(r.state.parties[1]!.partyArea).toBe(r.state.parties[0]!.partyArea);
    expect(r.state.parties[0]!.party).toEqual([member(0)]);
    expect(r.state.unions).toHaveLength(0); // one member left — the union is gone
  });

  it("a casualty among loaned members comes home dead — the owning seat's loss", () => {
    const mp = playing({}, [partyAt(0, { party: [member(0), member(7, [], { status: 3, mpTag: "loan:1" })] }), partyAt(1, { party: [] })]);
    mp.unions = [union()];
    const r = leaveUnion(mp, 1, 0);
    expect(r.state.parties[1]!.party[0]!.status).toBe(3);
    expect(r.state.parties[1]!.status).toBe("wiped"); // nothing living came back
  });

  it("leaving is blocked while the union is mid-fight", () => {
    const fighting = playing({}, [
      partyAt(0, { phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, party: [member(0), member(7)], strangers: [10] }),
      partyAt(1, { party: [] }),
    ]);
    fighting.unions = [union()];
    expect(leaveUnion(fighting, 1, 0).reason).toBe("midFight");
    expect(dissolveUnion(fighting, 0, 0).reason).toBe("midFight");
  });

  it("only the commander may dissolve; his leave IS a dissolution", () => {
    const mp = playing({}, [partyAt(0, { party: [member(0), member(7, [], { mpTag: "loan:1" })] }), partyAt(1, { party: [] })]);
    mp.unions = [union()];
    expect(dissolveUnion(mp, 1, 0).reason).toBe("notCommander");
    const r = leaveUnion(mp, 0, 0); // commander walking away dissolves the whole thing
    expect(r.ok).toBe(true);
    expect(r.state.unions).toHaveLength(0);
    expect(r.state.parties[1]!.party).toEqual([member(7)]);
  });

  it("dissolution with a recruit: unanimous allocation hands the ally over", () => {
    const mp = playing({}, [partyAt(0, { party: [member(0), member(5, [], { mpTag: "loan:1" }), member(6, [], { mpTag: "recruit:1" })] }), partyAt(1, { party: [] })]);
    mp.unions = [union({ recruits: [{ seat: 0, partyIdx: 2 }] })]; // the Woman joined while united
    const d = dissolveUnion(mp, 0, 0);
    expect(d.ok).toBe(true);
    expect(d.state.parties[1]!.party).toEqual([member(5)]); // loan home
    const residual = d.state.unions![0]!;
    expect(residual.dissolved).toBe(true);
    expect(residual.recruits).toEqual([{ seat: 0, partyIdx: 1 }]); // re-indexed after the loan left
    expect(activeUnionOf(d.state, 0)).toBeNull(); // dissolved: nobody is "in" it any more

    const a1 = allocateRecruit(d.state, 0, 0, 1);
    expect(a1.ok).toBe(true);
    expect(a1.state.unions![0]!.alloc).toEqual({ recruit: 0, to: 1, approved: [0] });
    const a2 = allocateRecruit(a1.state, 1, 0, 1); // the other member confirms the same split
    expect(a2.state.parties[1]!.party).toEqual([member(5), member(6)]);
    expect(a2.state.parties[0]!.party).toEqual([member(0)]);
    expect(a2.state.unions).toHaveLength(0); // all settled
  });

  it("dissolution with a recruit: disagreement parks the ally neutral on the tile", () => {
    const mp = playing({}, [partyAt(0, { party: [member(0), member(5, [], { mpTag: "loan:1" }), member(6, [2], { mpTag: "recruit:1" })] }), partyAt(1, { party: [] })]);
    mp.unions = [union({ recruits: [{ seat: 0, partyIdx: 2 }] })];
    const d = dissolveUnion(mp, 0, 0);
    const a1 = allocateRecruit(d.state, 0, 0, 0); // commander wants her for himself…
    const a2 = allocateRecruit(a1.state, 1, 0, 1); // …the partner disagrees
    expect(a2.ok).toBe(true);
    expect(a2.state.parties[0]!.party).toEqual([member(0)]);
    expect(a2.state.parties[1]!.party).toEqual([member(5)]);
    expect(a2.state.cave.areas[0]!.contents).toEqual([106, 202]); // neutral stranger + her treasure
    expect(a2.state.unions).toHaveLength(0);
  });
});

describe("union PvP command (I-9/I-10 + M5 fairness)", () => {
  // Seat 0 commands a union with seat 1 (a Giant on loan alongside… no — own Giant + loaned Dwarf).
  const unionVsRival = (): MpGameState => {
    const mp = playing({}, [
      partyAt(0, { party: [member(12), member(7)], prev: 2 }), // Giant (own) + Dwarf (on loan from 1)
      partyAt(1, { party: [] }),
      partyAt(2, { party: [member(12), member(5)] }), // the rival: Giant + Man
    ]);
    mp.unions = [union()];
    return mp;
  };

  it("declareAttack by the commander engages the union entire; a subordinate cannot declare", () => {
    const mp = unionVsRival();
    expect(declarePvp(mp, 1, 2, 0, 1000).events).toEqual([{ type: "blocked" }]); // subordinate
    expect(declarePvp(mp, 0, 1, 0, 1000).events).toEqual([{ type: "blocked" }]); // own union
    const r = declarePvp(mp, 0, 2, 0, 1000);
    const s = r.state.session!;
    expect(s.kind).toBe("pvp");
    expect((s as { attacker: number[] }).attacker).toEqual([0, 1]);
    expect((s as { defender: number[] }).defender).toEqual([2]);
  });

  it("enforces strongest-fights-strongest on a union command's engagements", () => {
    const declaredState = declarePvp(unionVsRival(), 0, 2, 0, 1000).state;
    const lined = setDefenderLine(declaredState, 2, ["2:0", "2:1"], 0, 1000).state;
    // The commander tries to feed the loaned Dwarf (FS 1) to the rival Giant (FS 7) while his own
    // Giant takes the soft Man — exactly what the rulebook forbids.
    const unfair = setAttackerEngage(lined, 0, [
      { attackers: ["0:1"], defenders: ["2:0"] },
      { attackers: ["0:0"], defenders: ["2:1"] },
    ], [], 0, 1000);
    expect(unfair.events).toEqual([{ type: "planRejected", reason: "strongestFightsStrongest" }]);
    // Strongest against strongest is accepted.
    const fair = setAttackerEngage(lined, 0, [
      { attackers: ["0:0"], defenders: ["2:0"] },
      { attackers: ["0:1"], defenders: ["2:1"] },
    ], [], 0, 1000);
    expect((fair.state.session as { stage?: string }).stage).toBe("defenderCasters");
  });
});

describe("division & rear-guards (I-8)", () => {
  const guardedMap = () => playing(
    { areas: [area(31, packCoord(1, 50, 50), [201]), area(31, packCoord(1, 50, 49))] },
    [partyAt(0, { party: [member(0), member(5)] }), partyAt(1, { partyArea: 1 })],
  );

  it("divideParty pins a guard detachment; the mobile part keeps the turn", () => {
    const mp = guardedMap();
    const r = mpReduce(mp, 0, { type: "divideParty", members: [1] });
    expect(r.state.detachments).toEqual([{ ownerSeat: 0, area: 0, members: [member(5)] }]);
    expect(r.state.parties[0]!.party).toEqual([member(0)]);
    expect(currentSeat(r.state)).toBe(0); // dividing does not end the turn
    expect(hostileDetachmentAt(r.state, 1)).toBe(false); // rival is elsewhere (for now)
  });

  it("guarded loot is re-parked when a rival tries to sweep it up, and the guard rejoins on return", () => {
    const mp = guardedMap();
    const d = mpReduce(mp, 0, { type: "divideParty", members: [1] }).state;
    const away = mpReduce(d, 0, { type: "move", dir: 1 }).state; // owner walks off north
    expect(currentSeat(away)).toBe(1);

    // The rival walks onto the guarded tile: the chamber reload sweeps the parked treasure into
    // its working set — the guard puts it straight back and cancels the pickup.
    const rival = mpReduce(away, 1, { type: "move", dir: 3 });
    expect(rival.events).toContainEqual({ type: "planRejected", reason: "treasureGuarded" });
    expect(rival.state.parties[1]!.treasures).toEqual([]);
    expect(rival.state.parties[1]!.phase).toBe("explore");
    expect(rival.state.cave.areas[0]!.contents).toContain(201);

    // The owner returns: the detachment auto-merges and the loot is his to take again.
    const pass = mpReduce(rival.state, 1, { type: "endTurn" }).state;
    const back = mpReduce(pass, 0, { type: "move", dir: 3 });
    expect(back.state.detachments).toEqual([]);
    expect(back.state.parties[0]!.party).toEqual([member(0), member(5)]);
    expect(back.state.parties[0]!.treasures).toEqual([1]); // pickup allowed for the owner
  });

  it("rejects dividing away the whole living party, and dividing while united", () => {
    const mp = playing({}, [partyAt(0, { party: [member(0)] }), partyAt(1)]);
    expect(divideParty(mp, 0, [0]).reason).toBe("mustKeepOne");
    const united = playing({}, [partyAt(0, { party: [member(0), member(5)] }), partyAt(1, { party: [] })]);
    united.unions = [union()];
    expect(divideParty(united, 0, [1]).reason).toBe("inUnion");
  });
});

describe("recruit recording & Sorcerer bounty (I-7/I-19)", () => {
  it("unionPostAction records strangers who joined under the union flag as recruits", () => {
    const mp = playing({}, [partyAt(0, { party: [member(0), member(7), member(6)] }), partyAt(1, { party: [] })]);
    mp.unions = [union()];
    const r = unionPostAction(mp, 0, [{ type: "strangersJoined", count: 1 }]);
    expect(r.state.unions![0]!.recruits).toEqual([{ seat: 0, partyIdx: 2 }]);
  });

  it("a union Sorcerer kill stamps the shared bounty on every member seat", () => {
    const mp = playing({}, [partyAt(0, { party: [member(0), member(7)] }), partyAt(1, { party: [] })]);
    mp.unions = [union()];
    const r = unionPostAction(mp, 0, [{ type: "sorcererSlain" }]);
    expect(r.state.parties[0]!).toMatchObject({ sorcererKilled: true, sorcererSharedWith: [1] });
    expect(r.state.parties[1]!).toMatchObject({ sorcererKilled: true, sorcererSharedWith: [0] });
  });

  it("mpScore divides the 30-point bounty equally: 2 seats → 15 each, 3 → 10 each", () => {
    const two = playing({}, [
      partyAt(0, { sorcererKilled: true, sorcererSharedWith: [1] }),
      partyAt(1, { sorcererKilled: true, sorcererSharedWith: [0] }),
    ]);
    // A lone Hero (10) + the full bounty (30) = 40 solo; shared two ways the 30 becomes 15.
    expect(scoreGame(partyView(two, 0))).toBe(40);
    expect(mpScore(two, 0)).toBe(25);
    expect(mpScore(two, 1)).toBe(25);

    const three = playing({}, [
      partyAt(0, { sorcererKilled: true, sorcererSharedWith: [1, 2] }),
      partyAt(1, { sorcererKilled: true, sorcererSharedWith: [0, 2] }),
      partyAt(2, { sorcererKilled: true, sorcererSharedWith: [0, 1] }),
    ]);
    expect(mpScore(three, 0)).toBe(20); // 10 + ⌊30/3⌋
  });

  it("a solo slayer keeps the full 30 (mpScore = scoreGame)", () => {
    const solo = playing({}, [partyAt(0, { sorcererKilled: true }), partyAt(1)]);
    expect(mpScore(solo, 0)).toBe(scoreGame(partyView(solo, 0)));
    expect(mpScore(solo, 0)).toBe(40);
  });
});

describe("cave-global Apprentice revert on a union Sorcerer kill (SC-EXT-31, design US-14)", () => {
  it("reverts an Apprentice ally in the KILLING (commander) seat's own party", () => {
    const mp = playing({}, [
      partyAt(0, { party: [member(0), member(14, [], { status: 1 })] }), // commander's own Apprentice ally
      partyAt(1, { party: [] }),
    ]);
    mp.unions = [union()];
    const r = unionPostAction(mp, 0, [{ type: "sorcererSlain" }]);
    expect(r.state.parties[0]!.party).toEqual([member(0)]);
    expect(r.state.parties[0]!.strangers).toEqual([14]); // hostile stranger in her current area
    expect(r.events).toContainEqual({ type: "apprenticeTurned", count: 1, items: [] });
  });

  it("reverts an Apprentice ally in ANOTHER, uninvolved seat's party — the Sorcerer is cave-global", () => {
    const mp = playing({}, [
      partyAt(0, { party: [member(0), member(7)] }),
      partyAt(1, { party: [] }),
      partyAt(2, { partyArea: 0, party: [member(5), member(14, [3], { status: 1 })] }), // seat 2: not in the union
    ]);
    mp.unions = [union()]; // union between seats 0 and 1 only
    const r = unionPostAction(mp, 0, [{ type: "sorcererSlain" }]);
    expect(r.state.parties[2]!.party).toEqual([member(5)]);
    expect(r.state.parties[2]!.strangers).toEqual([14]);
    expect(r.state.parties[2]!.treasures).toEqual([3]); // her carried item spills, solo semantics
  });

  it("a LOANED Apprentice ends her loan cleanly when she reverts, and her item spills", () => {
    const mp = playing({}, [
      partyAt(0, { party: [member(0), member(14, [2], { status: 1, mpTag: "loan:1" })] }), // seat 1's Apprentice, on loan
      partyAt(1, { party: [] }),
    ]);
    mp.unions = [union({ onLoan: [{ fromSeat: 1, idx: 1 }] })];
    const r = unionPostAction(mp, 0, [{ type: "sorcererSlain" }]);
    expect(r.state.parties[0]!.party).toEqual([member(0)]); // gone from the commander's array
    expect(r.state.parties[0]!.strangers).toEqual([14]); // stranger where the union stands
    expect(r.state.parties[0]!.treasures).toEqual([2]); // her item spilled into the working set
    expect(r.state.unions![0]!.onLoan).toEqual([]); // the loan ended — no dangling record
    expect(r.state.parties[1]!.party).toEqual([]); // she does NOT come home — she never exits the cave
  });
});

describe("loan-index stability under solo array reshaping (mutiny regression)", () => {
  it("a mutiny that splices deserters out of the commander's array does not corrupt the loans", () => {
    // Commander seat 0: own Hero (0), an own ALLY Troll (status 1 — WILL desert), and seat 1's
    // Dwarf on loan at index 2. The commander enters a chamber that draws Mutiny: the Troll is
    // spliced out, shifting the Dwarf to index 1 — stored loan indices are now stale. The tag
    // reindex in unionPostAction must keep the bookkeeping true so leaveUnion returns the Dwarf.
    const mp = playing(
      { largePack: [17], smallPack: [300 + 0] }, // N+chamber south; the draw is a Mutiny (hazard id 0)
      [
        partyAt(0, { party: [member(0), member(3, [], { status: 1 }), member(7, [], { mpTag: "loan:1" })] }),
        partyAt(1, { party: [] }),
      ],
    );
    mp.unions = [union({ onLoan: [{ fromSeat: 1, idx: 2 }] })];

    const moved = mpReduce(mp, 0, { type: "move", dir: 3 });
    expect(moved.events.some((e) => e.type === "mutinied")).toBe(true);
    expect(moved.state.parties[0]!.party.map((m) => m.creatureId)).toEqual([0, 7]); // Troll deserted
    expect(moved.state.unions![0]!.onLoan).toEqual([{ fromSeat: 1, idx: 1 }]); // reindexed by tag

    const left = leaveUnion(moved.state, 1, 0);
    expect(left.ok).toBe(true);
    expect(left.state.parties[1]!.party).toEqual([member(7)]); // the RIGHT member came home
    expect(left.state.parties[0]!.party).toEqual([member(0)]);
  });
});
