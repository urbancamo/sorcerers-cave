// Where each tile's stairwell is drawn on its art, as a fraction of the tile (x from the left, y from the top), measured from the
// card images. The up/down stair markers sit over these so they point at the staircase itself. An up stair is the middle of its steps
// (the door that tops them is just beyond). Tiles are used as printed (never rotated or mirrored), so no transform is needed.
// Not listed: a tile's stair with no art here (the Gateway's, or a return stair the engine adds at a hidden end) — the marker then
// keeps its corner of the tile.
type At = readonly [x: number, y: number];
const STAIRS: Record<string, { up?: At; down?: At }> = {
  "area-tile-s01-3.png": { down: [0.34, 0.54] },
  "area-tile-s03-1.png": { down: [0.34, 0.63] },
  "area-tile-s03-2.png": { up: [0.35, 0.41] },
  "area-tile-s04-3.png": { down: [0.5, 0.54] },
  "area-tile-s06-4.png": { down: [0.5, 0.5] },
  "area-tile-s07-1.png": { up: [0.66, 0.36] },
  "area-tile-s07-2.png": { up: [0.66, 0.41], down: [0.34, 0.63] },
  "area-tile-s07-3.png": { up: [0.34, 0.41] },
  "area-tile-s08-2.png": { down: [0.34, 0.54] },
  "area-tile-s10-4.png": { down: [0.66, 0.63] },
  "area-tile-s11-1.png": { up: [0.69, 0.41] },
  "area-tile-s12-4.png": { down: [0.34, 0.66] },
  "area-tile-s13-1.png": { up: [0.5, 0.59] },
  "area-tile-s13-4.png": { down: [0.66, 0.63] },
  "area-tile-s15-4.png": { down: [0.69, 0.7] },
};

/** The stairwell's place on a tile's art (`file` may be a path), or null when it isn't known. `dir` is the stair marker's "U" or "D". */
export function stairAt(file: string | undefined, dir: "U" | "D"): At | null {
  const name = file?.split("/").pop() ?? "";
  return STAIRS[name]?.[dir === "U" ? "up" : "down"] ?? null;
}
