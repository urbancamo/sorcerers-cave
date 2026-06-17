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
});

describe("areaKey", () => {
  it("keys by level,col,row", () => {
    expect(areaKey(2, 51, 49)).toBe("2,51,49");
  });
});
