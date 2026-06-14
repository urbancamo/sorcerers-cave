import { describe, it, expect } from "vitest";
import { resolveRound } from "./combat";
import { makeState } from "./testkit";

function fightState(over: Parameters<typeof makeState>[0] = {}) {
  return makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, ...over });
}

describe("resolveRound (spec §9.1, §9.3-9.4)", () => {
  it("a strong party kills the focus stranger and advances the round", () => {
    // A Giant (FS 7) vs a single Dwarf-stranger (id 7, FS 1). The party almost always wins.
    const s = fightState({
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }], // Giant
      strangers: [7], // Dwarf
      seed: 5,
    });
    const events = resolveRound(s);
    expect(s.strangers).toEqual([]); // Dwarf removed
    expect(s.fight!.round).toBe(2);
    expect(events).toContainEqual({ type: "strangerKilled", creatureId: 7 });
  });

  it("credits a single-handed dragon slayer", () => {
    // One Giant (FS 7) vs one Dragon (FS 6). Surprise to the party guarantees the win at seed 5.
    const s = fightState({
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }],
      strangers: [10], // Dragon
      fight: { surprise: 1, round: 1, focus: 0 },
      seed: 5,
    });
    resolveRound(s);
    expect(s.strangers).toEqual([]);
    expect(s.party[0]!.dragonKills).toBe(1);
  });

  it("a Spectre the party cannot fight auto-slays the strongest member", () => {
    // No caster MP, no Magic Sword -> the Hero (strongest) is auto-slain; the Spectre survives.
    const s = fightState({
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [] }, // Hero FS 5
        { creatureId: 7, status: 0, dragonKills: 0, treasure: [] }, // Dwarf FS 1
      ],
      strangers: [9], // Spectre
      seed: 5,
    });
    const events = resolveRound(s);
    expect(s.party.find((m) => m.creatureId === 0)!.status).toBe(3); // Hero dead
    expect(events).toContainEqual({ type: "spectreSlew", creatureId: 0 });
    expect(s.strangers).toEqual([9]); // Spectre not killed
  });
});
