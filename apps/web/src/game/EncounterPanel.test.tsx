import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, ALL_CREATURES, type GameState } from "@sorcerers-cave/engine";
import { EncounterPanel } from "./EncounterPanel";

function encounterState(): GameState {
  // Force an encounter: a Man+Woman party facing a lone Man stranger.
  return { ...newGame(1, [5, 6]), phase: "encounter", strangers: [5] };
}

describe("EncounterPanel", () => {
  it("renders nothing in the explore phase", () => {
    const { container } = render(<EncounterPanel state={newGame(1, [5, 6])} dispatch={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers encounter actions and dispatches the chosen one", () => {
    const dispatch = vi.fn();
    render(<EncounterPanel state={encounterState()} dispatch={dispatch} />);
    expect(screen.getByRole("button", { name: /test reaction/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /attack/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "attack" });
  });

  it("offers pickup actions", () => {
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] }; // Gold
    render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /leave/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "leaveTreasure" });
  });

  it("SC-4-18a: never renders a 'move' button — leaving an indifferent encounter is driven by the 3D exit markers, not this panel", () => {
    const s: GameState = { ...newGame(1, [5, 6]), phase: "encounter", strangers: [6], indiffStreak: 1 };
    s.areas[s.partyArea] = { ...s.areas[s.partyArea]!, card: 31 }; // N+E+S+W+chamber — legalActions now offers 4 moves
    render(<EncounterPanel state={s} dispatch={() => {}} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).not.toContain("move");
    expect(labels).toEqual(expect.arrayContaining(["Withdraw", "Attack", "Test reaction"]));
  });

  it("puts 'Retake dropped treasure' first, ahead of the per-item dropdowns", () => {
    const base = newGame(1, [0]); // Hero
    const pickup: GameState = { ...base, phase: "pickup", treasures: [1], fightDrops: [{ mi: 0, tid: 1 }] }; // Hero dropped Gold to fight
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    expect(screen.getAllByRole("button")[0]!).toHaveTextContent(/retake dropped treasure/i);
  });

  it("renders nothing in the fight phase (the FightSurface owns it)", () => {
    const s: GameState = { ...newGame(1, [0]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3] };
    const { container } = render(<EncounterPanel state={s} dispatch={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists a kit stranger/treasure by name, not a crash (SC-EXT-29)", () => {
    // A kit-on game's chamber can draw kit ids in `strangers`/`treasures` regardless of the
    // starting party — the small pack is shared. Before the ALL_CREATURES/ALL_TREASURES fix this
    // panel crashed (`CREATURES[16]`/`TREASURES[15]` are undefined in the base-only tables).
    const s: GameState = {
      ...newGame(1, [0], { extensionKit: true }),
      phase: "encounter",
      strangers: [16], // Lion (kit creature 16)
      treasures: [15], // Elixir (kit treasure 15)
    };
    render(<EncounterPanel state={s} dispatch={() => {}} />);
    expect(screen.getByText(/lion/i)).toBeInTheDocument();
    expect(screen.getByText(/elixir/i)).toBeInTheDocument();
  });

  it("offers the Chasm's descend button with a blocking confirm before dispatching (US-02)", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [0]);
    const s: GameState = { ...base, phase: "encounter", strangers: [3], areas: base.areas.map((a, i) => (i === 0 ? { ...a, card: 16 | (6 << 7) } : a)) };
    render(<EncounterPanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Descend the chasm" }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent(/cannot return this way/i);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "descendChasm" });
  });

  it("offers the Well's draw button with a blocking confirm before dispatching (US-07)", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [0]);
    const s: GameState = { ...base, phase: "encounter", strangers: [3], areas: base.areas.map((a, i) => (i === 0 ? { ...a, card: 16 | (11 << 7) } : a)) };
    render(<EncounterPanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw from the well" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "drawFromWell" });
  });

  it("offers the Bell Rope as a member-picker dropdown, then a confirm (US-03)", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [5, 6]); // Man + Woman
    const s: GameState = { ...base, phase: "encounter", strangers: [3], areas: base.areas.map((a, i) => (i === 0 ? { ...a, card: 16 | (7 << 7) } : a)) };
    render(<EncounterPanel state={s} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText("Bell Rope"), { target: { value: "0" } });
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent(/pull the bell rope with man/i);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "pullBellRope", mi: 0 });
  });

  it("explains an uncarryable treasure beside the rows for what CAN be taken", () => {
    // Man (50 kg) + Woman (25 kg), Gold takeable but the 100 kg Treasure Chest is not: the window
    // opens for the Gold, and the chest gets an info line instead of a silent, row-less listing.
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [14, 1] };
    render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    expect(screen.getByText("The Treasure Chest is too heavy for anyone to carry.")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled(); // something is takeable — no auto-skip
  });

  it("shows no too-heavy message when the treasure is carryable", () => {
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] }; // Gold, 25 kg
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    expect(screen.queryByText(/too heavy for anyone to carry/i)).not.toBeInTheDocument();
  });

  it("auto-skips a pickup where leaving is the only option (design 2026-07-28)", () => {
    // Nothing can be taken and nothing else is actionable: don't interrupt play with a window
    // whose only button is "Leave the treasure" — leave automatically and render nothing.
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [14] };
    const { container } = render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    expect(container).toBeEmptyDOMElement();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "leaveTreasure" });
  });

  it("auto-skip dispatches once per state, not once per render", () => {
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [14] };
    const { rerender } = render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    rerender(<EncounterPanel state={pickup} dispatch={dispatch} />);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("keeps the window (message included) while anything besides leaving is possible", () => {
    // The chest is uncarryable, but the fallen Man can be revived with the Woman's Healing Balm
    // (Balm users: Woman/W-Hero/Priest/Wizard) — the pause is real, so the window stays and
    // explains the chest.
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [14] };
    pickup.party[1]!.treasure.push(6); // the Woman carries the Healing Balm
    pickup.party[0]!.status = 3;      // the Man has fallen — revivable while looting
    pickup.party[0]!.diedTurn = pickup.turn; // this same turn/area — within the house-rule window (SC-11-15a)
    pickup.party[0]!.diedArea = pickup.partyArea;
    render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    expect(screen.getByText("The Treasure Chest is too heavy for anyone to carry.")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("auto-skips without a too-heavy claim when the whole party is down", () => {
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5]), phase: "pickup", treasures: [14] };
    pickup.party = pickup.party.map((m) => ({ ...m, status: 3 })); // everyone down
    const { container } = render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    expect(container).toBeEmptyDOMElement(); // no window, so no wrong "too heavy" wording either
    expect(dispatch).toHaveBeenCalledWith({ type: "leaveTreasure" });
  });

  it("shows no too-heavy message outside the pickup phase", () => {
    const s: GameState = { ...newGame(1, [5, 6]), phase: "encounter", strangers: [3], treasures: [14] };
    render(<EncounterPanel state={s} dispatch={() => {}} />);
    expect(screen.queryByText(/too heavy/i)).not.toBeInTheDocument();
  });

  it("offers the Medusa-pause choice as two plain buttons (throw the dust / proceed)", () => {
    const dispatch = vi.fn();
    const s: GameState = { ...newGame(1, [5, 6]), phase: "medusa", hazards: [3], medusaPause: { freshEntry: true } };
    s.party[0]!.treasure.push(5); // the Man carries the Lotus Dust
    render(<EncounterPanel state={s} dispatch={dispatch} />);
    expect(screen.getByText(/medusa looms/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /throw the lotus dust/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "useArtifact", artifact: 5 });
    fireEvent.click(screen.getByRole("button", { name: /proceed/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "proceed" });
  });
});

