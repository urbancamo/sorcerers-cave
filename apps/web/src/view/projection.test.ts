import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AssetManifest } from "@sorcerers-cave/assets";
import { newGame, packCoord, type GameState, type PlacedArea } from "@sorcerers-cave/engine";
import { parseManifest, type TileArt, type CardArt } from "../data/manifest";
import { projectArea, encodeWorkingSet, areaKey, type ArtTables } from "./projection";

let art: ArtTables;
beforeAll(() => {
  const m = JSON.parse(readFileSync(resolve(process.cwd(), "../../docs/assets/manifest.json"), "utf8")) as AssetManifest;
  const { tiles, cards } = parseManifest(m);
  art = { tiles, cards };
});

const area = (over: Partial<PlacedArea>): PlacedArea => ({
  card: 175, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0, ...over,
});

describe("projectArea", () => {
  it("shows treasure dropped into a Deep Pool on the area's floor", () => {
    const state = newGame(1, [0]);
    const pool = area({ dropped: [1, 2] }); // Gold + Gems jettisoned into the pool
    const a = projectArea(pool, 0, state, art);
    expect(a.treasure.map((c) => c.entityId).sort()).toEqual(["1", "2"]);
  });

  it("shows a permanent hazard scar (Earthquake marker) on the tile", () => {
    const state = newGame(1, [0]);
    const scarred = area({ markers: [300 + 2] }); // Earthquake (hazard id 2)
    const a = projectArea(scarred, 0, state, art);
    expect(a.hazards.some((c) => c.category === "hazard")).toBe(true);
  });

  it("projects the gateway with resolved art and view coords", () => {
    const state = newGame(1, [0]);
    const a = projectArea(state.areas[0]!, 0, state, art);
    expect(a.level).toBe(1);
    expect(a.col).toBe(50);
    expect(a.row).toBe(50);
    expect(a.special).toBe("gateway");
    expect(a.up).toBe(true);            // gateway card 175 has stairUp
    expect(a.exits).toBe("NESW");
    expect(typeof a.tileId).toBe("string");
    expect([0, 90, 180, 270]).toContain(a.rot);
    expect(a.party).toBe(true);          // party stands on the gateway
  });

  it("marks faceDown and party correctly", () => {
    const state = newGame(1, [0]);
    const down = projectArea(area({ faceUp: false, coord: packCoord(2, 50, 50) }), 5, state, art);
    expect(down.faceDown).toBe(true);
    expect(down.party).toBe(false);      // idx 5 !== partyArea 0
    expect(down.level).toBe(2);
  });

  it("flags an earthquake-collapsed area as destroyed", () => {
    const state = newGame(1, [0]);
    expect(projectArea(area({}), 0, state, art).destroyed).toBe(false);
    expect(projectArea(area({ flags: 4 }), 1, state, art).destroyed).toBe(true); // AF_DESTROYED
  });

  it("exposes a mirrored return-stair + secret-door marker so the renderer can draw the connector", () => {
    const state = newGame(1, [0]);
    // A tile that gained a mirrored stair-down on an up-move into it (card 31 NSEWC | 64 stair-down),
    // flagged mirroredStairs=64 with the second secret-door marker.
    const mirrored = area({ card: 31 | 64, coord: packCoord(1, 50, 49), mirroredStairs: 64, secretDoor: 1 });
    const a = projectArea(mirrored, 1, state, art);
    // The stair connector and marker are driven by these ports, not by tile art.
    expect(a.down).toBe(true);       // rebuildStairs draws a connector to the area below
    expect(a.up).toBe(false);
    expect(a.secretDoor).toBe(1);    // rebuildSecretDoors lays the lettered marker
    // The mirrored stair is a connectivity link, not printed art (SC-6.1-16): tile selection ignores it,
    // so the chosen tile is the same as the un-mirrored chamber's.
    const plain = projectArea(area({ card: 31, coord: packCoord(1, 50, 49) }), 1, state, art);
    expect(a.tileId).toBe(plain.tileId);
    expect(a.rot).toBe(plain.rot);
  });

  it("projects persisted floor contents into typed card lanes", () => {
    const state = newGame(1, [0]);
    // a chamber tile (bit16) with a creature (Dragon id10), a treasure (Magic Sword id3 = artifact), a hazard (id0)
    const a = projectArea(area({ card: 16 | 2, contents: [100 + 10, 200 + 3, 300 + 0] }), 1, state, art);
    expect(a.strangers.map((c) => c.name)).toContain("Dragon");
    expect(a.treasure.find((c) => c.name === "Magic Sword")?.category).toBe("artifact");
    expect(a.hazards.length).toBe(1);
    // unique ids even for repeats
    const dup = projectArea(area({ card: 16, contents: [100 + 10, 100 + 10] }), 1, state, art);
    expect(new Set(dup.strangers.map((c) => c.id)).size).toBe(2);
    // …each duplicate shows its OWN card art (the manifest has 3 distinct Dragon images)
    expect(dup.strangers[0]!.file).not.toBe(dup.strangers[1]!.file);
    expect(new Set(dup.strangers.map((c) => c.file)).size).toBe(2);
  });

  it("renders a Dragon asleep on the party's tile while the Charmed Flute is held", () => {
    const state = newGame(1, [0]); // Hero (eligible flute player), partyArea 0
    const dragon = (idx: number) =>
      projectArea(area({ card: 16, contents: [100 + 10] }), idx, state, art).strangers[0]!;
    state.party[0]!.treasure = [12]; // Charmed Flute
    expect(dragon(0).asleep).toBe(true); // party's tile + Flute held → asleep (Zzz)
    expect(dragon(1).asleep).toBe(false); // a different tile → awake (the charm is local to the party)
    state.party[0]!.treasure = []; // drop the Flute
    expect(dragon(0).asleep).toBe(false); // no Flute → awake again
  });
});

