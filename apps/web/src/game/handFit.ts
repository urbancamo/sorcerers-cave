// Sizing for the fight hand (Peter's 2026-10-21 impressions, R2.2, and his response of 2026-10-25): one row that never wraps or scrolls.
// A party of up to about 8 sits side by side, flat; cards shrink a little before they ever overlap. Only a larger party overlaps, each card
// over the one to its right so its top-left numbers stay visible, down to a legible stride; then the cards shrink further; and past that
// floor the overlap tightens rather than the row widening.
export const HAND_CARD = 116;          // a card's full width, as the plain fight card draws it
const GAP = 10;                        // space between full-size cards
const FLAT_GAP = 6;                    // space between cards shrunk to fit side by side
const FLAT_MIN = 100;                  // the narrowest a card gets while still side by side; below it the cards overlap instead
const READABLE_STRIDE = 0.45;          // the least stride, as a fraction of the card, before cards shrink instead
const MIN_CARD = 60;                   // the narrowest a card shrinks to
const MIN_STRIDE = 10;                 // the last resort, for a party far larger than the rules allow: a sliver of each card

export type HandFit = { cw: number; stride: number };

/** Card width and the distance from one card's left edge to the next, for `n` cards in `avail` px. */
export function handFit(avail: number, n: number): HandFit {
  if (n <= 1 || !(avail > 0)) return { cw: HAND_CARD, stride: HAND_CARD + GAP };
  if (n * HAND_CARD + (n - 1) * GAP <= avail) return { cw: HAND_CARD, stride: HAND_CARD + GAP };          // full size, side by side
  const flat = (avail - (n - 1) * FLAT_GAP) / n;
  if (flat >= FLAT_MIN) return { cw: Math.floor(flat), stride: Math.floor(flat) + FLAT_GAP };            // a little smaller, still side by side
  let cw = FLAT_MIN, stride = Math.min(cw + FLAT_GAP, (avail - cw) / (n - 1));                            // overlapping, at the flat size
  if (stride < cw * READABLE_STRIDE) {
    cw = Math.max(MIN_CARD, avail / (1 + READABLE_STRIDE * (n - 1)));                                     // too tight to read: shrink the cards
    stride = Math.max(MIN_STRIDE, Math.min(cw * READABLE_STRIDE, (avail - cw) / (n - 1)));
  }
  return { cw: Math.floor(cw), stride: Math.floor(stride) };
}
