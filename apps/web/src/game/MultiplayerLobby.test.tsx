import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi, beforeEach, type Mock } from "vitest";
import { useQuery } from "convex/react";
import { MultiplayerLobby } from "./MultiplayerLobby";

/**
 * M7 game variants in the lobby: the HOST gets three toggles (Fog of war, Concurrent
 * exploration, Extension kit — Task 8, the MP exposure switch); everyone else gets read-only
 * chips. Zombies is withdrawn from the UI while its kit interaction is rethought (MSW,
 * 2026-07-28) — engine/backend still honor it, and a game carrying it still chips itself.
 * Convex is mocked out — this exercises the pure host/guest rendering.
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

test("the host sees three variant toggles — Zombies is withdrawn from the UI (MSW, 2026-07-28)", () => {
  (useQuery as Mock).mockReturnValue(lobbyFixture());
  render(<MultiplayerLobby code="ABCD" onExit={() => {}} />);
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(3); // fog of war, concurrent exploration, extension kit
  expect(screen.queryByLabelText(/Zombies/)).toBeNull(); // implementation being rethought
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
  // A game that already carries zombies still labels itself; the option itself is withdrawn.
  expect(screen.getByText(/Zombies ✓/)).toBeTruthy();
  expect(screen.getByText(/Fog of war —/)).toBeTruthy();
});

test("guests see no Zombies chip at all when the game doesn't carry it", () => {
  (useQuery as Mock).mockReturnValue(lobbyFixture({
    isHost: false, youSeat: 1, variants: { fogLite: true },
  }));
  render(<MultiplayerLobby code="ABCD" onExit={() => {}} />);
  expect(screen.queryByText(/Zombies/)).toBeNull(); // withdrawn option isn't advertised
  expect(screen.getByText(/Fog of war ✓/)).toBeTruthy();
});

test("the host sees and can set the extension kit toggle (Task 8 exposure switch)", () => {
  (useQuery as Mock).mockReturnValue(lobbyFixture({
    variants: { zombies: true, fogLite: false, concurrent: false, extensionKit: false },
  }));
  render(<MultiplayerLobby code="ABCD" onExit={() => {}} />);
  const kitBox = screen.getByLabelText(/Extension kit/);
  expect(kitBox).not.toBeChecked();
  fireEvent.click(kitBox);
  // Merged object: the sibling flags (zombies/fogLite/concurrent) are preserved untouched.
  expect(mutationSpy).toHaveBeenCalledWith({
    gameId: "g1",
    variants: { zombies: true, fogLite: false, concurrent: false, extensionKit: true },
  });
});

test("non-host sees the extension kit as a read-only chip, not a checkbox", () => {
  (useQuery as Mock).mockReturnValue(lobbyFixture({
    isHost: false, youSeat: 1, variants: { zombies: true, extensionKit: true },
  }));
  render(<MultiplayerLobby code="ABCD" onExit={() => {}} />);
  expect(screen.queryByLabelText(/Extension kit/)).toBeNull();
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(screen.getByText(/Extension kit ✓/)).toBeTruthy();
});

test("the extension kit toggle is locked (gone, with the rest of the lobby) once the game has started", () => {
  (useQuery as Mock).mockReturnValue(lobbyFixture({ lobby: "started", variants: { extensionKit: true } }));
  render(<MultiplayerLobby code="ABCD" onExit={() => {}} />);
  // Once started, the lobby hands off to MultiplayerGame (mocked to null) — no toggle to touch.
  expect(screen.queryByLabelText(/Extension kit/)).toBeNull();
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
});
