import { describe, it, expect } from "vitest";
import { fitDistance } from "./camera-fit";

// Distance at which a sphere of the given radius is fully visible for a
// perspective camera. For aspect < 1 (portrait) the horizontal FOV is the
// limiting axis, so the distance must be LARGER than for aspect 1.
describe("fitDistance", () => {
  it("matches the vertical-FOV formula on a square viewport", () => {
    const r = 5, fov = 30, aspect = 1;
    const expected = r / Math.sin((fov * Math.PI) / 180 / 2);
    expect(fitDistance(r, fov, aspect)).toBeCloseTo(expected, 4);
  });
  it("requires more distance in portrait than in landscape", () => {
    const portrait = fitDistance(5, 30, 0.46);
    const landscape = fitDistance(5, 30, 2.17);
    expect(portrait).toBeGreaterThan(landscape);
  });
  it("never returns less than the square-viewport distance", () => {
    const square = fitDistance(5, 30, 1);
    expect(fitDistance(5, 30, 0.5)).toBeGreaterThanOrEqual(square);
  });
});
