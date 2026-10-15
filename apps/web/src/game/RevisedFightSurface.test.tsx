import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { newGame, reduce, driveStrangers, partyAction, legalActions, type GameState, type GameAction } from "@sorcerers-cave/engine";
import { RevisedFightSurface } from "./RevisedFightSurface";
import { FightSurface } from "./FightSurface";
import type { CardArt } from "../data/manifest";

const cards: CardArt[] = [];
const OGRE = 2, TROLL = 3, SCROLL = 19;

/** A real revised fight, reached by the engine's own rules: the party (three Men, or `picks`) attacks `strangers`. */
const attacking = (strangers: number[], over: Partial<GameState> = {}, picks = [5, 6, 7]): GameState => {
  const g: GameState = { ...newGame(1, picks), variants: { combatRevision: true }, phase: "encounter", strangers, treasures: [], ...over };
  return driveStrangers(reduce(g, { type: "attack" }).state).state;
};

/** Play the party's `standard` moves until it is asked for `kind`, trying seeds until a fight gets there. */
const reaching = (kind: "redeploy" | "engage" | "deploy"): GameState => {
  for (let seed = 1; seed <= 60; seed++) {
    let s = attacking(kind === "redeploy" ? [OGRE] : [OGRE, TROLL, OGRE, TROLL], { seed });   // a lone foe leaves spare fighters to redeploy
    for (let i = 0; i < 40 && s.fight; i++) {
      if (s.fight.pending?.by === "party" && s.fight.pending.kind === kind && !s.fight.casualtyQueue?.length) return s;
      const a = partyAction(s);
      if (!a) break;
      s = driveStrangers(reduce(s, a).state).state;
    }
  }
  throw new Error(`no fight reached a party ${kind}`);
};

