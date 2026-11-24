import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const join = vi.fn();
vi.mock("convex/react", () => ({
  useAction: (ref: string) => (ref === "createMultiplayer" ? create : join),
  useQuery: (_ref: string, args: unknown) => (args === "skip" ? undefined : { lobby: "open", takenColors: [], youSeat: null }),
}));
vi.mock("../../convex/_generated/api", () => ({ api: { multiplayer: { createMultiplayer: "createMultiplayer", joinByCode: "joinByCode", lobby: "lobby" } } }));
vi.mock("../manual/HelpButton", () => ({ HelpButton: () => null }));

import { MultiplayerSetup } from "./MultiplayerSetup";

const fill = (name: string) => {
  fireEvent.change(screen.getByLabelText("party name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "green" }));
};

beforeEach(() => {
  create.mockReset().mockResolvedValue({ gameId: "g", code: "ABCD" });
  join.mockReset().mockResolvedValue({ ok: true, gameId: "g" });
});

describe("MultiplayerSetup party name", () => {
  it("warns that the name is checked", () => {
    render(<MultiplayerSetup mode="create" onEnterLobby={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/checked first/i)).toBeInTheDocument();
    expect(screen.getByLabelText("party name")).toHaveAccessibleDescription(/checked first/i);
  });

  it("creating: a refused name shows the reason and stays on the form", async () => {
    create.mockRejectedValueOnce(new ConvexError("That name can't be used. Please choose another."));
    const onEnterLobby = vi.fn();
    render(<MultiplayerSetup mode="create" onEnterLobby={onEnterLobby} onCancel={() => {}} />);
    fill("Rude Name");
    fireEvent.click(screen.getByRole("button", { name: "Create game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That name can't be used.");
    expect(onEnterLobby).not.toHaveBeenCalled();
    expect(screen.getByLabelText("party name")).toHaveValue("Rude Name");
    fireEvent.change(screen.getByLabelText("party name"), { target: { value: "The Bold" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create game" }));
    await waitFor(() => expect(onEnterLobby).toHaveBeenCalledWith("ABCD"));
  });

  it("joining: a refused name shows the server's message, not a generic one", async () => {
    join.mockResolvedValue({ ok: false, reason: "name_rejected", message: "That name can't be used. Please choose another." });
    render(<MultiplayerSetup mode="join" onEnterLobby={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("game code"), { target: { value: "ABCD" } });
    fill("Rude Name");
    fireEvent.click(screen.getByRole("button", { name: "Join game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That name can't be used.");
  });

  it("joining: the old reasons still read as before, and too-many-attempts shows its message", async () => {
    join.mockResolvedValueOnce({ ok: false, reason: "name_taken" }).mockRejectedValueOnce(new ConvexError("Too many join attempts. Please try again in about 5 minutes."));
    render(<MultiplayerSetup mode="join" onEnterLobby={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("game code"), { target: { value: "ABCD" } });
    fill("Taken");
    fireEvent.click(screen.getByRole("button", { name: "Join game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That party name is taken");
    fireEvent.click(screen.getByRole("button", { name: "Join game" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Too many join attempts"));
  });
});
