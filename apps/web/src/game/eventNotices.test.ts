import { describe, it, expect } from "vitest";
import {
  SPECIAL_VIPER_PIT, SPECIAL_DEEP_POOL, SPECIAL_WHIRLPOOL,
  HAZARD_MEDUSA, HAZARD_MUTINY, HAZARD_TRAP, HAZARD_EARTHQUAKE,
  DIR_DOWN, DIR_UP,
  type GameEvent,
} from "@sorcerers-cave/engine";
import { eventNotices, noticeTone } from "./eventNotices";

describe("eventNotices exhaustiveness (base hardening)", () => {
  it("surfaces a generic notice for a blocked action (previously silent everywhere)", () => {
    const out = eventNotices([{ type: "blocked" }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.text.length).toBeGreaterThan(0);
  });

  it("surfaces the engine's rejection reason for an illegal battle plan (previously silent)", () => {
    const out = eventNotices([{ type: "planRejected", reason: "unmatched pairing" }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toMatch(/unmatched pairing/i);
    expect(out[0]!.tone).toBe("bad");
  });

  it("announces arrival at a special area (previously silent)", () => {
    expect(eventNotices([{ type: "enteredSpecial", special: SPECIAL_VIPER_PIT }])[0]!.text).toMatch(/viper pit/i);
    expect(eventNotices([{ type: "enteredSpecial", special: SPECIAL_DEEP_POOL }])[0]!.text).toMatch(/deep pool/i);
  });

  it("reports a downed member's items spilling onto the floor (previously silent)", () => {
    const out = eventNotices([{ type: "itemsSpilled", creatureId: 0, items: [1, 2] }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.text.length).toBeGreaterThan(0);
  });

  it("stays silent for the remaining event types, which all have dedicated dice-overlay or banner UI", () => {
    const handled: GameEvent[] = [
      { type: "viperPit", rolls: [{ creatureId: 0, roll: 3, died: false }] },
      { type: "medusaGaze", rolls: [{ creatureId: 0, roll: 3, petrified: false }] },
      { type: "casualtyChosen", creatureId: 0, roll: 4, gotPreference: true },
      { type: "fightWon" },
      { type: "rubyTaken" },
      { type: "statueAroused" },
      { type: "strangerKilled", creatureId: 3 },
      { type: "pacified" },
      { type: "strangersJoined", count: 2 },
      { type: "fightStarted", surprise: 1 },
      { type: "trapAvoided" },
    ];
    expect(eventNotices(handled)).toHaveLength(0);
  });
});

describe("eventNotices", () => {
  it("produces no text notices for a Viper Pit crossing (its dice overlay shows the outcome)", () => {
    const events: GameEvent[] = [
      { type: "crossedSpecial", special: SPECIAL_VIPER_PIT },
      { type: "viperPit", rolls: [{ creatureId: 0, roll: 1, died: true }] },
      { type: "memberDied", creatureId: 0 }, // Hero — shown by the dice, not as a duplicate notice
    ];
    expect(eventNotices(events)).toEqual([]);
  });

  it("reports Deep Pool treasure being dropped and reclaimed", () => {
    expect(eventNotices([{ type: "treasureDropped", count: 2 }])[0]!.text).toMatch(/2 heavy treasures sink/i);
    expect(eventNotices([{ type: "treasureReclaimed", count: 1 }])[0]!).toMatchObject({ tone: "good" });
    expect(eventNotices([{ type: "crossedSpecial", special: SPECIAL_DEEP_POOL }])[0]!.text).toMatch(/deep pool/i);
  });

  it("describes hazards, but defers Mutiny and Trap to their own UI", () => {
    expect(eventNotices([{ type: "hazardFired", hazard: HAZARD_MEDUSA }])[0]!.text).toMatch(/medusa/i);
    expect(eventNotices([{ type: "hazardFired", hazard: HAZARD_EARTHQUAKE }])[0]!.text).toMatch(/earthquake/i);
    expect(eventNotices([{ type: "hazardFired", hazard: HAZARD_MUTINY }])).toHaveLength(0);
    expect(eventNotices([{ type: "hazardFired", hazard: HAZARD_TRAP }])).toHaveLength(0);
  });

  it("reports a mutiny with deserter and dropped-loot counts", () => {
    const n = eventNotices([{ type: "mutinied", deserters: [5, 6], treasures: [1] }]);
    expect(n[0]!.text).toMatch(/2 allys desert/i);
    expect(n[0]!.text).toMatch(/dropping 1 item/i);
    expect(n[0]!.tone).toBe("bad");
  });

  it("reports artifact / special-area effects", () => {
    expect(eventNotices([{ type: "secretDoorRevealed", dir: DIR_DOWN }])[0]!.text).toMatch(/below/i);
    expect(eventNotices([{ type: "secretDoorRevealed", dir: DIR_UP }])[0]!.text).toMatch(/above/i);
    expect(eventNotices([{ type: "dragonsLulled", count: 3 }])[0]!.text).toMatch(/3 dragons/i);
    expect(eventNotices([{ type: "annihilated", creatureId: 9 }])[0]!.text).toMatch(/eye of god/i);
    expect(eventNotices([{ type: "carpetUsed", dir: DIR_DOWN }])[0]!.text).toMatch(/magic carpet/i);
    expect(eventNotices([{ type: "unicornGuards", creatureId: 6 }])[0]!.tone).toBe("good");
  });

  it("reports Balm/Staff via their generic artifactUsed, but not carpet/flute (which have their own events)", () => {
    expect(eventNotices([{ type: "artifactUsed", artifact: 6 }])[0]!.text).toMatch(/healing balm/i);
    expect(eventNotices([{ type: "artifactUsed", artifact: 9 }])[0]!.text).toMatch(/magic staff/i);
    // Carpet emits artifactUsed + carpetUsed; only the carpetUsed line should show (no double).
    expect(eventNotices([{ type: "artifactUsed", artifact: 4 }, { type: "carpetUsed", dir: DIR_DOWN }])).toHaveLength(1);
  });

  it("warns when a retreat hits a dead end and the party is forced back to fight", () => {
    const out = eventNotices([{ type: "deadEnd", dir: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.tone).toBe("bad");
    expect(out[0]!.text).toMatch(/dead end/i);
    expect(out[0]!.text).toMatch(/north/i);
    expect(out[0]!.text).toMatch(/fight another round/i);
  });

  it("stays silent for events that already have dedicated UI", () => {
    const handled: GameEvent[] = [
      { type: "reaction", outcome: "hostile", roll: 1 },
      { type: "combatRoll", party: "Hero", enemy: "Troll", partyRoll: 6, enemyRoll: 1, partyTotal: 11, enemyTotal: 5, result: "partyWon" },
      { type: "chestOpened", result: 6 },
      { type: "drewChamber", strangers: [], treasures: [], hazards: [] },
      { type: "trapSprung", level: 2 },
      { type: "moved", area: 1, level: 1 },
      { type: "gameOver", gs: 1 },
    ];
    expect(eventNotices(handled)).toHaveLength(0);
  });

  it("gives a celebratory congratulations when the Sorcerer is slain", () => {
    const out = eventNotices([{ type: "sorcererSlain" }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.tone).toBe("good");
    expect(out[0]!.text).toContain("Sorcerer");
    expect(out[0]!.text).toContain("Congratulations");
  });

  it("announces the Whirlpool's entry telegraph distinctly from Deep Pool / Viper Pit", () => {
    expect(eventNotices([{ type: "enteredSpecial", special: SPECIAL_WHIRLPOOL }])[0]!.text).toMatch(/whirlpool/i);
  });

  it("reports the Chasm descent (US-02) and Whirlpool crossing roll (US-05)", () => {
    expect(eventNotices([{ type: "chasmDescend" }])[0]!.text).toMatch(/climbs down into the chasm/i);
    const dragged = eventNotices([{ type: "whirlpoolRoll", roll: 1, dragged: true }])[0]!;
    expect(dragged.text).toMatch(/drags the whole party under/i);
    expect(dragged.tone).toBe("bad");
    const safe = eventNotices([{ type: "whirlpoolRoll", roll: 5, dragged: false }])[0]!;
    expect(safe.text).toMatch(/wades the shallows safely/i);
    expect(safe.tone).toBe("good");
  });

  it("reports the Well's draw (US-07) and the Bell Rope's three bands (US-03)", () => {
    expect(eventNotices([{ type: "wellDraw" }])[0]!.text).toMatch(/bucket rises/i);

    const vanish = eventNotices([{ type: "bellRoll", roll: 1, outcome: "vanish", creatureId: 0 }])[0]!;
    expect(vanish.text).toMatch(/rope yanks .* upward/i);
    expect(vanish.text).toMatch(/never seen again/i);
    expect(vanish.tone).toBe("bad");

    const toll = eventNotices([{ type: "bellRoll", roll: 2, outcome: "toll", creatureId: 0 }])[0]!;
    expect(toll.text).toMatch(/bell tolls once/i);
    expect(toll.text).toMatch(/now knows you are here/i);

    const stir = eventNotices([{ type: "bellRoll", roll: 5, outcome: "stir", creatureId: 0 }])[0]!;
    expect(stir.text).toMatch(/two cards are drawn/i);
    expect(stir.text).toMatch(/cannot withdraw this turn/i);
  });

  it("noticeTone prefers bad, then good, then neutral", () => {
    expect(noticeTone([{ text: "", tone: "neutral" }, { text: "", tone: "good" }, { text: "", tone: "bad" }])).toBe("bad");
    expect(noticeTone([{ text: "", tone: "neutral" }, { text: "", tone: "good" }])).toBe("good");
    expect(noticeTone([{ text: "", tone: "neutral" }])).toBe("neutral");
  });
});
