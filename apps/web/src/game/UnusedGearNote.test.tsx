import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { newGame } from "@sorcerers-cave/engine";
import { UnusedGearNote } from "./UnusedGearNote";
import { unusedGear } from "./wielding";

const game = () => { const s = newGame(1, [0]); s.party[0]!.treasure = [3, 10, 20]; return s; }; // a Hero: Sword, Ring, Shield

describe("the fight note about gear that is carried, not in use", () => {
  it("names each item that would help but is only carried", () => {
    expect(unusedGear(game())).toEqual([
      "Magic Sword (Hero) carried, not wielded", "The Ring (Hero) carried, not worn", "Magic Shield (Hero) carried, not wielded",
    ]);
  });
  it("says nothing once the items are in use, or when they would not help", () => {
    const s = game(); s.party[0]!.borne = [3, 10, 20];
    expect(unusedGear(s)).toEqual([]);
    const ogre = newGame(1, [2]); ogre.party[0]!.treasure = [3]; // an Ogre gets nothing from a Sword
    expect(unusedGear(ogre)).toEqual([]);
  });
  it("renders as a status note, and renders nothing when there is nothing to say", () => {
    const { rerender, container } = render(<UnusedGearNote state={game()} />);
    expect(screen.getByTestId("unused-gear")).toHaveTextContent("Magic Sword (Hero) carried, not wielded");
    const ready = game(); ready.party[0]!.borne = [3, 10, 20];
    rerender(<UnusedGearNote state={ready} />);
    expect(container).toBeEmptyDOMElement();
  });
});