describe("RevisedFightSurface", () => {
  it("renders nothing outside a revised fight, and the battle-plan surface steps aside for one", () => {
    const legacy: GameState = { ...newGame(1, [5]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [OGRE] };
    const { container } = render(<RevisedFightSurface state={legacy} dispatch={vi.fn()} cards={cards} />);
    expect(container).toBeEmptyDOMElement();
    const revised = attacking([OGRE]);
    const old = render(<FightSurface state={revised} dispatch={vi.fn()} cards={cards} />);
    expect(old.container).toBeEmptyDOMElement();
  });

  it("offers the Scroll's three choices to the attacking party, the surprise only in round 1", () => {
    const dispatch = vi.fn();
    const s = attacking([OGRE], { party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [SCROLL] }] });
    expect(s.fight!.pending).toMatchObject({ by: "party", kind: "scroll", surprise: true });
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    fireEvent.click(screen.getByRole("button", { name: /surprise/i }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "scroll", use: "surprise" });
    fireEvent.click(screen.getByRole("button", { name: /not read|decline|don't read/i }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "scroll", use: "decline" });
    fireEvent.click(screen.getByRole("button", { name: /destroy/i }));          // asks to confirm: it curses the party
    expect(dispatch).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "scroll", use: "destroy" });
  });

  it("hides the surprise option after round 1", () => {
    const s = attacking([OGRE, TROLL], { party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [SCROLL] }] });
    s.fight!.round = 2; s.fight!.pending = { by: "party", kind: "scroll", surprise: false };
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    expect(screen.queryByRole("button", { name: /surprise/i })).toBeNull();
  });

  it("engage: pairs a free fighter with a deployed foe, and fights only when the pairing is complete", () => {
    const dispatch = vi.fn();
    const s = attacking([OGRE]);
    expect(s.fight!.pending).toMatchObject({ by: "party", kind: "engage" });
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    const go = screen.getByRole("button", { name: /fight/i });
    expect(go).toBeDisabled();                                   // an unengaged fighter could still be paired
    fireEvent.click(screen.getByTestId("rev-free-0"));
    fireEvent.click(screen.getByTestId("rev-foe-0"));
    expect(go).not.toBeDisabled();
    fireEvent.click(go);
    expect(dispatch).toHaveBeenCalledWith({ type: "engage", pairs: [{ party: 0, stranger: 0 }] });
  });

  it("engage: tapping a chosen pairing again takes it back", () => {
    const s = attacking([OGRE]);
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    fireEvent.click(screen.getByTestId("rev-free-0"));
    fireEvent.click(screen.getByTestId("rev-foe-0"));
    fireEvent.click(screen.getByRole("button", { name: /undo|reset/i }));
    expect(screen.getByRole("button", { name: /fight/i })).toBeDisabled();
  });

  it("deploy: the defending party chooses at least the minimum to stand in front", () => {
    const dispatch = vi.fn();
    // The strangers attack first (they are in an area the party fled before), so the party must deploy.
    const base: GameState = { ...newGame(1, [5, 6, 7]), variants: { combatRevision: true }, phase: "encounter", strangers: [OGRE, TROLL], treasures: [] };
    const s = driveStrangers(reduce({ ...base, fight: null }, { type: "attack" }).state).state;
    const defending = structuredClone(s);
    defending.fight!.rev!.attacker = "strangers";
    defending.fight!.pending = { by: "party", kind: "deploy", min: 2 };
    defending.fight!.rev!.step = "deploy";
    render(<RevisedFightSurface state={defending} dispatch={dispatch} cards={cards} />);
    const go = screen.getByRole("button", { name: /stand|deploy/i });
    expect(go).toBeDisabled();
    fireEvent.click(screen.getByTestId("rev-free-0"));
    expect(go).toBeDisabled();
    fireEvent.click(screen.getByTestId("rev-free-1"));
    expect(go).not.toBeDisabled();
    fireEvent.click(go);
    expect(dispatch).toHaveBeenCalledWith({ type: "deploy", creatures: [0, 1] });
  });

  it("redeploy: lists the legal placements, and 'no changes' sends an empty list", () => {
    const dispatch = vi.fn();
    const s = reaching("redeploy");
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    fireEvent.click(screen.getByRole("button", { name: /no (more )?(changes|moves)|roll the round/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "redeploy", moves: [] });
  });

  it("redeploy: a creature tapped then a match it may join is sent as a move", () => {
    const dispatch = vi.fn();
    const s = reaching("redeploy");
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    const placements = screen.getAllByTestId(/^rev-place-/);
    expect(placements.length).toBeGreaterThan(0);
    fireEvent.click(placements[0]!);
    fireEvent.click(screen.getByRole("button", { name: /roll the round/i }));
    const sent = dispatch.mock.calls.at(-1)![0] as Extract<GameAction, { type: "redeploy" }>;
    expect(sent.type).toBe("redeploy");
    expect(sent.moves).toHaveLength(1);
  });

  it("redeploy with nothing to arrange says so, and still offers fight-on and retreat", () => {
    const dispatch = vi.fn();
    const s = attacking([OGRE]);
    s.fight!.round = 2; s.fight!.pending = { by: "party", kind: "redeploy" };
    s.fight!.rev!.matches = [{ pf: [0], pb: [], sf: [0], sb: [] }];
    s.fight!.rev!.deployed = { party: [], strangers: [] };
    s.party.forEach((m, i) => { if (i > 0) m.status = 3; });
    s.areas[s.partyArea]!.card = 15 | 16;
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    expect(screen.getByText(/nothing to arrange/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retreat/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /roll the round/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "redeploy", moves: [] });
  });

  it("says the strangers are deciding, and offers nothing, while their decision is pending", () => {
    const s = attacking([OGRE]);
    s.fight!.pending = { by: "strangers", kind: "engage" };
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    expect(screen.getByRole("status")).toHaveTextContent(/the strangers are deciding/i);
    expect(screen.queryByRole("button", { name: /fight/i })).toBeNull();
  });

  it("a lost front line asks which creature falls", () => {
    const dispatch = vi.fn();
    const s = attacking([OGRE]);
    s.fight!.casualtyQueue = [[0, 1]];
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    fireEvent.click(screen.getAllByRole("button", { name: /fall/i })[1]!);
    expect(dispatch).toHaveBeenCalledWith({ type: "chooseCasualty", idx: 1 });
  });

  it("a standoff is announced, with the retreats on offer", () => {
    const dispatch = vi.fn();
    const s = attacking([OGRE]);
    s.fight!.round = 3; s.fight!.rev!.standoff = true; delete s.fight!.pending;
    s.areas[s.partyArea]!.card = 15 | 16;
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    expect(screen.getByTestId("rev-standoff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retreat/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /north|east|south|west/i })[0]!);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "retreat" }));
  });

  it("shows the round, the surprise banner and the die bonus", () => {
    const s = attacking([OGRE], { surpriseReady: true });
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    expect(screen.getByText(/round 1/i)).toBeInTheDocument();
    expect(screen.getByText(/took them by surprise|surprised you/i)).toBeInTheDocument();
  });
});
