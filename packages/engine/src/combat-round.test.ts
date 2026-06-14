import { describe, it, expect } from "vitest";
import { resolveRound } from "./combat";
import { makeState } from "./testkit";
import type { GameEvent } from "./actions";

const combatRolls = (events: GameEvent[]) =>
  events.filter((e): e is Extract<GameEvent, { type: "combatRoll" }> => e.type === "combatRoll");

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

  it("out-numbered: a fighter faces at most two strangers hand-to-hand + background caster MP (§Fights)", () => {
    // The book example: 1 Hero vs Priest, Troll, Man, Dwarf. The strongest combination the Hero
    // must face is Troll(4) + Man(3) hand-to-hand + the Priest's magical power (2) = 9; the Dwarf is idle.
    const s = fightState({
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }], // Hero
      strangers: [4, 3, 5, 7], // Priest(caster), Troll, Man, Dwarf
      fight: { surprise: 0, round: 1, focus: 1 }, // focus the Troll (strongest)
      seed: 5,
    });
    const rolls = combatRolls(resolveRound(s));
    expect(rolls).toHaveLength(1); // one match only — the Dwarf stands idle, not folded in
    expect(rolls[0]!.enemyTotal - rolls[0]!.enemyRoll).toBe(9); // capped strongest combination, not all four summed
  });

  it("Lotus Dust and the Eye of God each reduce the Sorcerer's Strength by only 2, never to zero (card)", () => {
    const arena = (over = {}) => fightState({
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }], // Hero
      strangers: [11], // Sorcerer: FS 4 + MP 9 = 13
      seed: 5,
      ...over,
    });
    const str = (s) => { const r = combatRolls(resolveRound(s))[0]!; return r.enemyTotal - r.enemyRoll; };
    expect(str(arena())).toBe(13); // full strength
    expect(str(arena({ party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [13] }] }))).toBe(11); // Eye of God: −2
    expect(str(arena({ lotusOnSorcerer: true }))).toBe(11); // Lotus Dust: −2
    expect(str(arena({ party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [13] }], lotusOnSorcerer: true }))).toBe(9); // both: −4
  });

  it("a two-member group that loses queues a casualty for the player to decide (§9)", () => {
    // Two Dwarves gang an overwhelming Sorcerer (FS 4 + MP 9) and lose — both could fall, so the
    // choice is deferred rather than auto-killing the weakest.
    const s = fightState({
      party: [
        { creatureId: 7, status: 0, dragonKills: 0, treasure: [] },
        { creatureId: 7, status: 0, dragonKills: 0, treasure: [] },
      ],
      strangers: [11], // Sorcerer
      seed: 5,
    });
    const events = resolveRound(s);
    expect(s.fight!.casualtyQueue).toEqual([[0, 1]]);
    expect(s.party.every((m) => m.status === 0)).toBe(true); // nobody dead yet — awaiting the choice
    expect(events.some((e) => e.type === "memberDied")).toBe(false);
  });
});
