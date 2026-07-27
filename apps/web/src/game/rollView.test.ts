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

  it("reports a friendly womanless Unicorn staying to guard the chamber (no recruit)", () => {
    const view = rollFromEvents([
      { type: "reaction", outcome: "friendly", roll: 5 },
      { type: "strangersJoined", count: 0 },
      { type: "unicornGuards", creatureId: 13 },
    ])!;
    expect(view.message).toMatch(/guard the chamber/i);
    expect(view.tone).toBe("good");
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
    expect(w.message).toMatch(/\+20 points/i); // the Ruby's worth is shown on the win
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

  it("shows the Whirlpool's crossing roll as a single-die overlay, dragged or safe (US-05)", () => {
    const dragged = rollFromEvents([{ type: "whirlpoolRoll", roll: 1, dragged: true }])!;
    expect(dragged.title).toBe("The Whirlpool");
    expect(dragged.lanes).toHaveLength(1);
    expect(dragged.lanes[0]!.enemy.value).toBe(1);
    expect(dragged.message).toMatch(/drags the whole party under/i);
    expect(dragged.tone).toBe("bad");
    const safe = rollFromEvents([{ type: "whirlpoolRoll", roll: 5, dragged: false }])!;
    expect(safe.message).toMatch(/wades the shallows safely/i);
    expect(safe.tone).toBe("good");
  });

  it("shows the Bell Rope's roll as a single-die overlay, one message per band (US-03)", () => {
    const vanish = rollFromEvents([{ type: "bellRoll", roll: 1, outcome: "vanish", creatureId: 0 }])!;
    expect(vanish.title).toBe("The Bell Rope");
    expect(vanish.lanes[0]!.enemy.value).toBe(1);
    expect(vanish.message).toMatch(/rope yanks hero upward/i);
    expect(vanish.message).toMatch(/never seen again/i);
    expect(vanish.tone).toBe("bad");
    const toll = rollFromEvents([{ type: "bellRoll", roll: 2, outcome: "toll", creatureId: 0 }])!;
    expect(toll.message).toMatch(/bell tolls once/i);
    expect(toll.tone).toBe("neutral");
    const stir = rollFromEvents([{ type: "bellRoll", roll: 5, outcome: "stir", creatureId: 0 }])!;
    expect(stir.message).toMatch(/two cards are drawn/i);
    expect(stir.message).toMatch(/cannot withdraw this turn/i);
  });

  it("shows the Crypt's roll as a single-die overlay, trap or find (US-08)", () => {
    const trap = rollFromEvents([{ type: "cryptRoll", roll: 1, outcome: "trap" }])!;
    expect(trap.title).toBe("The Crypt");
    expect(trap.message).toBe("The floor gives way! The party plunges into darkness.");
    expect(trap.tone).toBe("bad");
    const find = rollFromEvents([{ type: "cryptRoll", roll: 5, outcome: "find" }])!;
    expect(find.message).toBe("Within the crypt: gems!");
    expect(find.tone).toBe("good");
  });

  it("shows Desertion's per-ally rolls as one lane per ally, with an itemized deserters message (US-09)", () => {
    const some = rollFromEvents([
      { type: "desertionRoll", creatureId: 5, roll: 1, deserted: true, items: [1, 3] }, // Man, Gold+Sword
      { type: "desertionRoll", creatureId: 6, roll: 5, deserted: false, items: [] },     // Woman stays
    ])!;
    expect(some.title).toBe("Desertion");
    expect(some.lanes).toHaveLength(2);
    expect(some.lanes[0]).toMatchObject({ enemy: { name: "Man", value: 1, outcome: "lose" } });
    expect(some.lanes[1]).toMatchObject({ enemy: { name: "Woman", value: 5, outcome: "win" } });
    expect(some.message).toMatch(/man slips away into the dark, taking gold, magic sword/i);
    expect(some.tone).toBe("bad");

    const none = rollFromEvents([{ type: "desertionRoll", creatureId: 6, roll: 4, deserted: false, items: [] }])!;
    expect(none.message).toBe("The party holds together.");
    expect(none.tone).toBe("good");
  });

  it("shows Quarrel's forced duel as a side-by-side dice overlay, loser or tie (US-11)", () => {
    const duel = rollFromEvents([{ type: "quarrel", aId: 0, bId: 5, aRoll: 2, bRoll: 5, loserId: 0 }])!; // Hero vs Man
    expect(duel.title).toBe("Quarrel");
    expect(duel.lanes).toHaveLength(1);
    expect(duel.lanes[0]!.party).toBeDefined(); // side-by-side (versus) presentation
    expect(duel.lanes[0]).toMatchObject({
      enemy: { name: "Hero", value: 2, outcome: "lose" },
      party: { name: "Man", value: 5, outcome: "win" },
    });
    expect(duel.message).toMatch(/tempers flare/i);
    expect(duel.message).toMatch(/hero falls to man's fury/i);
    expect(duel.tone).toBe("bad");

    const tie = rollFromEvents([{ type: "quarrel", aId: 0, bId: 5, aRoll: 4, bRoll: 4, loserId: null }])!;
    expect(tie.message).toMatch(/pulled apart, fuming but unhurt/i);
    expect(tie.tone).toBe("good");
  });

  it("shows the Elixir's draught as a single-die overlay, one message per band (US-19)", () => {
    const death = rollFromEvents([{ type: "elixirDrunk", creatureId: 0, roll: 1, outcome: "death" }])!;
    expect(death.title).toBe("The Elixir");
    expect(death.message).toBe("Hero convulses — poison!");
    expect(death.tone).toBe("bad");
    const nothing = rollFromEvents([{ type: "elixirDrunk", creatureId: 0, roll: 2, outcome: "nothing" }])!;
    expect(nothing.message).toBe("It tastes of pond water. Nothing happens.");
    expect(nothing.tone).toBe("neutral");
    const strength = rollFromEvents([{ type: "elixirDrunk", creatureId: 0, roll: 6, outcome: "strength" }])!;
    expect(strength.message).toBe("Hero feels power settle into their bones. (+2 fs)");
    expect(strength.tone).toBe("good");
  });

  it("names a kit combatant in the Quarrel/Desertion/Bell Rope/Elixir overlays, not '?' (SC-EXT-29)", () => {
    const duel = rollFromEvents([{ type: "quarrel", aId: 16, bId: 5, aRoll: 6, bRoll: 1, loserId: 5 }])!; // Lion vs Man
    expect(duel.lanes[0]!.enemy.name).toBe("Lion");
    const bell = rollFromEvents([{ type: "bellRoll", roll: 1, outcome: "vanish", creatureId: 18 }])!; // Witch
    expect(bell.message).toMatch(/witch/i);
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
