import { describe, it, expect } from "vitest";
import { decodeArea } from "./decode";
import { SPECIAL_GATEWAY, SPECIAL_TOMB, SPECIAL_DEEP_POOL } from "./data/areaCards";

describe("decodeArea (spec §3.1 bitfield)", () => {
  it("decodes the Gateway (175 = NSEW + stairUp + special 1)", () => {
    expect(decodeArea(175)).toEqual({
      n: true, e: true, s: true, w: true,
      chamber: false, stairUp: true, stairDown: false, special: SPECIAL_GATEWAY,
    });
  });
  it("decodes the Tomb of Kings (543 = NSEW + chamber + special 4)", () => {
    const d = decodeArea(543);
    expect(d.chamber).toBe(true);
    expect(d.special).toBe(SPECIAL_TOMB);
  });
  it("decodes the Deep Pool (287 = NSEW + chamber + special 2)", () => {
    expect(decodeArea(287).special).toBe(SPECIAL_DEEP_POOL);
  });
  it("decodes a plain NE corridor (3)", () => {
    expect(decodeArea(3)).toMatchObject({ n: true, e: true, s: false, w: false, chamber: false, special: 0 });
  });
});
