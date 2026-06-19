import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { newGame, type GameState } from "@sorcerers-cave/engine";
import { FightSurface } from "./FightSurface";
import type { CardArt } from "../data/manifest";

const cards: CardArt[] = []; // art is optional in tests — FightCard falls back to a name block

// Web tests build state by spreading newGame(seed, picks), as the other panel tests do. The party
// budget is 6, so [6, 4] = Woman (non-caster, idx 0) + Priest (caster, idx 1) — exactly the mix needed
// to fight a Troll and a Spectre.
const fightState = (over: Partial<GameState> = {}): GameState =>
  ({ ...newGame(1, [6, 4]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3, 9], ...over });

describe("FightSurface", () => {
  it("Roll is disabled until the plan is legal, then dispatches resolveRound", () => {
    const dispatch = vi.fn();
    render(<FightSurface state={fightState()} dispatch={dispatch} cards={cards} />); // Woman, Priest vs Troll, Spectre
    const roll = screen.getByRole("button", { name: /roll the round/i });
    expect(roll).toBeDisabled();

    // Assign the Priest (caster) to the Spectre, the Hero to the Troll (tap model).
    fireEvent.click(screen.getByTestId("tray-1"));     // pick the Priest
    fireEvent.click(screen.getByTestId("front-1"));    // place on the Spectre (stranger idx 1)
    fireEvent.click(screen.getByTestId("tray-0"));     // pick the Hero
    fireEvent.click(screen.getByTestId("front-0"));    // place on the Troll (stranger idx 0)

    expect(roll).not.toBeDisabled();
    fireEvent.click(roll);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "resolveRound" }));
    const arg = dispatch.mock.calls[0]![0];
    expect(arg.matches).toEqual(expect.arrayContaining([
      { front: [0], backers: [], strangers: [0] },
      { front: [1], backers: [], strangers: [1] },
    ]));
  });

  it("shows the casualty chooser when a casualty is queued", () => {
    const dispatch = vi.fn();
    const s = fightState({ fight: { surprise: 0, round: 2, focus: 0, casualtyQueue: [[0, 1]] } });
    render(<FightSurface state={s} dispatch={dispatch} cards={cards} />);
    expect(screen.getByText(/who is lost/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /let .* fall/i })[0]!);
    expect(dispatch).toHaveBeenCalledWith({ type: "chooseCasualty", idx: expect.any(Number) });
  });

  it("clears the pairing when a new round begins, so a slain member doesn't linger", () => {
    const { rerender } = render(<FightSurface state={fightState()} dispatch={() => {}} cards={cards} />);
    fireEvent.click(screen.getByTestId("tray-0")); // pick the Woman
    fireEvent.click(screen.getByTestId("front-0")); // place her against the Troll
    expect(screen.getByTestId("front-0").textContent ?? "").toContain("Woman"); // the Woman is now in the match

    // Next round: the Woman (idx 0) was slain in the last round.
    const s2 = fightState({
      fight: { surprise: 0, round: 2, focus: 0 },
      party: [
        { creatureId: 6, status: 3, dragonKills: 0, treasure: [] }, // slain Woman
        { creatureId: 4, status: 0, dragonKills: 0, treasure: [] }, // living Priest
      ],
    });
    rerender(<FightSurface state={s2} dispatch={() => {}} cards={cards} />);
    expect(screen.getByTestId("front-0").textContent ?? "").not.toContain("Woman"); // pairing reset — she's gone
  });

  it("shows a second stranger ganging up on a lone fighter when out-numbered", () => {
    // One Man vs a Troll + a Man-stranger: engaging the Troll leaves the other to gang up (§395).
    const s: GameState = { ...newGame(1, [5]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3, 5] };
    render(<FightSurface state={s} dispatch={() => {}} cards={cards} />);
    fireEvent.click(screen.getByTestId("tray-0"));  // pick the Man
    fireEvent.click(screen.getByTestId("front-0")); // engage the Troll (stranger 0)
    expect(screen.getByText(/gangs up/i)).toBeInTheDocument(); // the leftover Man-stranger joins the match
  });

  it("keeps the fighters in place after a drawn round (no one slain)", () => {
    const { rerender } = render(<FightSurface state={fightState()} dispatch={() => {}} cards={cards} />);
    fireEvent.click(screen.getByTestId("tray-0"));  // pick the Woman
    fireEvent.click(screen.getByTestId("front-0")); // place her against the Troll
    expect(screen.getByTestId("front-0").textContent ?? "").toContain("Woman"); // placed

    // A drawn round: the round advances but the party and foes are unchanged.
    const s2 = fightState({ fight: { surprise: 0, round: 2, focus: 0 } });
    rerender(<FightSurface state={s2} dispatch={() => {}} cards={cards} />);
    expect(screen.getByTestId("front-0").textContent ?? "").toContain("Woman"); // still placed
  });

  it("shows a fighter's artefact modifier in the matchup", () => {
    const s: GameState = { ...newGame(1, [0]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3],
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [3] }] }; // Hero with the Magic Sword vs a Troll
    render(<FightSurface state={s} dispatch={() => {}} cards={cards} />);
    fireEvent.click(screen.getByTestId("tray-0"));  // pick the Hero
    fireEvent.click(screen.getByTestId("front-0")); // engage the Troll
    expect(screen.getByText(/Magic Sword/i)).toBeInTheDocument();
  });

  it("re-renders without crashing after a foe is slain (stale stranger index)", () => {
    const { rerender } = render(<FightSurface state={fightState()} dispatch={() => {}} cards={cards} />); // Troll(0), Spectre(1)
    fireEvent.click(screen.getByTestId("tray-1"));  // pick the Priest (a caster)
    fireEvent.click(screen.getByTestId("front-1")); // engage the Spectre (stranger index 1)
    // The Spectre is slain — strangers shrink to just [Troll], so index 1 in the old draft is now gone.
    const s2 = fightState({ fight: { surprise: 0, round: 2, focus: 0 }, strangers: [3] });
    expect(() => rerender(<FightSurface state={s2} dispatch={() => {}} cards={cards} />)).not.toThrow();
    expect(screen.getByTestId("fight-surface")).toBeInTheDocument();
  });

  it("offers retreat after round 1", () => {
    const dispatch = vi.fn();
    // The gateway (card 175) has all four doorways, so legalActions offers N/E/S/W retreats at round > 1.
    const s = fightState({ fight: { surprise: 0, round: 2, focus: 0 }, strangers: [3] });
    render(<FightSurface state={s} dispatch={dispatch} cards={cards} />);
    fireEvent.click(screen.getByRole("button", { name: /retreat/i }));
    fireEvent.click(within(screen.getByTestId("retreat-menu")).getAllByRole("button")[0]!);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "retreat" }));
  });
});
