import { describe, it, expect } from "vitest";
import { handFit, HAND_CARD } from "./handFit";

const rowWidth = (avail: number, n: number): number => { const f = handFit(avail, n); return f.cw + (n - 1) * f.stride; };
const PANEL = 894;   // the hand's inner width in the 960 px fight panel

describe("handFit", () => {
  it("keeps full-size cards side by side while they fit", () => {
    const f = handFit(900, 4);
    expect(f.cw).toBe(HAND_CARD);
    expect(f.stride).toBeGreaterThanOrEqual(HAND_CARD);
  });

  it("seats a party of 8 side by side in the full panel, a little smaller if need be, with no overlap", () => {
    for (let n = 1; n <= 8; n++) {
      const f = handFit(PANEL, n);
      expect(f.stride, `${n} cards`).toBeGreaterThanOrEqual(f.cw);
      expect(f.cw, `${n} cards`).toBeGreaterThanOrEqual(100);
    }
  });

  it("starts to overlap only past about 8 cards, and then each card hides part of its neighbour", () => {
    expect(handFit(PANEL, 9).stride).toBeGreaterThanOrEqual(handFit(PANEL, 9).cw - 2);   // touching, at most
    const twelve = handFit(PANEL, 12);
    expect(twelve.stride).toBeLessThan(twelve.cw * 0.9);
    expect(twelve.stride).toBeGreaterThanOrEqual(twelve.cw * 0.45);
  });

  it("shrinks the cards when overlap alone would hide their numbers", () => {
    const f = handFit(600, 14);
    expect(f.cw).toBeLessThan(100);
    expect(f.cw).toBeGreaterThanOrEqual(60);
  });

  it("never widens the row past the space it was given, however many cards", () => {
    for (const avail of [320, 360, 600, PANEL]) for (let n = 1; n <= 24; n++) expect(rowWidth(avail, n), `${avail}/${n}`).toBeLessThanOrEqual(avail);
  });

  it("falls back to natural size when the space is unknown", () => {
    expect(handFit(0, 5)).toEqual({ cw: HAND_CARD, stride: HAND_CARD + 10 });
  });
});
