import { describe, it, expect } from "vitest";
import { memberLabels, memberLabel } from "./memberLabels";

const m = (creatureId: number) => ({ creatureId }); // ids: Hero 0, Priest 4, Man 5, Wizard 8

describe("memberLabels (party-wide #N disambiguation)", () => {
  it("leaves a class with a single member unnumbered", () => {
    expect(memberLabels([m(0), m(4), m(8)])).toEqual(["Hero", "Priest", "Wizard"]);
  });

  it("numbers every copy of a duplicated class by party order (#1, #2, …)", () => {
    // two Priests and two Men, interleaved with a lone Hero
    expect(memberLabels([m(4), m(5), m(4), m(5), m(0)])).toEqual([
      "Priest #1", "Man #1", "Priest #2", "Man #2", "Hero",
    ]);
  });

  it("memberLabel returns the stable label for a party index", () => {
    const party = [m(5), m(5)];
    expect(memberLabel(party, 0)).toBe("Man #1");
    expect(memberLabel(party, 1)).toBe("Man #2");
  });

  it("falls back for an out-of-range index", () => {
    expect(memberLabel([m(0)], 5)).toBe("a companion");
  });

  it("resolves kit creature ids (SC-EXT-29) — not the '?' base-table fallback", () => {
    // Witch 18, Wolf 20 — kit-only ids, single copies each.
    expect(memberLabels([m(18), m(20)])).toEqual(["Witch", "Wolf"]);
  });

  it("numbers duplicated kit creatures the same way as base ones", () => {
    // Two Witches (18) — legal kit stock is 3, so this can occur in play.
    expect(memberLabels([m(18), m(18)])).toEqual(["Witch #1", "Witch #2"]);
  });
});
