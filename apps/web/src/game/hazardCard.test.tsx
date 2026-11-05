import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HAZARD_DESERTION, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_QUARREL, type GameEvent } from "@sorcerers-cave/engine";
import { spentHazard } from "./hazardCard";
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
  it("names the spent hazard from its events, but not Ghouls (they stay in the chamber)", () => {
    expect(spentHazard([{ type: "hazardFired", hazard: HAZARD_MUTINY }])).toBe(HAZARD_MUTINY);
    expect(spentHazard([{ type: "quarrelFizzled" }])).toBe(HAZARD_QUARREL);
    expect(spentHazard([{ type: "hazardFired", hazard: HAZARD_GHOULS }])).toBeNull();
    expect(spentHazard([])).toBeNull();
  });

  it("tags a Desertion roll view and a Mutiny notice with their card", () => {
    const roll: GameEvent[] = [{ type: "hazardFired", hazard: HAZARD_DESERTION }, { type: "desertionRoll", creatureId: 5, roll: 1, deserted: true, items: [] }];
    expect(rollFromEvents(roll)?.hazard).toBe(HAZARD_DESERTION);
    const ns = eventNotices([{ type: "hazardFired", hazard: HAZARD_MUTINY }]);
    expect(ns.length).toBeGreaterThan(0);
    expect(ns.every((n) => n.hazard === HAZARD_MUTINY)).toBe(true);
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
