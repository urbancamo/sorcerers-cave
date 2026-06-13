import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

const member = (creatureId: number, treasure: number[] = [], status = 0) =>
  ({ creatureId, status: status as 0 | 1 | 2 | 3, dragonKills: 0, treasure });

/**
 * Build a two-area state at the given level where a `move` south enters a fresh chamber.
 *
 * Areas:
 *   [0] — starting area at (level, 50, 50), card 31 = NSEW+chamber (all exits + chamber),
 *          visited=true with contents=[] so enterChamber won't re-draw it; phase "explore".
 *   The target (south) is drawn on the move from largePack[0].
 *
 * largePack[0] = 17 = N+chamber (bits 1+16): provides the reverse-N door required by a
 *   southward move and marks the target as a chamber, so enterChamber fires.
 *
 * smallPack[0] = 109 = 100 + creatureId(9): a Spectre.
 *   enterChamber draws min(level, 4) cards; with only one card in the pack it draws exactly
 *   one Spectre and stops (exhausted).
 */
function makeWardTestState(level: number, partyTreasure: number[]) {
  return makeState({
    phase: "explore",
    level,
    party: [member(0, partyTreasure)], // Hero with the given treasure
    areas: [
      {
        card: 31,                       // NSEW+chamber: has a South exit
        coord: packCoord(level, 50, 50),
        faceUp: true,
        visited: true,                  // already visited; won't re-draw
        contents: [],
        flags: 0,
        indiffCount: 0,
      },
    ],
    largePack: [17],  // card 17 = N+chamber: connects back North and marks target as chamber
    largeIdx: 0,
    smallPack: [109], // 100 + 9 = Spectre
    smallIdx: 0,
    seed: 1,
  });
}

describe("Talisman ward (Spectres, level >= 4)", () => {
  it("drives off a Spectre drawn into the chamber when Talisman is held at level >= 4", () => {
    // Arrange: Hero carries the Talisman (treasure id 7) at level 4.
    const s = makeWardTestState(4, [7]);

    // Act: move South into the fresh chamber; enterChamber draws the Spectre, then
    // wardOffSpectres (wired in resolveArea by Task 2) removes it immediately.
    const { state, events } = reduce(s, { type: "move", dir: 3 /* DIR_S */ });

    // Assert: the Spectre (id 9) is gone from strangers …
    expect(state.strangers).not.toContain(9);

    // … and a wardedOff event was emitted …
    expect(events).toContainEqual({ type: "wardedOff", creatureId: 9 });

    // … and the chamber was otherwise resolved peacefully (explore, not encounter).
    expect(state.phase).toBe("explore");
  });

  it("control — Spectre remains and triggers an encounter at level 3 (Talisman present but level too low)", () => {
    // Arrange: identical setup but level 3 — the Talisman only wards on level >= 4.
    const s = makeWardTestState(3, [7]);

    // Act
    const { state, events } = reduce(s, { type: "move", dir: 3 /* DIR_S */ });

    // Assert: the Spectre is still in strangers …
    expect(state.strangers).toContain(9);

    // … no wardedOff event …
    expect(events).not.toContainEqual({ type: "wardedOff", creatureId: 9 });

    // … and the phase is encounter (the Spectre must be dealt with).
    expect(state.phase).toBe("encounter");
  });

  it("control — Spectre remains when no Talisman is held at level 4", () => {
    // Arrange: level 4 but no Talisman in the party's inventory.
    const s = makeWardTestState(4, []); // no treasure

    // Act
    const { state, events } = reduce(s, { type: "move", dir: 3 /* DIR_S */ });

    // Assert: Spectre stays, encounter begins.
    expect(state.strangers).toContain(9);
    expect(events).not.toContainEqual({ type: "wardedOff", creatureId: 9 });
    expect(state.phase).toBe("encounter");
  });
});
