import { describe, it, expect } from "vitest";
import { awardsOf } from "./awards";

describe("awardsOf — a member's permanent, earned marks", () => {
  it("is empty for a member who has earned nothing", () => {
    expect(awardsOf({ dragonKills: 0 })).toEqual([]);
    expect(awardsOf({ dragonKills: 0, fsBonus: 0 })).toEqual([]);
  });

  it("reports dragon-slayer with the number of dragons felled", () => {
    expect(awardsOf({ dragonKills: 2 })).toEqual([
      { kind: "dragon-slayer", count: 2, title: "Dragon-slayer — +1 fighting strength" },
    ]);
  });

  it("reports the Elixir's permanent bonus (which stacks)", () => {
    expect(awardsOf({ dragonKills: 0, fsBonus: 2 })).toEqual([
      { kind: "elixir", bonus: 2, title: "Elixir — +2 fighting strength, for ever" },
    ]);
    expect(awardsOf({ dragonKills: 0, fsBonus: 4 })[0]).toMatchObject({ kind: "elixir", bonus: 4 });
  });

  it("lists dragon-slayer first, then the Elixir", () => {
    expect(awardsOf({ dragonKills: 1, fsBonus: 2 }).map((a) => a.kind)).toEqual(["dragon-slayer", "elixir"]);
  });
});
