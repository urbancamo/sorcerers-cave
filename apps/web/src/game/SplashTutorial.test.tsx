import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SplashScreen } from "./SplashScreen";
import { loadProgress, saveProgress } from "../tutorial/progress";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  } });
});

describe("SplashScreen tutorial entry", () => {
  it("suggests the tutorial on a first visit, and starting it from the callout begins it fresh", () => {
    const onTutorial = vi.fn();
    render(<SplashScreen onStartSolitaire={() => {}} onStartTutorial={onTutorial} />);
    expect(screen.getByTestId("tutorial-nudge")).toBeInTheDocument();
    expect(screen.queryByTestId("howto-nudge")).toBeNull(); // one suggestion at a time
    fireEvent.click(screen.getByRole("button", { name: /play the tutorial/i }));
    expect(onTutorial).toHaveBeenCalledWith(false);
    expect(loadProgress()).toEqual({ status: "step", step: 0, cursor: 0 });
  });

  it("is not suggested again once dismissed, but the Tutorial button stays", () => {
    const { unmount } = render(<SplashScreen onStartSolitaire={() => {}} onStartTutorial={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByTestId("tutorial-nudge")).toBeNull();
    expect(loadProgress()).toEqual({ status: "skipped" });
    unmount();
    render(<SplashScreen onStartSolitaire={() => {}} onStartTutorial={() => {}} />);
    expect(screen.queryByTestId("tutorial-nudge")).toBeNull();
    expect(screen.getByTestId("start-tutorial")).toBeInTheDocument();
  });

  it("offers Continue and Start over to a player part-way through, and Continue resumes", () => {
    saveProgress({ status: "step", step: 5, cursor: 2 });
    const onTutorial = vi.fn();
    render(<SplashScreen onStartSolitaire={() => {}} onStartTutorial={onTutorial} />);
    expect(screen.queryByTestId("tutorial-nudge")).toBeNull();
    fireEvent.click(screen.getByTestId("continue-tutorial"));
    expect(onTutorial).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByTestId("restart-tutorial"));
    expect(onTutorial).toHaveBeenLastCalledWith(false);
    expect(loadProgress()).toEqual({ status: "step", step: 0, cursor: 0 });
  });
});
