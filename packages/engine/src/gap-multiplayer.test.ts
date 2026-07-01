import { describe, it, expect } from "vitest";
import {
  buildMpGame, choosePartyFor, mpReduce, partyView, currentSeat, currentPicker,
  type CaveState, type PartyState, type MpGameState,
} from "./multi";
import { packCoord } from "./coords";

// Local helpers mirrored from multi.test.ts.
const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });

// A playing-phase party at the shared gateway (area 0), at rest.
const partyAt = (seat: number, over: Partial<PartyState> = {}): PartyState => ({
  seat, color: ["green", "blue", "yellow", "red"][seat]!, name: "Party " + seat, status: "exploring", kills: 0,
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

describe("partyView (SC-MP-21)", () => {
  it("SC-MP-21: composes a single-party GameState = shared cave ⊕ that seat's party", () => {
    const cave: Partial<CaveState> = {
      areas: [{ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [17, 8, 1], largeIdx: 2, smallPack: [110, 105], smallIdx: 1, seed: 4242,
    };
    const p0 = partyAt(0, { partyArea: 0, phase: "explore", party: [member(5), member(7)], score: 9, kills: 2 });
    const p1 = partyAt(1, { partyArea: 3, phase: "encounter", party: [member(12)], strangers: [10] });
    const mp = playing(cave, [p0, p1]);

    const v0 = partyView(mp, 0);
    // Shared cave fields — identical to the cave, regardless of seat.
    expect(v0.areas).toBe(mp.cave.areas);
    expect(v0.largePack).toEqual([17, 8, 1]);
    expect(v0.smallPack).toEqual([110, 105]);
    expect(v0.seed).toBe(4242);
    // This seat's own party fields.
    expect(v0.party).toBe(p0.party);
    expect(v0.partyArea).toBe(0);
    expect(v0.phase).toBe("explore");

    const v1 = partyView(mp, 1);
    // Same shared cave, but seat 1's distinct party view.
    expect(v1.areas).toBe(mp.cave.areas);
    expect(v1.seed).toBe(4242);
    expect(v1.party).toBe(p1.party);
    expect(v1.partyArea).toBe(3);
    expect(v1.phase).toBe("encounter");
    expect(v1.strangers).toEqual([10]);
  });
});

describe("currentPicker / currentSeat (SC-MP-22)", () => {
  it("SC-MP-22: picker is pickOrder[active] while selecting (seat null); seat is order[active] while playing (picker null)", () => {
    // Selecting phase.
    const sel = buildMpGame(7, [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }]);
    expect(sel.phase).toBe("partySelect");
    expect(currentPicker(sel)).toBe(sel.pickOrder[sel.active]!);
    expect(currentSeat(sel)).toBeNull();

    // Playing phase.
    const play = playing({}, [partyAt(0), partyAt(1)]);
    expect(play.phase).toBe("playing");
    expect(currentSeat(play)).toBe(play.order[play.active]!);
    expect(currentPicker(play)).toBeNull();
  });
});

describe("no engine winner — the end signal is \"finished\" (SC-MP-24)", () => {
  it("SC-MP-24: when every party is terminal the game moves to \"finished\", each keeping its own score/kills", () => {
    // Two seats, each carrying distinct score/kills; drive both to terminal (quit).
    const mp = playing({}, [
      partyAt(0, { score: 11, kills: 2 }),
      partyAt(1, { score: 4, kills: 1 }),
    ]);
    const a = mpReduce(mp, 0, { type: "quit" }).state;
    expect(a.parties[0]!.status).toBe("quit");
    expect(a.phase).toBe("playing"); // one party still exploring

    const b = mpReduce(a, 1, { type: "quit" }).state;
    expect(b.parties[1]!.status).toBe("quit");
    // No winner is computed — the sole end signal is the "finished" phase.
    expect(b.phase).toBe("finished");
    // Each party still carries its own score/kills (no standings/ranking function exists).
    expect(b.parties[0]!.score).toBe(11);
    expect(b.parties[0]!.kills).toBe(2);
    expect(b.parties[1]!.score).toBe(4);
    expect(b.parties[1]!.kills).toBe(1);
    // currentSeat is null once finished (not the playing phase).
    expect(currentSeat(b)).toBeNull();
  });
});

describe("SeatStatus mapping (SC-MP-5)", () => {
  it("SC-MP-5: a level-1 stair-up exitCave maps GS_ESCAPED → \"left\"", () => {
    // Gateway card 175 has the stair-up bit (32) set → a level-1 exitCave escapes the cave.
    const gateway = { card: 175, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const mp = playing({ areas: [gateway] }, [
      partyAt(0, { partyArea: 0, level: 1, phase: "explore" }),
      partyAt(1),
    ]);
    const r = mpReduce(mp, 0, { type: "exitCave" });
    expect(r.state.parties[0]!.status).toBe("left"); // GS_ESCAPED mapped
    expect(r.state.active).toBe(1); // the escaped seat hands off
  });

  it("SC-MP-5: a quit action maps GS_QUIT → \"quit\"", () => {
    const mp = playing({}, [partyAt(0), partyAt(1)]);
    const r = mpReduce(mp, 0, { type: "quit" });
    expect(r.state.parties[0]!.status).toBe("quit"); // GS_QUIT mapped
    expect(r.state.active).toBe(1); // the quit seat hands off
  });
});
