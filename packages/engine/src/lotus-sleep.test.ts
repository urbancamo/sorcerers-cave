import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { enterChamber } from "./chamber";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import type { PlacedArea } from "./state";

// Lotus Dust on a stranger (card: "asleep for 2 turns of the player who uses it") — the same two-turn rule
// the Medusa throw already follows (medusaAsleepUntil, SC-7.2-15): thrown on turn T, the creature sleeps
// while the party's `turn` counter is <= T + 2 and is awake on the first entry after that.
const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });
const tile = (over: Partial<PlacedArea> = {}): PlacedArea => ({
  card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over,
});
const DRAGON = 10;

describe("Lotus Dust on a stranger — two-turn sleep", () => {
  it("the throw records when the creature wakes: this turn + 2", () => {
    const s = makeState({ phase: "encounter", turn: 4, areas: [tile()], strangers: [DRAGON], party: [member(5, [5])] });
    const { state } = reduce(s, { type: "useArtifact", artifact: 5, target: 0 });
    expect(state.areas[0]!.sleepers).toEqual([{ id: DRAGON, until: 6 }]);
    expect(state.areas[0]!.contents).toContain(400 + DRAGON); // still parked asleep on the tile
  });

  it("a creature slept earlier still sleeps on an entry within its two turns (turn <= until)", () => {
    const s = makeState({ turn: 6, areas: [tile({ contents: [400 + DRAGON], sleepers: [{ id: DRAGON, until: 6 }] })] });
    const events = enterChamber(s);
    expect(s.sleeping).toEqual([DRAGON]);
    expect(s.strangers).toEqual([]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "sleeperWoke" }));
    expect(s.areas[0]!.sleepers).toEqual([{ id: DRAGON, until: 6 }]); // the record survives for the next visit
  });

  it("wakes into an ordinary stranger on the first entry after the sleep lapses (turn > until)", () => {
    const s = makeState({ turn: 7, areas: [tile({ contents: [400 + DRAGON], sleepers: [{ id: DRAGON, until: 6 }] })] });
    const events = enterChamber(s);
    expect(s.strangers).toEqual([DRAGON]);
    expect(s.sleeping).toEqual([]);
    expect(events).toContainEqual({ type: "sleeperWoke", creatureId: DRAGON });
    expect(s.areas[0]!.sleepers).toBeUndefined(); // nothing left asleep here
    expect(s.areas[0]!.contents).toEqual([]);     // the working set owns everything now
  });

  it("pairs each parked sleeper with its own record: one lapsed, one still asleep", () => {
    const s = makeState({
      turn: 5,
      areas: [tile({ contents: [400 + DRAGON, 400 + DRAGON], sleepers: [{ id: DRAGON, until: 4 }, { id: DRAGON, until: 8 }] })],
    });
    enterChamber(s);
    expect(s.strangers).toEqual([DRAGON]);
    expect(s.sleeping).toEqual([DRAGON]);
    expect(s.areas[0]!.sleepers).toEqual([{ id: DRAGON, until: 8 }]);
  });

  it("a sleeper parked with no record (an old save from before the two-turn rule) wakes", () => {
    const s = makeState({ turn: 2, areas: [tile({ contents: [400 + DRAGON] })] });
    const events = enterChamber(s);
    expect(s.strangers).toEqual([DRAGON]);
    expect(events).toContainEqual({ type: "sleeperWoke", creatureId: DRAGON });
  });

  it("sleepers keep their wake turn when the party leaves and the chamber is parked again", () => {
    // Throw (turn 3), then walk off: the contents are re-parked and the record is untouched.
    const s = makeState({ phase: "encounter", turn: 3, areas: [tile()], strangers: [DRAGON], party: [member(5, [5])] });
    const thrown = reduce(s, { type: "useArtifact", artifact: 5, target: 0 }).state;
    expect(thrown.phase).toBe("explore");
    expect(thrown.areas[0]!.sleepers).toEqual([{ id: DRAGON, until: 5 }]);
    // Back on the tile at turn 5 — still asleep; at turn 6 — awake.
    const early = { ...thrown, turn: 5, areas: thrown.areas.map((a) => ({ ...a, contents: [...a.contents] })) };
    enterChamber(early);
    expect(early.sleeping).toEqual([DRAGON]);
    const late = { ...thrown, turn: 6, areas: thrown.areas.map((a) => ({ ...a, contents: [...a.contents] })) };
    enterChamber(late);
    expect(late.strangers).toEqual([DRAGON]);
  });
});
