import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { UnionProposal } from "@sorcerers-cave/engine";
import { UnionPanel, type UnionDispatch, type UnionView } from "./UnionPanel";

const parties = [
  { seat: 0, name: "Alpha", color: "green" },
  { seat: 1, name: "Beta", color: "blue" },
];

const proposal = (over: Partial<UnionProposal> = {}): UnionProposal => ({
  kind: "unionProposal", area: 0, commander: 0, invited: [1], accepted: [0],
  window: { seat: 1, deadline: Date.now() + 60_000, kind: "unionRespond" }, ...over,
});

const union = (over: Partial<UnionView> = {}): UnionView => ({
  id: 1, commander: 0, commanderName: "Alpha", youAreCommander: false,
  members: [
    { seat: 0, name: "Alpha", color: "green" },
    { seat: 1, name: "Beta", color: "blue" },
  ],
  recruits: [], dissolved: false, alloc: null, ...over,
});

const mkDispatch = (): UnionDispatch => ({
  respondUnion: vi.fn(), leaveUnion: vi.fn(), dissolveUnion: vi.fn(), allocateRecruit: vi.fn(),
});

describe("UnionPanel (spec I-6/I-7)", () => {
  it("shows the invitee the proposal with a countdown; Accept and Decline dispatch respondUnion", () => {
    const d = mkDispatch();
    render(<UnionPanel proposal={proposal()} union={null} youSeat={1} parties={parties} dispatch={d} />);
    expect(screen.getByTestId("union-proposal").textContent).toMatch(/Alpha proposes a union under Alpha/);
    expect(screen.getByText(/silence is refusal/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("union-accept"));
    expect(d.respondUnion).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByTestId("union-decline"));
    expect(d.respondUnion).toHaveBeenCalledWith(false);
  });

  it("shows the proposer a waiting chip (no modal) while the invitee ponders", () => {
    const d = mkDispatch();
    render(<UnionPanel proposal={proposal()} union={null} youSeat={0} parties={parties} dispatch={d} />);
    expect(screen.queryByTestId("union-proposal")).toBeNull();
    expect(screen.getByTestId("union-waiting").textContent).toMatch(/waiting on Beta/);
  });

  it("renders the union chip for a member with commander, colour dots and Leave", () => {
    const d = mkDispatch();
    render(<UnionPanel proposal={null} union={union()} youSeat={1} parties={parties} dispatch={d} />);
    const chip = screen.getByTestId("union-chip");
    expect(chip.textContent).toMatch(/Alpha commanding/);
    expect(chip.textContent).toMatch(/under command/);
    expect(chip.querySelectorAll(".scv-union-dot")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("union-leave"));
    expect(d.leaveUnion).toHaveBeenCalled();
  });

  it("offers the commander Dissolve instead of Leave", () => {
    const d = mkDispatch();
    render(<UnionPanel proposal={null} union={union({ youAreCommander: true })} youSeat={0} parties={parties} dispatch={d} />);
    expect(screen.getByTestId("union-chip").textContent).toMatch(/you command/);
    expect(screen.queryByTestId("union-leave")).toBeNull();
    fireEvent.click(screen.getByTestId("union-dissolve"));
    expect(d.dissolveUnion).toHaveBeenCalled();
  });

  it("allocation modal proposes recruit→seat and agrees to a pending allocation", () => {
    const d = mkDispatch();
    const dissolved = union({ dissolved: true, recruits: [{ name: "Goblin" }] });
    const { rerender } = render(
      <UnionPanel proposal={null} union={dissolved} youSeat={1} parties={parties} dispatch={d} />,
    );
    const modal = screen.getByTestId("union-alloc");
    expect(modal.textContent).toMatch(/Goblin/);
    // propose: the Goblin joins Alpha (seat 0)
    fireEvent.click(screen.getByTestId("alloc-0-0"));
    expect(d.allocateRecruit).toHaveBeenCalledWith(0, 0);
    // the pending proposal renders its agreement count; agreeing re-dispatches the SAME pairing
    rerender(
      <UnionPanel
        proposal={null}
        union={union({ dissolved: true, recruits: [{ name: "Goblin" }], alloc: { recruit: 0, to: 0, approved: [0] } })}
        youSeat={1} parties={parties} dispatch={d}
      />,
    );
    expect(screen.getByTestId("alloc-0-0").textContent).toMatch(/\(1\/2\)/);
    fireEvent.click(screen.getByTestId("alloc-0-0"));
    expect(d.allocateRecruit).toHaveBeenLastCalledWith(0, 0);
    // a member who already agreed cannot double-vote
    rerender(
      <UnionPanel
        proposal={null}
        union={union({ dissolved: true, recruits: [{ name: "Goblin" }], alloc: { recruit: 0, to: 0, approved: [0, 1] } })}
        youSeat={1} parties={parties} dispatch={d}
      />,
    );
    expect(screen.getByTestId("alloc-0-0")).toBeDisabled();
  });
});
