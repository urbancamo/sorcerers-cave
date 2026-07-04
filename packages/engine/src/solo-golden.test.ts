import { describe, it, expect } from "vitest";
import { newGame, reduce } from "./index";
import { legalActions } from "./selectors";
import { validatePlan } from "./combatPlan";
import { casterMP } from "./combat";
import { eyeActive } from "./effects";
import { scoreGame } from "./score";
import type { GameAction, GameState } from "./index";

/**
 * SOLO GOLDEN FIREWALL (multiplayer plan §8.1 / INV-2).
 *
 * Replays fixed seed × party × deterministic-policy games through the SOLO reducer and snapshots the
 * full action/event narrative plus a hash of every final state. Any engine change that alters solo
 * behaviour in ANY of these runs fails this test. That is the point: multiplayer work must keep solo
 * byte-identical. If a snapshot diff is ever intentional (an approved solo rules change), update the
 * snapshot deliberately in the same commit as the approved change + its engine-spec.md rows — never
 * as a side-effect.
 */

const C_SPECTRE = 9;
const T_MAGIC_SWORD = 3;

/** Greedy, always-valid battle plan: one capable free member per stranger, in order (see validatePlan). */
function buildPlan(state: GameState): { front: number[]; backers: number[]; strangers: number[] }[] {
  const usedM = new Set<number>();
  const matches: { front: number[]; backers: number[]; strangers: number[] }[] = [];
  const capable = (mi: number, si: number): boolean => {
    const m = state.party[mi]!;
    if (state.strangers[si] !== C_SPECTRE) return true;
    const sword = !eyeActive(state) && m.treasure.includes(T_MAGIC_SWORD) && [0, 1, 5, 6].includes(m.creatureId);
    return casterMP(m, state) > 0 || sword;
  };
  for (let s = 0; s < state.strangers.length; s++) {
    const mi = state.party.findIndex((m, i) => (m.status === 0 || m.status === 1) && !usedM.has(i) && capable(i, s));
    if (mi >= 0) { usedM.add(mi); matches.push({ front: [mi], backers: [], strangers: [s] }); }
  }
  return matches;
}

/** Tiny deterministic LCG so the policy varies per step without Math.random. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s; };
}

/** One-line code for an action, for the snapshot narrative. */
function actionCode(a: GameAction): string {
  switch (a.type) {
    case "move": return `move:${a.dir}`;
    case "retreat": return `retreat:${a.dir}`;
    case "takeTreasure": return `take:${a.ti}>${a.mi}`;
    case "chooseCasualty": return `casualty:${a.idx}`;
    case "useArtifact": return `use:${a.artifact}${a.target !== undefined ? ">" + a.target : ""}${a.dir !== undefined ? "@" + a.dir : ""}`;
    case "resolveRound": return `fight:${a.matches.map((m) => `${m.front.join("+")}v${m.strangers.join("+")}`).join(",")}`;
    default: return a.type;
  }
}

/** FNV-1a hash of a JSON-serialised value (stable enough as a state fingerprint). */
function fnv(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const MAX_STEPS = 150;

/** Drive one game with a fixed policy; return its full narrative + final fingerprint. */
function run(seed: number, picks: number[]): { narrative: string[]; final: Record<string, unknown> } {
  const rnd = lcg(seed * 2654435761);
  let state = newGame(seed, picks);
  const narrative: string[] = [];
  for (let step = 0; step < MAX_STEPS && state.gs === 0; step++) {
    let action: GameAction | null = null;
    if (state.phase === "fight" && !state.fight?.casualtyQueue?.length) {
      const matches = buildPlan(state);
      const plan: GameAction = { type: "resolveRound", matches };
      // buildPlan is valid by construction (incl. the forced-Spectre empty plan); guard anyway.
      action = validatePlan(state, { matches }).ok ? plan : null;
    }
    if (!action) {
      const acts = legalActions(state);
      if (acts.length === 0) break;
      // Policy: pseudo-random pick, but hold exitCave back (unless it's all there is) so runs explore.
      const pool = acts.filter((a) => a.type !== "exitCave");
      const from = step < 40 && pool.length > 0 ? pool : acts;
      action = from[rnd() % from.length]!;
    }
    const r = reduce(state, action);
    narrative.push(`#${step} ${actionCode(action)} => ${r.events.map((e) => e.type).join(",") || "-"}`);
    state = r.state;
  }
  return {
    narrative,
    final: {
      gs: state.gs, phase: state.phase, turn: state.turn, level: state.level,
      areas: state.areas.length, partyAlive: state.party.filter((m) => m.status === 0 || m.status === 1).length,
      score: scoreGame(state), stateHash: fnv(state),
    },
  };
}

// Seeds × parties chosen for coverage variety (combat, pickup, hazards, deaths, escapes).
const RUNS: [number, number[]][] = [
  [3, [0]], [7, [1, 7]], [11, [5, 6, 7]], [19, [2, 7]],
  [23, [4, 6]], [42, [3]], [101, [1, 7]], [777, [5, 6]],
];

describe("solo golden firewall — engine behaviour is frozen", () => {
  for (const [seed, picks] of RUNS) {
    it(`seed ${seed} party [${picks.join(",")}] plays back identically`, () => {
      const { narrative, final } = run(seed, picks);
      expect(narrative.length).toBeGreaterThan(5); // sanity: the run actually did something
      expect({ final, narrative }).toMatchSnapshot();
    });
  }
});
