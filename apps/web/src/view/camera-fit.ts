/**
 * Distance from a perspective camera at which a sphere of `radius` fits within
 * BOTH axes of the frustum. `fovDeg` is the vertical FOV; `aspect` = width/height.
 * The horizontal half-FOV is atan(tan(vFov/2) * aspect); the binding axis is the
 * smaller half-angle (portrait → horizontal binds). dist = radius / sin(halfAngle).
 */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const vHalf = (fovDeg * Math.PI) / 180 / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 1e-6));
  const half = Math.min(vHalf, hHalf);
  return radius / Math.sin(half);
}
