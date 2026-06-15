import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { decodeArea } from "./decode";
import { packCoord, DIR_DOWN } from "./coords";

const member = (creatureId: number, treasure: number[] = []) =>
  ({ creatureId, status: 0 as const, dragonKills: 0, treasure });

/**
 * A two-area state at level 2 where a `move` south (dir 3) enters a FRESH chamber drawn from the
 * small pack (draw = min(2,4) = 2). largePack[0] = 17 (N+chamber) supplies the reverse-N door the
 * southward move needs and marks the target a chamber, so resolveArea draws and lulls.
 */
const entering = (partyTreasure: number[], smallPack: number[]) =>
  makeState({
    phase: "explore",
    level: 2,
    party: [member(0, partyTreasure)],
    areas: [{ card: 31, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    largePack: [17], largeIdx: 0,
    smallPack, smallIdx: 0,
    seed: 1,
  });

describe("Charmed Flute — lull Dragons (§ Charmed Flute)", () => {
  it("enters a Dragon-only chamber as if empty while the party holds the Flute", () => {
    const { state, events } = reduce(entering([12], [110]), { type: "move", dir: 3 });
    expect(state.phase).toBe("explore"); // chamber acts empty — the party proceeds past the sleeper
    expect(events).toContainEqual({ type: "dragonsLulled", count: 1 });
    const contents = state.areas[state.partyArea]!.contents;
    expect(contents).toContain(110); // parked AWAKE (110), not permanently asleep (410)…
    expect(contents).not.toContain(410); // …so it is re-evaluated against the Flute on re-entry
    expect(state.lulled ?? []).toEqual([]); // cleared once parked
  });

  it("fights the Dragon normally without the Flute", () => {
    const { state, events } = reduce(entering([], [110]), { type: "move", dir: 3 });
    expect(state.phase).toBe("encounter");
    expect(state.strangers).toEqual([10]);
    expect(events).not.toContainEqual({ type: "dragonsLulled", count: 1 });
  });

  it("lulls only the Dragon — other strangers still lead and fight", () => {
    // Dragon (110) + Man (105): the Flute lulls the Dragon so the Man leads the encounter.
    const { state, events } = reduce(entering([12], [110, 105]), { type: "move", dir: 3 });
    expect(state.phase).toBe("encounter");
    expect(state.strangers).toEqual([5]); // Man stays awake
    expect(state.lulled).toEqual([10]); // Dragon asleep, out of the fight, still in the chamber
    expect(events).toContainEqual({ type: "dragonsLulled", count: 1 });
  });

  it("is blocked without a direction — lulling is passive, not an explicit action", () => {
    const s = makeState({ phase: "encounter", party: [member(0, [12])], strangers: [10] });
    const { events } = reduce(s, { type: "useArtifact", artifact: 12 });
    expect(events).toEqual([{ type: "blocked" }]);
  });
});

const priestWithFlute = () => ({ creatureId: 4, status: 0 as const, dragonKills: 0, treasure: [12] });
const PLAIN = 15; // N+E+S+W, no stairs
const STAIR_UP_CARD = 15 | 32; // a card showing a stair UP (bit 32)

describe("Charmed Flute — reveal secret doors (§ Secret Doors)", () => {
  it("reveals a concealed stair DOWN when the area below shows a matching stair up", () => {
    const s = makeState({
      phase: "explore",
      party: [priestWithFlute()],
      level: 1,
      partyArea: 0,
      areas: [
        { card: PLAIN, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: STAIR_UP_CARD, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 12, dir: DIR_DOWN });
    expect(decodeArea(state.areas[0]!.card).stairDown).toBe(true); // secret door revealed
    expect(state.party[0]!.treasure).toEqual([12]); // NOT consumed
    expect(events).toContainEqual({ type: "secretDoorRevealed", dir: DIR_DOWN });
  });

  it("is blocked when no played area below has a matching stair", () => {
    const s = makeState({
      phase: "explore",
      party: [priestWithFlute()],
      level: 1,
      partyArea: 0,
      areas: [{ card: PLAIN, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { events } = reduce(s, { type: "useArtifact", artifact: 12, dir: DIR_DOWN });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("cannot reveal a secret door during a fight", () => {
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      party: [priestWithFlute()],
      level: 1,
      partyArea: 0,
      strangers: [5],
      areas: [
        { card: PLAIN, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: STAIR_UP_CARD, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
    });
    const { events } = reduce(s, { type: "useArtifact", artifact: 12, dir: DIR_DOWN });
    expect(events).toEqual([{ type: "blocked" }]);
  });
});
