import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { startingStock, selectionCost } from "@sorcerers-cave/engine";
import { PartyDraft, type DraftProjection } from "./PartyDraft";
import type { Id } from "../../convex/_generated/dataModel";

// PartyDraft's `pick` mutation is fired via useMutation — stub it out, the tests here are about
// what the draft renders, not the submit round-trip (that's PartySelect's own coverage).
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("../data/manifest", () => ({
  loadManifest: () => Promise.resolve({ cards: [] }),
  resolveCard: () => null,
}));

const gameId = "g1" as Id<"games">;

/** The `.scv-card-cost` text ("cost N · n/avail") for the named creature's card — mirrors
 *  PartySelect.test.tsx's helper so cost assertions can't collide across same-cost creatures. */
const costOf = (name: RegExp) => within(screen.getByText(name, { selector: ".scv-card-nm" }).closest(".scv-card")!);

const baseParties = (over: Partial<DraftProjection["parties"][number]>[] = []) => [
  { seat: 0, name: "Alpha", color: "green", status: "picking", members: [] },
  { seat: 1, name: "Beta", color: "blue", status: "waiting", members: [] },
  ...over,
] as unknown as DraftProjection["parties"];

describe("PartyDraft — extension kit parity (SC-EXT-29)", () => {
  it("kit-off: your turn shows only the base roster at base costs (byte-identical draft)", () => {
    const proj: DraftProjection = {
      youSeat: 0, currentPicker: 0,
      parties: baseParties(),
      draft: { remaining: startingStock(), budget: 6 },
    };
    render(<PartyDraft gameId={gameId} proj={proj} />);
    expect(screen.queryByRole("button", { name: /add witch/i })).toBeNull();
    expect(costOf(/^Ogre$/).getByText(/cost 5 ·/)).toBeInTheDocument();
    expect(costOf(/^Troll$/).getByText(/cost 4 ·/)).toBeInTheDocument();
  });

  it("kit-on: your turn offers Witch/Scholar/Thief/Lion/Wolf at their official costs", () => {
    const variants = { extensionKit: true };
    const proj: DraftProjection = {
      youSeat: 0, currentPicker: 0,
      parties: baseParties(),
      draft: { remaining: startingStock(variants), budget: 6, extensionKit: true },
    };
    render(<PartyDraft gameId={gameId} proj={proj} />);
    expect(costOf(/^Witch$/).getByText(new RegExp(`cost ${selectionCost(18, variants)} ·`))).toBeInTheDocument();
    expect(costOf(/^Scholar$/).getByText(new RegExp(`cost ${selectionCost(17, variants)} ·`))).toBeInTheDocument();
    expect(costOf(/^Thief$/).getByText(new RegExp(`cost ${selectionCost(19, variants)} ·`))).toBeInTheDocument();
    expect(costOf(/^Lion$/).getByText(new RegExp(`cost ${selectionCost(16, variants)} ·`))).toBeInTheDocument();
    expect(costOf(/^Wolf$/).getByText(new RegExp(`cost ${selectionCost(20, variants)} ·`))).toBeInTheDocument();
  });

  it("kit-on: Ogre and Troll show their revised costs (4/3), not base (5/4)", () => {
    const variants = { extensionKit: true };
    const proj: DraftProjection = {
      youSeat: 0, currentPicker: 0,
      parties: baseParties(),
      draft: { remaining: startingStock(variants), budget: 6, extensionKit: true },
    };
    render(<PartyDraft gameId={gameId} proj={proj} />);
    expect(costOf(/^Ogre$/).getByText(/cost 4 ·/)).toBeInTheDocument();
    expect(costOf(/^Troll$/).getByText(/cost 3 ·/)).toBeInTheDocument();
  });

  it("kit-off waiting view: a rival's already-drafted kit member never renders undefined (ALL_CREATURES)", () => {
    // Regression guard: the roster preview must resolve kit ids even when this seat isn't picking.
    const proj: DraftProjection = {
      youSeat: 0, currentPicker: 1,
      parties: baseParties([]).map((p) => (p.seat === 0 ? { ...p, members: [18] } : p)) as DraftProjection["parties"],
      draft: { remaining: startingStock({ extensionKit: true }), budget: 6, extensionKit: true },
    };
    expect(() => render(<PartyDraft gameId={gameId} proj={proj} />)).not.toThrow();
    expect(screen.getByText(/witch/i)).toBeInTheDocument();
  });
});
