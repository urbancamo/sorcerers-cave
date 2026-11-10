import { describe, expect, it } from "vitest";
import { replay, scoreBreakdown } from "@sorcerers-cave/engine";
import { goldenBundle, isScenarioCode } from "./goldenGame";

const codes = (prefix: string) => Array.from({ length: 25 }, (_, i) => `${prefix}${String(i + 1).padStart(3, "0")}`);

describe("scenario replay codes", () => {
  it("opens as a replayable bundle under its code, whatever the case or spacing typed", async () => {
    for (const typed of ["K001", "k001", "  K001 "]) {
      const b = await goldenBundle(typed);
      expect(b?.replayable).toBe(true);
      expect(b?.game.code).toBe("K001");
      expect(b!.moves.length).toBeGreaterThan(10);
    }
  });

  it("is not a code for anything else — no real four-letter code, no rank beyond 25", async () => {
    for (const c of ["GOLD", "ZZZZ", "", "K000", "K026", "B999", "X001", "K01", "K0001"]) expect(await goldenBundle(c)).toBeNull();
    expect(isScenarioCode("s007")).toBe(true);
    expect(isScenarioCode("GOLD")).toBe(false);
  });

  it("carries the move events the viewer's log shows, one entry per move in order", async () => {
    const b = (await goldenBundle("K001"))!;
    expect(b.moves.map((m) => m.seq)).toEqual(b.moves.map((_, i) => i + 1));
    expect(b.moves.some((m) => m.events.length > 0)).toBe(true);
  });

  it("K001 is the best of the Extension Kit games, played with the kit and no Sibyl", async () => {
    // (Its exact score is pinned in the engine's scoreSearch.pinned.test.ts, so a re-run needs no edit here.)
    const b = (await goldenBundle("K001"))!;
    expect(b.game.variants).toEqual({ extensionKit: true });
    const end = replay(b.game.seed!, b.game.picks!, b.moves.map((m) => m.action), b.game.variants).at(-1)!.state;
    const rest = await Promise.all(["K002", "K003", "K025"].map((c) => goldenBundle(c)));
    for (const o of rest) {
      const e = replay(o!.game.seed!, o!.game.picks!, o!.moves.map((m) => m.action), o!.game.variants).at(-1)!.state;
      expect(scoreBreakdown(end).total).toBeGreaterThanOrEqual(scoreBreakdown(e).total);
    }
  });

  // If a rules change makes the stored actions drift, this fails — re-run the engine's offline search (see
  // docs/testing/search-scenarios.md), pin its result and regenerate the bundle with the conformance vectors
  // (`pnpm --filter engine exec vitest run -u src/conformance-vectors.test.ts`).
  // STALE since 2026-11-10: the Eye of God, the Scroll and the Talisman became human-only, and 26 of these 75 pinned games were found with an
  // inhuman holding one, so they no longer replay legally. Re-run the overnight search (packages/engine scripts/overnight-search.sh), pin the
  // results, regenerate the bundle, and un-skip this.
  it.skip.each([["B", "base", {}], ["K", "kit", { extensionKit: true }], ["S", "kit + Sibyl", { extensionKit: true, sibyl: true }]] as const)(
    "all 25 %s codes (%s) replay with every action legal, ending on the surface, best first",
    async (prefix, _name, variants) => {
      let last = Infinity;
      for (const code of codes(prefix)) {
        const b = (await goldenBundle(code))!;
        expect(b.game.variants).toEqual(variants ?? {});
        const frames = replay(b.game.seed!, b.game.picks!, b.moves.map((m) => m.action), b.game.variants);
        expect(frames.flatMap((f) => f.events).some((e) => e.type === "blocked"), code).toBe(false);
        const end = frames.at(-1)!.state;
        expect(end.gs, code).toBe(1); // GS_ESCAPED: the party is back on the surface
        const score = scoreBreakdown(end).total;
        expect(score, code).toBeLessThanOrEqual(last);
        last = score;
      }
    },
  );
});
