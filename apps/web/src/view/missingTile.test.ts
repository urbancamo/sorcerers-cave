import { describe, it, expect } from "vitest";
import { showsFog, tileReplaced } from "./missingTile";

describe("showsFog: a dead end fogs, the BUG tile never does", () => {
  it("fogs a face-down dead end", () => { expect(showsFog({ faceDown: true })).toBe(true); });
  it("shows a face-up tile", () => { expect(showsFog({ faceDown: false })).toBe(false); });
  it("keeps the BUG placeholder up even when it is a dead end, so the evidence is not faded away", () => {
    expect(showsFog({ faceDown: true, missingArt: "card 42: exits EW, stair up" })).toBe(false);
  });
});

// Game APGV: a Spell drew a tunnel of the very same shape as the one it replaced, so the renderer saw no new tile and left the old one face up.
describe("tileReplaced: the Spell's new tile is noticed even when it looks the same", () => {
  const meshed = { tileId: "tunnel-ns", rot: 0 };
  it("notices a face-down tile of a different shape", () => {
    expect(tileReplaced(meshed, { tileId: "tunnel-ew", rot: 0, faceDown: true })).toBe(true);
  });
  it("notices a face-down tile of the same shape that has become unresolved", () => {
    expect(tileReplaced(meshed, { ...meshed, faceDown: true, unresolved: true })).toBe(true);
  });
  it("does not re-notice a replacement already drawn, or an ordinary dead end that merely fogs", () => {
    expect(tileReplaced({ ...meshed, unresolved: true }, { ...meshed, faceDown: true, unresolved: true })).toBe(false);
    expect(tileReplaced(meshed, { ...meshed, faceDown: true })).toBe(false);
  });
  it("ignores a face-up tile, and the BUG placeholder", () => {
    expect(tileReplaced(meshed, { tileId: "tunnel-ew", rot: 0, faceDown: false })).toBe(false);
    expect(tileReplaced(meshed, { ...meshed, faceDown: true, unresolved: true, missingArt: "card 42" })).toBe(false);
  });
});
