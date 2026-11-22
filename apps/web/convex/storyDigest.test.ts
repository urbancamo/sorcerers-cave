import { describe, it, expect } from "vitest";
import { replay, type GameAction } from "@sorcerers-cave/engine";
import games from "../src/data/scenario-games.json";
import topScores from "../../../packages/engine/src/fixtures/top-score-games.json";
import { storyDigest, digestText } from "./storyDigest";

type Rec = { seed: number; picks: number[]; variants: Record<string, boolean>; actions: GameAction[] };
const run = (code: string) => { const g = (games as unknown as Record<string, Rec>)[code]!; return storyDigest(replay(g.seed, g.picks, g.actions, g.variants as never)); };

// Stored games recorded under an older rule may no longer replay to their recorded score (see docs/testing/search-scenarios.md);
// the digest is only meaningful on a game that still does, so pick those by comparing to the pinned score.
const pinned = (topScores as unknown as { games: { rules: string; rank: number; score: number }[] }).games;
const replayable = pinned.filter((g) => g.rules === "base").map((g) => ({ code: `B${String(g.rank).padStart(3, "0")}`, score: g.score })).filter(({ code, score }) => {
  const r = (games as unknown as Record<string, Rec>)[code]; if (!r) return false;
  try { return storyDigest(replay(r.seed, r.picks, r.actions, r.variants as never)).outcome.score === score; } catch { return false; }
});

describe("storyDigest", () => {
  it("has replayable stored games to test against", () => expect(replayable.length).toBeGreaterThan(3));

  it("every replayable game yields ordered, plain, bounded beats that end with the party leaving", () => {
    for (const { code, score } of replayable.slice(0, 8)) {
      const d = run(code);
      expect(d.outcome.score).toBe(score);
      expect(d.outcome.exitCount).toBeGreaterThan(0);
      expect(d.beats.length).toBeGreaterThan(5);
      expect(d.beats.length).toBeLessThanOrEqual(60);
      expect(d.beats.map((b) => b.n)).toEqual([...d.beats.map((b) => b.n)].sort((a, b) => a - b));
      const text = digestText(d);
      expect(text).not.toMatch(/undefined|NaN|\ba (?=[AEIOU])/);
    }
  });

  it("states the starting party and the exit count truthfully", () => {
    const { code } = replayable[0]!;
    const g = (games as unknown as Record<string, Rec>)[code]!;
    const frames = replay(g.seed, g.picks, g.actions, g.variants as never);
    const d = storyDigest(frames);
    expect(d.startingParty).toHaveLength(frames[0]!.state.party.length);
    expect(d.outcome.exitCount).toBe(frames[frames.length - 1]!.state.party.filter((m) => m.status === 0).length);
  });

  it("prints one real digest for reading", () => console.log(digestText(run(replayable[0]!.code))));
});
