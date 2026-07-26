import { describe, it, expect } from "vitest";
import { newGame, reduce, CREATURES } from "./index";
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
 * Three action-selection policies drive the runs. "base" mirrors solo-golden.test.ts; "slayer"
 * recruits allies, grabs treasure and gangs 2 front + casters onto the strongest foe (it can kill
 * the Sorcerer); "artifacts" additionally spends any usable artifact on sight. Policies need not
 * stay in lockstep with solo-golden: a vector file is self-contained (its OWN action list is what
 * a port replays) — the policy only decides what those actions are.
 */

type Policy = "base" | "slayer" | "artifacts";

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

/** Strongest-foe-first plan: 2 front on the toughest foe, leftover casters back it, 1v1 the rest. */
function buildStrongPlan(state: GameState): { front: number[]; backers: number[]; strangers: number[] }[] {
  const alive = state.party.map((m, i) => ({ m, i })).filter(({ m }) => m.status === 0 || m.status === 1);
  const capable = (mi: number, si: number): boolean => {
    const m = state.party[mi]!;
    if (state.strangers[si] !== C_SPECTRE) return true;
    const sword = !eyeActive(state) && m.treasure.includes(T_MAGIC_SWORD) && [0, 1, 5, 6].includes(m.creatureId);
    return casterMP(m, state) > 0 || sword;
  };
  const foes = state.strangers
    .map((cid, si) => ({ cid, si }))
    .sort((a, b) => CREATURES[b.cid]!.fs + CREATURES[b.cid]!.mp - (CREATURES[a.cid]!.fs + CREATURES[a.cid]!.mp));
  const used = new Set<number>();
  const matches: { front: number[]; backers: number[]; strangers: number[] }[] = [];
  for (const { si } of foes) {
    const cands = alive
      .filter(({ i }) => !used.has(i) && capable(i, si))
      .sort((a, b) => CREATURES[b.m.creatureId]!.fs - CREATURES[a.m.creatureId]!.fs);
    if (!cands.length) continue;
    const front = cands.slice(0, matches.length === 0 ? 2 : 1).map(({ i }) => i);
    front.forEach((i) => used.add(i));
    matches.push({ front, backers: [], strangers: [si] });
  }
  if (matches.length) {
    for (const { m, i } of alive) if (!used.has(i) && casterMP(m, state) > 0) { used.add(i); matches[0]!.backers.push(i); }
  }
  return matches;
}

/** Tiny deterministic LCG so the policy varies per step without Math.random. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s; };
}

// --- Vector text rendering (grammar documented in docs/specs/conformance/README.md) --------------

const PHASE_CODE: Record<string, string> = { explore: "EXP", medusa: "MDS", encounter: "ENC", fight: "FGT", pickup: "PKP", gameOver: "END" };
const list = (xs: readonly number[] | undefined): string => (xs && xs.length ? xs.join(",") : "-");

/** One action in the vector grammar — covers the full 18-action catalog (SC-4-41). */
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
    case "proceed": return "PROCEED";
    case "useArtifact": return `USE ${a.artifact}${a.target !== undefined ? ` T${a.target}` : ""}${a.dir !== undefined ? ` D${a.dir}` : ""}`;
    case "resolveRound":
      return `FIGHT ${a.matches.length === 0 ? "-" : a.matches
        .map((m) => `${m.front.join("+") || "-"}${m.backers.length ? `|${m.backers.join("+")}` : ""}>${m.strangers.join("+")}`)
        .join(";")}`;
    // Extension kit (SC-EXT-5): none of the "base"/"slayer"/"artifacts" policies below ever choose
    // this (the kit is off in every conformance run), so this arm is exhaustiveness-only — it never
    // actually appears in a committed vector file.
    case "descendChasm": return "DESCENDCHASM";
  }
}

