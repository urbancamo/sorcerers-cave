import { describe, it, expect } from "vitest";
import { newGame } from "@sorcerers-cave/engine";
import { viewParty } from "./viewParty";

describe("viewParty", () => {
  it("maps the engine party to renderer/reveal party members", () => {
    const state = newGame(1, [5, 6]); // Man (cost 3) + Woman (cost 2) = 5 <= 6 budget
    const p = viewParty(state);
    expect(p.length).toBe(state.party.length);

    const man = p.find((m) => m.name === "Man")!;
    expect(man).toBeDefined();
    expect(man.fs).toBeGreaterThan(0);
    expect(typeof man.charisma).toBe("boolean");
    expect(typeof man.sig).toBe("string");
    expect(Array.isArray(man.items)).toBe(true);

    // First member leads.
    expect(p[0]!.lead).toBe(true);
    expect(p.slice(1).every((m) => m.lead === false)).toBe(true);
  });

  it("reports carry capacity, heavy load, and carried items (with resolved art)", () => {
    const state = newGame(1, [5, 6]); // Man (carry 50) + Woman
    state.party[0]!.treasure.push(1, 7); // Gold (heavy, 25kg) + Talisman (artifact, 0kg)
    const cards = [
      { cardId: "a", file: "/assets/cards/gold.png", name: "Gold", category: "treasure" as const, entityId: 1 },
      { cardId: "b", file: "/assets/cards/talisman.png", name: "Talisman", category: "treasure" as const, entityId: 7 },
    ];
    const man = viewParty(state, cards)[0]!;
    expect(man.carry).toBe(50);
    expect(man.load).toBe(25); // only the heavy Gold counts toward load
    expect(man.items).toHaveLength(2);

    const gold = man.items.find((i) => i.name === "Gold")!;
    expect(gold).toMatchObject({ artifact: false, weight: 25, file: "/assets/cards/gold.png" });
    const talisman = man.items.find((i) => i.name === "Talisman")!;
    expect(talisman).toMatchObject({ artifact: true, weight: 0, file: "/assets/cards/talisman.png" });
  });

  it("leaves item art null when no cards are provided", () => {
    const state = newGame(1, [5, 6]);
    state.party[0]!.treasure.push(0); // Silver
    const man = viewParty(state)[0]!;
    expect(man.items[0]).toMatchObject({ name: "Silver", file: null });
  });
});
