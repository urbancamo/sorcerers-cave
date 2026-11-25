/**
 * A placed area whose doorways, stairs and special type match no tile artwork is an ENGINE or DATA BUG (a card the deck does not
 * hold, or art missing from the manifest). It used to be hidden by drawing the first tile in the manifest, which showed a wrong
 * corridor (issue #120). Now it is loud:
 *  - tests (strict, set in the test setup) throw `MissingTileArtError`, so a state that cannot be drawn fails the build;
 *  - the app logs the error and draws a placeholder tile (see `missingTileTexture` in cave3d.js) that cannot be mistaken for real art.
 */
export const MISSING_TILE_ID = "missing-tile-art";

export class MissingTileArtError extends Error {
  constructor(detail: string) {
    super(`No tile art matches this area (${detail}). This is a bug in the engine or the art manifest.`);
    this.name = "MissingTileArtError";
  }
}

/** Does this area draw as a face-down fog card? A dead end normally does (revealed for a moment, then fogged), but the BUG placeholder stays up for good:
 *  it must be seen, and a bug report is worth nothing if the evidence fades away. */
export const showsFog = (area: { faceDown: boolean; missingArt?: string }): boolean => area.faceDown && !area.missingArt;

/** Did the Spell replace the tile the mesh `old` was built for with `now`? It shows as a face-down card either way, and a new tile identity is the
 *  old signal; but the replacement can be a tile of the very same shape (the deck holds several identical tunnels), so the tile also counts as
 *  replaced when it has become unresolved since the mesh was built. Without that the old face-up tile stayed on screen and the Spell seemed to do nothing. */
export const tileReplaced = (
  old: { tileId: string; rot: number; unresolved?: boolean },
  now: { tileId: string; rot: number; unresolved?: boolean; faceDown: boolean; missingArt?: string },
): boolean => showsFog(now) && (now.tileId !== old.tileId || now.rot !== old.rot || (!!now.unresolved && !old.unresolved));

let strict = false;
/** Make a missing tile throw instead of drawing the placeholder. On in tests; off in the app. */
export function setStrictTileArt(on: boolean): void { strict = on; }

/** Report a missing tile: throws in strict mode, otherwise logs. The caller then draws the placeholder. */
export function reportMissingTileArt(detail: string): void {
  const err = new MissingTileArtError(detail);
  if (strict) throw err;
  console.error(err.message);
}
