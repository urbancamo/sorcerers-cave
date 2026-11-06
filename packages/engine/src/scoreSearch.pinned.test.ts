import { describe, expect, it } from "vitest";
import best from "./fixtures/best-score-search.json";
import top from "./fixtures/top-score-games.json";
import { replay } from "./index";
import { scoreBreakdown } from "./score";
import { validatePicks } from "./setup";
import { GS_ESCAPED } from "./state";
import type { GameAction } from "./actions";

// The pinned results of the overnight score search (`scoreSearch.search.ts`, run by `scripts/overnight-search.sh`): the highest
// score found for a game that ends with the party back on the surface, with no other requirement, and the 25 best distinct games
// of each rule set as ready-made scenarios. See docs/testing/search-scenarios.md. Scores are the best FOUND within the recorded budget, not proven
// maxima. If the engine's rules change these fail first (the replay diverges); re-run the search and pin the new result.
const run = (g: { seed: number; picks: number[]; variants: object; actions: unknown[] }) => {
  const frames = replay(g.seed, g.picks, g.actions as GameAction[], g.variants);
  return { frames, end: frames[frames.length - 1]!.state };
};

describe("score search: the best game (GOLD)", () => {
  const { frames, end } = run(best);
  it("replays move for move, ends on the surface with a living party, and scores what was recorded", () => {
    expect(frames).toHaveLength(best.actions.length + 1);
    expect(frames.filter((f) => f.events.some((e) => e.type === "blocked"))).toEqual([]);
    expect(end.gs).toBe(GS_ESCAPED);
    expect(end.party.some((m) => m.status === 0 || m.status === 1)).toBe(true);
    expect(scoreBreakdown(end).total).toBe(best.score);
    expect(best.note).toMatch(/not a proven maximum/);
  });
  it("is the top-ranked scenario of its rule set, and the best of all of them", () => {
    const ofRules = top.games.filter((g) => g.rules === best.rules);
    expect(ofRules[0]).toMatchObject({ rank: 1, seed: best.seed, picks: best.picks, score: best.score });
    expect(Math.max(...top.games.map((g) => g.score))).toBe(best.score);
  });
});

// 25 games for each rule set — the base game, the Extension Kit, and the kit with the Sibyl — 75 in all.
const RULESETS = ["base", "kit", "kit+sibyl"] as const;
describe.each(RULESETS)("score search: the top-25 scenarios, rules: %s", (rules) => {
  const games = top.games.filter((g) => g.rules === rules);
  it("holds 25 distinct games, best first, played under exactly these rules", () => {
    expect(games).toHaveLength(25);
    expect(games.map((g) => g.rank)).toEqual(games.map((_, i) => i + 1));
    const scores = games.map((g) => g.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(new Set(games.map((g) => `${g.picks.join()}|${g.seed}`)).size).toBe(25);
    const kit = rules !== "base";
    for (const g of games) {
      expect(!!(g.variants as { extensionKit?: boolean }).extensionKit).toBe(kit);
      expect(!!(g.variants as { sibyl?: boolean }).sibyl).toBe(rules === "kit+sibyl");
    }
  });
  it.each(games.map((g) => [g.rank, g.score, g] as const))("#%i (score %i) replays legally, escapes and scores as recorded", (_rank, _score, g) => {
    expect(validatePicks(g.picks, g.variants)).toBeTruthy();
    const { frames, end } = run(g);
    expect(frames.filter((f) => f.events.some((e) => e.type === "blocked"))).toEqual([]);
    expect(end.gs).toBe(GS_ESCAPED);
    expect(scoreBreakdown(end).total).toBe(g.score);
  });
});
