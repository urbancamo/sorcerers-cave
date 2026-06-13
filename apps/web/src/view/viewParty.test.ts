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
});
