import { describe, expect, it } from "vitest";
import golden from "./fixtures/golden-search.json";
import { replay } from "./index";
import { scoreBreakdown } from "./score";
import { validatePicks } from "./setup";
import { GS_ESCAPED } from "./state";
import type { GameAction } from "./actions";

// The pinned result of the offline search (`goldenSearch.search.ts`, run with `npm run search`). The search is slow and is never
// part of the build; this test replays the game it found, on the real engine, and asserts the three goals it was searching for.
// The score is the HIGHEST THE SEARCH FOUND within the budget recorded in the fixture — not a proven maximum — so if the engine's
// rules change this fails first (the replay diverges), and the fix is to re-run the search and pin the new result.
const actions = golden.actions as GameAction[];
const frames = replay(golden.seed, golden.picks, actions, golden.variants);
const end = frames[frames.length - 1]!.state;

describe("golden search: the pinned game", () => {
  it("is played with the Extension Kit and the Sibyl on, from a legal draft", () => {
    expect(golden.variants).toEqual({ extensionKit: true, sibyl: true });
    expect(validatePicks(golden.picks, golden.variants)).toBeTruthy();
  });

  it("replays move for move: the engine never refuses an action", () => {
    expect(frames).toHaveLength(actions.length + 1);
    const refused = frames.filter((f) => f.events.some((e) => e.type === "blocked"));
    expect(refused).toEqual([]);
  });

  it("defeats the Sorcerer in a fight (he is always hostile, so winning is slaying)", () => {
    expect(frames.some((f) => f.events.some((e) => e.type === "sorcererSlain"))).toBe(true);
    expect(end.sorcererKilled).toBe(true);
  });

  it("brings the Sibyl into the party", () => {
    expect(frames.some((f) => f.events.some((e) => e.type === "sibylJoins"))).toBe(true);
    expect(end.hasSibyl).toBe(true);
  });

  it("ends with the party back on the surface, alive", () => {
    expect(end.gs).toBe(GS_ESCAPED);
    expect(actions[actions.length - 1]!.type).toBe("exitCave");
    expect(end.party.some((m) => m.status === 0 || m.status === 1)).toBe(true);
  });

  it("scores exactly what the search recorded, and says plainly that this is a best-found score", () => {
    expect(scoreBreakdown(end).total).toBe(golden.score);
    expect(golden.note).toMatch(/not a proven maximum/);
    expect(golden.budget.searches).toBeGreaterThan(0);
    expect(golden.budget.statesExpanded).toBeGreaterThan(0);
  });
});