describe("EncounterPanel — the Sibyl (SC-SIB-4)", () => {
  const sibylEncounter = (over: Partial<GameState> = {}): GameState =>
    ({ ...newGame(1, [5, 6], { sibyl: true }), phase: "encounter", strangers: [], lulled: [21], ...over });

  it("names her when she is the one being tested, with only Withdraw and Test on offer", () => {
    render(<EncounterPanel state={sibylEncounter()} dispatch={() => {}} />);
    expect(screen.getByTestId("sibyl-waits")).toHaveTextContent(/the sibyl/i);
    expect(screen.getByRole("button", { name: /test reaction/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /attack/i })).toBeNull();
  });

  it("does not name her while real strangers are still to be dealt with first", () => {
    render(<EncounterPanel state={sibylEncounter({ strangers: [5] })} dispatch={() => {}} />);
    expect(screen.queryByTestId("sibyl-waits")).toBeNull();
  });

  it("does not name her once she has been met", () => {
    render(<EncounterPanel state={sibylEncounter({ sibylMet: true, strangers: [5] })} dispatch={() => {}} />);
    expect(screen.queryByTestId("sibyl-waits")).toBeNull();
  });
});

describe("EncounterPanel — artifact use lives on the item's card", () => {
  it("offers no artifact use of its own (Lotus Dust, Elixir, Scroll, Holy Water are used from their cards)", () => {
    const s: GameState = { ...newGame(1, [0], { extensionKit: true }), phase: "encounter", strangers: [3] };
    s.party[0]!.treasure.push(5, 15, 19, 16);
    render(<EncounterPanel state={s} dispatch={() => {}} />);
    expect(screen.queryByLabelText(/use lotus dust/i)).toBeNull();
    expect(screen.queryByLabelText("Elixir")).toBeNull();
    expect(screen.queryByRole("button", { name: "Read the Scroll" })).toBeNull();
    expect(screen.queryByLabelText(/use holy water/i)).toBeNull();
  });
});

