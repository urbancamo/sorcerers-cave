import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

const TABS = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }, { id: "c", label: "Gamma" }] as const;

function Demo() {
  const [v, setV] = useState<"a" | "b" | "c">("a");
  return <Tabs tabs={[...TABS]} value={v} onChange={setV} label="Demo">{`pane ${v}`}</Tabs>;
}

describe("Tabs", () => {
  it("is a tablist with one selected tab, and a pane labelled by it", () => {
    render(<Demo />);
    expect(screen.getByRole("tablist", { name: "Demo" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "false");
    const pane = screen.getByRole("tabpanel", { name: "Alpha" });
    expect(pane).toHaveTextContent("pane a");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-controls", pane.id);
  });

  it("only the selected tab is in the tab order", () => {
    render(<Demo />);
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("tabindex", "-1");
  });

  it("clicking selects", () => {
    render(<Demo />);
    fireEvent.click(screen.getByRole("tab", { name: "Gamma" }));
    expect(screen.getByRole("tabpanel", { name: "Gamma" })).toHaveTextContent("pane c");
  });

  it("arrow keys move and select, wrapping at both ends; Home and End jump", () => {
    render(<Demo />);
    const list = screen.getByRole("tablist");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveFocus();
    fireEvent.keyDown(list, { key: "End" });
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true"); // wraps
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-selected", "true"); // wraps back
    fireEvent.keyDown(list, { key: "Home" });
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveFocus();
  });

  it("ignores other keys", () => {
    render(<Demo />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "x" });
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
  });
});
