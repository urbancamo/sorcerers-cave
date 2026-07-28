import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, type TradeSession } from "@sorcerers-cave/engine";
import { TradeModal, type TradeDispatch } from "./TradeModal";

const session = (over: Partial<TradeSession> = {}): TradeSession => ({
  kind: "trade", area: 0, a: 0, b: 1,
  basketA: { treasure: [], members: [] }, basketB: { treasure: [], members: [] },
  confirmedA: false, confirmedB: false, window: null, ...over,
});

const mkDispatch = (): TradeDispatch => ({ updateBasket: vi.fn(), confirm: vi.fn(), cancel: vi.fn() });

describe("TradeModal (spec I-5)", () => {
  it("offers your held treasure; toggling it updates your basket", () => {
    const d = mkDispatch();
    const s = newGame(1, [5, 7]); // Man + Dwarf
    s.party[0]!.treasure.push(1); // Gold
    render(<TradeModal session={session()} youSeat={0} yourState={s} otherName="Red Talons" dispatch={d} />);
    fireEvent.click(screen.getByRole("button", { name: /gold/i }));
    expect(d.updateBasket).toHaveBeenCalledWith([1], []);
  });

  it("shows the other side's offer read-only and confirms", () => {
    const d = mkDispatch();
    const s = newGame(1, [5, 7]);
    render(
      <TradeModal
        session={session({ basketB: { treasure: [3], members: [] }, confirmedB: true })}
        youSeat={0} yourState={s} otherName="Red Talons" dispatch={d}
      />,
    );
    expect(screen.getByTestId("trade-theirs").textContent).toMatch(/magic sword/i);
    expect(screen.getByText(/has confirmed this exchange/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("trade-confirm"));
    expect(d.confirm).toHaveBeenCalled();
  });

  it("disables your confirm once you have confirmed (awaiting the other side)", () => {
    const d = mkDispatch();
    const s = newGame(1, [5, 7]);
    render(
      <TradeModal session={session({ confirmedA: true })} youSeat={0} yourState={s} otherName="Red Talons" dispatch={d} />,
    );
    const btn = screen.getByTestId("trade-confirm");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toMatch(/waiting/i);
  });
});

describe("extension kit (SC-EXT-29): kit creatures/artifacts render by name, not '#id'/'?'", () => {
  it("names a kit member and a kit artefact in your offer — no base-only fallback", () => {
    const d = mkDispatch();
    const s = newGame(1, [20, 7], { extensionKit: true }); // Wolf (kit id 20) + Dwarf
    s.party[0]!.treasure.push(16); // Holy Water (kit treasure id 16)
    render(<TradeModal session={session()} youSeat={0} yourState={s} otherName="Red Talons" dispatch={d} />);
    const yours = screen.getByTestId("trade-yours");
    expect(yours.textContent).toMatch(/holy water/i);
    expect(yours.textContent).toMatch(/wolf/i);
    expect(yours.textContent).not.toMatch(/#16/); // never the base-only TREASURES id fallback
    expect(yours.textContent).not.toMatch(/\(creature\).*\?/i);
  });
});
