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

let strict = false;
/** Make a missing tile throw instead of drawing the placeholder. On in tests; off in the app. */
export function setStrictTileArt(on: boolean): void { strict = on; }

/** Report a missing tile: throws in strict mode, otherwise logs. The caller then draws the placeholder. */
export function reportMissingTileArt(detail: string): void {
  const err = new MissingTileArtError(detail);
  if (strict) throw err;
  console.error(err.message);
}
