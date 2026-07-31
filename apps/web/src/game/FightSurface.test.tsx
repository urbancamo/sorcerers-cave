import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AssetManifest } from "@sorcerers-cave/assets";
import { newGame, type GameState } from "@sorcerers-cave/engine";
import { FightSurface } from "./FightSurface";
import { parseManifest, resolveCardVariant, type CardArt } from "../data/manifest";

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

  it("offers a forced round (no deadlock) when only an un-fightable Spectre remains", () => {
    const dispatch = vi.fn();
    // A lone Man (no magic) facing a single Spectre: nothing can be placed, but the round must be fought.
    const s: GameState = { ...newGame(1, [5]), phase: "fight", fight: { surprise: 0, round: 2, focus: 0 }, strangers: [9] };
    render(<FightSurface state={s} dispatch={dispatch} cards={cards} />);
    expect(screen.getByTestId("forced-spectre")).toBeInTheDocument();
    const roll = screen.getByRole("button", { name: /face the spectre/i });
    expect(roll).not.toBeDisabled();
    fireEvent.click(roll);
    expect(dispatch).toHaveBeenCalledWith({ type: "resolveRound", matches: [] });
  });

  it("still offers 'Face the Spectre' after a fighter is (illegally) placed on the un-fightable Spectre", () => {
    // Reproduces the soft-lock: a lone Man vs a single Spectre in round 1 (no retreat yet). The player
    // drags the Man onto the Spectre — an illegal plan (spectreNeedsMagic) — and must NOT get stuck: the
    // forced-Spectre escape stays available and resolves with an empty plan.
    const dispatch = vi.fn();
    const s: GameState = { ...newGame(1, [5]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [9] };
    render(<FightSurface state={s} dispatch={dispatch} cards={cards} />);
    fireEvent.click(screen.getByTestId("tray-0"));   // pick the Man
    fireEvent.click(screen.getByTestId("front-0"));  // place him on the Spectre (illegal)
    // The dead-end error must NOT be shown, and the escape button stays enabled.
    expect(screen.queryByText(/only be fought with magic/i)).not.toBeInTheDocument();
    const face = screen.getByRole("button", { name: /face the spectre/i });
    expect(face).not.toBeDisabled();
    fireEvent.click(face);
    expect(dispatch).toHaveBeenCalledWith({ type: "resolveRound", matches: [] }); // resolves empty, not the illegal plan
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

  it("keeps strangers in their original order when a fighter is assigned to a lower one", () => {
    // Two members vs Troll (foe 0) + Ogre (foe 1). Engaging the SECOND foe must not lift it above the first.
    const s: GameState = { ...newGame(1, [5, 6]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3, 2] };
    render(<FightSurface state={s} dispatch={() => {}} cards={cards} />);
    fireEvent.click(screen.getByTestId("tray-0"));  // pick a fighter
    fireEvent.click(screen.getByTestId("front-1")); // engage the second foe (the Ogre)
    const order = [...document.querySelectorAll('[data-testid^="front-"]')].map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["front-0", "front-1"]); // foe 0 still listed above foe 1
  });

  it("shows a leftover enemy caster lending magic from the background, not a mystery total", () => {
    // A lone Man vs a Troll + an enemy Priest: the Priest can't be engaged hand-to-hand, so it lends
    // its magical power from the background (§395). It must be shown — not silently folded into the total.
    const s: GameState = { ...newGame(1, [5]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3, 4] };
    render(<FightSurface state={s} dispatch={() => {}} cards={cards} />);
    fireEvent.click(screen.getByTestId("tray-0"));  // pick the Man
    fireEvent.click(screen.getByTestId("front-0")); // engage the Troll (stranger 0)
    expect(screen.getByText(/lends magic/i)).toBeInTheDocument(); // the Priest is shown as a background combatant
    // Enemy total reflects the combatants actually in play: Troll 4 + Priest magic 2 = 6.
    expect(screen.getByText("6")).toBeInTheDocument();
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

  it("shows a caster dropped behind a foe immediately, before any front fighter is placed", () => {
    render(<FightSurface state={fightState()} dispatch={() => {}} cards={cards} />); // Woman, Priest vs Troll, Spectre
    fireEvent.click(screen.getByTestId("tray-1"));  // pick the Priest (a caster)
    fireEvent.click(screen.getByTestId("bg-0"));    // place behind the first foe — no front fighter yet
    expect(screen.getByTestId("bg-0").textContent ?? "").toContain("Priest"); // visible right away
  });

  it("dropping a caster into the background slot places it via dataTransfer (first drop works)", () => {
    render(<FightSurface state={fightState()} dispatch={() => {}} cards={cards} />); // Woman(0), Priest(1) vs Troll, Spectre
    fireEvent.click(screen.getByTestId("tray-0"));  // pick the Woman
    fireEvent.click(screen.getByTestId("front-0")); // engage the Troll → the match gets a ✦ background slot
    const dataTransfer = { getData: (t: string) => (t === "application/x-scv-member" ? "1" : ""), setData: () => {} };
    fireEvent.drop(screen.getByTestId("bg-0"), { dataTransfer }); // drag the Priest (member 1) into the background
    expect(screen.getByTestId("bg-0").textContent ?? "").toContain("Priest"); // the caster is shown behind, no error
  });

  it("renders a kit party member fighting a kit stranger without crashing (SC-EXT-29)", () => {
    // Witch (18, a caster: mp 4) + Wolf (20) vs a Lion (16, a kit stranger). Before the
    // ALL_CREATURES fix, isCaster's raw CREATURES[18] lookup crashed before anything rendered.
    const s: GameState = {
      ...newGame(1, [18, 20], { extensionKit: true }),
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      strangers: [16],
    };
    render(<FightSurface state={s} dispatch={() => {}} cards={cards} />);
    expect(screen.getByTestId("fight-surface")).toBeInTheDocument();
    expect(screen.getByTestId("tray-0")).toHaveTextContent(/witch/i);
  });

  it("names a Holy Water mid-fight target via its own offset encoding, not a crash (SC-EXT-24, US-20)", () => {
    // Holy Water's `target` for a DESTROY/WEAKEN mid-fight use is HW_STRANGER_BASE(3000)+strangerIdx —
    // NOT a party index. The bottom artefact-buttons row previously named EVERY non-Lotus-Dust target
    // as a party member (`state.party[a.target]!.creatureId`), which crashes for any offset target.
    const dispatch = vi.fn();
    const s: GameState = {
      ...newGame(1, [0], { extensionKit: true }),
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      strangers: [15], // Demon — a DESTROY target
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [16] }], // Hero carrying Holy Water
    };
    expect(() => render(<FightSurface state={s} dispatch={dispatch} cards={cards} />)).not.toThrow();
    const btn = screen.getByRole("button", { name: /holy water.*demon/i });
    fireEvent.click(btn);
    expect(dispatch).toHaveBeenCalledWith({ type: "useArtifact", artifact: 16, target: 3000 });
  });

  it("extends the forced doom banner to an unfightable, unengaged Demon, naming it (not the Spectre) (US-13)", () => {
    const dispatch = vi.fn();
    // A lone Man (no magic, no Axe) facing a single Demon: nothing can be placed, but the round must
    // be fought — the Demon follows the Spectre's own forced-round/auto-slay rule (SC-EXT-21).
    const s: GameState = {
      ...newGame(1, [5], { extensionKit: true }),
      phase: "fight",
      fight: { surprise: 0, round: 2, focus: 0 },
      strangers: [15], // Demon
    };
    render(<FightSurface state={s} dispatch={dispatch} cards={cards} />);
    expect(screen.getByTestId("forced-spectre")).toHaveTextContent(/no one can fight the demon/i);
    expect(screen.getByTestId("forced-spectre")).not.toHaveTextContent(/spectre/i);
    const roll = screen.getByRole("button", { name: /face the demon/i });
    expect(roll).not.toBeDisabled();
    fireEvent.click(roll);
    expect(dispatch).toHaveBeenCalledWith({ type: "resolveRound", matches: [] });
  });

  it("offers the Scroll's confirm popup in fight phase, not a one-click dispatch (US-21, review fix)", () => {
    // Review finding: selectors.ts offers useArtifact(19) legally in the fight phase, but the
    // generic artifact-buttons loop rendered it as a plain one-click dispatch — no ConfirmButton,
    // no verbatim consequence text (EncounterPanel's own Scroll row already gets this right).
    const dispatch = vi.fn();
    const s: GameState = {
      ...newGame(1, [0], { extensionKit: true }),
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      strangers: [3], // Troll — not magic-only, so the Scroll has someone to burn
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [19] }], // Hero carrying the Scroll
    };
    render(<FightSurface state={s} dispatch={dispatch} cards={cards} />);
    const btn = screen.getByRole("button", { name: "Read the Scroll" });
    fireEvent.click(btn);
    expect(dispatch).not.toHaveBeenCalled(); // must confirm first — no immediate dispatch
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent(
      /destroys every enemy here save the magical — and curses the party/i,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "useArtifact", artifact: 19 });
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

describe("FightCard art — same picture the chamber floor already showed", () => {
  // Real manifest art (the same fixture projection.test.ts uses): the Dragon has 3 distinct images,
  // so a mismatch between "which copy" the chamber and the fight popup pick is actually visible.
  let realCards: CardArt[];
  beforeAll(() => {
    const m = JSON.parse(readFileSync(resolve(process.cwd(), "../../docs/assets/manifest.json"), "utf8")) as AssetManifest;
    realCards = parseManifest(m).cards;
  });

  it("gives two duplicate foes their own distinct art, matching the chamber's own nth-copy rule", () => {
    // Two Dragons (id 10) as strangers — projection.ts's laneCards assigns them variants 0 and 1 by
    // array order (see projection.test.ts's "unique ids even for repeats"); the fight popup must
    // pick the SAME two images for the SAME two Dragons, not a single fixed image derived from id 10.
    const s: GameState = { ...newGame(1, [6, 4]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [10, 10] };
    const dispatch = vi.fn();
    const { container } = render(<FightSurface state={s} dispatch={dispatch} cards={realCards} />);
    const foeArt = [...container.querySelectorAll<HTMLImageElement>(".scv-fc-art")].slice(0, 2);
    expect(foeArt).toHaveLength(2);
    expect(foeArt[0]!.src).toContain(resolveCardVariant("creature", 10, 0, realCards)!.file);
    expect(foeArt[1]!.src).toContain(resolveCardVariant("creature", 10, 1, realCards)!.file);
    expect(foeArt[0]!.src).not.toBe(foeArt[1]!.src); // the bug: both used to render the SAME fixed image
  });

  it("gives two duplicate allies their own distinct art, matching PartyPanel's own copy-index rule", () => {
    // Two Men (id 5) in the party tray — PartyPanel.tsx assigns copy 0/1 by original party order;
    // the fight tray must pick the same two images for the same two Men.
    const s: GameState = { ...newGame(1, [5, 5]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3] };
    const dispatch = vi.fn();
    render(<FightSurface state={s} dispatch={dispatch} cards={realCards} />);
    const tray0 = within(screen.getByTestId("tray-0")).getByRole("img") as HTMLImageElement;
    const tray1 = within(screen.getByTestId("tray-1")).getByRole("img") as HTMLImageElement;
    expect(tray0.src).toContain(resolveCardVariant("creature", 5, 0, realCards)!.file);
    expect(tray1.src).toContain(resolveCardVariant("creature", 5, 1, realCards)!.file);
    expect(tray0.src).not.toBe(tray1.src);
  });
});
