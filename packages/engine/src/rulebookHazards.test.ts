import { describe, expect, it } from "vitest";
import { applyHazards } from "./hazards";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { AF_UNRESOLVED, type PartyMember, type PlacedArea } from "./state";
import {
  HAZARD_DESERTION, HAZARD_EARTHQUAKE, HAZARD_GHOULS, HAZARD_HARPIES, HAZARD_MEDUSA, HAZARD_MUTINY, HAZARD_QUARREL, HAZARD_SPELL, HAZARD_TRAP,
} from "./data/hazards";

// Engine rules validation, pilot: the hazard cards, checked clause by clause against the Consolidated Rules V2 ('Hazard cards', and the
// clauses of other entries that govern them). Test names carry the clause id from docs/validation/clauses/hazards.md. A test that asserts
// what the BOOK says and fails against today's engine is `it.fails` (a KNOWN MISMATCH awaiting a ruling): it passes while the engine is
// wrong and starts failing the moment the engine is fixed, when the `.fails` must be removed. Register: docs/validation/rulings-register.md.
const MAN = 5, WOMAN = 6, DWARF = 7, LION = 16, WOLF = 20;
const TALISMAN = 7, EYE_OF_GOD = 13;
const member = (creatureId: number, status: PartyMember["status"] = 0, treasure: number[] = [], borne?: number[]): PartyMember => ({ creatureId, status, dragonKills: 0, treasure, ...(borne ? { borne } : {}) });
const area = (card: number, y: number): PlacedArea => ({ card, coord: packCoord(1, 50, 50 + y), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 });
const DESTROYED = 4; // AF_DESTROYED
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe("rulebook hazards: card order and the generic rules", () => {
  it("RC-HZ-1 when several hazards are drawn they are dealt with Earthquake, Spell, Harpies, Medusa, Ghouls, Quarrel, Desertion, Mutiny, Trap", () => {
    const s = makeState({ party: [member(MAN, 0, [3, 4]), member(MAN, 0), member(WOMAN, 1)], hazards: [HAZARD_TRAP, HAZARD_MUTINY, HAZARD_DESERTION, HAZARD_QUARREL, HAZARD_GHOULS, HAZARD_MEDUSA, HAZARD_HARPIES, HAZARD_EARTHQUAKE] });
    s.areas = [area(15, 0), area(31, 1)]; s.partyArea = 1; s.prev = 0;
    s.variants = { extensionKit: true };
    const fired = applyHazards(s).events.filter((e) => e.type === "hazardFired").map((e) => (e as { hazard: number }).hazard);
    // (Spell fizzles on a tunnel-less map and the earlier hazards may leave too few members for a Quarrel, so only the ORDER of those that fire is fixed.)
    const book = [HAZARD_EARTHQUAKE, HAZARD_HARPIES, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_QUARREL, HAZARD_DESERTION, HAZARD_MUTINY, HAZARD_TRAP];
    expect(fired).toEqual(book.filter((h) => fired.includes(h)));
    expect(fired[0]).toBe(HAZARD_EARTHQUAKE);
    expect(fired.at(-1)).toBe(HAZARD_TRAP);
    expect(fired.length).toBeGreaterThanOrEqual(6);
  });
});

describe("rulebook hazards: Desertion", () => {
  it("RC-HZ-D1/D2 each ALLY rolls and a 1 or 2 makes it disappear with its treasure; original members never roll", () => {
    let left = 0, stayed = 0;
    for (const seed of SEEDS) {
      const s = makeState({ seed, hazards: [HAZARD_DESERTION], party: [member(MAN, 0, [0]), member(WOMAN, 1, [1]), member(DWARF, 1)] });
      const ev = applyHazards(s).events.filter((e) => e.type === "desertionRoll") as { roll: number; deserted: boolean }[];
      expect(ev).toHaveLength(2); // two allies rolled, the original Man did not
      for (const e of ev) expect(e.deserted).toBe(e.roll <= 2);
      expect(s.party[0]!.creatureId).toBe(MAN); // the original is untouched
      left += ev.filter((e) => e.deserted).length; stayed += ev.filter((e) => !e.deserted).length;
    }
    expect(left).toBeGreaterThan(0);
    expect(stayed).toBeGreaterThan(left); // 2 in 6 leave
  });

  // RC-HZ-D3 (the book's "an all-ally party may designate one creature immune from desertion") is replaced by ruling R-07/R-10: a
  // party left with no original member picks a new leader, who counts as original. Pinned in leader-choice.test.ts.
});

