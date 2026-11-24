import { describe, it, expect } from "vitest";
import { newGame } from "./setup";
import { redactState } from "./redact";

describe("redactState", () => {
  const full = newGame(7, [1, 7]);

  it("removes the seed and the card values but keeps the deck sizes and positions", () => {
    const r = redactState(full);
    expect(r.seed).toBe(0);
    expect(r.largePack).toHaveLength(full.largePack.length);
    expect(r.smallPack).toHaveLength(full.smallPack.length);
    expect(new Set(r.largePack)).toEqual(new Set([0]));
    expect(new Set(r.smallPack)).toEqual(new Set([0]));
    expect(r.largeIdx).toBe(full.largeIdx);
    expect(r.smallIdx).toBe(full.smallIdx);
  });

  it("leaves nothing else changed, and does not touch the original", () => {
    const before = JSON.stringify(full);
    const r = redactState(full);
    expect(JSON.stringify(full)).toBe(before);
    expect({ ...r, seed: full.seed, largePack: full.largePack, smallPack: full.smallPack }).toEqual(full);
  });

  it("drops a party's diceSeed (multiplayer) wherever it appears on the composed state", () => {
    const withDice = { ...full, diceSeed: 12345 } as typeof full & { diceSeed: number };
    expect("diceSeed" in redactState(withDice)).toBe(false);
  });
});
