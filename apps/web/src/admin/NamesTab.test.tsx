import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

let scores: unknown[] | undefined;
let parties: unknown[] | undefined;
let audit: unknown[] | undefined;
const mutations: Record<string, ReturnType<typeof vi.fn>> = {};
const fn = (name: string) => (mutations[name] ??= vi.fn());

vi.mock("convex/react", () => ({
  useQuery: (ref: string) => (ref === "highScores" ? scores : ref === "parties" ? parties : audit),
  useMutation: (ref: string) => fn(ref),
}));
vi.mock("../../convex/_generated/api", () => ({
  api: { adminNames: {
    highScores: "highScores", parties: "parties", audit: "audit",
    renameHighScore: "renameHighScore", clearHighScore: "clearHighScore", renameParty: "renameParty", clearParty: "clearParty",
  } },
}));

import { NamesTab } from "./NamesTab";

const score = (id: string, name: string, over = {}) => ({ _id: id, name, score: 40, mode: "solo", gameCode: null, partyName: null, createdAt: 0, ...over });
const party = (id: string, partyName: string, over = {}) => ({ _id: id, gameId: "g", seat: 0, partyName, color: "green", createdAt: 0, withParties: ["Polite"], ...over });

beforeEach(() => {
  for (const k of Object.keys(mutations)) delete mutations[k];
  scores = [score("s1", "Offensive"), score("s2", "Gandalf", { mode: "multi", gameCode: "ABCD" })];
  parties = [party("p1", "Rude Name")];
  audit = [{ _id: "a1", at: 0, kind: "highScore", before: "Rude", after: "Anonymous" }];
});

describe("NamesTab: high scores", () => {
  it("lists the entries with their context", () => {
    render(<NamesTab />);
    expect(screen.getByText("Offensive")).toBeInTheDocument();
    expect(screen.getByText(/40 points · solo/)).toBeInTheDocument();
    expect(screen.getByText(/multiplayer ABCD/)).toBeInTheDocument();
  });

  it("waits for the data, and says so when there is none", () => {
    scores = undefined;
    const { unmount } = render(<NamesTab />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    unmount();
    scores = [];
    render(<NamesTab />);
    expect(screen.getByText("No entries yet.")).toBeInTheDocument();
  });

  it("filters by name", () => {
    render(<NamesTab />);
    fireEvent.change(screen.getByLabelText("Filter high-score names"), { target: { value: "gand" } });
    expect(screen.queryByText("Offensive")).toBeNull();
    expect(screen.getByText("Gandalf")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter high-score names"), { target: { value: "zzz" } });
    expect(screen.getByText("No names match.")).toBeInTheDocument();
  });

  it("edits a name: the new one is sent, and the form closes", async () => {
    render(<NamesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Offensive" }));
    fireEvent.change(screen.getByLabelText("New name for Offensive"), { target: { value: "Gandalf the Grey" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fn("renameHighScore")).toHaveBeenCalledWith({ id: "s1", name: "Gandalf the Grey" }));
    await waitFor(() => expect(screen.queryByLabelText("New name for Offensive")).toBeNull());
  });

  it("cancelling an edit sends nothing", () => {
    render(<NamesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Offensive" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Offensive")).toBeInTheDocument();
    expect(fn("renameHighScore")).not.toHaveBeenCalled();
  });

  it("Save is off for an empty name", () => {
    render(<NamesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Offensive" }));
    fireEvent.change(screen.getByLabelText("New name for Offensive"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("clears a name", async () => {
    render(<NamesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Clear Offensive" }));
    await waitFor(() => expect(fn("clearHighScore")).toHaveBeenCalledWith({ id: "s1" }));
  });

  it("shows the server's reason when a change is refused, and keeps the form open", async () => {
    fn("renameHighScore").mockRejectedValue(new ConvexError("A name can be at most 40 characters."));
    render(<NamesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Offensive" }));
    fireEvent.change(screen.getByLabelText("New name for Offensive"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at most 40 characters");
    expect(screen.getByLabelText("New name for Offensive")).toBeInTheDocument();
  });
});

describe("NamesTab: party names and changes", () => {
  it("renames and clears a party", async () => {
    render(<NamesTab />);
    fireEvent.click(screen.getByRole("tab", { name: "Party names" }));
    expect(screen.getByText(/green · seat 1 · with Polite/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Rude Name" }));
    fireEvent.change(screen.getByLabelText("New name for Rude Name"), { target: { value: "The Bold" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fn("renameParty")).toHaveBeenCalledWith({ playerId: "p1", name: "The Bold" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear Rude Name" }));
    await waitFor(() => expect(fn("clearParty")).toHaveBeenCalledWith({ playerId: "p1" }));
  });

  it("shows the record of changes", () => {
    render(<NamesTab />);
    fireEvent.click(screen.getByRole("tab", { name: "Changes" }));
    const row = screen.getByText("Rude").closest("li")!;
    expect(within(row).getByText("Anonymous")).toBeInTheDocument();
    expect(within(row).getByText(/high score/)).toBeInTheDocument();
  });

  it("says so when nothing has been changed", () => {
    audit = [];
    render(<NamesTab />);
    fireEvent.click(screen.getByRole("tab", { name: "Changes" }));
    expect(screen.getByText("No names have been changed yet.")).toBeInTheDocument();
  });
});