describe("rulebook hazards: Earthquake", () => {
  it("RC-HZ-E1 the last area the party was in collapses, impassable, and its small cards are removed from play", () => {
    const s = makeState({ areas: [area(15, 0), area(15, 1), area(31, 2)], partyArea: 2, prev: 1, prev2: 0, hazards: [HAZARD_EARTHQUAKE] });
    s.areas[1]!.contents = [205];
    applyHazards(s);
    expect(s.areas[1]!.flags & DESTROYED).toBe(DESTROYED);
    expect(s.areas[1]!.contents).toEqual([]);
    expect(s.areas[0]!.flags & DESTROYED).toBe(0);
  });

  it("RC-HZ-E2 [R-08 ruled 2026-11-06] two Earthquake cards drawn in the same chamber destroy only ONE area; one in each of two chambers destroys two", () => {
    // The small pack holds two Earthquakes (data/smallPack.ts). The engine fires once per hazard TYPE, which is what the ruling asks for.
    const s = makeState({ areas: [area(15, 0), area(15, 1), area(31, 2)], partyArea: 2, prev: 1, prev2: 0, hazards: [HAZARD_EARTHQUAKE, HAZARD_EARTHQUAKE] });
    applyHazards(s);
    expect(s.areas[1]!.flags & DESTROYED).toBe(DESTROYED);
    expect(s.areas[0]!.flags & DESTROYED).toBe(0);
  });
});

describe("rulebook hazards: Medusa", () => {
  it("RC-HZ-M1/M2 each creature rolls on entry and a 1 or 2 turns it to stone", () => {
    for (const seed of SEEDS) {
      const s = makeState({ seed, hazards: [HAZARD_MEDUSA], party: [member(MAN), member(MAN), member(MAN)] });
      const gaze = applyHazards(s).events.find((e) => e.type === "medusaGaze") as { rolls: { roll: number; petrified: boolean }[] };
      expect(gaze.rolls).toHaveLength(3);
      for (const r of gaze.rolls) expect(r.petrified).toBe(r.roll <= 2);
    }
  });

  it("RC-HZ-M4 a stoned creature's goods are left in the chamber, to be taken at the end of the turn", () => {
    for (const seed of SEEDS) {
      const s = makeState({ seed, hazards: [HAZARD_MEDUSA], party: [member(MAN, 0, [0, 1]), member(MAN)] });
      applyHazards(s);
      if (s.party[0]!.status === 2) { expect(s.treasures).toEqual(expect.arrayContaining([0, 1])); expect(s.party[0]!.treasure).toEqual([]); return; }
    }
    throw new Error("no seed petrified the first Man");
  });

  it("RC-HZ-M6 a Wizard with the Magic Staff wards her off: no one is stoned", () => {
    for (const seed of SEEDS) {
      const s = makeState({ seed, hazards: [HAZARD_MEDUSA], party: [member(8, 0, [9], [9]), member(MAN), member(MAN)] });
      applyHazards(s);
      expect(s.party.every((m) => m.status === 0)).toBe(true);
    }
  });

  it("RC-HZ-M5 [R-09 fixed 2026-11-06] the Eye of God renders Medusa powerless", () => {
    // Book, Medusa: "The Eye of God renders Medusa powerless." (and Eye of God: "renders powerless all magic in the area").
    // Before the fix the Eye changed nothing: members were stoned at the same rate with or without it (164 of 600 rolls in the pilot probe).
    for (const seed of SEEDS) {
      const s = makeState({ seed, hazards: [HAZARD_MEDUSA], party: [member(MAN, 0, [EYE_OF_GOD]), member(MAN), member(MAN)] });
      applyHazards(s);
      expect(s.party.filter((m) => m.status === 2), `seed ${seed}`).toEqual([]);
    }
  });

  it("RC-HZ-M5b the Eye does not free anyone Medusa has already turned to stone, and she still lurks in the chamber", () => {
    const s = makeState({ hazards: [HAZARD_MEDUSA], party: [member(MAN, 0, [EYE_OF_GOD]), member(MAN, 2)] });
    s.party[1]!.stoneArea = s.partyArea;
    applyHazards(s);
    expect(s.party[1]!.status).toBe(2);
    expect(s.areas[s.partyArea]!.contents).toContain(300 + HAZARD_MEDUSA);
  });
});

