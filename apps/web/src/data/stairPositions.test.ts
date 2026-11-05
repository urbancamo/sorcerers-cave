import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { stairAt } from "./stairPositions";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, "../../../../docs/assets/manifest.json"), "utf8"));
const tiles = manifest.categories.tiles.items as { file: string; special: string | null; stairUp: boolean; stairDown: boolean }[];

describe("stair marker positions", () => {
  it("covers every ordinary tile with a stair, in the direction the manifest says", () => {
    for (const t of tiles.filter((x) => x.special === null && (x.stairUp || x.stairDown))) {
      if (t.stairUp) expect(stairAt(t.file, "U"), `${t.file} up`).not.toBeNull();
      if (t.stairDown) expect(stairAt(t.file, "D"), `${t.file} down`).not.toBeNull();
    }
  });
  it("has no position for a stair the tile doesn't have, and keeps each within the tile", () => {
    for (const t of tiles) {
      if (!t.stairUp) expect(stairAt(t.file, "U")).toBeNull();
      if (!t.stairDown) expect(stairAt(t.file, "D")).toBeNull();
      for (const d of ["U", "D"] as const) { const at = stairAt(t.file, d); if (at) at.forEach((v) => { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }); }
    }
  });
  it("accepts a served path and an unknown tile", () => {
    expect(stairAt("/assets/tiles/area-tile-s03-2.png", "U")).toEqual([0.35, 0.41]);
    expect(stairAt(undefined, "D")).toBeNull();
  });
});
