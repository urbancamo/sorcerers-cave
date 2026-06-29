import { describe, it, expect } from "vitest";
import { spriteRotationForScreenVector } from "./billboard";

// A sprite texture whose chevron points "up" (+Y screen) sits at rotation 0.
// spriteRotationForScreenVector returns the SpriteMaterial.rotation (radians, CCW)
// needed to make that chevron point along the screen-space vector (dx, dy),
// where +dy is screen-up (NDC convention).
describe("spriteRotationForScreenVector", () => {
  it("points up when the vector is straight up", () => {
    expect(spriteRotationForScreenVector(0, 1)).toBeCloseTo(0, 5);
  });
  it("points right when the vector is to the right", () => {
    // pointing right = rotate the up-chevron clockwise 90° = -PI/2
    expect(spriteRotationForScreenVector(1, 0)).toBeCloseTo(-Math.PI / 2, 5);
  });
  it("points down when the vector is straight down", () => {
    expect(Math.abs(spriteRotationForScreenVector(0, -1))).toBeCloseTo(Math.PI, 5);
  });
  it("returns 0 for a degenerate (zero-length) vector", () => {
    expect(spriteRotationForScreenVector(0, 0)).toBe(0);
  });
});
