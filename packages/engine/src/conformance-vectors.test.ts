import { describe, it, expect } from "vitest";
import { newGame, reduce } from "./index";
import { legalActions } from "./selectors";
import { validatePlan } from "./combatPlan";
import { casterMP } from "./combat";
import { eyeActive } from "./effects";
import { scoreGame } from "./score";
import type { GameAction, GameState } from "./index";

/**
 * CROSS-IMPLEMENTATION CONFORMANCE VECTORS (engine-spec Appendix D).
 *
 * Emits the committed vector files under docs/specs/conformance/ — deterministic solo playthroughs
 * rendered as plain 7-bit-ASCII text a foreign implementation (e.g. the VAX Macro-32 port) can
 * consume without JavaScript: the action log to drive its reducer, and after every action the
 * post-state checkpoints (turn / level / area / phase / gs / RNG seed) that pinpoint the exact move
 * where a divergent port went wrong. The RNG seed is the sharpest signal: ANY difference in roll
 * count, order, or arithmetic shows up as a seed mismatch on that very line.
 *
 * Like the solo golden firewall, this test FAILS when engine behaviour drifts from the committed
 * vectors (they are file snapshots). If the drift is a deliberate, approved rules change,
 * regenerate in the same commit:
 *
 *     pnpm --filter engine exec vitest run -u src/conformance-vectors.test.ts
 *
 * The action-selection policy below mirrors solo-golden.test.ts. The two need not stay in lockstep:
 * a vector file is self-contained (its OWN action list is what a port replays), the policy only
 * decides what those actions are.
 */

const C_SPECTRE = 9;
const T_MAGIC_SWORD = 3;

/** Greedy, always-valid battle plan: one capable free member per stranger, in order. */
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

// --- Vector text rendering (grammar documented in docs/specs/conformance/README.md) --------------

const PHASE_CODE: Record<string, string> = { explore: "EXP", encounter: "ENC", fight: "FGT", pickup: "PKP", gameOver: "END" };
const list = (xs: readonly number[] | undefined): string => (xs && xs.length ? xs.join(",") : "-");

/** One action in the vector grammar — covers the full 17-action catalog (SC-4-41). */
function encodeAction(a: GameAction): string {
  switch (a.type) {
    case "move": return `MOVE ${a.dir}`;
    case "retreat": return `RETREAT ${a.dir}`;
    case "quit": return "QUIT";
    case "exitCave": return "EXITCAVE";
    case "withdraw": return "WITHDRAW";
    case "test": return "TEST";
    case "attack": return "ATTACK";
    case "leaveTreasure": return "LEAVE";
    case "retakeDropped": return "RETAKE";
    case "openChest": return "OPENCHEST";
    case "takeTreasure": return `TAKE ${a.ti} ${a.mi}`;
    case "moveTreasure": return `GIVE ${a.from} ${a.to} ${a.idx}`;
    case "dropTreasure": return `DROP ${a.mi} ${a.idx}`;
    case "setBorne": return `BORNE ${a.mi} ${a.idx} ${a.borne ? 1 : 0}`;
    case "chooseCasualty": return `CASUALTY ${a.idx}`;
    case "useArtifact": return `USE ${a.artifact}${a.target !== undefined ? ` T${a.target}` : ""}${a.dir !== undefined ? ` D${a.dir}` : ""}`;
    case "resolveRound":
      return `FIGHT ${a.matches.length === 0 ? "-" : a.matches
        .map((m) => `${m.front.join("+") || "-"}${m.backers.length ? `|${m.backers.join("+")}` : ""}>${m.strangers.join("+")}`)
        .join(";")}`;
  }
}

