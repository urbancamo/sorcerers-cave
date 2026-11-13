import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let data: { multiplayerEnabled: boolean } | undefined;
const setOptions = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: () => data,
  useMutation: () => setOptions,
}));
vi.mock("../../convex/_generated/api", () => ({ api: { settings: { get: "get", setOptions: "setOptions" } } }));

import { SystemTab } from "./SystemTab";

const toggle = () => screen.getByRole("switch");
const save = () => screen.getByRole("button", { name: "Save modified options" });
const cancel = () => screen.getByRole("button", { name: "Cancel" });

beforeEach(() => {
  setOptions.mockReset().mockResolvedValue({ multiplayerEnabled: true });
  data = { multiplayerEnabled: false };
});

describe("SystemTab", () => {
  it("shows Multiplayer OFF by default, with nothing to save", () => {
    render(<SystemTab />);
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("OFF")).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(cancel()).toBeDisabled();
  });

  it("waits for the saved value before showing the form", () => {
    data = undefined;
    render(<SystemTab />);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("asks first: the toggle opens a guard dialog and changes nothing until it is confirmed", () => {
    render(<SystemTab />);
    fireEvent.click(toggle());
    expect(screen.getByRole("alertdialog", { name: "Turn Multiplayer ON?" })).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(save()).toBeDisabled();
  });

  it("Escape answers the guard dialog with Cancel", () => {
    render(<SystemTab />);
    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(toggle()).toHaveAttribute("aria-checked", "false");
  });

  it("a confirmed change is a draft until Save modified options writes it", async () => {
    render(<SystemTab />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Turn it on" }));
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/not saved yet/i)).toBeInTheDocument();
    expect(setOptions).not.toHaveBeenCalled();
    fireEvent.click(save());
    await waitFor(() => expect(setOptions).toHaveBeenCalledWith({ multiplayerEnabled: true }));
    expect(await screen.findByText("Options saved.")).toBeInTheDocument();
  });

  it("Cancel at the foot of the form throws the draft away", () => {
    render(<SystemTab />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Turn it on" }));
    expect(save()).toBeEnabled();
    fireEvent.click(cancel());
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(save()).toBeDisabled();
    expect(setOptions).not.toHaveBeenCalled();
  });

  it("switching it back to the saved value leaves nothing to save", () => {
    data = { multiplayerEnabled: true };
    render(<SystemTab />);
    fireEvent.click(toggle());
    expect(screen.getByRole("alertdialog", { name: "Turn Multiplayer OFF?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Turn it off" }));
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Turn it on" }));
    expect(save()).toBeDisabled();
  });

  it("shows the server's reason when the save is refused and keeps the draft", async () => {
    setOptions.mockRejectedValue(new Error("[CONVEX M(settings:setOptions)] Server Error Uncaught Error: Forbidden\n at x"));
    render(<SystemTab />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Turn it on" }));
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });
});
