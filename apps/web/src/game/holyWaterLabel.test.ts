import { describe, it, expect } from "vitest";
import { HW_STATUE_BASE, HW_MEDUSA, HW_STRANGER_BASE, HW_PARKED_STATUE_BASE, type GameState } from "@sorcerers-cave/engine";
import { holyWaterTargetName } from "./holyWaterLabel";

describe("holyWaterTargetName", () => {
  const state = {
    party: [{ creatureId: 0 }],
    strangers: [15], // Demon
    statues: [18], // Witch
    partyArea: 0,
    areas: [{ contents: [200 + 3, 500 + 5] }], // Silver, then a parked Man statue (bug fix 2026-08-09)
  } as unknown as GameState;
  const memberLabelOf = (mi: number) => `member#${mi}`;

  it("decodes a plain party index as a REVIVE target", () => {
    expect(holyWaterTargetName(state, 0, memberLabelOf)).toBe("member#0");
  });

  it("decodes HW_STATUE_BASE+i as a WAKE target, naming the statue's creature", () => {
    expect(holyWaterTargetName(state, HW_STATUE_BASE + 0, memberLabelOf)).toBe("Witch");
  });

  it("decodes the HW_MEDUSA singleton", () => {
    expect(holyWaterTargetName(state, HW_MEDUSA, memberLabelOf)).toBe("Medusa");
  });

  it("decodes HW_STRANGER_BASE+i as a DESTROY/WEAKEN target, naming the stranger", () => {
    expect(holyWaterTargetName(state, HW_STRANGER_BASE + 0, memberLabelOf)).toBe("Demon");
  });

  // Bug fix 2026-08-09 (QOTO-04): a statue already parked on the current area's contents (a
  // Gallery settled to explore with nothing else pending) — a content-array index, not a
  // state.statues index, so it must decode via the SAME area the target was computed against.
  it("decodes HW_PARKED_STATUE_BASE+i as a WAKE target, naming the parked statue's creature", () => {
    expect(holyWaterTargetName(state, HW_PARKED_STATUE_BASE + 1, memberLabelOf)).toBe("Man");
  });
});
