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
});
