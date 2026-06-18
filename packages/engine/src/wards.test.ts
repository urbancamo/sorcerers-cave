import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { frontStrength, casterMP, partyRollBonus } from "./combat";
import { resolvePlannedRound } from "./combatPlan";

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

describe("Eye of God stills the Lost-Ruby statue (§ Eye of God)", () => {
  it("an aroused statue cannot attack while the Eye is held", () => {
    // Mirror the aroused-entry setup from ruby.test.ts (seed=3 normally kills the Hero).
    // With the Eye held, the statue is stilled instead.
    const s = makeState({
      areas: [
        { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: 175, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 32, indiffCount: 0 },
      ],
      partyArea: 0, prev: 0,
      party: [member(0, [13])], // Hero holding the Eye (id 13)
      seed: 3, // same seed that normally kills the Hero via the statue
    });

    const { state, events } = reduce(s, { type: "move", dir: 3 }); // DIR_S into the aroused area
    expect(state.partyArea).toBe(1);

    // Eye stills the statue — statuePowerless fires instead of statueAttacked
    expect(events).toContainEqual({ type: "statuePowerless" });
    expect(events).not.toContainEqual({ type: "statueAttacked" });

    // Party member is NOT killed
    expect(state.party[0]!.status).not.toBe(3);
    expect(events.some((e) => e.type === "memberDied")).toBe(false);
  });

  it("the Lost Ruby is taken without a fight while the Eye is held", () => {
    const s = makeState({
      party: [member(0, [13])], // Hero holding the Eye
      phase: "pickup",
      treasures: [11],
      seed: 1,
    });
    const { state, events } = reduce(s, { type: "takeTreasure", ti: 0, mi: 0 });
    expect(state.party[0]!.treasure).toContain(11);
    expect(state.party[0]!.status).toBe(0); // alive
    expect(state.treasures).toEqual([]);
    expect(events).toContainEqual({ type: "rubyTaken" });
    expect(events).toContainEqual({ type: "statuePowerless" });
  });
});

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

describe("Eye of God nullifies magic & artefacts (§ Eye of God)", () => {
  it("zeroes caster MP for every member while the Eye is held", () => {
    const s = makeState({ party: [member(8, [13])] }); // Wizard (MP 5) holding the Eye
    expect(casterMP(s.party[0]!)).toBe(5); // no state -> unaffected
    expect(casterMP(s.party[0]!, s)).toBe(0); // Eye active -> magic powerless
  });

  it("suppresses the Magic Sword bonus while the Eye is held", () => {
    const s = makeState({ party: [member(0, [3, 13])] }); // Hero with Magic Sword + Eye
    expect(frontStrength(s.party[0]!)).toBe(7); // FS 5 + sword 2 (no state)
    expect(frontStrength(s.party[0]!, s)).toBe(5); // sword powerless under the Eye
  });

  it("disables The Ring's roll bonus while the Eye is held", () => {
    const ring = makeState({ party: [member(0, [10])] });
    expect(partyRollBonus(ring)).toBe(1); // Ring +1
    const ringAndEye = makeState({ party: [member(0, [10, 13])] });
    expect(partyRollBonus(ringAndEye)).toBe(0); // Ring powerless under the Eye
  });
});