describe("EncounterPanel — leaveOnMove (solo: the party simply walks away from treasure)", () => {
  it("shows no bar for a pickup whose only choices are giving treasure out or leaving it", () => {
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] }; // Gold: the right-hand panel handles Give to
    const { container } = render(<EncounterPanel state={pickup} dispatch={() => {}} leaveOnMove />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the one-tap retake but drops the Leave button", () => {
    const pickup: GameState = { ...newGame(1, [0]), phase: "pickup", treasures: [1], fightDrops: [{ mi: 0, tid: 1 }] };
    render(<EncounterPanel state={pickup} dispatch={() => {}} leaveOnMove />);
    expect(screen.getByRole("button", { name: /retake dropped treasure/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /leave the treasure/i })).toBeNull();
  });

  it("still offers Leave without it (multiplayer)", () => {
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] };
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    expect(screen.getByRole("button", { name: /leave the treasure/i })).toBeInTheDocument();
  });
});

describe("EncounterPanel — the thin bar", () => {
  it("names the strangers in one line and compares printed strength and magic", () => {
    // Man + Woman (strength 5 and 3? the numbers come from the engine tables) against a lone Man.
    const s = encounterState();
    render(<EncounterPanel state={s} dispatch={() => {}} />);
    const odds = screen.getByTestId("enc-odds");
    expect(odds).toHaveTextContent(/strength.*them.*you/i);
    expect(odds).toHaveTextContent(/magic.*them.*you/i);
    expect(odds).toHaveAttribute("title", expect.stringMatching(/printed/i));
  });

  it("adds up the strangers and only the party members able to fight", () => {
    const s: GameState = { ...newGame(1, [5, 6]), phase: "encounter", strangers: [5, 5] };
    s.party[1]!.status = 2; // the Woman (the Man alone can still fight) is turned to stone: adds nothing
    const { fs: manFs } = ALL_CREATURES[5]!;
    render(<EncounterPanel state={s} dispatch={() => {}} />);
    expect(screen.getByTestId("enc-odds")).toHaveTextContent(`Strength: them ${manFs * 2} · you ${manFs}`);
  });

  it("shows no comparison outside an encounter with strangers", () => {
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] };
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    expect(screen.queryByTestId("enc-odds")).toBeNull();
  });
});

describe("EncounterPanel — the bar's label says what the player is deciding", () => {
  const heading = () => screen.getByRole("heading", { level: 3 });

  it("is Encounter while meeting strangers", () => {
    render(<EncounterPanel state={encounterState()} dispatch={() => {}} />);
    expect(heading()).toHaveTextContent(/^Encounter/);
  });

  it("is Medusa at the Medusa pause", () => {
    const s: GameState = { ...newGame(1, [5, 6]), phase: "medusa", strangers: [] };
    render(<EncounterPanel state={s} dispatch={() => {}} />);
    expect(heading()).toHaveTextContent(/^Medusa/);
  });

  it("is Treasure or Artifact when the bar shows during a pickup (a retake after a fight)", () => {
    const retake = (treasures: number[]): GameState => ({ ...newGame(1, [0]), phase: "pickup", treasures, fightDrops: [{ mi: 0, tid: treasures[0]! }] });
    const { unmount } = render(<EncounterPanel state={retake([1])} dispatch={() => {}} leaveOnMove />); // Gold
    expect(heading()).toHaveTextContent(/^Treasure/);
    unmount();
    render(<EncounterPanel state={{ ...retake([3]), fightDrops: [{ mi: 0, tid: 1 }] }} dispatch={() => {}} />); // Magic Sword, with the Leave button showing
    expect(heading()).toHaveTextContent(/^Artifact/);
  });
});