/** Drive one game with the fixed policy and render its conformance vector text. */
function buildVector(seed: number, picks: number[]): string {
  const rnd = lcg(seed * 2654435761);
  let state = newGame(seed, picks);
  const lines: string[] = [
    "SORCERERS CAVE ENGINE CONFORMANCE VECTOR V1",
    "SEE docs/specs/conformance/README.md FOR THE FORMAT; engine-spec.md APPENDIX D FOR ITS CONTRACT",
    `SEED ${seed}`,
    `PICKS ${picks.join(",")}`,
    `SETUP TRN ${state.turn} LVL ${state.level} ARA ${state.partyArea} PH ${PHASE_CODE[state.phase]} GS ${state.gs} SEED ${state.seed} LARGEIDX ${state.largeIdx} SMALLIDX ${state.smallIdx}`,
    "BEGIN MOVES",
  ];
  let step = 0;
  const MAX_STEPS = 150;
  for (; step < MAX_STEPS && state.gs === 0; step++) {
    let action: GameAction | null = null;
    if (state.phase === "fight" && !state.fight?.casualtyQueue?.length) {
      const matches = buildPlan(state);
      action = validatePlan(state, { matches }).ok ? { type: "resolveRound", matches } : null;
    }
    if (!action) {
      const acts = legalActions(state);
      if (acts.length === 0) break;
      const pool = acts.filter((a) => a.type !== "exitCave");
      const from = step < 40 && pool.length > 0 ? pool : acts;
      action = from[rnd() % from.length]!;
    }
    const r = reduce(state, action);
    state = r.state;
    lines.push(
      `${String(step + 1).padStart(4)} ${encodeAction(action).padEnd(24)} -> TRN ${state.turn} LVL ${state.level} ARA ${state.partyArea} PH ${PHASE_CODE[state.phase]} GS ${state.gs} SEED ${state.seed} EV ${r.events.map((e) => e.type).join(",") || "-"}`,
    );
  }
  lines.push(`END MOVES ${step}`);
  lines.push(
    `FINAL GS ${state.gs} PH ${PHASE_CODE[state.phase]} TRN ${state.turn} LVL ${state.level} AREAS ${state.areas.length} LARGEIDX ${state.largeIdx} SMALLIDX ${state.smallIdx} SEED ${state.seed} SCORE ${scoreGame(state)}`,
    `STATE CURSES ${state.curses} BONUS ${state.bonusScore} SORCKILLED ${state.sorcererKilled ? 1 : 0} STRANGERS ${list(state.strangers)} TREASURES ${list(state.treasures)} HAZARDS ${list(state.hazards)}`,
  );
  state.party.forEach((m, i) =>
    lines.push(`PARTY ${i} CID ${m.creatureId} ST ${m.status} DK ${m.dragonKills} CARRY ${list(m.treasure)} BORNE ${list(m.borne)}`),
  );
  state.areas.forEach((a, i) =>
    lines.push(
      `AREA ${i} CARD ${a.card} COORD ${a.coord} FU ${a.faceUp ? 1 : 0} VIS ${a.visited ? 1 : 0} FLG ${a.flags} MIR ${a.mirroredStairs ?? 0} SD ${a.secretDoor ?? "-"} CONT ${list(a.contents)} DROP ${list(a.dropped)}`,
    ),
  );
  lines.push("END");
  return lines.join("\n") + "\n";
}

// The same seed × party coverage set as the solo golden firewall.
const RUNS: [number, number[]][] = [
  [3, [0]], [7, [1, 7]], [11, [5, 6, 7]], [19, [2, 7]],
  [23, [4, 6]], [42, [3]], [101, [1, 7]], [777, [5, 6]],
];

describe("conformance vectors — committed port fixtures match the engine", () => {
  for (const [seed, picks] of RUNS) {
    it(`solo seed ${seed} party [${picks.join(",")}] matches its committed vector`, async () => {
      const text = buildVector(seed, picks);
      expect(text.split("\n").length).toBeGreaterThan(10); // sanity: the run did something
      // File snapshot = the committed, port-consumable fixture. Drift fails; regenerate with -u.
      await expect(text).toMatchFileSnapshot(
        `../../../docs/specs/conformance/solo-seed${seed}-party${picks.join("-")}.txt`,
      );
    });
  }
});
