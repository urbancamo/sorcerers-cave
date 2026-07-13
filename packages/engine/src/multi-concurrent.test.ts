import { describe, it, expect } from "vitest";
import { buildMpGame, mpReduce, type CaveState, type PartyState, type MpGameState } from "./multi";
import { declarePvp, setDefenderLine, setAttackerEngage, setDefenderCasters, resolveRoundPvp } from "./multi-fight";
import { rollDie, nextSeed } from "./rng";
import { packCoord, DIR_N, DIR_E, DIR_S } from "./coords";
import type { PartyMember, PlacedArea } from "./state";

/**
 * M6 (plan WS-5): the split RNG (shared deck stream + per-party dice substreams, spec §0
 * principle 2) and concurrent exploration behind the per-game `concurrent` flag (spec §1.2
 * Tier A). Builders copied from multi-fight.test.ts (kept local — this suite edits no existing
 * test file).
 */

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

// A controlled playing game with a hand-built cave (card 31 = NESW+chamber) and 2+ seats.
const playing = (cave: Partial<CaveState>, parties: PartyState[], order = [0, 1]): MpGameState => ({
  phase: "playing",
  cave: {
    areas: [area(31, packCoord(1, 50, 50))],
    largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0, seed: 1, ...cave,
  },
  parties, order, pickOrder: [...order].reverse(), active: 0, turnCount: 0,
});

// A 3-tile north-running corridor of explored, empty chambers: (50,50) → (50,49) → (50,48).
const corridor = (): PlacedArea[] => [
  area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49)), area(31, packCoord(1, 50, 48)),
];

const SEATS = [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }];

// ---------------------------------------------------------------------------------------------
// Part A — the split RNG (shared deck stream, per-party dice substreams)
// ---------------------------------------------------------------------------------------------

describe("split RNG (M6, spec §0 principle 2)", () => {
  it("buildMpGame derives each seat's diceSeed from the game seed — nextSeed^(seat+1)(cave.seed) — reproducibly", () => {
    const mp = buildMpGame(7, SEATS);
    const d0 = nextSeed(mp.cave.seed);
    const d1 = nextSeed(d0);
    expect(mp.parties[0]!.diceSeed).toBe(d0); // seat 0: one step off the cave seed
    expect(mp.parties[1]!.diceSeed).toBe(d1); // seat 1: two steps — derived, never consumed
    expect(d0).not.toBe(d1);
    expect(buildMpGame(7, SEATS)).toEqual(mp); // the whole build (incl. substreams) is reproducible
  });

  it("PvP rolls come from each side's OWN substream and never perturb the shared cave.seed", () => {
    const mp = playing({ seed: 1 }, [
      partyAt(0, { party: [member(12)], diceSeed: 101 }), // Giant
      partyAt(1, { party: [member(7)], diceSeed: 202 }),  // Dwarf
    ]);
    let r = declarePvp(mp, 0, 1, 0, 1000);
    r = setDefenderLine(r.state, 1, ["1:0"], 0, 1000);
    r = setAttackerEngage(r.state, 0, [{ attackers: ["0:0"], defenders: ["1:0"] }], [], 0, 1000);
    r = setDefenderCasters(r.state, 1, [], 0, 1000);
    const res = resolveRoundPvp(r.state, 0, 1000);
    const aRoll = rollDie(101); // the attacker command lead's substream
    const dRoll = rollDie(202); // the defender's — "roll the die for his own scores"
    expect(res.events[0]).toMatchObject({ type: "combatRoll", partyRoll: aRoll.value, enemyRoll: dRoll.value });
    expect(res.state.cave.seed).toBe(1); // the shared deck/solo stream is untouched
    expect(res.state.parties[0]!.diceSeed).toBe(aRoll.seed); // each substream advanced once
    expect(res.state.parties[1]!.diceSeed).toBe(dRoll.seed);
  });

  it("legacy parties without a diceSeed fall back to the shared cave stream (pinned pre-M6 rolls)", () => {
    const mp = playing({ seed: 1 }, [partyAt(0, { party: [member(12)] }), partyAt(1, { party: [member(7)] })]);
    let r = declarePvp(mp, 0, 1, 0, 1000);
    r = setDefenderLine(r.state, 1, ["1:0"], 0, 1000);
    r = setAttackerEngage(r.state, 0, [{ attackers: ["0:0"], defenders: ["1:0"] }], [], 0, 1000);
    r = setDefenderCasters(r.state, 1, [], 0, 1000);
    const res = resolveRoundPvp(r.state, 0, 1000);
    expect(res.events[0]).toMatchObject({ partyRoll: 4, enemyRoll: 2 }); // the pinned seed-1 stream
    const s1 = rollDie(1);
    expect(res.state.cave.seed).toBe(rollDie(s1.seed).seed); // cave.seed advanced twice, as before M6
  });

  it("the same start + the same action sequence (incl. a PvP round) reproduces identical states", () => {
    const start = (): MpGameState => playing({ seed: 5, largePack: [1] }, [
      partyAt(0, { party: [member(12)], diceSeed: 111 }),
      partyAt(1, { party: [member(7), member(7)], diceSeed: 222 }),
    ]);
    const run = (mp0: MpGameState): MpGameState[] => {
      const out: MpGameState[] = [];
      let r = mpReduce(mp0, 0, { type: "declareAttack", to: 1 }, 0);
      out.push(r.state);
      r = mpReduce(r.state, 1, { type: "pvpLine", line: ["1:0", "1:1"] }, 0);
      out.push(r.state);
      r = mpReduce(r.state, 0, { type: "pvpEngage", engagements: [{ attackers: ["0:0"], defenders: ["1:0", "1:1"] }], backers: [] }, 0);
      out.push(r.state);
      r = mpReduce(r.state, 1, { type: "pvpCasters", backers: [] }, 0); // completes the layout → auto-resolves
      out.push(r.state);
      return out;
    };
    const first = run(start());
    expect(run(start())).toEqual(first); // fully deterministic replay
    const last = first[first.length - 1]!;
    expect(last.cave.seed).toBe(5); // the defender's roll did NOT perturb the shared stream
    expect(last.parties[0]!.diceSeed).toBe(rollDie(111).seed); // one engagement — one roll per side
    expect(last.parties[1]!.diceSeed).toBe(rollDie(222).seed);
  });
});

