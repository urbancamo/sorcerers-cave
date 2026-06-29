/**
 * SpriteMaterial.rotation (radians, CCW) that orients a chevron sprite — whose
 * art points "up" (+Y screen) at rotation 0 — to point along the screen-space
 * vector (dx, dy). +dy is screen-up (matches THREE NDC, where y grows upward).
 *
 * atan2(dy, dx) is the vector's angle from +X. An up-pointing glyph is at +Y
 * (angle PI/2), so the rotation that aligns it with the vector is
 * atan2(dy,dx) - PI/2. Returns 0 for a zero-length vector.
 */
export function spriteRotationForScreenVector(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx) - Math.PI / 2;
}
