import { describe, it, expect } from "vitest";
import { decodeArea } from "./decode";
import {
  AREA_CARDS,
  GATEWAY_INDEX,
  EXT_AREA_CARDS,
  SPECIAL_CHASM,
  SPECIAL_BELL_ROPE,
  SPECIAL_LAIR,
  SPECIAL_WHIRLPOOL,
  SPECIAL_GALLERY,
  SPECIAL_WELL,
} from "./data/areaCards";
import { smallPackTemplate } from "./data/smallPack";
import { smallPackExtension } from "./data/smallPack";
import { buildLargePack, buildSmallPack } from "./decks";
import { shuffle } from "./rng";
import {
  CREATURES,
  STARTING_STOCK,
  KIT_CREATURES,
  KIT_STARTING_STOCK,
  KIT_COST_OVERRIDES,
  selectionCost,
  startingStock,
  FLAG_HUMAN,
  FLAG_INHUMAN,
} from "./data/creatures";
import { TREASURES, KIT_TREASURES } from "./data/treasures";
import {
  HAZARD_NAMES,
  KIT_HAZARD_NAMES,
  HAZARD_DESERTION,
  HAZARD_HARPIES,
  HAZARD_QUARREL,
  HAZARD_SPELL,
} from "./data/hazards";

/**
 * Extension kit data tables + decode widening + deck integration (SC-EXT-2..4).
 *
 * Base game byte-identity is the hard rule (CLAUDE.md, task-3-brief): `data.test.ts` pins the
 * BASE tables (CREATURES len 14, TREASURES len 15, HAZARD_NAMES len 5) and must stay green
 * UNMODIFIED, so the new kit ids live in separate parallel tables (KIT_CREATURES/KIT_TREASURES/
 * KIT_HAZARD_NAMES) rather than growing the base exports — appended "after existing ranges" in
 * spirit (design §1.3) without touching the base arrays' shape.
 */
describe("extension-kit data tables (SC-EXT-2)", () => {
  it("kit creature rows 14-20 match the design table verbatim, in id order", () => {
    const rows = KIT_CREATURES.map((c) => [
      c.id, c.name, c.fs, c.mp, c.carry, c.cost, c.points, c.flags, c.hostileMax, c.indiffMax, c.leaderPri,
    ]);
    expect(rows).toEqual([
      [14, "Apprentice", 2, 7, 0, null, 0, FLAG_HUMAN, 5, 5, 10],
      [15, "Demon", 0, 6, 0, null, 0, FLAG_INHUMAN, 6, 6, 10],
      [16, "Lion", 3, 0, 0, 2, 3, FLAG_INHUMAN, 4, 5, 3],
      [17, "Scholar", 2, 1, 25, 3, 5, FLAG_HUMAN, 1, 4, 6],
      [18, "Witch", 1, 4, 0, 5, 10, FLAG_HUMAN, 2, 4, 6],
      [19, "Thief", 2, 0, 25, 3, 5, FLAG_HUMAN, 2, 4, 5],
      [20, "Wolf", 2, 0, 0, 1, 2, FLAG_INHUMAN, 4, 5, 2],
    ]);
    // Base CREATURES table is untouched (still exactly ids 0-13 — data.test.ts pins this).
    expect(CREATURES).toHaveLength(14);
  });

  it("kit treasure rows 15-21 match the design table verbatim, in id order", () => {
    const rows = KIT_TREASURES.map((t) => [t.id, t.name, t.points, t.weight, t.kind]);
    expect(rows).toEqual([
      [15, "Elixir", 0, 0, "artifact"],
      [16, "Holy Water", 5, 0, "artifact"],
      [17, "Magic Axe", 15, 0, "artifact"],
      [18, "Idol", 0, 25, "heavy"],
      [19, "Scroll", 0, 0, "artifact"],
      [20, "Magic Shield", 15, 0, "artifact"],
      [21, "Crypt/Gems", 20, 25, "heavy"],
    ]);
    // Base TREASURES table is untouched (still exactly ids 0-14 — data.test.ts pins this).
    expect(TREASURES).toHaveLength(15);
  });

  it("kit hazards 5-8 are Desertion/Harpies/Quarrel/Spell; base HAZARD_NAMES untouched", () => {
    expect(KIT_HAZARD_NAMES).toEqual(["Desertion", "Harpies", "Quarrel", "Spell"]);
    expect(HAZARD_DESERTION).toBe(5);
    expect(HAZARD_HARPIES).toBe(6);
    expect(HAZARD_QUARREL).toBe(7);
    expect(HAZARD_SPELL).toBe(8);
    // Base HAZARD_NAMES tuple is untouched (still exactly 5 — data.test.ts pins this).
    expect(HAZARD_NAMES).toHaveLength(5);
  });

  it("KIT_STARTING_STOCK / KIT_COST_OVERRIDES match the design table verbatim", () => {
    expect(KIT_STARTING_STOCK).toEqual({ 16: 1, 17: 1, 18: 3, 19: 1, 20: 1, 6: 1, 7: 1 });
    expect(KIT_COST_OVERRIDES).toEqual({ 2: 4, 3: 3 });
  });
});

