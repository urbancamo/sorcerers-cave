import { describe, it, expect } from "vitest";
import { buildMpGame, choosePartyFor, mpReduce, currentSeat, type CaveState, type PartyState, type MpGameState } from "./multi";
import { packCoord } from "./coords";

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });

// A playing-phase party at the shared gateway (area 0), at rest.
const partyAt = (seat: number, over: Partial<PartyState> = {}): PartyState => ({
  seat, color: ["green", "blue", "yellow", "red"][seat]!, name: "Party " + seat, status: "exploring",
  gs: 0, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
  partyArea: 0, level: 1, prev: 0, prev2: 0, party: [member(0)], strangers: [], treasures: [], hazards: [], fight: null,
  ...over,
});

// A controlled playing game with a hand-built cave (card 31 = NESW+chamber start) and 2 seats.
const playing = (cave: Partial<CaveState>, parties: PartyState[], order = [0, 1]): MpGameState => ({
  phase: "playing",
  cave: {
    areas: [{ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0, seed: 1, ...cave,
  },
  parties, order, pickOrder: [...order].reverse(), active: 0, turnCount: 0,
});

describe("buildMpGame", () => {
  it("sets up one shared cave, a party per seat on the gateway, and a random play order", () => {
    const mp = buildMpGame(7, [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }]);
    expect(mp.phase).toBe("partySelect");
    expect(mp.cave.areas).toHaveLength(1); // the gateway
    expect(mp.cave.largePack).toHaveLength(60);
    expect(mp.cave.smallPack).toHaveLength(71);
    expect([...mp.order].sort()).toEqual([0, 1]);
    expect(mp.pickOrder).toEqual([...mp.order].reverse()); // first pick = last to move
    expect(mp.parties.map((p) => p.status)).toEqual(["selecting", "selecting"]);
    expect(mp.parties.every((p) => p.partyArea === 0)).toBe(true);
  });
});

describe("choosePartyFor (turn-based draft from the shared pack)", () => {
  it("drafts in pick order, depletes the shared pack, and begins play after the last pick", () => {
    const mp0 = buildMpGame(7, [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }]);
    const first = mp0.pickOrder[0]!, second = mp0.pickOrder[1]!;

    expect(choosePartyFor(mp0, second, [0]).reason).toBe("not_your_pick"); // out of turn
    const r1 = choosePartyFor(mp0, first, [5, 5]); // two Men (cost 3+3 = 6)
    expect(r1.ok).toBe(true);
    expect(r1.state.parties[first]!.party.map((m) => m.creatureId)).toEqual([5, 5]);
    expect(r1.state.cave.smallPack.filter((c) => c === 105)).toHaveLength(4); // 6 Men − 2 picked
    expect(r1.state.phase).toBe("partySelect"); // still selecting (one seat left)

    const r2 = choosePartyFor(r1.state, second, [0]); // a Hero (cost 6)
    expect(r2.ok).toBe(true);
    expect(r2.state.phase).toBe("playing"); // last pick → play begins
    expect(r2.state.active).toBe(0); // first mover = order[0]
    expect(r2.state.parties.every((p) => p.status === "exploring")).toBe(true);
  });

  it("a card taken by one seat is unavailable to the next (one finite pack)", () => {
    const mp0 = buildMpGame(7, [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }]);
    const first = mp0.pickOrder[0]!, second = mp0.pickOrder[1]!;
    const r1 = choosePartyFor(mp0, first, [1]); // the lone Woman-Hero (id 1)
    expect(r1.ok).toBe(true);
    expect(choosePartyFor(r1.state, second, [1]).reason).toBe("unavailable"); // only one exists
  });
});

describe("mpReduce (turn-gated play)", () => {
  it("rejects actions from the seat whose turn it isn't", () => {
    const mp = playing({}, [partyAt(0), partyAt(1)]);
    expect(currentSeat(mp)).toBe(0);
    const r = mpReduce(mp, 1, { type: "move", dir: 1 });
    expect(r.events).toEqual([{ type: "blocked" }]);
    expect(r.state).toBe(mp); // unchanged
  });

  it("a move into a tunnel ends the turn and passes to the next seat", () => {
    // largePack[0] = 1 (N door only) → a tunnel placed south that connects back north.
    const mp = playing({ largePack: [1] }, [partyAt(0), partyAt(1)]);
    const r = mpReduce(mp, 0, { type: "move", dir: 3 }); // DIR_S
    expect(r.state.active).toBe(1); // handed off
    expect(currentSeat(r.state)).toBe(1);
    expect(r.state.cave.largeIdx).toBe(1); // drew from the shared deck
    expect(r.state.cave.areas).toHaveLength(2);
    expect(r.state.parties[0]!.partyArea).toBe(1); // mover advanced; its own position
    expect(r.state.parties[1]!.partyArea).toBe(0); // the other party is untouched
  });

  it("entering a chamber with strangers keeps the turn until the party acts", () => {
    // card 17 (N+chamber) drawn south; level-1 draw of one Dragon (110) → an encounter.
    const mp = playing({ largePack: [17], smallPack: [110] }, [partyAt(0), partyAt(1)]);
    const r = mpReduce(mp, 0, { type: "move", dir: 3 });
    expect(r.state.active).toBe(0); // still seat 0 — must resolve the encounter this turn
    expect(r.state.parties[0]!.phase).toBe("encounter");
    expect(r.state.parties[0]!.strangers).toEqual([10]);
    // the other seat can't jump in
    expect(mpReduce(r.state, 1, { type: "attack" }).events).toEqual([{ type: "blocked" }]);
    // seat 0 attacks — a round is fought, which ends the turn
    const r2 = mpReduce(r.state, 0, { type: "attack" });
    expect(r2.state.active).toBe(1);
  });

  it("shares the area deck across seats", () => {
    const mp = playing({ largePack: [1, 8] }, [partyAt(0), partyAt(1)]); // 1 = N door, 8 = W door
    const a = mpReduce(mp, 0, { type: "move", dir: 3 }).state; // seat 0 south
    const b = mpReduce(a, 1, { type: "move", dir: 2 }).state;   // seat 1 east (a fresh card)
    expect(b.cave.largeIdx).toBe(2); // both draws came from the one shared deck
    expect(b.cave.areas).toHaveLength(3);
  });

  it("skips terminal parties and finishes when none remain", () => {
    const mp = playing({}, [partyAt(0), partyAt(1)]);
    const a = mpReduce(mp, 0, { type: "quit" }).state;
    expect(a.parties[0]!.status).toBe("quit");
    expect(a.active).toBe(1); // seat 0 skipped hereafter
    const b = mpReduce(a, 1, { type: "quit" }).state;
    expect(b.parties[1]!.status).toBe("quit");
    expect(b.phase).toBe("finished");
  });

  it("endTurn passes when at rest and is rejected mid-encounter", () => {
    const resting = playing({}, [partyAt(0), partyAt(1)]);
    expect(mpReduce(resting, 0, { type: "endTurn" }).state.active).toBe(1);
    const mid = playing({}, [partyAt(0, { phase: "encounter", strangers: [10] }), partyAt(1)]);
    expect(mpReduce(mid, 0, { type: "endTurn" }).events).toEqual([{ type: "blocked" }]);
  });
});
