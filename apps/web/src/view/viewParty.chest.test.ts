import { describe, it, expect } from "vitest";
import { newGame } from "@sorcerers-cave/engine";
import { viewParty } from "./viewParty";

describe("viewParty: a shared Treasure Chest", () => {
  it("shows each bearer's share as a mini card, counts it in their load, and says who they share with", () => {
    const g = newGame(1, [5, 6]);
    const state = { ...g, party: [{ ...g.party[0]!, creatureId: 3, chestShares: [{ chest: 1, kg: 75 }] }, { ...g.party[1]!, creatureId: 1, chestShares: [{ chest: 1, kg: 25 }] }] };
    const [troll, whero] = viewParty(state);
    expect(troll!.items).toEqual([expect.objectContaining({ name: "Treasure Chest (shared)", weight: 75, file: "/assets/cards/treasure-chest-shared-v1.jpg" })]);
    expect(troll!.load).toBe(75);
    expect(whero!.items).toHaveLength(1);
    expect(whero!.chestNote).toMatch(/Bearing 25 kg of the Treasure Chest, shared with .*75 kg/);
  });
});
