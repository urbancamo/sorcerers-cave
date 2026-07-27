import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { rollDie } from "./rng";
import { frontStrength } from "./combat";
import { previewPlan } from "./combatPlan";
import { scoreBreakdown, scoreGame } from "./score";
import { canCarry } from "./pickup";
import { packCoord } from "./coords";
import type { PartyMember } from "./state";

/**
 * Extension kit — the Elixir (artifact 15, US-19, SC-EXT-22) and the Idol (treasure 18, US-25,
 * SC-EXT-23). Neither is tied to a tile special: the Elixir is an ordinary usable artifact card
 * (drawn via the small pack like Balm/Staff/etc.); the Idol is an ordinary heavy-treasure find,
 * scored only at game end. kit-crypt-desertion.test.ts's fixture style (a minimal `makeState` plus
 * a local `member` helper and a seed-sweeping roll finder) is reused here.
 */

const HERO = 0;
const WIZARD = 8; // carry 0 — cannot take any heavy treasure, Idol included
const T_ELIXIR = 15;
const T_IDOL = 18;
const T_EYE_OF_GOD = 13;
const T_RING = 10;

const member = (creatureId: number, treasure: number[] = [], status: 0 | 1 | 2 | 3 = 0, overrides: Partial<PartyMember> = {}): PartyMember => ({
  creatureId,
  status,
  dragonKills: 0,
  treasure,
  ...overrides,
});

const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

/** Sweep seeds until `rollDie` produces a value satisfying `want` (kit-descents.test.ts pattern). */
function seedForRoll(want: (v: number) => boolean, start = 1): number {
  for (let seed = start; seed < 100000; seed++) {
    if (want(rollDie(seed).value)) return seed;
  }
  throw new Error("no matching seed found");
}
const seedForValue = (v: number, start = 1) => seedForRoll((r) => r === v, start);

describe("useArtifact — Elixir (US-19, SC-EXT-22)", () => {
  it("1: the drinker dies — Eye-forsaken curse checked BEFORE the spill (Task 9 ordering), items spill", () => {
    const seed = seedForValue(1);
    const s = makeState({
      phase: "explore",
      areas: [area],
      party: [member(HERO, [T_ELIXIR, T_EYE_OF_GOD])],
      seed,
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: T_ELIXIR, target: 0 });
    expect(state.party[0]!.status).toBe(3); // dead — Balm-revivable like any normal death
    expect(state.party[0]!.treasure).toEqual([]); // Elixir consumed, Eye of God spilled — nothing left
    expect(state.curses).toBe(1); // the Eye check ran while it was still on the corpse, not after the spill
    expect(events).toContainEqual({ type: "artifactUsed", artifact: T_ELIXIR });
    expect(events).toContainEqual({ type: "eyeForsaken" });
    expect(events).toContainEqual({ type: "itemsSpilled", creatureId: HERO, items: [T_EYE_OF_GOD] });
    expect(events).toContainEqual({ type: "elixirDrunk", creatureId: HERO, roll: 1, outcome: "death" });
    expect(state.treasures).toEqual([T_EYE_OF_GOD]); // spilled onto the chamber floor
  });

  it("1: the Ring's usual invincibility still applies (a killing die-roll, §Ring) — no death, no spill", () => {
    const seed = seedForValue(1);
    const s = makeState({
      phase: "explore",
      level: 4, // the Ring only guards at level >= 4
      areas: [area],
      party: [member(HERO, [T_ELIXIR, T_RING])],
      seed,
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: T_ELIXIR, target: 0 });
    expect(state.party[0]!.status).toBe(0); // spared
    expect(state.party[0]!.treasure).toEqual([T_RING]); // Elixir consumed; the Ring stays put — never spilled
    expect(events).toContainEqual({ type: "deathPrevented", creatureId: HERO });
    expect(events).toContainEqual({ type: "elixirDrunk", creatureId: HERO, roll: 1, outcome: "death" });
  });

  it("2-3: nothing happens, but the draught is still consumed", () => {
    for (const roll of [2, 3]) {
      const seed = seedForValue(roll);
      const s = makeState({ phase: "explore", areas: [area], party: [member(HERO, [T_ELIXIR])], seed });
      const { state, events } = reduce(s, { type: "useArtifact", artifact: T_ELIXIR, target: 0 });
      expect(state.party[0]!.status).toBe(0);
      expect(state.party[0]!.treasure).toEqual([]); // consumed
      expect(state.party[0]!.fsBonus).toBeUndefined();
      expect(events).toContainEqual({ type: "elixirDrunk", creatureId: HERO, roll, outcome: "nothing" });
    }
  });

  it("4-6: a PERMANENT +2 fs — consumed, and visible in a subsequent fight's strength total and chips", () => {
    for (const roll of [4, 5, 6]) {
      const seed = seedForValue(roll);
      const s = makeState({ phase: "explore", areas: [area], party: [member(HERO, [T_ELIXIR])], seed });
      const { state, events } = reduce(s, { type: "useArtifact", artifact: T_ELIXIR, target: 0 });
      expect(state.party[0]!.treasure).toEqual([]); // consumed
      expect(state.party[0]!.fsBonus).toBe(2);
      expect(events).toContainEqual({ type: "elixirDrunk", creatureId: HERO, roll, outcome: "strength" });
      expect(frontStrength(state.party[0]!)).toBe(7); // Hero 5 + 2, forever

      // The bonus rides into a LATER fight untouched — combatPlan's preview shows both the
      // strength total AND a dedicated chip, exactly like Dragon-slayer/Magic Sword.
      const fought = { ...state, phase: "fight" as const, fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3] };
      const pv = previewPlan(fought, { matches: [{ front: [0], backers: [], strangers: [0] }] });
      expect(pv.matches[0]!.partyStr).toBe(7);
      expect(pv.matches[0]!.modifiers).toContainEqual({ label: "Elixir · Hero", value: 2, side: "party", roll: false });
    }
  });

  it("is offered in explore/encounter/pickup but never mid-fight — any living member as target", () => {
    const holding = [member(HERO, [T_ELIXIR])];
    const explore = makeState({ phase: "explore", areas: [area], party: holding });
    expect(legalActions(explore)).toContainEqual({ type: "useArtifact", artifact: T_ELIXIR, target: 0 });

    const encounter = makeState({ phase: "encounter", areas: [area], strangers: [3], party: holding });
    expect(legalActions(encounter)).toContainEqual({ type: "useArtifact", artifact: T_ELIXIR, target: 0 });

    const pickup = makeState({ phase: "pickup", areas: [area], treasures: [], party: holding });
    expect(legalActions(pickup)).toContainEqual({ type: "useArtifact", artifact: T_ELIXIR, target: 0 });

    const fight = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, areas: [area], strangers: [3], party: holding });
    expect(legalActions(fight)).not.toContainEqual({ type: "useArtifact", artifact: T_ELIXIR, target: 0 });
    expect(reduce(fight, { type: "useArtifact", artifact: T_ELIXIR, target: 0 }).events).toContainEqual({ type: "blocked" });
  });
});

