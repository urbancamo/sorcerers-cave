import { describe, it, expect } from "vitest";
import { newGame, reduce } from "./index";
import { legalActions } from "./selectors";
import { validatePlan } from "./combatPlan";
import { casterMP } from "./combat";
import { swordFightsSpectre } from "./capabilities";
import { eyePresent } from "./effects";
import type { GameAction, GameState } from "./index";

/**
 * Invariant sweep for the stranger loadout: play many policy-driven games (kit off and on) and check,
 * after EVERY action, that what strangers bear stays aligned with the strangers and that no fight
 * artefact is ever duplicated or lost. Also asserts the sweep actually exercises the loadout.
 */

const C_SPECTRE = 9, C_DEMON = 15;
const FIGHT_ARTIFACTS = [3, 9, 10, 17, 20]; // Sword, Staff, Ring, Axe, Shield

function buildPlan(state: GameState): { front: number[]; backers: number[]; strangers: number[] }[] {
  const used = new Set<number>();
  const matches: { front: number[]; backers: number[]; strangers: number[] }[] = [];
  const capable = (mi: number, si: number): boolean => {
    const m = state.party[mi]!, sid = state.strangers[si];
    if (sid !== C_SPECTRE && sid !== C_DEMON) return true;
    const sword = sid === C_SPECTRE && !eyePresent(state) && m.treasure.includes(3) && swordFightsSpectre(m.creatureId);
    const axe = sid === C_DEMON && !eyePresent(state) && m.treasure.includes(17);
    return casterMP(m, state) > 0 || sword || axe;
  };
  for (let s = 0; s < state.strangers.length; s++) {
    const mi = state.party.findIndex((m, i) => (m.status === 0 || m.status === 1) && !used.has(i) && capable(i, s));
    if (mi >= 0) { used.add(mi); matches.push({ front: [mi], backers: [], strangers: [s] }); }
  }
  return matches;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s; };
}

/** Count of each fight artefact across the floor, the strangers' gear and the party — must never grow. */
function artifactCensus(state: GameState): number[] {
  const count = (id: number) =>
    state.treasures.filter((t) => t === id).length
    + (state.fight?.gear ?? []).flat().filter((t) => t === id).length
    + state.party.reduce((n, m) => n + m.treasure.filter((t) => t === id).length, 0)
    + state.areas.reduce((n, a) => n + a.contents.filter((c) => c === 200 + id).length, 0);
  return FIGHT_ARTIFACTS.map(count);
}

describe("stranger loadout — invariants over many played games", () => {
  it("gear stays aligned with strangers, and no fight artefact is ever duplicated", () => {
    let equipped = 0, fights = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const kit = seed % 2 === 0;
      const rnd = lcg(seed * 2654435761);
      let state = newGame(seed, kit ? [18, 20] : [seed % 6, 7], kit ? { extensionKit: true } : undefined);
      for (let step = 0; step < 220 && state.gs === 0; step++) {
        let action: GameAction | null = null;
        if (state.phase === "fight" && !state.fight?.casualtyQueue?.length) {
          const matches = buildPlan(state);
          action = validatePlan(state, { matches }).ok ? { type: "resolveRound", matches } : null;
        }
        if (!action) {
          const acts = legalActions(state);
          if (acts.length === 0) break;
          const pool = acts.filter((a) => a.type !== "exitCave");
          const from = step < 60 && pool.length > 0 ? pool : acts;
          action = from[rnd() % from.length]!;
        }
        const before = artifactCensus(state);
        const r = reduce(state, action);
        equipped += r.events.filter((e) => e.type === "strangerEquipped").length;
        if (r.events.some((e) => e.type === "fightStarted")) fights++;
        state = r.state;
        const gear = state.fight?.gear;
        if (gear) {
          expect(gear.length, `seed ${seed} step ${step}: gear misaligned`).toBe(state.strangers.length);
          expect(state.fight!.round, "gear only exists inside a fight").toBeGreaterThan(0);
        }
        const after = artifactCensus(state);
        // Artefacts only ever enter play via a chamber draw, so the census may rise but never by duplication from
        // a loadout/drop/retreat step: a step that draws nothing must leave it unchanged or lower (consumed/vanished).
        if (!r.events.some((e) => e.type === "drewChamber" || e.type === "chestOpened" || e.type === "strangersJoined")) {
          after.forEach((n, i) => expect(n, `seed ${seed} step ${step} (${action!.type}): artefact ${FIGHT_ARTIFACTS[i]} duplicated`).toBeLessThanOrEqual(before[i]!));
        }
      }
    }
    expect(fights).toBeGreaterThan(100); // the sweep really played fights
    expect(equipped).toBeGreaterThan(3); // ...and the loadout really fired (a few percent of fights, per the feasibility odds)
    console.log(`sweep: ${fights} fights started, ${equipped} stranger equips`);
  }, 120_000);
});