describe("rulebook hazards: Ghouls, Harpies, Quarrel, Mutiny, Trap", () => {
  it("RC-HZ-G6 the Talisman wards off Ghouls (Talisman entry): they do not attack a party wearing it", () => {
    const s = makeState({ hazards: [HAZARD_GHOULS], party: [member(MAN, 0, [TALISMAN], [TALISMAN])] });
    const ev = applyHazards(s).events;
    expect(ev.some((e) => e.type === "ghoulsWarded")).toBe(true);
    expect(s.party[0]!.status).toBe(0);
  });

  it("RC-HZ-G5 Medusa and Ghouls stay in the chamber and strike again each time the party re-enters", () => {
    const s = makeState({ hazards: [HAZARD_MEDUSA, HAZARD_GHOULS], party: [member(MAN)] });
    applyHazards(s);
    expect(s.areas[s.partyArea]!.contents).toEqual(expect.arrayContaining([300 + HAZARD_MEDUSA, 300 + HAZARD_GHOULS]));
  });

  it("RC-HZ-H4 Harpies with no artefacts to take, or against the Talisman, stay in the chamber instead of striking", () => {
    const none = makeState({ hazards: [HAZARD_HARPIES], party: [member(MAN, 0, [0])] }); // heavy treasure only
    applyHazards(none);
    expect(none.areas[none.partyArea]!.contents).toContain(300 + HAZARD_HARPIES);
    const warded = makeState({ hazards: [HAZARD_HARPIES], party: [member(MAN, 0, [TALISMAN, 3], [TALISMAN])] });
    applyHazards(warded);
    expect(warded.areas[warded.partyArea]!.contents).toContain(300 + HAZARD_HARPIES);
    expect(warded.party[0]!.treasure).toContain(3);
  });

  it("RC-HZ-H3 Harpies take the party's artefacts but not those found in this chamber", () => {
    const s = makeState({ hazards: [HAZARD_HARPIES], treasures: [4], party: [member(MAN, 0, [3, 0])] });
    applyHazards(s);
    expect(s.party[0]!.treasure).toEqual([0]); // the Sword went, the Gold stayed
    expect(s.treasures).toEqual([4]); // the Carpet lying in the chamber was not taken
  });

  it("RC-HZ-Q1/Q2 a Quarrel is between the two strongest members by total strength; the Lion and the Wolf are not drawn into it", () => {
    // Book example: Giant, Priest and a Man with a sword -> the Giant and one of the others; Man, Wolf and Dwarf -> the Man and the Dwarf.
    const s = makeState({ hazards: [HAZARD_QUARREL], party: [member(MAN), member(WOLF, 1), member(DWARF, 1), member(LION, 1)] });
    const q = applyHazards(s).events.find((e) => e.type === "quarrel") as { aId: number; bId: number };
    expect([q.aId, q.bId].sort()).toEqual([MAN, DWARF].sort());
  });

  it("RC-HZ-U1/U3 a Mutiny turns every ally back into a stranger in this chamber; original members stay", () => {
    const s = makeState({ hazards: [HAZARD_MUTINY], party: [member(MAN), member(WOMAN, 1), member(DWARF, 1)] });
    applyHazards(s);
    expect(s.party.map((m) => m.creatureId)).toEqual([MAN]);
    expect(s.strangers.sort()).toEqual([WOMAN, DWARF].sort());
  });

  it("RC-HZ-U4 when the whole party is allies one remains loyal (the survivor is the first; the player then names the new leader — R-10, leader-choice.test.ts)", () => {
    const s = makeState({ hazards: [HAZARD_MUTINY], party: [member(MAN, 1), member(WOMAN, 1), member(DWARF, 1)] });
    applyHazards(s);
    expect(s.party).toHaveLength(1);
  });

  it("RC-HZ-T1/T2 a Trap drops the party a level; a Dwarf guides it past one trap but not two", () => {
    const fall = makeState({ hazards: [HAZARD_TRAP], party: [member(MAN)] });
    expect(applyHazards(fall).fell).toBe(true);
    const guided = makeState({ hazards: [HAZARD_TRAP], party: [member(MAN), member(DWARF)] });
    expect(applyHazards(guided).fell).toBe(false);
    const two = makeState({ hazards: [HAZARD_TRAP, HAZARD_TRAP], party: [member(MAN), member(DWARF)], variants: { trapRules: true } });
    expect(applyHazards(two).fell).toBe(true);
  });
});

