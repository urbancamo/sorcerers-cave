import { describe, it, expect } from "vitest";
import type { GameEvent } from "@sorcerers-cave/engine";
import { featsFromEvents } from "./feats";

const ev = (e: object) => e as GameEvent;

describe("featsFromEvents", () => {
  it("is empty when nothing worth celebrating happened", () => {
    expect(featsFromEvents([])).toEqual([]);
    expect(featsFromEvents([ev({ type: "strangerKilled", creatureId: 10 }), ev({ type: "elixirDrunk", creatureId: 0, roll: 2, outcome: "nothing" })])).toEqual([]);
  });

  describe("dragon-slayer", () => {
    it("celebrates a first kill, naming the slayer and the +1 strength", () => {
      const [f] = featsFromEvents([ev({ type: "dragonSlain", creatureId: 12, kills: 1 })]);
      expect(f).toMatchObject({ id: "dragon-slain", title: "Dragon-slayer!", motion: "flip", card: { category: "creature", entityId: 10, name: "Dragon" } });
      expect(f!.headline).toBe("Your Giant has felled a dragon single-handed!");
      expect(f!.detail).toMatch(/\+1 fighting strength/);
      expect(f!.tally).toBeUndefined();
    });
    it("celebrates a repeat kill with the running tally", () => {
      const [f] = featsFromEvents([ev({ type: "dragonSlain", creatureId: 0, kills: 3 })]);
      expect(f!.headline).toBe("Your Hero fells yet another dragon!");
      expect(f!.detail).toMatch(/Dragon-slayer ×3/);
      expect(f!.detail).toMatch(/\+3 fighting strength/);
      expect(f!.tally).toBe(3);
    });
  });

  it("celebrates the Sorcerer's fall: his card flips, with the +30", () => {
    const [f] = featsFromEvents([ev({ type: "sorcererSlain" })]);
    expect(f).toMatchObject({ id: "sorcerer-slain", title: "The Sorcerer falls!", motion: "flip", card: { category: "creature", entityId: 11 } });
    expect(f!.headline).toMatch(/vanquished the master of the cave/);
    expect(f!.detail).toMatch(/\+30/);
  });

  describe("Lost Ruby", () => {
    it("celebrates wresting it from the statue: the Ruby card rises, with its points", () => {
      const [f] = featsFromEvents([ev({ type: "rubyTaken" })]);
      expect(f).toMatchObject({ id: "ruby-wrested", title: "The Lost Ruby!", motion: "rise", card: { category: "treasure", entityId: 11 } });
      expect(f!.headline).toBe("You wrest the Lost Ruby from the guardian statue!");
      expect(f!.detail).toMatch(/\+20 points/);
    });
    it("words it differently when the Eye stills the statue", () => {
      const [f] = featsFromEvents([ev({ type: "rubyTaken" }), ev({ type: "statuePowerless" })]);
      expect(f!.headline).toBe("The Lost Ruby is yours — the statue stands powerless before you!");
    });
  });

  it("celebrates the Elixir's strength band only: the Elixir card rises, +2 for ever", () => {
    const [f] = featsFromEvents([ev({ type: "elixirDrunk", creatureId: 0, roll: 6, outcome: "strength" })]);
    expect(f).toMatchObject({ id: "elixir-strength", title: "The Elixir works!", motion: "rise", card: { category: "treasure", entityId: 15 } });
    expect(f!.headline).toBe("Hero feels power settle into their bones.");
    expect(f!.detail).toMatch(/\+2 fighting strength/);
    expect(featsFromEvents([ev({ type: "elixirDrunk", creatureId: 0, roll: 1, outcome: "death" })])).toEqual([]);
  });

  it("returns feats in event order when several happen in one action", () => {
    const ids = featsFromEvents([
      ev({ type: "dragonSlain", creatureId: 12, kills: 1 }), ev({ type: "strangerKilled", creatureId: 10 }),
      ev({ type: "sorcererSlain" }), ev({ type: "rubyTaken" }),
    ]).map((f) => f.id);
    expect(ids).toEqual(["dragon-slain", "sorcerer-slain", "ruby-wrested"]);
  });
});