describe("selection helpers (SC-EXT-2, variant-aware)", () => {
  it("selectionCost returns base costs unchanged when the kit is off", () => {
    expect(selectionCost(2)).toBe(5); // Ogre, base
    expect(selectionCost(3)).toBe(4); // Troll, base
  });

  it("selectionCost applies the Ogre/Troll kit-on revision, and resolves kit creature costs", () => {
    const kit = { extensionKit: true };
    expect(selectionCost(2, kit)).toBe(4); // Ogre 5→4
    expect(selectionCost(3, kit)).toBe(3); // Troll 4→3
    expect(selectionCost(18, kit)).toBe(5); // Witch (unaffected by the override map)
    expect(selectionCost(14, kit)).toBeNull(); // Apprentice: never selectable
  });

  it("startingStock() equals STARTING_STOCK; startingStock(kit) merges the kit additions", () => {
    expect(startingStock()).toEqual(STARTING_STOCK);
    expect(startingStock({})).toEqual(STARTING_STOCK);
    const stock = startingStock({ extensionKit: true });
    expect(stock[16]).toBe(1); // Lion
    expect(stock[17]).toBe(1); // Scholar
    expect(stock[18]).toBe(3); // Witch
    expect(stock[19]).toBe(1); // Thief
    expect(stock[20]).toBe(1); // Wolf
    expect(stock[6]).toBe(4); // Woman 3→4
    expect(stock[7]).toBe(4); // Dwarf 3→4
    // Untouched base entries still present.
    expect(stock[0]).toBe(STARTING_STOCK[0]);
    expect(stock[5]).toBe(STARTING_STOCK[5]);
  });
});