describe("encodeWorkingSet", () => {
  it("encodes the live working set to 100/200/300 codes", () => {
    const s = { strangers: [10, 5], treasures: [3], hazards: [0] } as unknown as GameState;
    expect(encodeWorkingSet(s)).toEqual([110, 105, 203, 300]);
  });

  it("encodes live Gallery statues to 500+id codes (SC-EXT-10, carry-forward)", () => {
    const s = { strangers: [], treasures: [], hazards: [], statues: [18, 20] } as unknown as GameState;
    expect(encodeWorkingSet(s)).toEqual([518, 520]);
  });
});

describe("extension kit specials (Part 2 US-02..07)", () => {
  const specialKeys = ["chasm", "bell-rope", "lair", "whirlpool", "gallery", "well"];

  it.each([
    [6, "chasm", "The Chasm"],
    [7, "bell-rope", "The Bell Rope"],
    [8, "lair", "The Lair"],
    [9, "whirlpool", "The Whirlpool"],
    [10, "gallery", "The Gallery"],
    [11, "well", "The Well"],
  ])("resolves special code %i to '%s' art key and display name %s", (code, key, displayName) => {
    const state = newGame(1, [0]);
    // A chamber (bit16) card whose special nibble is `code` — bits 7-10 (mask 15, SC-EXT-1 width).
    const a = projectArea(area({ card: 16 | (code << 7) }), 0, state, art);
    expect(a.special).toBe(key);
    expect(a.name).toBe(displayName);
    expect(specialKeys).toContain(a.special);
  });

  it("projects a Gallery statue (500+id) as a stone creature card", () => {
    const state = newGame(1, [0]);
    const a = projectArea(area({ card: 16, contents: [500 + 18] }), 0, state, art); // Witch, stoned
    expect(a.strangers).toHaveLength(1);
    expect(a.strangers[0]!.stone).toBe(true);
    expect(a.strangers[0]!.asleep).toBe(false); // distinct overlay from Lotus Dust sleep
    expect(a.strangers[0]!.entityId).toBe("18");
  });

  it("categorizes a kit artifact as 'artifact', not 'treasure' (found via the manual smoke test)", () => {
    const state = newGame(1, [0]);
    // Magic Axe (kit treasure 17, an artifact) — the base-only TREASURES table lookup used to miss
    // every kit id and silently fall back to the plain "treasure" category.
    const a = projectArea(area({ card: 16, contents: [200 + 17] }), 0, state, art);
    expect(a.treasure[0]!.category).toBe("artifact");
    // A kit heavy treasure (Idol, 18) correctly stays "treasure" (not an artifact).
    const idol = projectArea(area({ card: 16, contents: [200 + 18] }), 0, state, art);
    expect(idol.treasure[0]!.category).toBe("treasure");
  });

  it("shows a parked Crypt lurking on its floor as the Crypt/Gems card (SC-EXT-13, design US-08)", () => {
    const state = { ...newGame(1, [0]), cryptCoord: 12345 } as unknown as GameState;
    const parked = projectArea(area({ coord: 12345 }), 1, state, art);
    expect(parked.treasure.some((c) => c.entityId === "21")).toBe(true);
    // A different area — the crypt doesn't lurk everywhere.
    const elsewhere = projectArea(area({ coord: 99999 }), 1, state, art);
    expect(elsewhere.treasure.some((c) => c.entityId === "21")).toBe(false);
    // Once resolved (cryptCoord cleared, whatever the roll), it no longer lurks.
    const resolved = { ...state, cryptCoord: undefined } as unknown as GameState;
    expect(projectArea(area({ coord: 12345 }), 1, resolved, art).treasure).toHaveLength(0);
  });

  it("renders a Spell-remapped (AF_UNRESOLVED) area face-down even though faceUp is true (SC-EXT-28)", () => {
    const state = newGame(1, [0]);
    const remapped = area({ faceUp: true, visited: false, flags: 16 }); // AF_UNRESOLVED = 16
    expect(projectArea(remapped, 1, state, art).faceDown).toBe(true);
    // Once resolved (the flag cleared on a genuine forward entry), it renders normally again.
    const resolved = area({ faceUp: true, visited: true, flags: 0 });
    expect(projectArea(resolved, 1, state, art).faceDown).toBe(false);
  });
});

describe("areaKey", () => {
  it("keys by level,col,row", () => {
    expect(areaKey(2, 51, 49)).toBe("2,51,49");
  });
});
