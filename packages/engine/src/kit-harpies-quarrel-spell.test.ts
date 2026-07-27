import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { applyHazards } from "./hazards";
import { makeState } from "./testkit";
import { rollDie } from "./rng";
import { packCoord } from "./coords";
import { AREA_CARDS, GATEWAY_INDEX } from "./data/areaCards";
import { HAZARD_HARPIES, HAZARD_QUARREL, HAZARD_SPELL } from "./data/hazards";
import { AF_DESTROYED, AF_UNRESOLVED, GS_PLAYING, type GameState, type PartyMember } from "./state";

/**
 * Extension kit — Harpies (US-10, SC-EXT-15), Quarrel (US-11, SC-EXT-16) and Spell (US-22,
 * SC-EXT-28). All three are ordinary hazards resolved by `applyHazards` (hazards.ts) like
 * Mutiny/Ghouls/Desertion; Spell additionally touches the map (`state.areas`/`largePack`) since
 * its effect replaces the previous tunnel's card. kit-crypt-desertion.test.ts's direct
 * `applyHazards(state)` fixture style (no `reduce`/movement needed for a pure hazard case) is
 * reused throughout; a couple of `reduce`-driven integration tests confirm each hazard also
 * behaves correctly reached through a real chamber entry.
 */

const HERO = 0;
const OGRE = 2;
const MAN = 5;
const WOMAN = 6;
const WOLF = 20;
const LION = 16;

const GOLD = 1;
const MAGIC_SWORD = 3;
const HEALING_BALM = 6;
const TALISMAN = 7;
const EYE_OF_GOD = 13;

const DIR_E = 2;
const DIR_W = 4;

const member = (creatureId: number, status: 0 | 1 | 2 | 3 = 0, treasure: number[] = [], borne?: number[]): PartyMember => ({
  creatureId,
  status,
  dragonKills: 0,
  treasure,
  ...(borne ? { borne } : {}),
});

/** Sweep seeds until a SEQUENCE of `rollDie` calls (each seeded by the previous one's output)
 *  satisfies one predicate per roll, in order (kit-crypt-desertion.test.ts pattern). */
function seedForSequence(wants: ((v: number) => boolean)[], start = 1): number {
  outer: for (let seed = start; seed < 200000; seed++) {
    let s = seed;
    for (const want of wants) {
      const r = rollDie(s);
      if (!want(r.value)) continue outer;
      s = r.seed;
    }
    return seed;
  }
  throw new Error("no matching seed sequence found");
}

// ---------------------------------------------------------------------------------------------
// Harpies (hazard 6, US-10, SC-EXT-15)
// ---------------------------------------------------------------------------------------------

