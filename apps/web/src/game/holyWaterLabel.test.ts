import { describe, it, expect } from "vitest";
import { HW_STATUE_BASE, HW_MEDUSA, HW_STRANGER_BASE, type GameState } from "@sorcerers-cave/engine";
import { holyWaterTargetName } from "./holyWaterLabel";

describe("holyWaterTargetName", () => {
  const state = {
    party: [{ creatureId: 0 }],
    strangers: [15], // Demon
    statues: [18], // Witch
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
});
