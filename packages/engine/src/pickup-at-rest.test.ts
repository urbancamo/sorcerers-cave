import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions, AT_REST_FROM_PICKUP } from "./selectors";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_WELL } from "./data/areaCards";
import type { GameState, PartyMember } from "./state";

// An uncarryable treasure (the Chest) reopens a pickup on every visit. An open pickup must not hide the tile's at-rest actions:
// taking one leaves the floor treasure behind (as walking on does), then runs as usual.
const HERO = 0;
const CHEST = 14;
const member = (treasure: number[] = []): PartyMember => ({ creatureId: HERO, status: 0, dragonKills: 0, treasure });
const onTile = (special: number, over: Partial<GameState> = {}): GameState => makeState({
  phase: "pickup", level: 1, party: [member(), member()], treasures: [CHEST], smallPack: [201, 202, 203], smallIdx: 0,
  areas: [{ card: (special << 7) | 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
  partyArea: 0, ...over,
});

describe("at-rest tile actions stay on offer during an open pickup", () => {
  it.each([
    ["descendChasm", SPECIAL_CHASM],
    ["drawFromWell", SPECIAL_WELL],
    ["pullBellRope", SPECIAL_BELL_ROPE],
  ])("%s is offered, and leaves the floor treasure behind", (type, special) => {
    const s = onTile(special);
    const act = legalActions(s).find((a) => a.type === type);
    expect(act).toBeDefined();
    const out = reduce(s, act!);
    expect(out.events).not.toContainEqual({ type: "blocked" });
    expect(out.state.treasures).not.toContain(CHEST);
    // the chest is parked on its tile (a chasm drop moves the party, so look at the tile it was left on)
    expect(out.state.areas[0]!.contents).toContain(200 + CHEST);
  });

  it("openChest is offered to a member carrying one", () => {
    const s = onTile(0, { party: [member([CHEST]), member()], treasures: [1] });
    expect(legalActions(s).some((a) => a.type === "openChest")).toBe(true);
  });

  it("offers nothing extra on an ordinary tile, and a refused action leaves the pickup untouched", () => {
    const s = onTile(0);
    expect(legalActions(s).some((a) => AT_REST_FROM_PICKUP.has(a.type))).toBe(false);
    const out = reduce(s, { type: "descendChasm" });
    expect(out.events).toEqual([{ type: "blocked" }]);
    expect(out.state.phase).toBe("pickup");
    expect(out.state.treasures).toEqual([CHEST]);
  });
});