describe("Harpies — steal-all-artifacts, park condition, Eye-of-God curse (US-10, SC-EXT-15)", () => {
  it("steals every living member's artifacts, carried AND borne, leaving heavy treasure behind — then discards (no re-park)", () => {
    const s = makeState({
      party: [
        member(HERO, 0, [GOLD, MAGIC_SWORD], [MAGIC_SWORD]), // heavy Gold + a BORNE Magic Sword
        member(MAN, 0, [HEALING_BALM]), // a merely-carried artifact
      ],
      hazards: [HAZARD_HARPIES],
    });
    const { events } = applyHazards(s);

    expect(s.party[0]!.treasure).toEqual([GOLD]); // the Sword is gone; the heavy Gold stays
    expect(s.party[0]!.borne ?? []).toEqual([]); // no longer listed as borne — it isn't held at all
    expect(s.party[1]!.treasure).toEqual([]);

    const steal = events.find((e) => e.type === "harpiesSteal") as { treasureIds: number[]; cursed: boolean };
    expect(steal.treasureIds.slice().sort()).toEqual([MAGIC_SWORD, HEALING_BALM].sort());
    expect(steal.cursed).toBe(false);

    // Discarded — unlike Medusa/Ghouls it does NOT lurk again once it has actually struck.
    expect(s.areas[s.partyArea]!.contents).not.toContain(300 + HAZARD_HARPIES);
    // No Lair on the map yet — the theft queues in harpyStash rather than landing anywhere.
    expect(s.harpyStash).toEqual(expect.arrayContaining([MAGIC_SWORD, HEALING_BALM]));
    expect(events.some((e) => e.type === "lairStash")).toBe(false);
  });

  it("stealing the Eye of God invokes the forsaken curse, but via harpiesSteal.cursed, not a reused eyeForsaken event", () => {
    const s = makeState({
      party: [member(HERO, 0, [EYE_OF_GOD])],
      hazards: [HAZARD_HARPIES],
      curses: 0,
    });
    const { events } = applyHazards(s);

    expect(s.curses).toBe(1);
    const steal = events.find((e) => e.type === "harpiesSteal") as { treasureIds: number[]; cursed: boolean };
    expect(steal.treasureIds).toContain(EYE_OF_GOD);
    expect(steal.cursed).toBe(true);
    // The design mandates this theft's OWN wording ("The Eye of God is torn away…") — reusing the
    // base game's `eyeForsaken` event would carry the wrong (bearer-death) notice text, so it must
    // not appear here at all.
    expect(events.some((e) => e.type === "eyeForsaken")).toBe(false);
  });

  it("parks (does not fire) when the party holds no artifacts at all — re-checked on every re-entry", () => {
    const s = makeState({
      party: [member(HERO, 0, [GOLD])], // heavy treasure only — no artifact
      hazards: [HAZARD_HARPIES],
    });
    const { events } = applyHazards(s);

    expect(events).toContainEqual({ type: "harpiesLurk" });
    expect(events.some((e) => e.type === "harpiesSteal")).toBe(false);
    expect(s.party[0]!.treasure).toEqual([GOLD]); // untouched
    // LURKS like Medusa/Ghouls — re-parked so the next entry checks again.
    expect(s.areas[s.partyArea]!.contents).toContain(300 + HAZARD_HARPIES);
  });

  it("parks even WITH artifacts present, when the party holds the Talisman", () => {
    const s = makeState({
      party: [member(HERO, 0, [TALISMAN, MAGIC_SWORD])],
      hazards: [HAZARD_HARPIES],
    });
    const { events } = applyHazards(s);

    expect(events).toContainEqual({ type: "harpiesLurk" });
    expect(s.party[0]!.treasure).toEqual([TALISMAN, MAGIC_SWORD]); // nothing stolen
    expect(s.areas[s.partyArea]!.contents).toContain(300 + HAZARD_HARPIES);
  });

  it("only LIVING members' artifacts count — a stone member's held Sword neither wards nor is stolen", () => {
    const s = makeState({
      party: [
        member(HERO, 2, [MAGIC_SWORD]), // stone — holds an artifact, but isn't "the party" for this check
        member(MAN, 0, []), // the only living member holds nothing
      ],
      hazards: [HAZARD_HARPIES],
    });
    const { events } = applyHazards(s);

    expect(events).toContainEqual({ type: "harpiesLurk" }); // no LIVING artifacts ⇒ parks
    expect(s.party[0]!.treasure).toEqual([MAGIC_SWORD]); // the stone member's sword is untouched
  });

  it("delivers straight to an already-placed Lair (stashOrDeliver), firing lairStash alongside harpiesSteal", () => {
    const lairCoord = packCoord(1, 60, 60);
    const s = makeState({
      party: [member(HERO, 0, [MAGIC_SWORD])],
      hazards: [HAZARD_HARPIES],
      lairCoord,
      areas: [
        { card: 175, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
        { card: 31, coord: lairCoord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 0,
    });
    const { events } = applyHazards(s);

    expect(events).toContainEqual({ type: "lairStash", treasureIds: [MAGIC_SWORD] });
    expect(s.areas[1]!.contents).toContain(200 + MAGIC_SWORD); // landed on the Lair's floor directly
    expect(s.harpyStash ?? []).toEqual([]); // nothing left pending
  });

  it("fires within a real chamber entry (reduce), alongside the ordinary moved/drewChamber events", () => {
    const s = makeState({
      gs: GS_PLAYING,
      phase: "explore",
      party: [member(HERO, 0, [MAGIC_SWORD])],
      largePack: [31],
      largeIdx: 0,
      smallPack: [300 + HAZARD_HARPIES],
      smallIdx: 0,
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(events.some((e) => e.type === "moved")).toBe(true);
    expect(events.some((e) => e.type === "drewChamber")).toBe(true);
    expect(events.some((e) => e.type === "harpiesSteal")).toBe(true);
    expect(state.party[0]!.treasure).toEqual([]);
    expect(state.phase).toBe("explore"); // nothing left drawn — the turn continues normally
  });
});

// ---------------------------------------------------------------------------------------------
// Quarrel (hazard 7, US-11, SC-EXT-16)
// ---------------------------------------------------------------------------------------------

describe("Quarrel — top-two effective-fs duel, Wolf/Lion exclusion, tie-break by roster order (US-11, SC-EXT-16)", () => {
  it("picks the two highest effective-fs LIVING members, excluding Wolf and Lion entirely", () => {
    const seed = seedForSequence([(v) => v >= 1, (v) => v >= 1]); // any roll — outcome not under test here
    const s = makeState({
      party: [
        member(HERO, 0),  // fs 5 — eligible, highest
        member(WOLF, 0),  // fs 2 — excluded regardless of fs
        member(LION, 0),  // fs 3 — excluded regardless of fs
        member(MAN, 0),   // fs 3 — eligible, second-highest among the eligible pool
      ],
      hazards: [HAZARD_QUARREL],
      seed,
    });
    const { events } = applyHazards(s);

    const q = events.find((e) => e.type === "quarrel") as { aId: number; bId: number };
    expect([q.aId, q.bId].sort()).toEqual([HERO, MAN].sort());
    expect([q.aId, q.bId]).not.toContain(WOLF);
    expect([q.aId, q.bId]).not.toContain(LION);
  });

  it("breaks a tied effective fs by roster order — the earlier member ranks first (aId)", () => {
    const seed = seedForSequence([(v) => v >= 1, (v) => v >= 1]);
    const s = makeState({
      party: [
        member(HERO, 0), // fs 5, roster index 0
        member(WOMAN, 0), // fs 2 — third place, not picked
        member(OGRE, 0), // fs 5, roster index 2 — ties the Hero
      ],
      hazards: [HAZARD_QUARREL],
      seed,
    });
    const { events } = applyHazards(s);
    const q = events.find((e) => e.type === "quarrel") as { aId: number; bId: number };
    expect(q.aId).toBe(HERO); // earlier in the roster wins the tie for top rank
    expect(q.bId).toBe(OGRE);
  });

  it("a seed-pinned loser dies a normal death: memberDied semantics (status 3), items spilled to the floor", () => {
    // Equal fs (Hero vs Ogre, both 5) isolates the outcome to the dice: Hero rolls lower and loses.
    const seed = seedForSequence([(v) => v <= 3, (v) => v >= 4]);
    const s = makeState({
      party: [member(HERO, 0, [GOLD]), member(OGRE, 0)],
      hazards: [HAZARD_QUARREL],
      treasures: [],
      seed,
    });
    const { events } = applyHazards(s);

    const q = events.find((e) => e.type === "quarrel") as { aId: number; bId: number; aRoll: number; bRoll: number; loserId: number | null };
    expect(q.aId).toBe(HERO);
    expect(q.bId).toBe(OGRE);
    expect(q.aRoll).toBeLessThanOrEqual(3);
    expect(q.bRoll).toBeGreaterThanOrEqual(4);
    expect(q.loserId).toBe(HERO);

    expect(s.party[0]!.status).toBe(3); // dead — Balm-revivable, not removed from the game
    expect(s.party[1]!.status).toBe(0); // the winner is unmarked
    expect(s.treasures).toContain(GOLD); // carried items spilled to the floor
    expect(events).toContainEqual({ type: "itemsSpilled", creatureId: HERO, items: [GOLD] });
    expect(events.some((e) => e.type === "memberDied")).toBe(false); // narrated via `quarrel` itself, not a second event
  });

  it("a tie is harmless — no death, no items spilled, loserId null", () => {
    const seed = seedForSequence([(v) => v === 1 || v === 2 || v === 3, (v) => v === 1 || v === 2 || v === 3]);
    // Force an exact tie by re-deriving a seed where both rolls land on the SAME value.
    let tiedSeed = seed;
    for (let s0 = 1; s0 < 200000; s0++) {
      const r1 = rollDie(s0);
      const r2 = rollDie(r1.seed);
      if (r1.value === r2.value) { tiedSeed = s0; break; }
    }
    const s = makeState({
      party: [member(HERO, 0, [GOLD]), member(OGRE, 0)],
      hazards: [HAZARD_QUARREL],
      treasures: [],
      seed: tiedSeed,
    });
    const { events } = applyHazards(s);
    const q = events.find((e) => e.type === "quarrel") as { aRoll: number; bRoll: number; loserId: number | null };
    expect(q.aRoll).toBe(q.bRoll);
    expect(q.loserId).toBeNull();
    expect(s.party[0]!.status).toBe(0);
    expect(s.party[1]!.status).toBe(0);
    expect(s.treasures).toEqual([]);
  });

  it("fizzles with fewer than two eligible combatants — no roll, no effect, and no generic hazard notice fallback", () => {
    const s = makeState({ party: [member(HERO, 0)], hazards: [HAZARD_QUARREL] });
    const { events } = applyHazards(s);
    expect(events).toEqual([{ type: "quarrelFizzled" }]);
    expect(events.some((e) => e.type === "hazardFired")).toBe(false);
  });

  it("fizzles when the only two living members are the excluded Wolf and Lion", () => {
    const s = makeState({ party: [member(WOLF, 0), member(LION, 0)], hazards: [HAZARD_QUARREL] });
    const { events } = applyHazards(s);
    expect(events).toEqual([{ type: "quarrelFizzled" }]);
  });

  it("discards after firing — never re-parks, whatever the outcome", () => {
    const seed = seedForSequence([(v) => v >= 1, (v) => v >= 1]);
    const s = makeState({ party: [member(HERO, 0), member(OGRE, 0)], hazards: [HAZARD_QUARREL], seed });
    applyHazards(s);
    expect(s.areas[s.partyArea]!.contents).not.toContain(300 + HAZARD_QUARREL);
  });

  it("fires within a real chamber entry and the turn continues into the normal phase afterward", () => {
    const seed = seedForSequence([(v) => v >= 1, (v) => v >= 1]);
    const s = makeState({
      gs: GS_PLAYING,
      phase: "explore",
      party: [member(HERO, 0), member(OGRE, 0)],
      largePack: [31],
      largeIdx: 0,
      smallPack: [300 + HAZARD_QUARREL],
      smallIdx: 0,
      seed,
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });
    expect(events.some((e) => e.type === "quarrel")).toBe(true);
    expect(["explore", "pickup", "encounter"]).toContain(state.phase); // resolves into a normal phase, not stuck
  });
});

// ---------------------------------------------------------------------------------------------
// Spell (hazard 8, US-22, SC-EXT-28)
// ---------------------------------------------------------------------------------------------

const TUNNEL_CARD = 2; // East-only doorway, non-chamber — matches other kit fixtures' plain tunnel
const CHAMBER_CARD = 31; // NESW chamber

function spellState(over: Partial<GameState>): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    party: [member(HERO, 0)],
    areas: [
      { card: TUNNEL_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      { card: CHAMBER_CARD, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
    ],
    partyArea: 1,
    prev: 0,
    largePack: [CHAMBER_CARD, 999, 998],
    largeIdx: 0,
    hazards: [HAZARD_SPELL],
    ...over,
  });
}

describe("Spell — remap-on-draw: splice into the pack, replace the cell face-down (US-22, SC-EXT-28)", () => {
  it("splices prev's card value into the middle of the REMAINING large pack, and draws the next card for the cell", () => {
    const s = spellState({});
    const { events } = applyHazards(s);

    // remaining = 3, floor(3/2) = 1 ⇒ inserted at largeIdx(0)+1 = 1.
    expect(s.largePack).toEqual([CHAMBER_CARD, TUNNEL_CARD, 999, 998]);
    expect(s.largeIdx).toBe(1); // exactly one card drawn for the new cell
    expect(s.areas[0]!.card).toBe(CHAMBER_CARD); // the first (unaffected) pack card
    expect(events).toContainEqual({ type: "spellRemap", fizzled: false });
  });

  it("places the new cell UNEXPLORED (AF_UNRESOLVED, visited:false, empty contents), with the old tile's secret door/mirrored stairs gone", () => {
    const s = spellState({
      areas: [
        // The old tunnel carries a mirrored stair + secret door from an earlier descent — both must
        // vanish once the Spell replaces it (design: "Its secret doors are gone.").
        { card: TUNNEL_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, mirroredStairs: 32, secretDoor: 2 },
        { card: CHAMBER_CARD, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
    });
    applyHazards(s);

    const cell = s.areas[0]!;
    expect(cell.flags & AF_UNRESOLVED).toBe(AF_UNRESOLVED);
    expect(cell.visited).toBe(false);
    expect(cell.contents).toEqual([]);
    expect(cell.mirroredStairs).toBeUndefined();
    expect(cell.secretDoor).toBeUndefined();
  });

  it("resolves with a normal entry beat (a real chamber draw) the next time the party steps on it, clearing AF_UNRESOLVED", () => {
    const s = spellState({ smallPack: [], smallIdx: 0 });
    applyHazards(s); // area 0 is now the freshly-drawn CHAMBER_CARD, unresolved

    const { state, events } = reduce(s, { type: "move", dir: DIR_W }); // step from area 1 back onto the remapped cell
    expect(state.partyArea).toBe(0);
    expect(state.areas[0]!.flags & AF_UNRESOLVED).toBe(0); // revealed
    expect(state.areas[0]!.visited).toBe(true);
    expect(events).toContainEqual({ type: "drewChamber", strangers: [], treasures: [], hazards: [] });
  });

  it("fizzles (no state change) when prev is a CHAMBER, not a tunnel", () => {
    const s = spellState({
      areas: [
        { card: CHAMBER_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: CHAMBER_CARD, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
    });
    const before = JSON.stringify(s.areas);
    const beforePack = [...s.largePack];
    const { events } = applyHazards(s);
    expect(events).toEqual([{ type: "hazardFired", hazard: HAZARD_SPELL }, { type: "spellRemap", fizzled: true }]);
    expect(JSON.stringify(s.areas)).toBe(before);
    expect(s.largePack).toEqual(beforePack);
    expect(s.largeIdx).toBe(0);
  });

  it("fizzles when prev is the Gateway", () => {
    const s = spellState({
      areas: [
        { card: AREA_CARDS[GATEWAY_INDEX]!, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
        { card: CHAMBER_CARD, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
    });
    const { events } = applyHazards(s);
    expect(events).toEqual([{ type: "hazardFired", hazard: HAZARD_SPELL }, { type: "spellRemap", fizzled: true }]);
  });

  it("fizzles when prev is earthquake-collapsed (AF_DESTROYED)", () => {
    const s = spellState({
      areas: [
        { card: TUNNEL_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: AF_DESTROYED, indiffCount: 0 },
        { card: CHAMBER_CARD, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
    });
    const { events } = applyHazards(s);
    expect(events).toEqual([{ type: "hazardFired", hazard: HAZARD_SPELL }, { type: "spellRemap", fizzled: true }]);
  });

  it("fizzles when there is no real prev (prev === partyArea)", () => {
    const s = spellState({ partyArea: 0, prev: 0 });
    const { events } = applyHazards(s);
    expect(events).toEqual([{ type: "hazardFired", hazard: HAZARD_SPELL }, { type: "spellRemap", fizzled: true }]);
  });

  it("fizzles when the large pack is empty, even with an otherwise-eligible prev tunnel", () => {
    const s = spellState({ largePack: [], largeIdx: 0 });
    const before = JSON.stringify(s.areas);
    const { events } = applyHazards(s);
    expect(events).toEqual([{ type: "hazardFired", hazard: HAZARD_SPELL }, { type: "spellRemap", fizzled: true }]);
    expect(JSON.stringify(s.areas)).toBe(before);
  });

  it("discards after firing (fizzled or not) — Spell is never re-parked", () => {
    const s = spellState({});
    applyHazards(s);
    // area 1 is the party's CURRENT area (unrelated to the remap target) — Spell never lurks there.
    expect(s.areas[1]!.contents).not.toContain(300 + HAZARD_SPELL);
  });
});