describe("Unicorn loyalty to a Woman (§ Unicorn)", () => {
  // The Unicorn (id 13) has hostileMax=0/indiffMax=0, so it ALWAYS leads with a friendly reaction.
  // area.indiffCount must be < 3 to allow `test`; use a fresh area with indiffCount: 0.
  function unicornEncounter(party: ReturnType<typeof member>[]) {
    return makeState({
      phase: "encounter",
      party,
      strangers: [13], // lone Unicorn leading the encounter
      treasures: [1],  // Gold it may guard (present so guardPool path also has treasure)
      seed: 2,
      areas: [{
        card: 175,
        coord: makeState().areas[0]!.coord,
        faceUp: true,
        visited: true,
        contents: [],
        flags: 0,
        indiffCount: 0,
      }],
    });
  }

  it("a Unicorn joins the party when a Woman is present", () => {
    // Woman (id 6) in party → hasWoman() true → Unicorn joins normally.
    const { state, events } = reduce(unicornEncounter([member(6)]), { type: "test" });
    expect(events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "friendly" }));
    expect(state.party.map((m) => m.creatureId)).toContain(13); // Unicorn joined
    expect(state.strangers).toEqual([]);
  });

  it("a Womanless party leaves the Unicorn guarding the area", () => {
    // Hero (id 0) only — no Woman → Unicorn stays behind guarding.
    const { state, events } = reduce(unicornEncounter([member(0)]), { type: "test" });
    expect(events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "friendly" }));
    expect(events).toContainEqual({ type: "unicornGuards", creatureId: 13 });
    expect(state.party.map((m) => m.creatureId)).not.toContain(13); // did NOT join
    expect(state.phase).toBe("explore"); // party moves on
    expect(state.pacifiedAreas).toContain(state.partyArea); // guarded for this party (per-party, re-entry skips it)
  });

  it("a Unicorn ally departs after combat once the last Woman is gone", () => {
    // Setup: Woman (FS 2) + Unicorn ally (MP 4) vs Dragon (FS 6).
    // With seed 2: partyRoll=1, enemyRoll=5 → partyTotal=7, enemyTotal=11 → Dragon wins.
    // The Woman (weakest in group) dies. Then reconcileUnicorns fires and removes the Unicorn.
    // Verified deterministic: at seed 2 the Woman ALWAYS dies (enemyTotal 11 > partyTotal 7).
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      level: 1,
      party: [
        { creatureId: 6, status: 0 as const, dragonKills: 0, treasure: [] }, // Woman
        { creatureId: 13, status: 1 as const, dragonKills: 0, treasure: [] }, // Unicorn ally
      ],
      strangers: [10], // Dragon
      seed: 2,
    });
    const { state: result, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    // The Woman dies deterministically at seed 2.
    expect(events).toContainEqual({ type: "memberDied", creatureId: 6 });
    // Once the last Woman is gone, the Unicorn must depart.
    expect(events).toContainEqual({ type: "unicornDeparted", creatureId: 13 });
    // The Unicorn is no longer in the party.
    expect(result.party.map((m) => m.creatureId)).not.toContain(13);
  });
});

describe("The Ring — level-4 invincibility (§ The Ring)", () => {
  // Seed 3: Dwarf party roll = 4 + 1 (Ring bonus) = 6, Dragon enemy roll = 2 + 6 = 8.
  // enemyTotal (8) > partyTotal (6) — the Dragon always wins, exercising the death site.
  // Verified: seeds 1-20 all result in DWARF DIES (Dragon FS 6 too strong for Dwarf FS 1 + Ring +1).

  it("ignores a killing combat roll for the Ring bearer at level >= 4", () => {
    // A lone Dwarf (FS 1) carrying the Ring faces a Dragon (FS 6): normally the Dwarf dies.
    // At level 4 the killing roll is ignored and deathPrevented fires instead.
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      level: 4,
      party: [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [10] }], // Dwarf + Ring
      strangers: [10], // Dragon
      seed: 3,
    });
    const events = resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(s.party[0]!.status).not.toBe(3); // Ring bearer survives
    expect(events).toContainEqual({ type: "deathPrevented", creatureId: 7 });
    expect(events).not.toContainEqual({ type: "memberDied", creatureId: 7 });
  });

  it("does NOT protect the Ring bearer below level 4", () => {
    // Same setup but level 3 — Ring invincibility only activates on level >= 4.
    // At seed 3: partyTotal=6 (FS1 + roll4 + Ring+1), enemyTotal=8 (FS6 + roll2) — Dwarf dies.
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      level: 3,
      party: [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [10] }],
      strangers: [10],
      seed: 3,
    });
    resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(s.party[0]!.status).toBe(3); // dies normally at level 3 (no invincibility)
  });
});
