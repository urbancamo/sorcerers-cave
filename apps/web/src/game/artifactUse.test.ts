import { describe, it, expect } from "vitest";
import { newGame, HW_STATUE_BASE, HW_PARKED_STATUE_BASE, STAFF_WAKE_ALL, type GameState } from "@sorcerers-cave/engine";
import { useOptions } from "./artifactUse";

const MAN = 5, WIZARD = 8, MAGIC_STAFF = 9, STRENGTH_POTION = 8;

/** A resting Staff-Wizard on the gateway tile, with whatever the test adds (statues live or parked, a stone member). */
function staffState(over: { phase?: GameState["phase"]; statues?: number[]; parked?: number[]; stoneMan?: boolean }): GameState {
  const s = newGame(1, [0]);
  s.party[0]!.creatureId = WIZARD; // (a legal Hero start, made a Wizard)
  s.party[0]!.treasure = [MAGIC_STAFF];
  if (over.stoneMan) s.party.push({ creatureId: MAN, status: 2, dragonKills: 0, treasure: [], stoneArea: s.partyArea });
  s.areas[s.partyArea]!.contents = (over.parked ?? []).map((id) => 500 + id);
  if (over.statues) s.statues = over.statues;
  s.phase = over.phase ?? "explore";
  return s;
}

describe("Magic Staff options at a Gallery (SC-EXT-11, issue #105)", () => {
  it("offers each live statue singly (repeats numbered) and a group wake for two or more", () => {
    const opts = useOptions(staffState({ phase: "pickup", statues: [MAN, MAN] }), MAGIC_STAFF);
    expect(opts.map((o) => o.label)).toEqual(["wake the stone Man #1", "wake the stone Man #2", "wake every stone figure here"]);
    expect(opts.map((o) => o.action.target)).toEqual([HW_STATUE_BASE, HW_STATUE_BASE + 1, STAFF_WAKE_ALL]);
  });

  it("names a statue parked on the tile, and offers no 'all' for a single one", () => {
    const opts = useOptions(staffState({ parked: [MAN] }), MAGIC_STAFF);
    expect(opts.map((o) => o.label)).toEqual(["wake the stone Man"]);
    expect(opts[0]!.action.target).toBe(HW_PARKED_STATUE_BASE);
  });

  it("still frees a stone party member by its plain index", () => {
    const opts = useOptions(staffState({ stoneMan: true }), MAGIC_STAFF);
    expect(opts).toHaveLength(1);
    expect(opts[0]!.label).toMatch(/^free .* from stone$/);
  });
});

describe("Strength Potion options (issue #121)", () => {
  it("names each member who may drink it, not 'use #1 … use #5'", () => {
    const s = newGame(1, [0]); // a lone Hero, who may drink
    s.party.push({ creatureId: MAN, status: 1, dragonKills: 0, treasure: [] });
    s.party[0]!.treasure = [STRENGTH_POTION];
    s.phase = "fight";
    const opts = useOptions(s, STRENGTH_POTION);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) expect(o.label).not.toMatch(/^use/i);
    expect(opts.map((o) => o.label)).toEqual(opts.map((o) => o.label.trim()));
    expect(new Set(opts.map((o) => o.label)).size).toBe(opts.length);
  });
});
