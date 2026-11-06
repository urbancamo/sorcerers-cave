import { describe, expect, it } from "vitest";
import { replay } from "@sorcerers-cave/engine";
import { GOLDEN_CODE, goldenBundle } from "./goldenGame";

describe("golden game replay code", () => {
  it("opens as a replayable bundle under its reserved code, whatever the case or spacing typed", () => {
    for (const typed of [GOLDEN_CODE, GOLDEN_CODE.toLowerCase(), `  ${GOLDEN_CODE} `]) {
      const b = goldenBundle(typed);
      expect(b?.replayable).toBe(true);
      expect(b?.game.code).toBe(GOLDEN_CODE);
      expect(b!.moves.length).toBeGreaterThan(10);
    }
  });

  it("is not a code for anything else", () => {
    expect(goldenBundle("ZZZZ")).toBeNull();
    expect(goldenBundle("")).toBeNull();
  });

  it("carries the move events the viewer's log shows, one entry per move in order", () => {
    const b = goldenBundle(GOLDEN_CODE)!;
    expect(b.moves.map((m) => m.seq)).toEqual(b.moves.map((_, i) => i + 1));
    expect(b.moves.some((m) => m.events.length > 0)).toBe(true);
  });

  it("replays with every recorded action legal on this engine, and shows what the golden game is for", () => {
    // If a rules change makes the stored actions drift, this fails — re-run the engine's offline search
    // (`npm run search -w packages/engine`), pin its result and regenerate the bundle with the conformance vectors
    // (`pnpm --filter engine exec vitest run -u src/conformance-vectors.test.ts`).
    const b = goldenBundle(GOLDEN_CODE)!;
    expect(b.game.variants).toEqual({ extensionKit: true, sibyl: true });
    const frames = replay(b.game.seed!, b.game.picks!, b.moves.map((m) => m.action), b.game.variants);
    const events = frames.flatMap((f) => f.events);
    const end = frames[frames.length - 1]!.state;
    expect(events.some((e) => e.type === "blocked")).toBe(false);
    expect(events.some((e) => e.type === "sorcererSlain")).toBe(true);
    expect(events.some((e) => e.type === "sibylJoins")).toBe(true);
    expect(end.sorcererKilled).toBe(true);
    expect(end.gs).toBe(1); // GS_ESCAPED: the party is back on the surface
  });
});
