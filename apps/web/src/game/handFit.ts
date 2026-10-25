// Sizing for the fight hand (Peter's 2026-10-21 impressions, R2.2): one row that never wraps or scrolls. Cards keep their full size and
// sit side by side while they fit; then each overlaps the one to its right (so its top-left numbers stay visible), down to a legible
// stride; then the cards shrink; and past that floor the overlap tightens further rather than the row widening.
export const HAND_CARD = 116;          // a card's full width, as the plain fight card draws it
const GAP = 10;                        // space between cards that fit without overlap
const READABLE_STRIDE = 0.45;          // the least stride, as a fraction of the card, before cards shrink instead
const MIN_CARD = 60;                   // the narrowest a card shrinks to
const MIN_STRIDE = 10;                 // the last resort, for a party far larger than the rules allow: a sliver of each card

export type HandFit = { cw: number; stride: number };

/** Card width and the distance from one card's left edge to the next, for `n` cards in `avail` px. */
export function handFit(avail: number, n: number): HandFit {
  if (n <= 1 || !(avail > 0)) return { cw: HAND_CARD, stride: HAND_CARD + GAP };
  const fits = (cw: number, want: number): number => Math.min(want, (avail - cw) / (n - 1));
  let cw = HAND_CARD;
  let stride = fits(cw, cw + GAP);
  if (stride < cw * READABLE_STRIDE) {
    cw = Math.max(MIN_CARD, avail / (1 + READABLE_STRIDE * (n - 1)));
    stride = Math.max(MIN_STRIDE, fits(cw, cw * READABLE_STRIDE));
  }
  return { cw: Math.floor(cw), stride: Math.floor(stride) };
}
