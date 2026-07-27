import { describe, it, expect } from "vitest";
import { newGame, reduce } from "./index";
import { legalActions } from "./selectors";
import { validatePlan } from "./combatPlan";
import { casterMP } from "./combat";
import { eyeActive } from "./effects";
import { scoreGame } from "./score";
import type { GameAction, GameState } from "./index";

/**
 * KIT GOLDEN FIREWALL (extension-kit engine-integration plan, Task 17).
 *
 * The kit's counterpart to `solo-golden.test.ts`: replays one fixed seed × kit-on party × deterministic
 * policy game through the SOLO reducer with `variants: { extensionKit: true }`, and snapshots the full
 * action/event narrative plus a hash of the final state. Any engine change that alters kit-on behaviour
 * fails this test — that is the point. If a snapshot diff is ever intentional (an approved kit rules
 * change), update the snapshot deliberately in the same commit as the change + its engine-spec.md rows,
 * never as a side-effect. This test does NOT touch `solo-golden.test.ts`'s own fixtures — the base game
 * is untouched by this file.
 *
 * Seed/party: seed 397, party [18, 20] (Witch, Wolf) — the cheapest kit-only-heavy 6-budget party
 * (Witch 5 + Wolf 1), chosen by a scratchpad seed sweep (not committed) that scored ~10,500 seed×party
 * candidates against a kit-biased policy (below) for coverage of every required kit surface. This run
 * comfortably clears the plan's coverage bar and then some — it plays out to a natural GS_DEAD ending
 * (a full party wipe at step 197, no step-cap truncation):
 *
 *   - Kit special areas (need ≥1): descendChasm fires TWICE (#47, #94 — the Chasm is reusable terrain,
 *     SC-EXT-5); a Whirlpool crossing rolls `whirlpoolRoll` (#99, SC-EXT-6); the Well is drawn from
 *     repeatedly (`wellDraw`, SC-EXT-7, including one draw that fires a hazard and one that spawns a
 *     Demon); a Crypt/Gems card parks (`cryptParked`, #46, SC-EXT-13).
 *   - Kit hazards (need ≥2): all FOUR kit hazard types fire — Quarrel fizzles for want of two eligible
 *     duelists (#5, SC-EXT-16 — this 2-member party's only Quarrel-eligible member is the Witch, Wolf
 *     being permanently excluded, so a fizzle is this party's ONLY reachable Quarrel outcome, itself a
 *     documented case of SC-EXT-16), Spell remaps a tunnel (#20, SC-EXT-28), Desertion rolls twice for
 *     two allies (#110, SC-EXT-14), and Harpies actually strikes (#151, SC-EXT-15).
 *   - Kit artifact uses (need ≥2): Holy Water destroys a stranger (#96, `use:16>3000`, SC-EXT-24) and
 *     the Scroll is read (#111, `use:19`, SC-EXT-25).
 *   - Kit creature reactions (need ≥1): THREE — a hostile Witch stranger (#26, `strangers=18`), a
 *     friendly Giant+Lion group that joins as allies (#108, `strangers=12,16`), and the final, fatal
 *     attack into an eight-strong stranger group including the Apprentice and the Thief (#195,
 *     `strangers=11,7,19,9,14,5,7,4`).
 *   - Bonus (not required, pinned incidentally): a Demon materializes mid-run (`demonSpawned`, SC-EXT-21)
 *     and Medusa's gaze fires alongside the parked Crypt (#46) — both base/kit hazard machinery
 *     interacting correctly with the kit content around them.
 *
 * Policy: unlike solo-golden's plain "hold back exitCave, else uniform-random" policy, this run is
 * KIT-BIASED — precedented by `conformance-vectors.test.ts`'s own distinct "slayer"/"artifacts" policies
 * (which likewise steer differently from solo-golden's "base" policy while sharing its LCG/battle-plan
 * shape): whenever a kit special action (`descendChasm`/`drawFromWell`/`pullBellRope`/`enterCrypt`) is
 * legal it is preferred outright; otherwise a legal `useArtifact` is preferred 2-in-3 of the time; else a
 * `test` half the time; else `takeTreasure`; else the solo-golden fallback (uniform-random over the
 * remaining legal actions, holding back `exitCave` until near the step cap). A uniform-random policy
 * (solo-golden's own) essentially never reaches every one of the four required kit surfaces inside a
 * survivable run — the sweep script tried it and found no qualifying seed in the same search budget —
 * so this deliberate bias is the only practical way to pin a genuinely kit-heavy playthrough.
 */

const C_SPECTRE = 9;
const C_DEMON = 15;
const T_MAGIC_SWORD = 3;
const T_MAGIC_AXE = 17;

/** Greedy, always-valid battle plan: one capable free member per stranger, in order (see validatePlan).
 *  Magic-only gate widened to the Demon (SC-EXT-21) alongside the Spectre — a Magic Axe bearer (any
 *  species) or a caster satisfies either; mirrors solo-golden's own `buildPlan` shape exactly. */
