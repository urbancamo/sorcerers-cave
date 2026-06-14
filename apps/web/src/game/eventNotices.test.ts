import { describe, it, expect } from "vitest";
import {
  SPECIAL_VIPER_PIT, SPECIAL_DEEP_POOL,
  HAZARD_MEDUSA, HAZARD_MUTINY, HAZARD_TRAP, HAZARD_EARTHQUAKE,
  DIR_DOWN, DIR_UP,
  type GameEvent,
} from "@sorcerers-cave/engine";
import { eventNotices, noticeTone } from "./eventNotices";

describe("eventNotices", () => {
  it("reports a Viper Pit crossing and names each member slain", () => {
    const events: GameEvent[] = [
      { type: "crossedSpecial", special: SPECIAL_VIPER_PIT },
      { type: "memberDied", creatureId: 0 }, // Hero
    ];
    const n = eventNotices(events);
    expect(n).toHaveLength(2);
    expect(n[0]!.text).toMatch(/viper pit/i);
    expect(n[1]!).toEqual({ text: "Hero is slain!", tone: "bad" });
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

  it("noticeTone prefers bad, then good, then neutral", () => {
    expect(noticeTone([{ text: "", tone: "neutral" }, { text: "", tone: "good" }, { text: "", tone: "bad" }])).toBe("bad");
    expect(noticeTone([{ text: "", tone: "neutral" }, { text: "", tone: "good" }])).toBe("good");
    expect(noticeTone([{ text: "", tone: "neutral" }])).toBe("neutral");
  });
});