describe("decode widening to a 4-bit special field (SC-EXT-3)", () => {
  it("all 61 base AREA_CARDS decode identically under the widened (& 15) mask as under the old (& 7) mask", () => {
    const oldDecode = (value: number) => ({
      n: (value & 1) !== 0,
      e: (value & 2) !== 0,
      s: (value & 4) !== 0,
      w: (value & 8) !== 0,
      chamber: (value & 16) !== 0,
      stairUp: (value & 32) !== 0,
      stairDown: (value & 64) !== 0,
      special: (value >> 7) & 7,
    });
    expect(AREA_CARDS.map(decodeArea)).toEqual(AREA_CARDS.map(oldDecode));
  });

  it("EXT_AREA_CARDS has exactly 30 tiles", () => {
    expect(EXT_AREA_CARDS).toHaveLength(30);
  });

  it("x04-1 (EXT_AREA_CARDS[12]) is a NW TUNNEL — the QFAR misclassification fix", () => {
    // The art is a bent NW corridor (passage-width throughout; the wall grate is décor, not a
    // room). It was wrongly encoded as a chamber, which dealt chamber cards — Ghouls in a
    // tunnel (docs/bugs/QFAR-log.json). Manifest tileType and this encoding must both say tunnel.
    expect(EXT_AREA_CARDS[12]).toBe(9); // N(1) + W(8), no chamber bit
    expect(decodeArea(EXT_AREA_CARDS[12]!)).toEqual({
      n: true, e: false, s: false, w: true,
      chamber: false, stairUp: false, stairDown: false, special: 0,
    });
  });

  it("decodeArea(799) is a NESW chamber with special 6 (Chasm, tile x06-2)", () => {
    expect(decodeArea(799)).toEqual({
      n: true, e: true, s: true, w: true,
      chamber: true, stairUp: false, stairDown: false, special: SPECIAL_CHASM,
    });
  });

  it("decodeArea(1439) is a NESW chamber with special 11 (Well, tile x07-4)", () => {
    expect(decodeArea(1439)).toEqual({
      n: true, e: true, s: true, w: true,
      chamber: true, stairUp: false, stairDown: false, special: SPECIAL_WELL,
    });
  });

  it("decodeArea(39) is a NES stairUp tunnel (tile x02-1)", () => {
    expect(decodeArea(39)).toEqual({
      n: true, e: true, s: true, w: false,
      chamber: false, stairUp: true, stairDown: false, special: 0,
    });
  });

  it("decodes the remaining new specials (Bell Rope 7, Lair 8, Whirlpool 9, Gallery 10) as NESW chambers", () => {
    expect(decodeArea(927).special).toBe(SPECIAL_BELL_ROPE); // tile x06-4
    expect(decodeArea(1055).special).toBe(SPECIAL_LAIR); // tile x07-1
    expect(decodeArea(1183).special).toBe(SPECIAL_WHIRLPOOL); // tile x07-2
    expect(decodeArea(1311).special).toBe(SPECIAL_GALLERY); // tile x07-3
    for (const v of [927, 1055, 1183, 1311]) {
      expect(decodeArea(v)).toMatchObject({ n: true, e: true, s: true, w: true, chamber: true });
    }
  });
});

describe("small-pack extension (SC-EXT-2)", () => {
  it("smallPackTemplate stays 71 cards — unchanged by the kit", () => {
    expect(smallPackTemplate()).toHaveLength(71);
  });

  it("smallPackExtension is exactly 30 codes, with the right duplicate counts", () => {
    const ext = smallPackExtension();
    expect(ext).toHaveLength(30);
    const count = (code: number) => ext.filter((c) => c === code).length;
    expect(count(118)).toBe(3); // Witch ×3
    expect(count(201)).toBe(3); // Gold ×3 (kit copies)
    expect(count(200)).toBe(3); // Silver ×3 (kit copies)
  });
});

describe("deck-as-gate composition (SC-EXT-4)", () => {
  it("kit off: buildSmallPack/buildLargePack are 71/60 and byte-identical to a direct pre-kit shuffle", () => {
    const seed = 918273;
    const small = buildSmallPack(seed);
    expect(small.pack).toHaveLength(71);
    expect(small.pack).toEqual(shuffle(seed, smallPackTemplate()).result);

    const large = buildLargePack(seed);
    expect(large.pack).toHaveLength(60);
    const baseAreaValues = AREA_CARDS.filter((_, i) => i !== GATEWAY_INDEX);
    expect(large.pack).toEqual(shuffle(seed, baseAreaValues).result);
  });

  it("kit on: buildSmallPack is 101 cards, buildLargePack is 90 cards", () => {
    const seed = 918273;
    const kit = { extensionKit: true };
    expect(buildSmallPack(seed, kit).pack).toHaveLength(101);
    expect(buildLargePack(seed, kit).pack).toHaveLength(90);
  });
});
