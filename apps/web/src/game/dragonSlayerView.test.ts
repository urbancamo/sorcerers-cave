import { describe, it, expect } from "vitest";
import type { GameEvent } from "@sorcerers-cave/engine";
import { dragonSlayersFromEvents, DRAGON_CREATURE_ID } from "./dragonSlayerView";

const slain = (creatureId: number, kills: number): GameEvent => ({ type: "dragonSlain", creatureId, kills });

describe("dragonSlayersFromEvents", () => {
  it("is empty when no dragon was slain single-handed", () => {
    expect(dragonSlayersFromEvents([])).toEqual([]);
    expect(dragonSlayersFromEvents([{ type: "strangerKilled", creatureId: DRAGON_CREATURE_ID }])).toEqual([]);
  });

  it("celebrates a first kill, naming the slayer and the +1 strength", () => {
    const [v] = dragonSlayersFromEvents([slain(12, 1)]);
    expect(v!.title).toBe("Dragon-slayer!");
    expect(v!.headline).toBe("Your Giant has felled a dragon single-handed!");
    expect(v!.detail).toMatch(/\+1 fighting strength/);
    expect(v!.kills).toBe(1);
  });

  it("celebrates a repeat kill with the running tally", () => {
    const [v] = dragonSlayersFromEvents([slain(0, 3)]);
    expect(v!.headline).toBe("Your Hero fells yet another dragon!");
    expect(v!.detail).toMatch(/Dragon-slayer ×3/);
    expect(v!.detail).toMatch(/\+3 fighting strength/);
  });

  it("returns one view per slayer, in event order, when several fell dragons in one round", () => {
    const views = dragonSlayersFromEvents([slain(12, 1), { type: "strangerKilled", creatureId: 10 }, slain(0, 2)]);
    expect(views.map((v) => v.headline)).toEqual([
      "Your Giant has felled a dragon single-handed!",
      "Your Hero fells yet another dragon!",
    ]);
  });
});
