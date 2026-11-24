import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HAZARD_DESERTION, HAZARD_GHOULS, HAZARD_HARPIES, HAZARD_MUTINY, HAZARD_QUARREL, type GameEvent } from "@sorcerers-cave/engine";
import { firedSpent, ownerOf } from "./hazardCard";
import { rollFromEvents } from "./rollView";
import { eventNotices } from "./eventNotices";
import { NoticeModal } from "./NoticeModal";
import { DiceRoll } from "./DiceRoll";
import type { CardArt } from "../data/manifest";

const cards = [
  { category: "hazard", entityId: HAZARD_MUTINY, file: "/m.png" },
  { category: "hazard", entityId: HAZARD_DESERTION, file: "/d.png" },
] as unknown as CardArt[];

describe("spent hazard set piece", () => {
  it("knows which spent hazards fired, but not Ghouls (they stay in the chamber)", () => {
    expect(firedSpent([{ type: "hazardFired", hazard: HAZARD_MUTINY }], HAZARD_MUTINY)).toBe(true);
    expect(firedSpent([{ type: "hazardFired", hazard: HAZARD_MUTINY }], HAZARD_DESERTION)).toBe(false);
    expect(firedSpent([{ type: "quarrelFizzled" }], HAZARD_QUARREL)).toBe(true);
    expect(firedSpent([{ type: "hazardFired", hazard: HAZARD_GHOULS }], HAZARD_GHOULS)).toBe(false);
    expect(firedSpent([], HAZARD_MUTINY)).toBe(false);
  });

  it("gives an event its own hazard's card only, and only when that hazard fired", () => {
    const fired: GameEvent[] = [{ type: "hazardFired", hazard: HAZARD_HARPIES }];
    expect(ownerOf({ type: "harpiesLurk" }, fired)).toBe(HAZARD_HARPIES);
    expect(ownerOf({ type: "harpiesLurk" }, [])).toBeUndefined();
    expect(ownerOf({ type: "strangerVanished", creatureId: 5, artifact: 10 }, fired)).toBeUndefined();
  });

  it("tags a Desertion roll view and a Mutiny notice with their card", () => {
    const roll: GameEvent[] = [{ type: "hazardFired", hazard: HAZARD_DESERTION }, { type: "desertionRoll", creatureId: 5, roll: 1, deserted: true, items: [] }];
    expect(rollFromEvents(roll)?.hazard).toBe(HAZARD_DESERTION);
    const ns = eventNotices([{ type: "hazardFired", hazard: HAZARD_MUTINY }]);
    expect(ns.length).toBeGreaterThan(0);
    expect(ns.every((n) => n.hazard === HAZARD_MUTINY)).toBe(true);
  });

  // Issue #133: a popup took the card of whichever spent hazard fired in the same action, whatever the popup was about.
  it("gives a hazard's card to its own notices only, not to others from the same action", () => {
    const ns = eventNotices([
      { type: "hazardFired", hazard: HAZARD_HARPIES },
      { type: "strangerVanished", creatureId: 5, artifact: 10 },
      { type: "harpiesLurk" },
    ]);
    expect(ns.find((n) => /vanishes/i.test(n.text))?.hazard).toBeUndefined();
    expect(ns.find((n) => /circle overhead/i.test(n.text))?.hazard).toBe(HAZARD_HARPIES);
  });

  it("puts no hazard card on a reaction or Medusa roll, even when a hazard fired with it", () => {
    const fired: GameEvent = { type: "hazardFired", hazard: HAZARD_MUTINY };
    expect(rollFromEvents([{ type: "reaction", roll: 3, outcome: "hostile", creatureId: 1, hostileMax: 2, indiffMax: 4 } as never, fired])?.hazard).toBeUndefined();
    expect(rollFromEvents([{ type: "medusaGaze", rolls: [] } as never, fired])?.hazard).toBeUndefined();
  });

  it("shows the card in the aftermath pop-up and in the dice pop-up", () => {
    const ns = eventNotices([{ type: "hazardFired", hazard: HAZARD_MUTINY }]);
    const { unmount } = render(<NoticeModal notices={ns} cards={cards} onClose={() => {}} />);
    expect(screen.getByAltText("Mutiny card")).toHaveAttribute("src", "/m.png");
    unmount();
    render(<DiceRoll title="Desertion" lanes={[{ enemy: { value: 1 } }]} tone="bad" hazard={HAZARD_DESERTION} cards={cards} onContinue={() => {}} />);
    expect(screen.getByAltText("Desertion card")).toBeInTheDocument();
  });
});
