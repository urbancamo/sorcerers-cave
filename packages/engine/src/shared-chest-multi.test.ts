import { describe, it, expect } from "vitest";
import { declarePvp, acceptStop, type PvpFightSession } from "./multi-fight";
import type { CaveState, PartyState, MpGameState } from "./multi";
import type { PartyMember, PlacedArea } from "./state";
import { packCoord } from "./coords";
import { deepPoolCrossing } from "./special";
import { makeState } from "./testkit";
import { carriedWeight } from "./pickup";

// Sharing the Treasure Chest in multiplayer (the §388 pre-fight drop and its retake) and at the Deep Pool.
const GIANT = 12, OGRE = 2, DWARF = 7, TROLL = 3;
const member = (creatureId: number, over: Partial<PartyMember> = {}): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [], ...over });
const partyAt = (seat: number, party: PartyMember[]): PartyState => ({
  seat, color: ["green", "blue"][seat]!, name: "Party " + seat, status: "exploring", kills: 0,
  gs: 0, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
  partyArea: 0, level: 1, prev: 0, prev2: 0, party, strangers: [], treasures: [], hazards: [], fight: null,
});
const area = (): PlacedArea => ({ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 });
const game = (att: PartyMember[], def: PartyMember[]): MpGameState => ({
  phase: "playing",
  cave: { areas: [area()], largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0, seed: 1 } as CaveState,
  parties: [partyAt(0, att), partyAt(1, def)], order: [0, 1], pickOrder: [1, 0], active: 0, turnCount: 0,
});
const sharedPair = () => [member(GIANT, { chestShares: [{ chest: 1, kg: 75 }] }), member(OGRE, { chestShares: [{ chest: 1, kg: 25 }] })];

describe("multiplayer: a shared chest and the §388 pre-fight drop", () => {
  it("goes down whole when the fight is declared, each bearer's share remembered", () => {
    const { state } = declarePvp(game(sharedPair(), [member(DWARF)]), 0, 1, 0, 1000);
    expect(state.cave.areas[0]!.contents).toEqual([200 + 14]);
    expect(state.parties[0]!.party.every((m) => !m.chestShares)).toBe(true);
    expect((state.session as PvpFightSession).drops).toEqual([
      { seat: 0, id: "0:0", tid: 14, kg: 75, chest: 1 }, { seat: 0, id: "0:1", tid: 14, kg: 25, chest: 1 },
    ]);
  });

  it("is retaken as before when both sides agree to stop and every bearer is alive", () => {
    const declared = declarePvp(game(sharedPair(), [member(DWARF)]), 0, 1, 0, 1000).state;
    (declared.session as PvpFightSession).stopProposedBy = 0;
    const { state, events } = acceptStop(declared, 1, 0);
    expect(state.parties[0]!.party.map((m) => m.chestShares)).toEqual([[{ chest: 1, kg: 75 }], [{ chest: 1, kg: 25 }]]);
    expect(state.cave.areas[0]!.contents).toEqual([]);
    expect(events).toContainEqual({ type: "droppedRetaken", count: 1 });
  });

  it("stays on the floor if a bearer fell", () => {
    const declared = declarePvp(game(sharedPair(), [member(DWARF)]), 0, 1, 0, 1000).state;
    (declared.session as PvpFightSession).stopProposedBy = 0;
    declared.parties[0]!.party[1]!.status = 3;
    const { state } = acceptStop(declared, 1, 0);
    expect(state.cave.areas[0]!.contents).toEqual([200 + 14]);
    expect(state.parties[0]!.party[0]!.chestShares).toBeUndefined();
  });
});

describe("the Deep Pool and a shared chest", () => {
  const pool = (party: PartyMember[]) => makeState({ party, areas: [area()] });

  it("with a Giant the chest crosses, and counts once: two shared chests (200 kg) against one Giant's 150 kg load is a one-turn delay", () => {
    const s = pool([member(GIANT, { chestShares: [{ chest: 1, kg: 50 }, { chest: 2, kg: 50 }] }), member(OGRE, { chestShares: [{ chest: 1, kg: 50 }, { chest: 2, kg: 50 }] })]);
    const events = deepPoolCrossing(s, 0);
    expect(events).toContainEqual({ type: "deepPoolDelay", loads: 2, turns: 1 });
    expect(carriedWeight(s.party[0]!)).toBe(100); // the shares are untouched
  });

  it("one shared chest with a Giant is a single load: no delay", () => {
    const s = pool([member(GIANT, { chestShares: [{ chest: 1, kg: 50 }] }), member(OGRE, { chestShares: [{ chest: 1, kg: 50 }] })]);
    expect(deepPoolCrossing(s, 0).some((e) => e.type === "deepPoolDelay")).toBe(false);
  });

  it("without a Giant the whole chest sinks into the pool, once", () => {
    const s = pool([member(OGRE, { chestShares: [{ chest: 1, kg: 50 }] }), member(TROLL, { chestShares: [{ chest: 1, kg: 50 }] })]);
    const events = deepPoolCrossing(s, 0);
    expect(s.areas[0]!.dropped).toEqual([14]);
    expect(s.party.every((m) => !m.chestShares)).toBe(true);
    expect(events).toContainEqual({ type: "treasureDropped", count: 1 });
  });
});
