import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { CaveHud } from "./CaveHud";

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
