import { describe, it, expect } from "vitest";
import { mpReduce, partyView, type CaveState, type PartyState, type MpGameState } from "./multi";
import { getSubLocation } from "./subLocation";
import { packCoord, DIR_N, DIR_W } from "./coords";
import type { PartyMember, PlacedArea } from "./state";
import { SPECIAL_DEEP_POOL, SPECIAL_CHASM } from "./data/areaCards";

/**
 * Precise Locations (§10.5, §9): confirms the sub-location model and precise dropped treasure
 * flow through multiplayer with NO dedicated multi.ts wiring — `GameState.subLocation` reaches
 * every seat's `PartyState` for free via `PartyCore` (`Omit<GameState, cave fields>`), and
 * `PlacedArea.sunkTreasure` is genuinely cave-shared (like `contents`/`dropped`) since it lives on
 * `CaveState.areas`, not on any one seat's party. Mirrors multi-kit.test.ts's hand-built-cave style.
 */

const DEEP_POOL_CARD = (SPECIAL_DEEP_POOL << 7) | 31; // NESW + chamber
const CHASM_CARD = (SPECIAL_CHASM << 7) | 31;

const member = (creatureId: number, treasure: number[] = []): PartyMember =>
  ({ creatureId, status: 0, dragonKills: 0, treasure });

const partyAt = (seat: number, over: Partial<PartyState> = {}): PartyState => ({
  seat, color: ["green", "blue", "yellow", "red"][seat]!, name: "Party " + seat, status: "exploring", kills: 0,
  gs: 0, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
  partyArea: 0, level: 1, prev: 0, prev2: 0, party: [member(0)], strangers: [], treasures: [], hazards: [], fight: null,
  ...over,
});

const area = (card: number, coord: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card, coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });

const playing = (cave: Partial<CaveState>, parties: PartyState[], order = [0, 1]): MpGameState => ({
  phase: "playing",
  cave: { areas: [area(31, packCoord(1, 50, 50))], largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0, seed: 1, ...cave },
  parties, order, pickOrder: [...order].reverse(), active: 0, turnCount: 0,
});

/** Two seats sharing one Deep Pool tile (idx 0), each having entered through its OWN doorway —
 *  seat 0 from the west (idx 1), seat 1 from the north (idx 2). */
function twoSeatsOnThePool(): MpGameState {
  return playing(
    {
      areas: [
        area(DEEP_POOL_CARD, packCoord(1, 50, 50)),
        area(2 /* E-only */, packCoord(1, 49, 50)), // west neighbour
        area(4 /* S-only */, packCoord(1, 50, 49)), // north neighbour
      ],
    },
    [partyAt(0, { partyArea: 0, prev: 1, party: [member(5, [1])] }), partyAt(1, { partyArea: 0, prev: 2, party: [member(6)] })],
  );
}

describe("multiplayer inherits sub-locations for free (§10.5, §9)", () => {
  it("each seat's sub-location is independent — composed per-party via PartyCore, not shared", () => {
    const mp = twoSeatsOnThePool();
    expect(getSubLocation(partyView(mp, 0))).toEqual({ at: "doorway", dir: DIR_W });
    expect(getSubLocation(partyView(mp, 1))).toEqual({ at: "doorway", dir: DIR_N });
  });

  it("jumpToIsland moves only the acting seat's own sub-location — the co-located seat is untouched", () => {
    const mp = twoSeatsOnThePool();
    const { state } = mpReduce(mp, 0, { type: "jumpToIsland" });

    expect(getSubLocation(partyView(state, 0))).toEqual({ at: "island" });
    expect(getSubLocation(partyView(state, 1))).toEqual({ at: "doorway", dir: DIR_N }); // seat 1 never moved
    // Untouched but for `seenAreas`: mpReduce's always-on fog-of-war-lite ledger (M7) records EVERY
    // exploring seat's current area on every call, regardless of who acted (multi-kit.test.ts's own
    // Whirlpool-drag test notes the identical diff) — unrelated to sub-locations.
    expect(state.parties[1]).toEqual({ ...mp.parties[1], seenAreas: [0] });
  });

  it("sunk treasure is genuinely cave-shared: seat 0's drop is visible (and reclaimable) to seat 1 too", () => {
    const mp = twoSeatsOnThePool();
    const dropped = mpReduce(mp, 0, { type: "dropTreasure", mi: 0, idx: 0 });
    expect(dropped.state.cave.areas[0]!.sunkTreasure).toEqual([{ at: DIR_W, items: [1] }]);

    // Seat 1 (a Giant, re-entering via the SAME west doorway seat 0 dropped in) can reclaim it —
    // proving the bucket lives on the shared cave, not on seat 0's own party state.
    const withGiant = {
      ...dropped.state,
      parties: dropped.state.parties.map((p, i) => (i === 1 ? { ...p, partyArea: 1, prev: 1, party: [member(12)] } : p)),
    };
    const reentered = mpReduce(withGiant, 1, { type: "move", dir: 2 /* DIR_E, from the west tile back into the pool */ });
    expect(reentered.state.parties[1]!.phase).toBe("pickup");
    expect(reentered.state.parties[1]!.treasures).toEqual([1]);
  });
});

describe("special-areas revision (2026-08-08): pending Chasm/Whirlpool drops are cave-shared", () => {
  it("a drop by seat 0 is delivered to WHICHEVER seat's own exploration reaches the level below first", () => {
    const mp = playing(
      {
        areas: [
          area(CHASM_CARD, packCoord(1, 50, 50)), // seat 0 stands here
          area(2 /* E-only */, packCoord(2, 49, 50)), // seat 1's own tile — west neighbour of the target
          area(31, packCoord(2, 50, 50), { visited: false }), // the target: placed, not yet entered by ANYONE
        ],
      },
      [
        partyAt(0, { partyArea: 0, prev: 0, level: 1, party: [member(5, [1])] }),
        partyAt(1, { partyArea: 1, prev: 1, level: 2, party: [member(6)] }),
      ],
    );
    const dropped = mpReduce(mp, 0, { type: "dropTreasure", mi: 0, idx: 0 });
    // Queued on the SHARED cave, keyed by the target coordinate — mirrors cryptCoord's own pattern:
    // `rest.pendingDrops` also lands redundantly on seat 0's OWN PartyState (PartyCore doesn't
    // exclude it), but that stale copy is never consulted — `compose` always re-seeds it fresh from
    // `mp.cave.pendingDrops` on every later read, which is what actually matters and what the rest
    // of this test proves.
    expect(dropped.state.cave.pendingDrops).toEqual({ [packCoord(2, 50, 50)]: [1] });

    // Seat 1, exploring entirely independently on level 2, walks east onto that exact coordinate —
    // proving the pending drop is visible to it, not locked to the seat that dropped it (unlike the
    // genuinely per-seat Lair/Harpies stash).
    const arrived = mpReduce(dropped.state, 1, { type: "move", dir: 2 /* DIR_E */ });
    expect(arrived.state.parties[1]!.phase).toBe("pickup");
    expect(arrived.state.parties[1]!.treasures).toEqual([1]);
    expect(arrived.state.cave.pendingDrops ?? {}).toEqual({});
  });
});
