import { describe, it, expect } from "vitest";
import { showsFog } from "./missingTile";

describe("showsFog: a dead end fogs, the BUG tile never does", () => {
  it("fogs a face-down dead end", () => { expect(showsFog({ faceDown: true })).toBe(true); });
  it("shows a face-up tile", () => { expect(showsFog({ faceDown: false })).toBe(false); });
  it("keeps the BUG placeholder up even when it is a dead end, so the evidence is not faded away", () => {
    expect(showsFog({ faceDown: true, missingArt: "card 42: exits EW, stair up" })).toBe(false);
  });
});
