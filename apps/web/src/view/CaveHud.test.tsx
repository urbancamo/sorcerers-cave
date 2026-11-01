import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import type { GameState } from "@sorcerers-cave/engine";
import { CaveHud, cursesInForce } from "./CaveHud";

const ref = () => createRef<HTMLDivElement>();

describe("CaveHud — game-log button", () => {
  it("shows the Log button and fires onLog when it is provided", () => {
    const onLog = vi.fn();
    render(<CaveHud mountRef={ref()} onLog={onLog} />);
    const btn = screen.getByRole("button", { name: /game log/i });
    fireEvent.click(btn);
    expect(onLog).toHaveBeenCalledOnce();
  });

  it("hides the Log button when no onLog handler is given", () => {
    render(<CaveHud mountRef={ref()} />);
    expect(screen.queryByRole("button", { name: /game log/i })).toBeNull();
  });
});

describe("CaveHud — extension kit chip (SC-EXT-29, design US-01)", () => {
  it("shows an EXT chip when the game is a kit game", () => {
    render(<CaveHud mountRef={ref()} kitActive />);
    expect(screen.getByText("EXT")).toBeInTheDocument();
  });

  it("hides the EXT chip for a kit-off (or pre-kit) game", () => {
    render(<CaveHud mountRef={ref()} />);
    expect(screen.queryByText("EXT")).toBeNull();
    render(<CaveHud mountRef={ref()} kitActive={false} />);
    expect(screen.queryAllByText("EXT")).toHaveLength(0);
  });
});

describe("CaveHud — game code chip", () => {
  it("shows the CODE box with the game's resume code when provided", () => {
    render(<CaveHud mountRef={ref()} code="ABCD" />);
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("ABCD")).toBeInTheDocument();
  });

  it("hides the CODE box when no code is given", () => {
    render(<CaveHud mountRef={ref()} />);
    expect(screen.queryByText("Code")).toBeNull();
  });
});

describe("cursesInForce — the curse chip follows the rules, not the raw counter", () => {
  it("counts every curse while the Sorcerer lives", () => {
    expect(cursesInForce({ curses: 3, sorcererKilled: false } as GameState)).toBe(3);
  });

  it("is zero once the Sorcerer is slain, however many were taken", () => {
    expect(cursesInForce({ curses: 3, sorcererKilled: true } as GameState)).toBe(0);
  });
});

describe('CaveHud — thin shell', () => {
  it('drops the title, stat chips and help panel, and keeps the dock', () => {
    const { container } = render(<CaveHud mountRef={ref()} shell code="ABCD" onLog={() => {}} />);
    expect(container.querySelector('.brand')).toBeNull();
    expect(container.querySelector('.hint')).toBeNull();
    expect(container.querySelector('#cardpanel')).toBeNull(); // the React card panel replaces it
    expect(screen.queryByText('ABCD')).toBeNull();
    expect(container.querySelector('#snapBtn')).not.toBeNull();
    expect(screen.getByRole('button', { name: /game log/i })).toBeInTheDocument();
  });

  it('exposes the open slots to the stylesheet', () => {
    const { container } = render(<CaveHud mountRef={ref()} shell leftSlot="party" rightSlot="card" />);
    const hud = container.querySelector('#hud') as HTMLElement;
    expect(hud).toHaveClass('shell');
    expect(hud.dataset.left).toBe('party');
    expect(hud.dataset.right).toBe('card');
  });

  it('keeps the legacy HUD for the other views', () => {
    const { container } = render(<CaveHud mountRef={ref()} />);
    expect(container.querySelector('.brand')).not.toBeNull();
    expect(container.querySelector('.hint')).not.toBeNull();
  });
});
