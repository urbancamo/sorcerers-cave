import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi, beforeEach, type Mock } from "vitest";
import { useQuery } from "convex/react";
import { MultiplayerLobby } from "./MultiplayerLobby";

/**
 * M7 game variants in the lobby: the HOST gets two toggles (Zombies, Fog of war); everyone else
 * gets read-only chips. Convex is mocked out — this exercises the pure host/guest rendering.
 */

const { mutationSpy } = vi.hoisted(() => ({ mutationSpy: vi.fn() }));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: () => mutationSpy,
}));
vi.mock("./ChatPanel", () => ({ ChatPanel: () => null }));
vi.mock("./MultiplayerGame", () => ({ MultiplayerGame: () => null }));

const lobbyFixture = (over: Record<string, unknown> = {}) => ({
  gameId: "g1",
  code: "ABCD",
  lobby: "open",
  maxSeats: 4,
  variants: { zombies: true },
  takenColors: ["green", "blue"],
  youSeat: 0,
  isHost: true,
  seats: [
    { seat: 0, partyName: "Alpha", color: "green", ready: false, isHost: true, isYou: true },
    { seat: 1, partyName: "Beta", color: "blue", ready: true, isHost: false, isYou: false },
  ],
  ...over,
});

beforeEach(() => {
  mutationSpy.mockClear();
});

test("the host sees two variant toggles reflecting the stored state", () => {
  (useQuery as Mock).mockReturnValue(lobbyFixture());
  render(<MultiplayerLobby code="ABCD" onExit={() => {}} />);
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(2);
  expect(screen.getByLabelText(/Zombies/)).toBeChecked();
  expect(screen.getByLabelText(/Fog of war/)).not.toBeChecked();
});

test("toggling a variant sends the merged variants object", () => {
  (useQuery as Mock).mockReturnValue(lobbyFixture());
  render(<MultiplayerLobby code="ABCD" onExit={() => {}} />);
  fireEvent.click(screen.getByLabelText(/Fog of war/));
  expect(mutationSpy).toHaveBeenCalledWith({ gameId: "g1", variants: { zombies: true, fogLite: true } });
});

test("guests get read-only chips, never toggles (host-only control)", () => {
  (useQuery as Mock).mockReturnValue(lobbyFixture({
    isHost: false, youSeat: 1, variants: { zombies: true, fogLite: false },
  }));
  render(<MultiplayerLobby code="ABCD" onExit={() => {}} />);
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(screen.getByText(/Zombies ✓/)).toBeTruthy();
  expect(screen.getByText(/Fog of war —/)).toBeTruthy();
});
