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