describe("Idol (US-25, SC-EXT-23) — carry gating", () => {
  it("is heavy (25 kg): a carry-0 member cannot take it; an ordinary member can", () => {
    expect(canCarry(member(WIZARD), T_IDOL)).toBe(false); // Wizard carry 0
    expect(canCarry(member(HERO), T_IDOL)).toBe(true); // Hero carry 75

    const s = makeState({ phase: "pickup", areas: [area], treasures: [T_IDOL], party: [member(WIZARD), member(HERO)] });
    const acts = legalActions(s);
    expect(acts).not.toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 }); // Wizard blocked
    expect(acts).toContainEqual({ type: "takeTreasure", ti: 0, mi: 1 }); // Hero fine
  });

  it("counts toward carriedWeight like Silver/Gold/Gems (a Woman at capacity can't also take it)", () => {
    // Woman: carry 25 — exactly one Idol's worth, nothing more.
    const s = makeState({ phase: "pickup", areas: [area], treasures: [T_IDOL], party: [member(6, [0])] }); // already holding Silver (25 kg)
    expect(legalActions(s)).not.toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 });
  });
});

describe("Idol (US-25, SC-EXT-23) — deferred 10×d6 valuation at scoreBreakdown", () => {
  it("scores 10× a d6 peeked from the final state's seed, without advancing it", () => {
    const seed = seedForValue(4);
    const s = makeState({ gs: 1, seed, party: [member(HERO, [T_IDOL])] }); // GS_ESCAPED
    const before = s.seed;
    const b = scoreBreakdown(s);
    expect(b.idolRoll).toBe(4);
    expect(s.seed).toBe(before); // scoreBreakdown never mutates the state it's handed
    const idolLine = b.members[0]!.treasures.find((t) => t.id === T_IDOL)!;
    expect(idolLine.points).toBe(40); // 10 × 4
    expect(b.members[0]!.subtotal).toBe(10 + 40); // Hero 10 + Idol 40
    expect(b.total).toBe(50);
    expect(scoreGame(s)).toBe(50);
  });

  it("is deterministic: two calls against the same final state agree exactly", () => {
    const s = makeState({ gs: 1, seed: 777, party: [member(HERO, [T_IDOL])] });
    const b1 = scoreBreakdown(s);
    const b2 = scoreBreakdown(s);
    expect(b2).toEqual(b1);
  });

  it("scores 0 on a DEAD member (status 3) — never rolled at all", () => {
    const s = makeState({ gs: 1, seed: 777, party: [member(HERO, []), member(5, [T_IDOL], 3)] }); // Hero 10 + a dead Man holding the Idol
    const b = scoreBreakdown(s);
    expect(b.idolRoll).toBeUndefined(); // no surviving carrier — never rolled
    const idolLine = b.members[1]!.treasures.find((t) => t.id === T_IDOL)!;
    expect(idolLine.points).toBe(0);
    expect(b.members[1]!.subtotal).toBe(0);
    expect(b.total).toBe(10); // just the living Hero
  });

  it("scores 0 on a STONE member (status 2) the same way", () => {
    const s = makeState({ gs: 1, seed: 777, party: [member(5, [T_IDOL], 2)] });
    const b = scoreBreakdown(s);
    expect(b.idolRoll).toBeUndefined();
    expect(b.total).toBe(0);
  });

  it("leaves base scoring (no Idol in play) byte-identical", () => {
    const s = makeState({
      gs: 1,
      party: [
        { creatureId: HERO, status: 0, dragonKills: 1, treasure: [1, 3] }, // Hero 10*2 + Gold 10 + Sword 15
        { creatureId: 5, status: 1, dragonKills: 0, treasure: [] },
      ],
    });
    const b = scoreBreakdown(s);
    expect(b.idolRoll).toBeUndefined();
    expect(b.total).toBe(50); // Hero 20 + Gold 10 + Sword 15 + ally Man 5, unchanged by the Idol feature
    expect(b.total).toBe(scoreGame(s));
  });
});
