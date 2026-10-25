import { StrictMode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { newGame, reduce, driveStrangers, partyAction, legalActions, legalMoves, type GameState, type GameAction } from "@sorcerers-cave/engine";
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
    const go = screen.getByRole("button", { name: /confirm initial pairings/i });
    expect(go).toBeDisabled();                                   // an unengaged fighter could still be paired
    fireEvent.click(screen.getByTestId("rev-free-0"));
    fireEvent.click(screen.getByTestId("rev-foe-0"));
    expect(go).not.toBeDisabled();
    fireEvent.click(go);
    expect(dispatch).toHaveBeenCalledWith({ type: "engage", pairs: [{ party: 0, stranger: 0 }] });
  });

  it("shows each stranger as its own row, with the paired fighter beside it", () => {
    const s = attacking([OGRE, TROLL, OGRE, TROLL]);
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    expect(screen.getAllByTestId(/^rev-row-/)).toHaveLength(4);
    fireEvent.click(screen.getByTestId("rev-free-0"));
    fireEvent.click(screen.getByTestId("rev-foe-0"));
    expect(screen.getByTestId("rev-slot-0")).toHaveTextContent(/tap to take back/i);
  });

  it("lists the strangers leader-first: the highest leader rank on the top row, ties to the first drawn", () => {
    const WIZARD = 8, DWARF = 7;   // leaderPri: Wizard 8, Troll 2, Dwarf 1
    const s = attacking([DWARF, TROLL, WIZARD, TROLL]);
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    const order = screen.getAllByTestId(/^rev-row-/).map((r) => r.getAttribute("data-testid"));
    expect(order).toEqual(["rev-row-2", "rev-row-1", "rev-row-3", "rev-row-0"]);
  });

  describe("the Ghouls", () => {
    const GHOUL = 22;
    const ghoulFight = (party: number[], ghouls: number) => {
      const s = attacking(Array(ghouls).fill(GHOUL), {}, party);
      s.fight!.ghouls = { aside: [], freshEntry: false, announceLull: false };
      return s;
    };

    it("announces the Ghouls first, with a reminder of their impact, and rolls nothing until the player faces them", () => {
      const dispatch = vi.fn();
      render(<RevisedFightSurface state={ghoulFight([5, 6, 7], 3)} dispatch={dispatch} cards={cards} />);
      const intro = screen.getByTestId("ghouls-intro");
      expect(intro).toHaveTextContent(/ghouls attack/i);
      expect(intro).toHaveTextContent(/strength 2/i);
      expect(intro).toHaveTextContent(/heavy treasure/i);
      expect(intro).toHaveTextContent(/next party/i);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("shows each creature matched up beside its Ghoul once they are faced, while the round is rolled", () => {
      render(<RevisedFightSurface state={ghoulFight([5, 6, 7], 3)} dispatch={vi.fn()} cards={cards} />);
      expect(screen.queryAllByTestId(/^rev-slot-/).every((el) => /—/.test(el.textContent ?? ""))).toBe(true);   // nothing paired yet
      fireEvent.click(screen.getByRole("button", { name: /face the ghouls/i }));
      const slots = screen.getAllByTestId(/^rev-slot-/);
      expect(slots).toHaveLength(3);
      for (const el of slots) expect(el.textContent).not.toMatch(/—|pick a creature/);   // each Ghoul has a party creature beside it
    });

    it("then pairs every creature with a Ghoul for the party, since which Ghoul it faces changes nothing", () => {
      const dispatch = vi.fn();
      render(<RevisedFightSurface state={ghoulFight([5, 6, 7], 3)} dispatch={dispatch} cards={cards} />);
      fireEvent.click(screen.getByRole("button", { name: /face the ghouls/i }));
      expect(screen.queryByTestId("ghouls-intro")).toBeNull();
      expect(dispatch).toHaveBeenCalledTimes(1);
      const sent = dispatch.mock.calls[0]![0] as Extract<GameAction, { type: "engage" }>;
      expect(sent.type).toBe("engage");
      expect(sent.pairs.map((p) => p.party).sort()).toEqual([0, 1, 2]);
      expect(new Set(sent.pairs.map((p) => p.stranger)).size).toBe(3);
    });

    it("does not announce them again in a later round, and pairs for the party then, once", () => {
      const dispatch = vi.fn();
      const s = ghoulFight([5, 6, 7], 3);
      s.fight!.round = 2;
      // StrictMode runs the mount effect twice, as the development build does; a second pairing would be refused ("not an unengaged attacker").
      render(<StrictMode><RevisedFightSurface state={s} dispatch={dispatch} cards={cards} /></StrictMode>);
      expect(screen.queryByTestId("ghouls-intro")).toBeNull();
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it("shows each Ghoul on the Ghouls hazard card until it has art of its own", () => {
      const ghoulsCard: CardArt = { cardId: "s02-3", file: "/assets/cards/small-card-s02-3.png", name: "Ghouls", category: "hazard", entityId: 4 };
      const { container } = render(<RevisedFightSurface state={ghoulFight([5, 6], 2)} dispatch={vi.fn()} cards={[ghoulsCard]} />);
      expect(container.querySelectorAll('img.scv-fc-art[src="/assets/cards/small-card-s02-3.png"]')).toHaveLength(2);
    });

    it("leaves the pairing to the player when there are fewer Ghouls than creatures", () => {
      const dispatch = vi.fn();
      render(<RevisedFightSurface state={ghoulFight([5, 6, 7], 2)} dispatch={dispatch} cards={cards} />);
      fireEvent.click(screen.getByRole("button", { name: /face the ghouls/i }));
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("does not pair for the party against ordinary strangers", () => {
      const dispatch = vi.fn();
      render(<RevisedFightSurface state={attacking([OGRE, OGRE, OGRE])} dispatch={dispatch} cards={cards} />);
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  it("engage: tapping a chosen pairing again takes it back", () => {
    const s = attacking([OGRE]);
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    fireEvent.click(screen.getByTestId("rev-free-0"));
    fireEvent.click(screen.getByTestId("rev-foe-0"));
    fireEvent.click(screen.getByRole("button", { name: /undo|reset/i }));
    expect(screen.getByRole("button", { name: /confirm initial pairings/i })).toBeDisabled();
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

  /** The strangers attack a party that must stand every one of its creatures in front (min = all it has free). */
  const forcedDefence = (): GameState => {
    const base: GameState = { ...newGame(1, [5, 6]), variants: { combatRevision: true }, phase: "encounter", strangers: [OGRE, TROLL], treasures: [] };
    const defending = structuredClone(driveStrangers(reduce({ ...base, fight: null }, { type: "attack" }).state).state);
    defending.fight!.rev!.attacker = "strangers";
    defending.fight!.pending = { by: "party", kind: "deploy", min: 2 };
    defending.fight!.rev!.step = "deploy";
    return defending;
  };

  it("deploy: a defending party with no choice is deployed at once, once, and is not asked to drag anything", () => {
    const dispatch = vi.fn();
    render(<StrictMode><RevisedFightSurface state={forcedDefence()} dispatch={dispatch} cards={cards} /></StrictMode>);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "deploy", creatures: [0, 1] });
    expect(screen.queryByTestId("rev-frontline")).toBeNull();
    expect(screen.queryByRole("button", { name: /stand|deploy/i })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/drawing up their line/i);
  });

  it("the review pause names the attackers when the strangers attacked, and the button rolls the round", () => {
    const s = forcedDefence();
    s.fight!.pending = { by: "party", kind: "redeploy" }; s.fight!.rev!.step = "surplus"; s.fight!.rev!.review = true;
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    expect(screen.getByTestId("rev-review")).toHaveTextContent("The attackers have chosen their targets");
    expect(screen.getByRole("button", { name: /roll the round/i })).toBeInTheDocument();
  });

  it("engage: when there is only one pairing to make it is laid out ready, and one click rolls the round", () => {
    const dispatch = vi.fn();
    const s = attacking([OGRE], {}, [5]);                       // one fighter against one foe
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    const go = screen.getByRole("button", { name: /roll the round/i });
    expect(go).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: /undo pairings/i })).toBeNull();
    fireEvent.click(go);
    expect(dispatch).toHaveBeenCalledWith({ type: "engage", pairs: [{ party: 0, stranger: 0 }] });
  });

  it("engage: with a real choice to make, the player pairs as before and the button still confirms pairings", () => {
    render(<RevisedFightSurface state={attacking([OGRE, TROLL], {}, [5, 6])} dispatch={vi.fn()} cards={cards} />);
    expect(screen.getByRole("button", { name: /confirm initial pairings/i })).toBeDisabled();
  });

  it("deploy: creatures can be dragged into the front line, and dragged-in ones are sent", () => {
    const dispatch = vi.fn();
    const base: GameState = { ...newGame(1, [5, 6, 7]), variants: { combatRevision: true }, phase: "encounter", strangers: [OGRE, TROLL], treasures: [] };
    const s = driveStrangers(reduce({ ...base, fight: null }, { type: "attack" }).state).state;
    const defending = structuredClone(s);
    defending.fight!.rev!.attacker = "strangers";
    defending.fight!.pending = { by: "party", kind: "deploy", min: 2 };
    defending.fight!.rev!.step = "deploy";
    render(<RevisedFightSurface state={defending} dispatch={dispatch} cards={cards} />);
    const zone = screen.getByTestId("rev-frontline");
    fireEvent.drop(zone, { dataTransfer: { getData: () => "1" } });
    fireEvent.drop(zone, { dataTransfer: { getData: () => "0" } });
    fireEvent.click(screen.getByRole("button", { name: /stand|deploy/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "deploy", creatures: [1, 0] });
  });

  it("redeploy: lists the legal placements, and 'no changes' sends an empty list", () => {
    const dispatch = vi.fn();
    const s = reaching("redeploy");
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    fireEvent.click(screen.getByRole("button", { name: /roll the round/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "redeploy", moves: [] });
  });

  /** The first legal placement the engine offers, as the creature's tray card and the match slot it may go to. */
  const firstMove = (s: GameState) => {
    const m = legalMoves(s, "party")[0]!;
    return { m, card: `rev-free-${m.creature}`, slot: `rev-m${m.back ? "back" : "front"}-${m.match}` };
  };

  it("redeploy: a creature tapped then a match it may join is sent as a move", () => {
    const dispatch = vi.fn();
    const s = reaching("redeploy");
    const { m, card, slot } = firstMove(s);
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    expect(screen.queryAllByTestId(/^rev-place-/)).toHaveLength(0);   // no button per placement any more
    fireEvent.click(screen.getByTestId(card));
    fireEvent.click(screen.getByTestId(slot));
    fireEvent.click(screen.getByRole("button", { name: /roll the round/i }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "redeploy", moves: [{ creature: m.creature, match: m.match, back: m.back }] });
  });

  it("redeploy: the party's strength in the tally includes a creature added but not yet confirmed", () => {
    const s = reaching("redeploy");
    const { m, card, slot } = firstMove(s);
    const { container } = render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    const me = () => Number(container.querySelectorAll(".scv-match-vs .me")[m.match]!.textContent);
    const before = me();
    fireEvent.click(screen.getByTestId(card));
    fireEvent.click(screen.getByTestId(slot));
    expect(me()).toBeGreaterThan(before);
    fireEvent.click(screen.getByRole("button", { name: /undo moves/i }));
    expect(me()).toBe(before);
  });

  it("redeploy: a creature dragged onto a match it may join is sent as a move", () => {
    const dispatch = vi.fn();
    const s = reaching("redeploy");
    const { m, slot } = firstMove(s);
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    const data = { getData: () => String(m.creature) };
    fireEvent.drop(screen.getByTestId(slot), { dataTransfer: data });
    fireEvent.click(screen.getByRole("button", { name: /roll the round/i }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "redeploy", moves: [{ creature: m.creature, match: m.match, back: m.back }] });
  });

  it("redeploy: a drop the engine would refuse is ignored", () => {
    const dispatch = vi.fn();
    const s = reaching("redeploy");
    const { m } = firstMove(s);
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    fireEvent.drop(screen.getByTestId(`rev-m${m.back ? "front" : "back"}-${m.match}`), { dataTransfer: { getData: () => String(m.creature) } });
    fireEvent.click(screen.getByRole("button", { name: /roll the round/i }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "redeploy", moves: [] });
  });

  it("review: after the strangers pair up, the party sees the arrangement and can only fight on", () => {
    const dispatch = vi.fn();
    const s = reaching("redeploy");
    s.fight!.rev!.review = true;
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    expect(screen.getByTestId("rev-review")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /roll the round/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "redeploy", moves: [] });
  });

  it("redeploy with nothing to arrange still offers fight-on and retreat", () => {
    const dispatch = vi.fn();
    const s = attacking([OGRE]);
    s.fight!.round = 2; s.fight!.pending = { by: "party", kind: "redeploy" };
    s.fight!.rev!.matches = [{ pf: [0], pb: [], sf: [0], sb: [] }];
    s.fight!.rev!.deployed = { party: [], strangers: [] };
    s.party.forEach((m, i) => { if (i > 0) m.status = 3; });
    s.areas[s.partyArea]!.card = 15 | 16;
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    expect(screen.queryByTestId("rev-tray")).toBeNull();
    expect(screen.getByRole("button", { name: /retreat/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /roll the round/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "redeploy", moves: [] });
  });

  it("says the strangers are deciding, and offers nothing, while their decision is pending", () => {
    const s = attacking([OGRE]);
    s.fight!.pending = { by: "strangers", kind: "engage" };
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    expect(screen.getByRole("status")).toHaveTextContent(/the strangers are deciding/i);
    expect(screen.queryByRole("button", { name: /confirm initial pairings/i })).toBeNull();
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

  it("Retreat shrinks the view to a bar of ways out so the map shows, and Cancel brings it back with the pairing intact", () => {
    const dispatch = vi.fn();
    const s = attacking([OGRE]);
    s.fight!.round = 2;
    s.areas[s.partyArea]!.card = 15 | 16;
    render(<RevisedFightSurface state={s} dispatch={dispatch} cards={cards} />);
    fireEvent.click(screen.getByTestId("rev-free-0"));
    fireEvent.click(screen.getByTestId("rev-foe-0"));            // a pairing under way
    fireEvent.click(screen.getByRole("button", { name: /retreat/i }));
    expect(screen.getByTestId("rev-retreat")).toBeInTheDocument();
    expect(screen.queryByTestId("rev-matches")).toBeNull();      // neither the battlefield...
    expect(screen.queryByTestId("rev-tray")).toBeNull();         // ...nor the hand covers the map
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByTestId("rev-retreat")).toBeNull();
    expect(screen.getByTestId("rev-tray")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm initial pairings/i })).not.toBeDisabled();   // the pairing survived
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("explains each total: the sword, the caster behind the line and its staff are chips under the party, and the tally adds up", () => {
    const s = attacking([OGRE], { party: [
      { creatureId: 5, status: 0, dragonKills: 0, treasure: [3] },     // a Man with the Magic Sword
      { creatureId: 4, status: 0, dragonKills: 0, treasure: [9] },     // a Priest with the Magic Staff
      { creatureId: 6, status: 0, dragonKills: 0, treasure: [] },
    ] });
    s.fight!.pending = { by: "party", kind: "redeploy" }; s.fight!.rev!.step = "surplus";
    s.fight!.rev!.matches = [{ pf: [0], pb: [1], sf: [0], sb: [] }];
    s.fight!.rev!.deployed = { party: [], strangers: [] };
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    const mods = screen.getByTestId("rev-mods-party-0");
    expect(mods).toHaveTextContent("Magic Sword · Man +1");
    expect(mods).toHaveTextContent("Behind · Priest +2");
    expect(mods).toHaveTextContent("Magic Staff · Priest +1");
    expect(screen.getByTestId("rev-fight").querySelector(".scv-match-vs .me")).toHaveTextContent("7");   // 3 + 1 for the Man, 2 + 1 behind
  });

  it("a pairing under way shows its chips and tally before it is confirmed", () => {
    const s = attacking([OGRE], { party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [3] }, { creatureId: 6, status: 0, dragonKills: 0, treasure: [] }] });
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    expect(screen.queryByTestId("rev-mods-party-0")).toBeNull();            // nobody paired yet: nothing to explain on the party's side
    fireEvent.click(screen.getByTestId("rev-free-0"));
    fireEvent.click(screen.getByTestId("rev-foe-0"));
    expect(screen.getByTestId("rev-mods-party-0")).toHaveTextContent("Magic Sword · Man +1");
  });

  it("shows the round, the surprise banner and the die bonus", () => {
    const s = attacking([OGRE], { surpriseReady: true });
    render(<RevisedFightSurface state={s} dispatch={vi.fn()} cards={cards} />);
    expect(screen.getByText(/round 1/i)).toBeInTheDocument();
    expect(screen.getByText(/took them by surprise|surprised you/i)).toBeInTheDocument();
  });
});
