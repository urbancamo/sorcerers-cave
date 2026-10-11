import { describe, it, expect } from "vitest";
import { makeState } from "./testkit";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { packCoord } from "./coords";
import { buildMpGame, mpReduce, type MpGameState, type PartyState } from "./multi";
import { AF_DESTROYED, AF_UNRESOLVED, type PlacedArea } from "./state";

const tile = (over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });
const looks = (s: ReturnType<typeof makeState>) => legalActions(s).filter((a) => a.type === "examineArea");

describe("examineArea (SC-SIB-8)", () => {
  const withTiles = () => makeState({
    hasSibyl: true,
    largePack: [31, 5], largeIdx: 0,
    areas: [tile(), tile({ faceUp: false, coord: packCoord(1, 50, 51) }), tile({ flags: AF_UNRESOLVED, coord: packCoord(1, 50, 52) }),
            tile({ faceUp: false, flags: AF_DESTROYED, coord: packCoord(1, 50, 53) })],
  });

  it("is never offered without a Sibyl", () => {
    const s = withTiles();
    delete s.hasSibyl;
    expect(looks(s)).toEqual([]);
  });

  it("is offered at rest: the pack top plus every face-down, un-collapsed tile", () => {
    expect(looks(withTiles())).toEqual([
      { type: "examineArea" },
      { type: "examineArea", area: 1 },
      { type: "examineArea", area: 2 },
    ]);
  });

  it("is not offered outside the explore phase", () => {
    expect(looks({ ...withTiles(), phase: "encounter" })).toEqual([]);
  });

  it("offers no pack look when the large pack is spent", () => {
    expect(looks({ ...withTiles(), largeIdx: 2 })).toEqual([
      { type: "examineArea", area: 1 }, { type: "examineArea", area: 2 },
    ]);
  });

  it("changes nothing and emits one event with no card content", () => {
    const s = withTiles();
    const pack = reduce(s, { type: "examineArea" });
    expect(pack.state).toEqual(s);
    expect(pack.events).toEqual([{ type: "sibylExamined" }]);
    const tileLook = reduce(s, { type: "examineArea", area: 1 });
    expect(tileLook.state).toEqual(s);
    expect(tileLook.events).toEqual([{ type: "sibylExamined" }]);
  });

  it("blocks a forged look: no Sibyl, wrong phase, a face-up/collapsed/missing tile, an empty pack", () => {
    const s = withTiles();
    const blocked = [{ type: "blocked" }];
    const noSibyl = structuredClone(s);
    delete noSibyl.hasSibyl;
    expect(reduce(noSibyl, { type: "examineArea" }).events).toEqual(blocked);
    expect(reduce({ ...s, phase: "encounter" }, { type: "examineArea" }).events).toEqual(blocked);
    expect(reduce(s, { type: "examineArea", area: 0 }).events).toEqual(blocked); // face-up
    expect(reduce(s, { type: "examineArea", area: 3 }).events).toEqual(blocked); // collapsed
    expect(reduce(s, { type: "examineArea", area: 99 }).events).toEqual(blocked); // missing
    expect(reduce({ ...s, largeIdx: 2 }, { type: "examineArea" }).events).toEqual(blocked);
  });
});

describe("examineArea in multiplayer (SC-SIB-8)", () => {
  const member = { creatureId: 5, status: 0 as const, dragonKills: 0, treasure: [] };
  const partyAt = (seat: number, over: Partial<PartyState> = {}): PartyState => ({
    seat, color: ["green", "blue"][seat]!, name: "Party " + seat, status: "exploring", kills: 0,
    gs: 0, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
    partyArea: 0, level: 1, prev: 0, prev2: 0, party: [member], strangers: [], treasures: [], hazards: [], fight: null, ...over,
  });
  const game = (): MpGameState => ({
    phase: "playing",
    cave: { areas: [tile()], largePack: [31], largeIdx: 0, smallPack: [], smallIdx: 0, seed: 1 },
    parties: [partyAt(0, { hasSibyl: true }), partyAt(1)], order: [0, 1], pickOrder: [1, 0], active: 0, turnCount: 0,
  });

  it("does not end the looking seat's turn, and the event carries no card content", () => {
    const r = mpReduce(game(), 0, { type: "examineArea" });
    expect(r.events).toEqual([{ type: "sibylExamined" }]);
    expect(r.state.active).toBe(0); // still seat 0's turn — a look is free
  });

  it("passing the turn still works (control: the seat can still end its turn)", () => {
    const r = mpReduce(game(), 0, { type: "endTurn" });
    expect(r.state.active).not.toBe(0);
  });

  it("is turn-gated like any solo action", () => {
    const r = mpReduce(game(), 1, { type: "examineArea" });
    expect(r.events).toEqual([{ type: "blocked" }]);
  });

  it("buildMpGame stays compatible: a Sibyl game still builds", () => {
    expect(buildMpGame(3, [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }], { sibyl: true }).phase).toBe("partySelect");
  });
});
