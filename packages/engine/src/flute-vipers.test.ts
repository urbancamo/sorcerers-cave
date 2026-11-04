import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { SPECIAL_VIPER_PIT } from "./data/areaCards";
import { GS_PLAYING, type GameState, type PartyMember } from "./state";

// The Charmed Flute at the Viper Pit is PLAYED, like lulling Dragons (Mark, 2026-11-04): holding it no longer lulls the vipers by itself.
const FLUTE = 12;
const DIR_E = 2;
const member = (creatureId: number, treasure: number[] = []): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure });
const VIPER_PIT_CARD = (SPECIAL_VIPER_PIT << 7) | 2; // an east doorway
const PLAIN_WEST_TUNNEL = 8;

const atPit = (party: PartyMember[], seed = 1): GameState => makeState({
  gs: GS_PLAYING, phase: "explore", party, seed,
  areas: [{ card: VIPER_PIT_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
  partyArea: 0, prev: 0, largePack: [PLAIN_WEST_TUNNEL, PLAIN_WEST_TUNNEL], largeIdx: 0,
});
const play = { type: "useArtifact", artifact: FLUTE } as const;

describe("the Charmed Flute at the Viper Pit is a player's action", () => {
  it("merely holding it does not lull the vipers: the crossing rolls for every member", () => {
    const r = reduce(atPit([member(0, [FLUTE]), member(5)]), { type: "move", dir: DIR_E });
    expect(r.events.some((e) => e.type === "viperPit")).toBe(true);
    expect(r.events.some((e) => e.type === "vipersLulled")).toBe(false);
  });

  it("is offered to an eligible bearer at the pit, and not to one who cannot play it, nor away from the pit", () => {
    expect(legalActions(atPit([member(0, [FLUTE])]))).toContainEqual(play);
    expect(legalActions(atPit([member(2, [FLUTE])]))).not.toContainEqual(play);   // an Ogre cannot play it
    const away = atPit([member(0, [FLUTE])]);
    away.areas[0]!.card = 31;
    expect(legalActions(away)).not.toContainEqual(play);
  });

  it("playing it lulls the vipers: the crossing is safe with no dice, then they wake when the party moves on", () => {
    const s = atPit([member(0, [FLUTE]), member(5)], 1);
    const played = reduce(s, play);
    expect(played.events).toEqual([{ type: "artifactUsed", artifact: FLUTE }, { type: "vipersAsleep" }]);   // asleep — but no one has crossed yet
    expect(played.state.vipersLulledArea).toBe(0);
    expect(legalActions(played.state)).not.toContainEqual(play);                  // once is enough: they sleep until the party leaves

    const seedBefore = played.state.seed;
    const crossed = reduce(played.state, { type: "move", dir: DIR_E });
    expect(crossed.events).toContainEqual({ type: "vipersLulled" });
    expect(crossed.events.some((e) => e.type === "viperPit")).toBe(false);
    expect(crossed.state.seed).toBe(seedBefore);                                  // no dice
    expect(crossed.state.party.every((m) => m.status === 0)).toBe(true);
    expect(crossed.state.vipersLulledArea).toBeUndefined();                       // asleep only while the party stayed
  });

  it("is blocked when the bearer cannot play it or the party is not at a pit", () => {
    expect(reduce(atPit([member(2, [FLUTE])]), play).events).toEqual([{ type: "blocked" }]);
    const away = atPit([member(0, [FLUTE])]);
    away.areas[0]!.card = 31;
    expect(reduce(away, play).events).toEqual([{ type: "blocked" }]);
  });
});
