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
 * Seed/party: seed 165018, party [18, 20] (Witch, Wolf) — the cheapest kit-only-heavy 6-budget party
 * (Witch 5 + Wolf 1). Originally seed 397 (chosen by a scratchpad seed sweep, ~10,500 candidates
 * scored); re-swept to seed 165018 (bug fix 2026-08-02, ~240,000 candidates at this same party) after
 * the Chasm stopped drawing a small-pack card on arrival — a rules change that shifts the RNG cascade
 * of every kit-on playthrough that ever touches a Chasm, including the original seed 397's. This run
 * plays out to a natural GS_DEAD ending (a full party wipe at step 140, no step-cap truncation):
 *
 *   - Kit special areas (need ≥1): ALL FOUR fire — descendChasm (#5, the Chasm is reusable terrain,
 *     SC-EXT-5), a Whirlpool crossing rolls `whirlpoolRoll` (#70, SC-EXT-6), the Well is drawn from
 *     repeatedly (`wellDraw`, first at #76, SC-EXT-7), and a Crypt/Gems card parks (`cryptParked`, #43,
 *     SC-EXT-13).
 *   - Kit hazards (need ≥2): all FOUR kit hazard types fire — Quarrel (#93, SC-EXT-16), Spell remaps a
 *     tunnel (#50, SC-EXT-28), Desertion rolls (#97, SC-EXT-14), and Harpies actually strikes (#133,
 *     SC-EXT-15, delivering to a placed Lair the same step).
 *   - Kit artifact uses (need ≥1 here — Holy Water's own destroy-a-stranger band is exhaustively pinned
 *     separately in `kit-holywater-scroll.test.ts`, so this integration fixture only needs to prove ONE
 *     kit artifact resolves correctly in context): the Scroll is read (#58, SC-EXT-25).
 *   - Kit creature reactions (need ≥1): THREE — two reactions to a mixed stranger group including the
 *     Thief (#9-10, `strangers=[2,5,19]`) and one to a Dragon/Apprentice pair (#16, `strangers=[14,10]`).
 *   - Bonus (not required, pinned incidentally): a Demon materializes mid-run (`demonSpawned`, #15,
 *     SC-EXT-21), shortly followed by a forced ambush fight the party survives.
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
const RUNS: [number, number[]][] = [[165018, [18, 20]]];

describe("kit golden firewall — kit-on engine behaviour is frozen", () => {
  for (const [seed, picks] of RUNS) {
    it(`seed ${seed} kit-on party [${picks.join(",")}] plays back identically`, () => {
      const { narrative, final } = run(seed, picks);
      expect(narrative.length).toBeGreaterThan(5); // sanity: the run actually did something
      expect({ final, narrative }).toMatchSnapshot();
    });
  }
});