// Spell (book: "The last unoccupied tunnel your party was in is put into the middle of the pack and replaced by the next card, face down").
// Owner's reading (2026-11-06): look back along the path the party WALKED and take the last tunnel on it with no exploring party (another
// player, in multiplayer) and no small card; chambers are not affected; an Earthquake drawn here is placed first. The engine used to look only at
// `prev` (the tile the party just came from); it now walks `state.trail` (kept by `reduce`) as well. Register R-12.
describe("rulebook hazards: Spell", () => {
  const TUNNEL = 2, CHAMBER = 31;
  const spell = (cards: [number, number], hazards = [HAZARD_SPELL]) =>
    makeState({ areas: [area(cards[0], 0), area(cards[1], 1), area(CHAMBER, 2)], partyArea: 2, prev: 1, prev2: 0, largePack: [CHAMBER, 999, 998], largeIdx: 0, hazards });
  const remapped = (s: ReturnType<typeof spell>, i: number) => (s.areas[i]!.flags & AF_UNRESOLVED) === AF_UNRESOLVED;

  it("RC-HZ-S1 the last tunnel walked through, with nobody on it and no small card, is replaced by the next card, face down", () => {
    const s = spell([TUNNEL, TUNNEL]);
    applyHazards(s);
    expect(remapped(s, 1)).toBe(true);
    expect(remapped(s, 0)).toBe(false);
  });

  it("RC-HZ-S2 chambers are not affected: a walk through chambers only leaves nothing to replace", () => {
    const s = spell([CHAMBER, CHAMBER]);
    const { events } = applyHazards(s);
    expect(remapped(s, 0) || remapped(s, 1)).toBe(false);
    expect(events).toContainEqual({ type: "spellRemap", fizzled: true });
  });

  it("RC-HZ-S2b [R-15] with the area tile pack used up there is nothing to swap in: the Spell is ineffective and changes nothing", () => {
    const s = makeState({ areas: [area(TUNNEL, 0), area(TUNNEL, 1), area(CHAMBER, 2)], partyArea: 2, prev: 1, prev2: 0, largePack: [CHAMBER], largeIdx: 1, hazards: [HAZARD_SPELL] });
    const before = JSON.stringify(s.areas.map((a) => a.card)), packBefore = JSON.stringify(s.largePack);
    const { events } = applyHazards(s);
    expect(events).toContainEqual({ type: "spellRemap", fizzled: true });
    expect(JSON.stringify(s.areas.map((a) => a.card))).toBe(before);
    expect(JSON.stringify(s.largePack)).toBe(packBefore);
    expect(remapped(s, 0) || remapped(s, 1)).toBe(false);
  });

  it("RC-HZ-S3 [R-12 fixed 2026-11-06] when the tile just left is a chamber, the Spell takes the last TUNNEL walked through before it", () => {
    const s = spell([TUNNEL, CHAMBER]);
    applyHazards(s);
    expect(remapped(s, 0)).toBe(true);
  });

  it("RC-HZ-S4 [R-12 fixed 2026-11-06] a tunnel holding a small card is skipped: the Spell takes the last tunnel walked through that has none", () => {
    const s = spell([TUNNEL, TUNNEL]);
    s.areas[1]!.contents = [203]; // a treasure card lying on the tile
    applyHazards(s);
    expect(remapped(s, 1)).toBe(false);
    expect(remapped(s, 0)).toBe(true);
  });

  it("RC-HZ-S5 [R-12 fixed 2026-11-06] an Earthquake drawn in the same chamber is placed first, and the Spell then takes the last tunnel it left standing", () => {
    const s = spell([TUNNEL, TUNNEL], [HAZARD_EARTHQUAKE, HAZARD_SPELL]);
    applyHazards(s);
    expect(s.areas[1]!.flags & DESTROYED).toBe(DESTROYED);
    expect(remapped(s, 0)).toBe(true);
  });

  it("RC-HZ-S6 [R-12 fixed 2026-11-06] secret-door markers on the level below, at the far end of a stairway in the vanished tunnel, are removed", () => {
    const STAIR_DOWN_TUNNEL = 2 | 64;
    const s = spell([TUNNEL, STAIR_DOWN_TUNNEL]);
    s.areas.push({ ...area(TUNNEL, 1), coord: packCoord(2, 50, 51), mirroredStairs: 32, secretDoor: 0 });
    applyHazards(s);
    expect(remapped(s, 1)).toBe(true);
    expect(s.areas[3]!.secretDoor).toBeUndefined();
  });
});
