import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, type GameState } from "@sorcerers-cave/engine";
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

  it("lists a treasure once with a member dropdown (Leave in chamber default)", () => {
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] }; // Gold
    render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    const select = screen.getByLabelText(/assign gold/i) as HTMLSelectElement;
    expect(select.options[0]!.textContent).toBe("Leave in chamber"); // first option leaves it
    fireEvent.change(select, { target: { value: "0" } });            // give to the first eligible member
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "takeTreasure", ti: 0 }));
  });

  it("words the Lost Ruby as wresting it from the guardian statue, not a free pickup", () => {
    const pickup: GameState = { ...newGame(1, [0]), phase: "pickup", treasures: [11] }; // Lost Ruby (guarded)
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    const select = screen.getByLabelText(/wrest lost ruby/i) as HTMLSelectElement;
    const opts = [...select.options].map((o) => o.textContent ?? "");
    expect(opts.some((t) => /wrests it from the statue/i.test(t))).toBe(true);
    expect(opts.some((t) => /^give to/i.test(t))).toBe(false); // never the plain "Give to" wording
  });

  it("lists an artefact once with a target dropdown", () => {
    const dispatch = vi.fn();
    const s: GameState = { ...newGame(1, [5, 6]), phase: "encounter", strangers: [3] }; // vs a Troll
    s.party[0]!.treasure.push(5); // the Man carries Lotus Dust
    render(<EncounterPanel state={s} dispatch={dispatch} />);
    const select = screen.getByLabelText(/use lotus dust/i);
    fireEvent.change(select, { target: { value: "0" } }); // apply to the only stranger
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "useArtifact", artifact: 5 }));
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

  it("offers the Elixir as a drinker-picker dropdown, then the verbatim confirm (US-19)", () => {
    const dispatch = vi.fn();
    const s: GameState = { ...newGame(1, [0]), phase: "encounter", strangers: [3] };
    s.party[0]!.treasure.push(15); // Hero carries the Elixir
    render(<EncounterPanel state={s} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText("Elixir"), { target: { value: "0" } });
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent(/1: death\. 2–3: nothing\. 4–6: \+2 strength, forever\./);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "useArtifact", artifact: 15, target: 0 });
  });

  it("offers the Scroll as a single confirm button, verbatim text (US-21)", () => {
    const dispatch = vi.fn();
    const s: GameState = { ...newGame(1, [0]), phase: "encounter", strangers: [3] }; // Hero (HUMAN) vs Troll
    s.party[0]!.treasure.push(19); // carries the Scroll
    render(<EncounterPanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Read the Scroll" }));
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent(/curses the party/i);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "useArtifact", artifact: 19 });
  });

  it("offers Holy Water's target picker, naming a stone statue distinctly from a stranger (US-20)", () => {
    const dispatch = vi.fn();
    const s: GameState = {
      ...newGame(1, [0], { extensionKit: true }),
      phase: "encounter",
      strangers: [15], // Demon (DESTROY target)
    };
    s.party[0]!.treasure.push(16); // Hero carries Holy Water
    render(<EncounterPanel state={s} dispatch={dispatch} />);
    const select = screen.getByLabelText(/use holy water/i);
    const opts = [...(select as HTMLSelectElement).options].map((o) => o.textContent ?? "");
    expect(opts.some((t) => /demon/i.test(t))).toBe(true);
    fireEvent.change(select, { target: { value: "0" } });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "useArtifact", artifact: 16 }));
  });

  it("explains an uncarryable treasure instead of offering a pickup row", () => {
    // Man (50 kg) + Woman (25 kg) vs the 100 kg Treasure Chest: nobody qualifies, so the engine
    // offers no takeTreasure — the panel must say why instead of a silent, row-less listing.
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [14] };
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    expect(screen.getByText("The Treasure Chest is too heavy for anyone to carry.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/assign treasure chest/i)).not.toBeInTheDocument();
  });

  it("shows no too-heavy message when the treasure is carryable", () => {
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] }; // Gold, 25 kg
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    expect(screen.queryByText(/too heavy for anyone to carry/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/assign gold/i)).toBeInTheDocument();
  });

  it("words a Giant-less Deep Pool pickup as needing a Giant, not as too heavy", () => {
    const base = newGame(1, [5, 6]); // no Giant; Gold is light enough for the Man
    const pickup: GameState = {
      ...base, phase: "pickup", treasures: [1],
      areas: base.areas.map((a, i) => (i === 0 ? { ...a, card: 16 | (2 << 7) } : a)), // Deep Pool (special 2)
    };
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    expect(screen.getByText("Only a Giant can lift the Gold from the pool.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/assign gold/i)).not.toBeInTheDocument();
  });

  it("words a Deep Pool pickup as too heavy when a Giant is present but already loaded", () => {
    const base = newGame(1, [0]); // party fixture; swap in a fully-loaded Giant below
    const pickup: GameState = {
      ...base, phase: "pickup", treasures: [14],
      areas: base.areas.map((a, i) => (i === 0 ? { ...a, card: 16 | (2 << 7) } : a)), // Deep Pool
    };
    pickup.party = [{ creatureId: 12, status: 0, treasure: [14, 1, 2], dragonKills: 0 }]; // Giant at 150/150 kg
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    expect(screen.getByText("The Treasure Chest is too heavy for anyone to carry.")).toBeInTheDocument();
  });

  it("stays silent about uncarryable treasure when no member is active", () => {
    const pickup: GameState = { ...newGame(1, [5]), phase: "pickup", treasures: [14] };
    pickup.party = pickup.party.map((m) => ({ ...m, status: 3 })); // everyone down
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    expect(screen.queryByText(/too heavy/i)).not.toBeInTheDocument();
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
