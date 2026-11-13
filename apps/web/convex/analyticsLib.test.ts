import { describe, expect, test } from "vitest";
import { aggregate, DAYS } from "./analyticsLib";

const NOW = Date.UTC(2026, 10, 13, 12);
const row = (over: Partial<Parameters<typeof aggregate>[0][number]> = {}) => ({
  mode: "solo" as const, outcome: "escaped" as const, score: 120, turn: 40, deepestLevel: 2, dragonKills: 0, membersLost: 0,
  picks: [0, 7], extensionKit: false, sibyl: false, finishedAt: NOW, ...over,
});

describe("aggregate", () => {
  test("an empty window gives empty figures, not NaN", () => {
    const a = aggregate([], NOW);
    expect(a.n).toBe(0);
    expect(a.escapedScore).toEqual({ mean: null, median: null, max: null, meanTurns: null });
    expect(a.perDay).toHaveLength(DAYS);
    expect(a.scoreHistogram).toEqual([]);
  });

  test("splits outcomes by mode", () => {
    const a = aggregate([row(), row({ outcome: "dead", score: 0 }), row({ mode: "multi", outcome: "quit" })], NOW);
    expect(a.outcomes.solo).toEqual({ escaped: 1, dead: 1, quit: 0 });
    expect(a.outcomes.multi).toEqual({ escaped: 0, dead: 0, quit: 1 });
  });

  test("score figures cover escaped games only; the histogram buckets by 50", () => {
    const a = aggregate([row({ score: 120 }), row({ score: 130 }), row({ score: 260 }), row({ outcome: "dead", score: 0 })], NOW);
    expect(a.escapedScore).toMatchObject({ mean: 170, median: 130, max: 260 });
    expect(a.scoreHistogram).toEqual([{ from: 100, to: 150, count: 2 }, { from: 250, to: 300, count: 1 }]);
  });

  test("the median of an even count is the middle pair's mean", () => {
    expect(aggregate([row({ score: 100 }), row({ score: 200 })], NOW).escapedScore.median).toBe(150);
  });

  test("per-day counts cover the last 30 days, oldest first; older games are left out", () => {
    const a = aggregate([row(), row({ outcome: "dead", finishedAt: NOW - 86_400_000 }), row({ finishedAt: NOW - 40 * 86_400_000 })], NOW);
    expect(a.perDay[DAYS - 1]).toMatchObject({ day: "2026-11-13", escaped: 1 });
    expect(a.perDay[DAYS - 2]).toMatchObject({ day: "2026-11-12", dead: 1 });
    expect(a.perDay.reduce((n, d) => n + d.escaped + d.dead + d.quit, 0)).toBe(2);
  });

  test("distributions, creature picks and variant uptake", () => {
    const a = aggregate([
      row({ deepestLevel: 3, dragonKills: 1, membersLost: 2 }),
      row({ extensionKit: true, picks: [0] }),
      row({ extensionKit: true, sibyl: true, picks: undefined }),
    ], NOW);
    expect(a.deepest).toEqual([{ level: 2, count: 2 }, { level: 3, count: 1 }]);
    expect(a.dragonKills).toEqual([{ kills: 0, count: 2 }, { kills: 1, count: 1 }]);
    expect(a.membersLost).toEqual([{ lost: 0, count: 2 }, { lost: 2, count: 1 }]);
    expect(a.creatures[0]).toEqual({ id: 0, count: 2 });
    expect(a.variants).toEqual({ base: 1, extensionKit: 1, sibyl: 1 });
  });
});