/** Drive one game with the given policy and render its conformance vector text. */
function buildVector(seed: number, picks: number[], policy: Policy, maxSteps: number): string {
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
  for (; step < maxSteps && state.gs === 0; step++) {
    let action: GameAction | null = null;
    if (state.phase === "fight" && !state.fight?.casualtyQueue?.length) {
      // The artifacts policy spends fight-legal artifacts (Potion, Lotus) before planning a round;
      // they are consumed, so this self-limits.
      const fightUses = policy === "artifacts" ? legalActions(state).filter((a) => a.type === "useArtifact") : [];
      if (fightUses.length) action = fightUses[rnd() % fightUses.length]!;
      else {
        let matches = policy === "base" ? buildPlan(state) : buildStrongPlan(state);
        if (!validatePlan(state, { matches }).ok) matches = buildPlan(state);
        action = validatePlan(state, { matches }).ok ? { type: "resolveRound", matches } : null;
      }
    }
    if (!action) {
      const acts = legalActions(state);
      if (acts.length === 0) break;
      let from = acts;
      if (policy !== "base") {
        // Steered preferences: use artifacts / recruit by testing / grab treasure, else roam.
        const uses = acts.filter((a) => a.type === "useArtifact");
        const tests = acts.filter((a) => a.type === "test");
        const takes = acts.filter((a) => a.type === "takeTreasure");
        if (policy === "artifacts" && uses.length) from = uses;
        else if (tests.length) from = tests;
        else if (takes.length) from = takes;
        else {
          const pool = acts.filter((a) => a.type !== "exitCave");
          from = step < 60 && pool.length > 0 ? pool : acts;
        }
      } else {
        const pool = acts.filter((a) => a.type !== "exitCave");
        from = step < 40 && pool.length > 0 ? pool : acts;
      }
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

// Base set = the solo golden firewall's seed × party coverage. The tagged runs are TARGETED
// fixtures found by seed sweep: outcomes the base policy never reaches (see the tag).
interface Run { seed: number; picks: number[]; policy: Policy; maxSteps: number; tag?: string }
const RUNS: Run[] = [
  { seed: 3, picks: [0], policy: "base", maxSteps: 150 },
  { seed: 7, picks: [1, 7], policy: "base", maxSteps: 150 },
  { seed: 11, picks: [5, 6, 7], policy: "base", maxSteps: 150 },
  { seed: 19, picks: [2, 7], policy: "base", maxSteps: 150 },
  { seed: 23, picks: [4, 6], policy: "base", maxSteps: 150 },
  { seed: 42, picks: [3], policy: "base", maxSteps: 150 },
  { seed: 101, picks: [1, 7], policy: "base", maxSteps: 150 },
  { seed: 777, picks: [5, 6], policy: "base", maxSteps: 150 },
  // Escape with a laden party: gameOver(ESCAPED), 11 carried treasures, valid score 131.
  { seed: 225, picks: [0], policy: "base", maxSteps: 150, tag: "escape" },
  // The Sorcerer is slain (sorcererSlain, curse lift §12) before the party is wiped.
  { seed: 174, picks: [1, 7], policy: "slayer", maxSteps: 300, tag: "sorcerer" },
  // Artifact coverage — together the four artifact runs use Carpet 4, Lotus 5, Balm 6, Potion 8,
  // Staff 9 and Flute 12, and exercise the Lost-Ruby wrestle and the Treasure Chest.
  { seed: 257, picks: [4, 6], policy: "artifacts", maxSteps: 300, tag: "artifacts" },   // 5,6,8,12 + ruby, terminal
  { seed: 1237, picks: [1, 7], policy: "artifacts", maxSteps: 300, tag: "artifacts" },  // 5,6,9 (Staff) + ruby
  { seed: 2678, picks: [5, 6, 7], policy: "artifacts", maxSteps: 300, tag: "artifacts" }, // 4 (Carpet),5,6,12 + ruby
  { seed: 2355, picks: [0], policy: "artifacts", maxSteps: 300, tag: "artifacts" },     // 5,6,8,12 + chest
  // Gap coverage (seed sweep) — each targets an outcome the four artifact runs never reach:
  { seed: 53, picks: [2, 7], policy: "artifacts", maxSteps: 300, tag: "chest2" },       // openChest -> a Spectre attacks
  { seed: 30, picks: [4, 6], policy: "artifacts", maxSteps: 300, tag: "ring" },         // Ring shrugs off a killing blow (deathPrevented)
  { seed: 148, picks: [4, 6], policy: "artifacts", maxSteps: 300, tag: "reclaim" },     // Deep-Pool dropped treasure reclaimed
  { seed: 330, picks: [1, 7], policy: "artifacts", maxSteps: 300, tag: "medusaavert" }, // Staff-Wizard averts Medusa
  { seed: 24, picks: [5, 6, 7], policy: "artifacts", maxSteps: 300, tag: "petrified" }, // whole party turned to stone (petrifiedOut)
];

describe("conformance vectors — committed port fixtures match the engine", () => {
  for (const { seed, picks, policy, maxSteps, tag } of RUNS) {
    const name = `solo-seed${seed}-party${picks.join("-")}${tag ? `-${tag}` : ""}`;
    it(`${name} (${policy}) matches its committed vector`, async () => {
      const text = buildVector(seed, picks, policy, maxSteps);
      expect(text.split("\n").length).toBeGreaterThan(10); // sanity: the run did something
      // File snapshot = the committed, port-consumable fixture. Drift fails; regenerate with -u.
      await expect(text).toMatchFileSnapshot(`../../../docs/specs/conformance/${name}.txt`);
    });
  }
});
