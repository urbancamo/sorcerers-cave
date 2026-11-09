import { describe, expect, it } from "vitest";
import { replay } from "./replay";
import { legalActions } from "./selectors";
import { viableExitsCheck } from "./redraw";
import games from "./fixtures/dead-end-sealed-games.json";

// Engine rules validation, B-01 triage (docs/validation/rulings-register.md). Two games found by the invariant soak with the Dead End rescue
// (`variants.forcedRedraw`) ON. In each the party FIRST ENTERS a chamber that was laid long before (so the move is the plain move: the rescue
// only swaps a card drawn by the move) and draws an Earthquake, which collapses the tunnel it came from. The chamber's other doorways lead to
// laid cards that do not connect, so the party has no way on although the pack still holds cards. No card was played by this move, so the
// printed Dead End rule has nothing to put back. This test PINS that known limitation (it is not an endorsement): if the rule is ever extended
// to first entries, these games stop being stuck and the test must change.
describe("a chamber entered for the first time can seal the party in (no card to swap)", () => {
  for (const g of games) {
    it(`seed ${g.seed}: Earthquake on first entry leaves no legal action, with cards still in the pack`, () => {
      const frames = replay(g.seed, g.picks, g.actions as never, g.variants as never);
      const s = frames[frames.length - 1]!.state;
      expect(s.variants?.forcedRedraw).toBe(true);
      expect(s.largeIdx).toBeLessThan(s.largePack.length);
      expect(viableExitsCheck(s, s.partyArea)).toBe(false);
      expect(legalActions(s).filter((a) => a.type !== "quit")).toEqual([]);
    });
  }
});
