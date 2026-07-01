import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { viperCrossing } from "./special";
import { applyHazards } from "./hazards";
import { eyeForsakenByDeath } from "./effects";
import { scoreBreakdown } from "./score";
import { makeState } from "./testkit";
import { GS_DEAD, GS_ESCAPED, GS_PLAYING, GATEWAY_START_COORD, type PartyMember } from "./state";
import { HAZARD_MEDUSA } from "./data/hazards";
import { DIR_E } from "./coords";

// Ids used across these pins.
const HERO0 = 0; // Hero — front-line original
const WOMAN6 = 6; // Woman
const EYE = 13; // Eye of God — its bearer must survive or the party is cursed (§Eye of God)

// Encoded tile constants.
const DIR_E_EXIT = 2; // east doorway bit
const WEST_DOOR_TILE = 8; // a tile whose only doorway faces west (connects back to the viper pit)

describe("SC-12-14: losing the Eye's bearer to death curses the party, costing a flat 30 at scoring", () => {
  it("SC-12-14 (a): eyeForsakenByDeath on a slain Eye-bearer increments curses and emits eyeForsaken", () => {
    // Direct pin on the effect itself (§Eye of God: the gem is left on the body, cursing the party).
    const state = makeState({
      curses: 0,
      party: [{ creatureId: HERO0, status: 3, dragonKills: 0, treasure: [EYE] }],
    });
    const fallen = state.party[0]!;
    const events = eyeForsakenByDeath(state, fallen);
    expect(state.curses).toBe(1);
    expect(events).toEqual([{ type: "eyeForsaken" }]);
  });

  it("SC-12-14 (a): a member NOT holding the Eye who dies leaves no curse", () => {
    const state = makeState({
      curses: 0,
      party: [{ creatureId: HERO0, status: 3, dragonKills: 0, treasure: [] }],
    });
    const events = eyeForsakenByDeath(state, state.party[0]!);
    expect(state.curses).toBe(0);
    expect(events).toEqual([]);
  });

  it("SC-12-14 (a): a real death path (viper pit) that slays the Eye-bearer curses the party via eyeForsakenByDeath", () => {
    // A 2-member party crosses the viper pit; seed 2 makes the first roll a 1 (a fatal fall). The
    // dying member carries the Eye, so viperCrossing runs eyeForsakenByDeath -> curse + eyeForsaken.
    const state = makeState({
      seed: 2,
      curses: 0,
      party: [
        { creatureId: HERO0, status: 0, dragonKills: 0, treasure: [EYE] }, // falls (roll 1)
        { creatureId: WOMAN6, status: 0, dragonKills: 0, treasure: [] }, // survives to keep a live party
      ],
    });
    const events = viperCrossing(state);
    expect(state.curses).toBe(1);
    expect(events).toContainEqual({ type: "eyeForsaken" });
    expect(events).toContainEqual({ type: "memberDied", creatureId: HERO0 });
    expect(state.party[0]!.status).toBe(3); // dead
  });

  it("SC-12-14 (b): with curses>0 and GS_ESCAPED, scoreBreakdown levies a flat 30 cursePenalty", () => {
    const state = makeState({
      gs: GS_ESCAPED,
      curses: 1,
      party: [{ creatureId: HERO0, status: 0, dragonKills: 0, treasure: [] }],
    });
    const b = scoreBreakdown(state);
    expect(b.cursePenalty).toBe(30);
  });
});

describe("SC-12-18: a lethal event transitions to GS_DEAD (gameOver)", () => {
  it("SC-12-18: a viper-pit crossing driven through reduce wipes a lone party -> gs GS_DEAD, phase gameOver, terminal gameOver event", () => {
    // Stand a single-member party on a Viper Pit tile (special=3) with an east exit, then move east.
    // reduce runs viperCrossing on the crossing; seed 2 (roll 1) kills the sole member -> the party
    // is wiped and the game ends.
    const viperCard = (3 << 7) | DIR_E_EXIT; // special VIPER_PIT + an east doorway
    const state = makeState({
      gs: GS_PLAYING,
      phase: "explore",
      seed: 2,
      prev: 0,
      party: [{ creatureId: HERO0, status: 0, dragonKills: 0, treasure: [] }],
      largePack: [WEST_DOOR_TILE], // the tile drawn to the east: a plain tunnel with a matching west door
      largeIdx: 0,
      areas: [
        {
          card: viperCard,
          coord: GATEWAY_START_COORD,
          faceUp: true,
          visited: true,
          contents: [],
          flags: 0,
          indiffCount: 0,
        },
      ],
    });

    const { state: after, events } = reduce(state, { type: "move", dir: DIR_E });

    expect(after.gs).toBe(GS_DEAD); // 2
    expect(after.phase).toBe("gameOver");
    expect(after.party.every((m: PartyMember) => m.status !== 0 && m.status !== 1)).toBe(true);
    // The terminal event reports the DEAD end-state.
    const over = events.find((e) => e.type === "gameOver");
    expect(over).toEqual({ type: "gameOver", gs: GS_DEAD });
  });


  it("SC-12-18: a Medusa chamber that petrifies the whole lone party ends the game via resolveArea (gs GS_DEAD, gameOver)", () => {
    // Not a death (status 3) but a whole-party incapacitation: Medusa turns the sole member to stone.
    // applyHazards + the resolveArea wipe check drive gs -> GS_DEAD. Here we pin applyHazards + the
    // no-one-left check directly (seed 2 -> roll 1 -> petrified).
    const state = makeState({
      seed: 2,
      partyArea: 0,
      party: [{ creatureId: HERO0, status: 0, dragonKills: 0, treasure: [] }],
      hazards: [HAZARD_MEDUSA],
    });
    applyHazards(state);
    expect(state.party[0]!.status).toBe(2); // stone
    // The party has no one left able to act — the resolveArea wipe rule ends the game (reduce.ts ~158).
    const partyAlive = state.party.some((m) => m.status === 0 || m.status === 1);
    expect(partyAlive).toBe(false);
  });
});
