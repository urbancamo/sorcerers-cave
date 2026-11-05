// Alpha key for area-tile art. The tile PNGs are opaque RGB painted on black, so the cave shape is cut out by
// making the black *around* the art transparent. Only near-black pixels connected to the image border are
// keyed: black painted inside the art (a pit, dark water, a shadow) is part of the tile and stays opaque.
//
// The flood runs through near-black only (the surround is exactly 0, its anti-aliased fringe a few levels up).
// Flooding through everything "dark" leaks along the mortar seams between the rim bricks and into the shadowed
// band between rim and floor (lum 20-50), which then shows as a see-through gap.
export const FLOOD_MAX = 8;  // luminance at or below this, connected to the border, is outside
export const FEATHER_LO = 12; // the one-pixel fringe next to the outside fades in between these luminances
export const FEATHER_HI = 48;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const luminance = (d: Uint8ClampedArray, i: number) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];

/** Rewrite the alpha channel of RGBA `data` (w x h) in place. */
export function keyOutsideAlpha(data: Uint8ClampedArray, w: number, h: number): void {
  const n = w * h;
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  // Seed from every near-black pixel on the border, then spread through near-black pixels (4-connected, so a
  // one-pixel diagonal gap in the art's edging doesn't leak the key into the interior).
  const seed = (p: number) => {
    if (!outside[p] && luminance(data, p * 4) <= FLOOD_MAX) { outside[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop() as number;
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < n - w) seed(p + w);
  }
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (outside[p]) { data[i + 3] = 0; continue; }
    const x = p % w;
    const touches = (x > 0 && outside[p - 1]) || (x < w - 1 && outside[p + 1]) ||
                    (p >= w && outside[p - w]) || (p < n - w && outside[p + w]);
    // Only the pixel right at the edge is feathered; everything further in is opaque.
    data[i + 3] = touches ? Math.round(255 * smooth(FEATHER_LO, FEATHER_HI, luminance(data, i))) : 255;
  }
}
