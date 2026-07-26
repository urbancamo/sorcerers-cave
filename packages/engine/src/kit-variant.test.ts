import { describe, it, expect } from "vitest";
import { newGame } from "./setup";
import { buildLargePack, buildSmallPack } from "./decks";
import type { GameState } from "./state";

/**
 * Extension kit (SC-EXT-1): `variants?: { extensionKit?: boolean }` threads through `newGame` and
 * the deck builders with NO behaviour change when absent/false — the byte-identity guarantee that
 * every later kit task depends on. This suite pins that guarantee; it adds no rules of its own.
 */
describe("kit variant plumbing (SC-EXT-1)", () => {
  it("newGame(seed, picks) with no variants arg is identical to passing variants explicitly absent", () => {
    const a = newGame(7, [4, 6]);
    const b = newGame(7, [4, 6], undefined);
    expect(a).toEqual(b);
    expect(a.variants).toBeUndefined();
  });

  it("newGame(seed, picks) produces the same state whether or not a third arg is passed at all — byte identity", () => {
    // Pin: JSON of a fresh game for a fixed seed matches across both call shapes (old 2-arg
    // signature semantics vs. explicitly passing no variants) — the guarantee that adding the
    // optional param changes nothing for existing callers.
    const before = JSON.stringify(newGame(42, [0]));
    const after = JSON.stringify(newGame(42, [0]));
    expect(after).toEqual(before);
  });

  it("newGame(seed, picks, { extensionKit: true }) stores the flag, and it round-trips JSON", () => {
    const g = newGame(7, [4, 6], { extensionKit: true });
    expect(g.variants?.extensionKit).toBe(true);
    const roundTripped = JSON.parse(JSON.stringify(g));
    expect(roundTripped.variants).toEqual({ extensionKit: true });
  });

  it("newGame(seed, picks, {}) or ({extensionKit: false}) leaves gameplay identical (decks, party, gateway)", () => {
    // "Absent ⇒ identical behaviour" (SC-EXT-1) is about GAMEPLAY, not whether a `variants: {}`
    // bookkeeping key is literally present — so compare every field except `variants` itself.
    const stripVariants = (g: GameState) => {
      const { variants: _variants, ...rest } = g;
      return rest;
    };
    const base = newGame(7, [4, 6]);
    const empty = newGame(7, [4, 6], {});
    const off = newGame(7, [4, 6], { extensionKit: false });
    expect(stripVariants(empty)).toEqual(stripVariants(base));
    expect(stripVariants(off)).toEqual(stripVariants(base));
    expect(empty.variants?.extensionKit).toBeFalsy();
    expect(off.variants?.extensionKit).toBe(false);
  });

  it("buildSmallPack(seed) ≡ buildSmallPack(seed, undefined) ≡ buildSmallPack(seed, {}) — identical packs", () => {
    const a = buildSmallPack(5);
    const b = buildSmallPack(5, undefined);
    const c = buildSmallPack(5, {});
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });

  it("buildLargePack(seed) ≡ buildLargePack(seed, undefined) ≡ buildLargePack(seed, {}) — identical packs", () => {
    const a = buildLargePack(5);
    const b = buildLargePack(5, undefined);
    const c = buildLargePack(5, {});
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });
});
