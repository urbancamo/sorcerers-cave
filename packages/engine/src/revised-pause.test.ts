import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { newGame } from "./setup";
import { driveStrangers } from "./strangerDriver";
import { legalMoves } from "./revisedRound";
import { partyAction, playRevisedFight } from "./headless";
import type { GameState } from "./state";

// Bug found in play (15-OCT-2026): a Woman and a Dwarf lost their first round to a Man, the Dwarf fell, and the game ended at once. With
// nothing free to deploy or pair, round 2 had no decision for the party and was fought on the spot, so the player never had the chance
// to retreat. From round 2 on, a round in which the party has no decision to make now pauses on an empty redeploy: fight on, or retreat.
const WOMAN = 6, DWARF = 7, MAN = 5;

/** The scripted losing round: Woman and Dwarf stand against one Man (the Dwarf sent in beside the Woman); returns the state at the first casualty. */
const atCasualty = (): GameState => {
  for (let seed = 1; seed <= 200; seed++) {
    let s: GameState = { ...newGame(seed, [WOMAN, DWARF]), variants: { combatRevision: true }, phase: "encounter", strangers: [MAN], treasures: [] };
    s = driveStrangers(reduce(s, { type: "attack" }).state).state;
    s = driveStrangers(reduce(s, { type: "engage", pairs: [{ party: 0, stranger: 0 }] }).state).state;
    if (s.fight?.pending?.by === "party" && s.fight.pending.kind === "redeploy") {
      const mv = legalMoves(s, "party").filter((m) => !m.back);
      s = driveStrangers(reduce(s, { type: "redeploy", moves: mv.length ? [mv[0]!] : [] }).state).state;
    }
    if (s.fight?.casualtyQueue?.length) return s;
  }
  throw new Error("no seed lost the first round with both in front");
};

describe("a round with no decision for the party", () => {
  it("does not end the game when the Dwarf falls: it pauses so the party can fight on or retreat", () => {
    const s = atCasualty();
    const dwarf = s.fight!.casualtyQueue![0]!.find((i) => s.party[i]!.creatureId === DWARF)!;
    const r = reduce(s, { type: "chooseCasualty", idx: dwarf });
    expect(r.state.phase).toBe("fight");
    expect(r.state.fight!.pending).toEqual({ by: "party", kind: "redeploy" });
    expect(r.state.party.filter((m) => m.status === 0)).toHaveLength(1);
    expect(r.events.some((e) => e.type === "gameOver")).toBe(false);
  });

  it("answering the pause with no moves fights the round, as before", () => {
    const s = atCasualty();
    const dwarf = s.fight!.casualtyQueue![0]!.find((i) => s.party[i]!.creatureId === DWARF)!;
    const paused = reduce(s, { type: "chooseCasualty", idx: dwarf }).state;
    const r = reduce(paused, { type: "redeploy", moves: [] });
    expect(r.events.some((e) => e.type === "combatRoll")).toBe(true);
  });

  it("is not asked in round 1, nor when the party has already decided something this round", () => {
    let s: GameState = { ...newGame(1, [WOMAN]), variants: { combatRevision: true }, phase: "encounter", strangers: [MAN], treasures: [] };
    s = driveStrangers(reduce(s, { type: "attack" }).state).state;
    s = driveStrangers(reduce(s, { type: "engage", pairs: [{ party: 0, stranger: 0 }] }).state).state;   // round 1 is fought with no pause
    expect(s.fight?.pending?.kind === "redeploy" && s.fight.round === 1).toBe(false);
  });

  it("keeps the headless harness moving (the standard party answers the pause)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s: GameState = { ...newGame(seed, [WOMAN, DWARF]), variants: { combatRevision: true }, phase: "encounter", strangers: [MAN], treasures: [] };
      s = driveStrangers(reduce(s, { type: "attack" }).state).state;
      expect(["won", "lost", "standoff"]).toContain(playRevisedFight(s).end);
    }
    expect(partyAction).toBeTypeOf("function");
  });
});