function buildPlan(state: GameState): { front: number[]; backers: number[]; strangers: number[] }[] {
  const usedM = new Set<number>();
  const matches: { front: number[]; backers: number[]; strangers: number[] }[] = [];
  const capable = (mi: number, si: number): boolean => {
    const m = state.party[mi]!;
    const sid = state.strangers[si];
    if (sid !== C_SPECTRE && sid !== C_DEMON) return true;
    // Sword-Spectre bypass stays species-restricted ([0,1,5,6], as solo-golden's own always was); the
    // Axe-Demon bypass is possession-only, no species restriction (SC-EXT-21/26) — the two do NOT
    // collapse into one flat "holds a magic item" check.
    const sword = m.treasure.includes(T_MAGIC_SWORD) && [0, 1, 5, 6].includes(m.creatureId);
    const axe = sid === C_DEMON && m.treasure.includes(T_MAGIC_AXE);
    const magicItem = !eyeActive(state) && (sword || axe);
    return casterMP(m, state) > 0 || magicItem;
  };
  for (let s = 0; s < state.strangers.length; s++) {
    const mi = state.party.findIndex((m, i) => (m.status === 0 || m.status === 1) && !usedM.has(i) && capable(i, s));
    if (mi >= 0) { usedM.add(mi); matches.push({ front: [mi], backers: [], strangers: [s] }); }
  }
  return matches;
}

/** Tiny deterministic LCG so the policy varies per step without Math.random (solo-golden's own). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s; };
}

/** One-line code for an action, for the snapshot narrative — extends solo-golden's `actionCode` with
 *  the kit's four new action types (SC-EXT-5/7/8/13). */
function actionCode(a: GameAction): string {
  switch (a.type) {
    case "move": return `move:${a.dir}`;
    case "retreat": return `retreat:${a.dir}`;
    case "takeTreasure": return `take:${a.ti}>${a.mi}`;
    case "chooseCasualty": return `casualty:${a.idx}`;
    case "useArtifact": return `use:${a.artifact}${a.target !== undefined ? ">" + a.target : ""}${a.dir !== undefined ? "@" + a.dir : ""}`;
    case "resolveRound": return `fight:${a.matches.map((m) => `${m.front.join("+")}v${m.strangers.join("+")}`).join(",")}`;
    case "pullBellRope": return `bellrope:${a.mi}`;
    default: return a.type;
  }
}

/** FNV-1a hash of a JSON-serialised value (stable enough as a state fingerprint). Identical to
 *  solo-golden's own. */
function fnv(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const MAX_STEPS = 300;

/** Drive one kit-on game with a fixed, kit-biased policy; return its full narrative + final fingerprint.
 *  Structurally identical to solo-golden's own `run` (LCG, battle-plan-first-in-fight, narrative array,
 *  final summary object) — the only difference is the action-selection policy itself (see header). */
function run(seed: number, picks: number[]): { narrative: string[]; final: Record<string, unknown> } {
  const rnd = lcg(seed * 2654435761);
  let state = newGame(seed, picks, { extensionKit: true });
  const narrative: string[] = [];
  for (let step = 0; step < MAX_STEPS && state.gs === 0; step++) {
    let action: GameAction | null = null;
    if (state.phase === "fight" && !state.fight?.casualtyQueue?.length) {
      const acts = legalActions(state);
      const fightUses = acts.filter((a) => a.type === "useArtifact");
      if (fightUses.length && rnd() % 2 === 0) {
        action = fightUses[rnd() % fightUses.length]!;
      } else {
        const matches = buildPlan(state);
        const plan: GameAction = { type: "resolveRound", matches };
        // buildPlan is valid by construction (incl. the forced-Spectre/Demon empty plan); guard anyway.
        action = validatePlan(state, { matches }).ok ? plan : null;
      }
    }
    if (!action) {
      const acts = legalActions(state);
      if (acts.length === 0) break;
      // Kit-biased policy (see header doc comment): kit specials > artifacts > test > takeTreasure >
      // solo-golden's own uniform-random fallback (holding exitCave back until near the step cap).
      const kitSpecial = acts.filter(
        (a) => a.type === "descendChasm" || a.type === "drawFromWell" || a.type === "pullBellRope" || a.type === "enterCrypt",
      );
      const uses = acts.filter((a) => a.type === "useArtifact");
      const tests = acts.filter((a) => a.type === "test");
      const takes = acts.filter((a) => a.type === "takeTreasure");
      if (kitSpecial.length) action = kitSpecial[rnd() % kitSpecial.length]!;
      else if (uses.length && rnd() % 3 !== 0) action = uses[rnd() % uses.length]!;
      else if (tests.length && rnd() % 2 === 0) action = tests[rnd() % tests.length]!;
      else if (takes.length) action = takes[rnd() % takes.length]!;
      else {
        const pool = acts.filter((a) => a.type !== "exitCave");
        const from = step < MAX_STEPS - 20 && pool.length > 0 ? pool : acts;
        action = from[rnd() % from.length]!;
      }
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

// Seed × party chosen by a scratchpad seed sweep for kit-content coverage — see header doc comment.
const RUNS: [number, number[]][] = [[397, [18, 20]]];

describe("kit golden firewall — kit-on engine behaviour is frozen", () => {
  for (const [seed, picks] of RUNS) {
    it(`seed ${seed} kit-on party [${picks.join(",")}] plays back identically`, () => {
      const { narrative, final } = run(seed, picks);
      expect(narrative.length).toBeGreaterThan(5); // sanity: the run actually did something
      expect({ final, narrative }).toMatchSnapshot();
    });
  }
});