// ---------------------------------------------------------------------------------------------
// Part B — concurrent exploration (spec §1.2 Tier A, plan revision ①), behind the flag
// ---------------------------------------------------------------------------------------------

describe("concurrent exploration (M6, per-game flag)", () => {
  it("flag off (absent vs false) is byte-identical strict round-robin on a scripted sequence", () => {
    const run = (mp0: MpGameState) => {
      const r1 = mpReduce(mp0, 1, { type: "move", dir: DIR_S }); // off-turn — must stay blocked
      const r2 = mpReduce(r1.state, 0, { type: "move", dir: DIR_S }); // draws card 1, turn passes
      const r3 = mpReduce(r2.state, 1, { type: "move", dir: DIR_E }); // seat 1's turn — draws card 8
      return { events: [r1.events, r2.events, r3.events], state: r3.state };
    };
    const base = playing({ largePack: [1, 8] }, [partyAt(0), partyAt(1)]);
    const a = run(base);
    const b = run({ ...structuredClone(base), concurrent: false });
    const strip = (mp: MpGameState): MpGameState => { const c = structuredClone(mp); delete c.concurrent; return c; };
    expect(a.events[0]).toEqual([{ type: "blocked" }]); // the strict turn gate held in both
    expect(b.events).toEqual(a.events);
    expect(strip(b.state)).toEqual(strip(a.state)); // byte-identical apart from the flag itself
  });

  it("flag on: a free seat acts off-turn; the deck serialises in action-arrival order; turnCount ticks per action", () => {
    const mp: MpGameState = { ...playing({ largePack: [8, 1] }, [partyAt(0), partyAt(1)]), concurrent: true };
    // active === 0, yet seat 1 moves FIRST — free roam has no turn gate.
    const r1 = mpReduce(mp, 1, { type: "move", dir: DIR_E });
    expect(r1.state.parties[1]!.partyArea).toBe(1);
    expect(r1.state.cave.largeIdx).toBe(1); // first arrival drew largePack[0]
    expect(r1.state.cave.areas[1]!.card).toBe(8);
    const r2 = mpReduce(r1.state, 0, { type: "move", dir: DIR_S });
    expect(r2.state.cave.largeIdx).toBe(2); // second arrival drew the NEXT card — sequential cursors
    expect(r2.state.cave.areas[2]!.card).toBe(1);
    expect(r2.state.parties[0]!.partyArea).toBe(2);
    expect(r2.state.turnCount).toBe(2); // one per completed action (the HUD clock)
    expect(r2.state.active).toBe(0); // the strict cursor never moves
  });

  it("endTurn is a harmless no-op when concurrent — there are no turns to pass", () => {
    const mp: MpGameState = { ...playing({}, [partyAt(0), partyAt(1)]), concurrent: true };
    const r = mpReduce(mp, 1, { type: "endTurn" });
    expect(r.state).toBe(mp);
    expect(r.events).toEqual([]);
  });

  it("sessions still lock their participants; everyone else keeps roaming", () => {
    const areas = [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49))];
    const mp: MpGameState = { ...playing({ areas }, [partyAt(0), partyAt(1), partyAt(2)], [0, 1, 2]), concurrent: true };
    const t = mpReduce(mp, 0, { type: "proposeTrade", to: 1 }, 0).state;
    expect(t.session?.kind).toBe("trade");
    // Both traders are locked out of solo actions (leaving is an explicit cancelTrade)…
    expect(mpReduce(t, 0, { type: "move", dir: DIR_N }).events).toEqual([{ type: "blocked" }]);
    expect(mpReduce(t, 1, { type: "move", dir: DIR_N }).events).toEqual([{ type: "blocked" }]);
    // …while the third seat plays on, mid-session, off-turn (Tier C scopes to participants only).
    const free = mpReduce(t, 2, { type: "move", dir: DIR_N });
    expect(free.state.parties[2]!.partyArea).toBe(1);
    // Cancelling frees the trader to act again.
    const cancelled = mpReduce(t, 0, { type: "cancelTrade" }, 0).state;
    expect(mpReduce(cancelled, 0, { type: "move", dir: DIR_N }).state.parties[0]!.partyArea).toBe(1);
  });

  it("a seat may not move INTO an area where a rival's stranger-fight is live (I-13 extended)", () => {
    const areas = [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49))];
    const mp: MpGameState = {
      ...playing({ areas, largePack: [8] }, [
        partyAt(0),
        partyAt(1, { partyArea: 1, phase: "fight", strangers: [3], fight: { surprise: 0, round: 1, focus: 0 } }),
      ]),
      concurrent: true,
    };
    const r = mpReduce(mp, 0, { type: "move", dir: DIR_N });
    expect(r.events).toEqual([{ type: "planRejected", reason: "a fight with strangers is under way" }]);
    expect(r.state).toBe(mp);
    // Any other exit stays free — only the contested area is barred.
    expect(mpReduce(mp, 0, { type: "move", dir: DIR_E }).state.parties[0]!.partyArea).toBe(2);
  });

  it("pursuit lockout under fleeGrace: declareAttack is barred until the grace clears on the clean-flight rules", () => {
    let mp: MpGameState = {
      ...playing({ areas: corridor() }, [partyAt(0, { party: [member(12)] }), partyAt(1, { party: [member(7)], fleeGrace: 2 })]),
      concurrent: true,
    };
    // Grace 2: the pursuer cannot re-engage.
    expect(mpReduce(mp, 0, { type: "declareAttack", to: 1 }, 0).events).toEqual([{ type: "blocked" }]);
    // First clean flight (empty explored chamber, no rivals there) burns one grace.
    mp = mpReduce(mp, 1, { type: "move", dir: DIR_N }).state;
    expect(mp.parties[1]!.fleeGrace).toBe(1);
    mp = mpReduce(mp, 0, { type: "move", dir: DIR_N }).state; // the pursuer follows
    expect(mpReduce(mp, 0, { type: "declareAttack", to: 1 }, 0).events).toEqual([{ type: "blocked" }]); // still shielded
    // Second clean flight clears the grace — the shield drops.
    mp = mpReduce(mp, 1, { type: "move", dir: DIR_N }).state;
    expect(mp.parties[1]!.fleeGrace).toBeUndefined();
    mp = mpReduce(mp, 0, { type: "move", dir: DIR_N }).state;
    const atk = mpReduce(mp, 0, { type: "declareAttack", to: 1 }, 0);
    expect(atk.state.session?.kind).toBe("pvp");
  });

  it("forfeit lockout: an owing seat may not act until rival activity has paid the debt off", () => {
    const areas = [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49))];
    const mp: MpGameState = { ...playing({ areas }, [partyAt(0, { forfeitTurnsOwed: 1 }), partyAt(1)]), concurrent: true };
    expect(mpReduce(mp, 0, { type: "move", dir: DIR_N }).events).toEqual([{ type: "blocked" }]); // parked
    const r1 = mpReduce(mp, 1, { type: "move", dir: DIR_N }); // a rival completes an action…
    expect(r1.state.parties[0]!.forfeitTurnsOwed).toBeUndefined(); // …paying one owed forfeit off
    const r2 = mpReduce(r1.state, 0, { type: "move", dir: DIR_N });
    expect(r2.state.parties[0]!.partyArea).toBe(1); // free again
  });

  it("an owing seat with no exploring rival left is NOT dead-stopped (spec §1.3)", () => {
    const areas = [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49))];
    const mp: MpGameState = {
      ...playing({ areas }, [partyAt(0, { forfeitTurnsOwed: 2 }), partyAt(1, { status: "quit" })]),
      concurrent: true,
    };
    const r = mpReduce(mp, 0, { type: "move", dir: DIR_N });
    expect(r.state.parties[0]!.partyArea).toBe(1); // nobody to yield to — the gate stands down
  });

  it("the game still finishes when every seat is terminal (no advanceTurn to detect it)", () => {
    const mp: MpGameState = { ...playing({}, [partyAt(0), partyAt(1)]), concurrent: true };
    const a = mpReduce(mp, 1, { type: "quit" }).state; // off-turn quit — fine in free roam
    expect(a.parties[1]!.status).toBe("quit");
    expect(a.phase).toBe("playing");
    const b = mpReduce(a, 0, { type: "quit" }).state;
    expect(b.phase).toBe("finished");
  });
});
