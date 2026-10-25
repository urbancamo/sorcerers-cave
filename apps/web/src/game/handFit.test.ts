import { describe, it, expect } from "vitest";
import { handFit, HAND_CARD } from "./handFit";

const rowWidth = (avail: number, n: number): number => { const f = handFit(avail, n); return f.cw + (n - 1) * f.stride; };

describe("handFit", () => {
  it("keeps full-size cards side by side while they fit", () => {
    const f = handFit(900, 4);
    expect(f.cw).toBe(HAND_CARD);
    expect(f.stride).toBeGreaterThanOrEqual(HAND_CARD);
  });

  it("overlaps cards, still at full size, before it shrinks them", () => {
    const f = handFit(600, 8);
    expect(f.cw).toBe(HAND_CARD);
    expect(f.stride).toBeLessThan(HAND_CARD);
    expect(f.stride).toBeGreaterThanOrEqual(HAND_CARD * 0.45);
  });

  it("shrinks the cards when overlap alone would hide their numbers", () => {
    const f = handFit(600, 14);
    expect(f.cw).toBeLessThan(HAND_CARD);
    expect(f.cw).toBeGreaterThanOrEqual(60);
  });

  it("never widens the row past the space it was given, however many cards", () => {
    for (const avail of [320, 360, 600, 900]) for (let n = 1; n <= 24; n++) expect(rowWidth(avail, n)).toBeLessThanOrEqual(avail);
  });

  it("falls back to natural size when the space is unknown", () => {
    expect(handFit(0, 5)).toEqual({ cw: HAND_CARD, stride: HAND_CARD + 10 });
  });
});
