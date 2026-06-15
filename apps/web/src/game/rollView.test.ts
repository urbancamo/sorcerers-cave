import { describe, it, expect } from "vitest";
import type { GameEvent } from "@sorcerers-cave/engine";
import { rollFromEvents } from "./rollView";

describe("rollFromEvents", () => {
  it("returns null when no reaction or combat roll happened", () => {
    expect(rollFromEvents([{ type: "moved", area: 1, level: 1 }])).toBeNull();
  });

  it("builds a single-die reaction view, with a join message on a friendly recruit", () => {
    const events: GameEvent[] = [
      { type: "reaction", outcome: "friendly", roll: 6 },
      { type: "strangersJoined", count: 1 },
    ];
    const view = rollFromEvents(events)!;
    expect(view.title).toBe("Reaction roll");
    expect(view.lanes).toHaveLength(1);
    expect(view.lanes[0]!.party).toBeUndefined();
    expect(view.lanes[0]!.enemy.value).toBe(6);
    expect(view.message).toMatch(/join your party/i);
    expect(view.tone).toBe("good");
  });

  it("reports a friendly reaction that does not recruit", () => {
    const view = rollFromEvents([{ type: "reaction", outcome: "friendly", roll: 5 }])!;
    expect(view.message).toMatch(/keep their distance/i);
  });

  it("shows an opened Treasure Chest as a single-die loot view", () => {
    const view = rollFromEvents([{ type: "chestOpened", result: 6 }])!;
    expect(view.title).toMatch(/treasure chest/i);
    expect(view.lanes).toHaveLength(1);
    expect(view.lanes[0]!.enemy.value).toBe(6);
    expect(view.message).toMatch(/gems/i);
    expect(view.tone).toBe("good");
  });

  it("reports a chest curse as a bad outcome", () => {
    const view = rollFromEvents([{ type: "chestOpened", result: 1 }])!;
    expect(view.message).toMatch(/curse/i);
    expect(view.tone).toBe("bad");
  });

  it("shows a decided casualty as a single-die view noting whether the choice was honoured", () => {
    const got = rollFromEvents([{ type: "casualtyChosen", creatureId: 0, roll: 5, gotPreference: true }])!;
    expect(got.title).toMatch(/who falls/i);
    expect(got.lanes[0]!.enemy.value).toBe(5);
    expect(got.message).toMatch(/hero/i);
    expect(got.message).toMatch(/as you chose/i);
    const not = rollFromEvents([{ type: "casualtyChosen", creatureId: 7, roll: 2, gotPreference: false }])!;
    expect(not.message).toMatch(/fate decided otherwise/i);
  });

  it("builds a party-vs-enemy combat view with both rolls and totals", () => {
    const events: GameEvent[] = [
      { type: "combatRoll", party: "Ogre", enemy: "Troll", partyRoll: 6, enemyRoll: 1, partyTotal: 12, enemyTotal: 5, result: "partyWon" },
      { type: "strangerKilled", creatureId: 7 },
      { type: "fightWon" },
    ];
    const view = rollFromEvents(events)!;
    expect(view.title).toBe("Combat round");
    expect(view.lanes).toHaveLength(1);
    expect(view.lanes[0]!.party).toMatchObject({ name: "Ogre", value: 6, total: 12, outcome: "win" });
    expect(view.lanes[0]!.enemy).toMatchObject({ name: "Troll", value: 1, total: 5, outcome: "lose" });
    expect(view.message).toMatch(/victory/i);
    expect(view.tone).toBe("good");
  });

  it("frames the Lost Ruby statue fight: win takes the ruby, loss is the statue's blow", () => {
    const win: GameEvent[] = [
      { type: "combatRoll", party: "Hero", enemy: "Statue", partyRoll: 6, enemyRoll: 1, partyTotal: 11, enemyTotal: 9, result: "partyWon" },
      { type: "rubyTaken" },
    ];
    const w = rollFromEvents(win)!;
    expect(w.title).toBe("The guardian statue");
    expect(w.lanes[0]!.enemy.name).toBe("Statue");
    expect(w.message).toMatch(/wrest the lost ruby/i);
    expect(w.tone).toBe("good");

    const loss: GameEvent[] = [
      { type: "combatRoll", party: "Dwarf", enemy: "Statue", partyRoll: 1, enemyRoll: 6, partyTotal: 2, enemyTotal: 14, result: "enemyWon" },
      { type: "memberDied", creatureId: 7 },
      { type: "statueAroused" },
    ];
    const l = rollFromEvents(loss)!;
    expect(l.title).toBe("The guardian statue");
    expect(l.message).toMatch(/statue strikes/i);
    expect(l.tone).toBe("bad");
  });

  it("counts a deferred two-member casualty as a loss (no memberDied event yet)", () => {
    // W-Hero + Man lose the match — the death is deferred to a casualty choice, so NO memberDied
    // fires this round. The summary must still report one of yours lost (matching the lost roll).
    const events: GameEvent[] = [
      { type: "combatRoll", party: "W-Hero + Man", enemy: "Hero", partyRoll: 2, enemyRoll: 5, partyTotal: 9, enemyTotal: 10, result: "enemyWon" },
    ];
    const view = rollFromEvents(events)!;
    expect(view.message).toBe("Round resolved — 0 foe(s) down, 1 of yours lost.");
    expect(view.tone).toBe("bad");
  });

  it("does not count a death that The Ring averted", () => {
    const events: GameEvent[] = [
      { type: "combatRoll", party: "Hero", enemy: "Dragon", partyRoll: 1, enemyRoll: 6, partyTotal: 6, enemyTotal: 12, result: "enemyWon" },
      { type: "deathPrevented", creatureId: 0 },
    ];
    const view = rollFromEvents(events)!;
    expect(view.message).toBe("Round resolved — 0 foe(s) down, 0 of yours lost.");
  });

  it("shows one lane per pairing and a slain message when the party falls", () => {
    const events: GameEvent[] = [
      { type: "combatRoll", party: "Dwarf", enemy: "Dragon", partyRoll: 2, enemyRoll: 6, partyTotal: 4, enemyTotal: 12, result: "enemyWon" },
      { type: "memberDied", creatureId: 7 },
      { type: "gameOver", gs: 2 },
    ];
    const view = rollFromEvents(events)!;
    expect(view.lanes).toHaveLength(1);
    expect(view.lanes[0]!.enemy.outcome).toBe("win");
    expect(view.lanes[0]!.party!.outcome).toBe("lose");
    expect(view.message).toMatch(/slain/i);
    expect(view.tone).toBe("bad");
  });
});
