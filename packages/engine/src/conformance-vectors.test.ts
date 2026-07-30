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
 * Four action-selection policies drive the runs. "base" mirrors solo-golden.test.ts; "slayer"
 * recruits allies, grabs treasure and gangs 2 front + casters onto the strongest foe (it can kill
 * the Sorcerer); "artifacts" additionally spends any usable artifact on sight. Policies need not
 * stay in lockstep with solo-golden: a vector file is self-contained (its OWN action list is what
 * a port replays) — the policy only decides what those actions are.
 *
 * "kit" (Task 17) drives the ONE kit-on (`variants.extensionKit: true`) vector, mirroring
 * kit-golden.test.ts's own kit-biased policy: a legal kit special action (`descendChasm`/
 * `drawFromWell`/`pullBellRope`/`enterCrypt`) is preferred outright, else a legal `useArtifact` is
 * preferred like "artifacts", else it falls back to "base"'s own steered preferences (test, then
 * takeTreasure, then roam holding exitCave back). `buildVector`'s optional `variants` parameter
 * threads straight into `newGame`; every OTHER (kit-off) run below omits it, so their vector text is
 * byte-identical to before this parameter existed (SC-EXT-1) — a kit-on run alone gains one extra
 * `KIT 1` header line (see docs/specs/conformance/README.md) so a port knows to build its decks with
 * the extension content before replaying.
 */

type Policy = "base" | "slayer" | "artifacts" | "kit";

const C_SPECTRE = 9;
const C_DEMON = 15; // extension kit (SC-EXT-21) — the same magic-only fight gate as the Spectre, plus a Magic Axe bypass
const T_MAGIC_SWORD = 3;
const T_MAGIC_AXE = 17; // extension kit (SC-EXT-21/26) — ANY bearer (no species restriction) may fight a Demon hand-to-hand

/** Greedy, always-valid battle plan: one capable free member per stranger, in order. Magic-only gate
 *  widened to the Demon (SC-EXT-21) alongside the Spectre — used by both the kit-off "base" policy
 *  (where a Demon can never appear, so this is a no-op) and the kit-on "kit" policy (Task 17), which
 *  needs it for real. */
function buildPlan(state: GameState): { front: number[]; backers: number[]; strangers: number[] }[] {
  const usedM = new Set<number>();
  const matches: { front: number[]; backers: number[]; strangers: number[] }[] = [];
  const capable = (mi: number, si: number): boolean => {
    const m = state.party[mi]!;
    const sid = state.strangers[si];
    if (sid !== C_SPECTRE && sid !== C_DEMON) return true;
    // Sword-Spectre bypass stays species-restricted ([0,1,5,6], as it always was); the Axe-Demon
    // bypass is possession-only, no species restriction (SC-EXT-21/26) — the two do NOT collapse
    // into one flat "holds a magic item" check.
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
// Precise Locations (§10.5): `PlacedArea.sunkTreasure` buckets — `<at>:<items>` per non-empty
// bucket, `;`-joined, `-` when there are none. `at` is `island` or DIR_N..DIR_W's own 1-4 (same
// numbering MOVE/RETREAT already use).
const sunkStr = (buckets: { at: "island" | 1 | 2 | 3 | 4; items: number[] }[] | undefined): string =>
  buckets && buckets.length ? buckets.map((b) => `${b.at}:${b.items.join(",")}`).join(";") : "-";

/** One action in the vector grammar — covers the full 21-action catalog (SC-4-41). */
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
    // Extension kit (SC-EXT-5/7/8/13): the "base"/"slayer"/"artifacts" policies below never choose
    // these (the kit is off in every one of their runs); the "kit" policy (Task 17) does. Of the four,
    // only `descendChasm`/`drawFromWell` actually fire in the one committed kit vector below (the run
    // never revisits a Bell Rope tile or the parked Crypt's own coord to invoke `pullBellRope`/
    // `enterCrypt` — see docs/specs/conformance/README.md's `-kit` row) — `pullBellRope`/`enterCrypt`
    // stay exhaustiveness-only, same as all four are for every OTHER (kit-off) run.
    case "descendChasm": return "DESCENDCHASM";
    case "drawFromWell": return "DRAWFROMWELL";
    case "pullBellRope": return `PULLBELLROPE ${a.mi}`;
    case "enterCrypt": return "ENTERCRYPT";
    // Precise Locations (§10.5, §8.2): Peter's jump-to-island house rule, Viper Pit/Deep Pool only —
    // none of the policies below choose it deliberately, but it appears in `legalActions` for any
    // run that lands a doorway on one of those two tiles, so it must stay exhaustive here.
    case "jumpToIsland": return "JUMPISLAND";
  }
}

/** Drive one game with the given policy and render its conformance vector text. `variants` (Task 17,
 *  SC-EXT-1) threads straight into `newGame`; omitted (every non-"kit" run below), the vector text is
 *  byte-identical to before this parameter existed — no `KIT` header line, no kit deck content. */
function buildVector(seed: number, picks: number[], policy: Policy, maxSteps: number, variants?: { extensionKit?: boolean }): string {
  const rnd = lcg(seed * 2654435761);
  let state = newGame(seed, picks, variants);
  const lines: string[] = [
    "SORCERERS CAVE ENGINE CONFORMANCE VECTOR V1",
    "SEE docs/specs/conformance/README.md FOR THE FORMAT; engine-spec.md APPENDIX D FOR ITS CONTRACT",
    `SEED ${seed}`,
    `PICKS ${picks.join(",")}`,
    ...(variants?.extensionKit ? ["KIT 1"] : []),
    `SETUP TRN ${state.turn} LVL ${state.level} ARA ${state.partyArea} PH ${PHASE_CODE[state.phase]} GS ${state.gs} SEED ${state.seed} LARGEIDX ${state.largeIdx} SMALLIDX ${state.smallIdx}`,
    "BEGIN MOVES",
  ];
  let step = 0;
  for (; step < maxSteps && state.gs === 0; step++) {
    let action: GameAction | null = null;
    if (policy === "kit") {
      // The "kit" policy is a byte-for-byte port of kit-golden.test.ts's own `run()` decision logic —
      // same branch shape AND same rnd()-consumption order — so this vector replays the identical
      // action sequence (and hence the identical kit-content coverage) as the pinned golden narrative,
      // rather than reinventing a similar-but-different policy that would need its own seed sweep.
      if (state.phase === "fight" && !state.fight?.casualtyQueue?.length) {
        const acts = legalActions(state);
        const fightUses = acts.filter((a) => a.type === "useArtifact");
        if (fightUses.length && rnd() % 2 === 0) {
          action = fightUses[rnd() % fightUses.length]!;
        } else {
          const matches = buildPlan(state);
          const plan: GameAction = { type: "resolveRound", matches };
          action = validatePlan(state, { matches }).ok ? plan : null;
        }
      }
      if (!action) {
        const acts = legalActions(state);
        if (acts.length === 0) break;
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
          const from = step < maxSteps - 20 && pool.length > 0 ? pool : acts;
          action = from[rnd() % from.length]!;
        }
      }
      const r = reduce(state, action!);
      state = r.state;
      lines.push(
        `${String(step + 1).padStart(4)} ${encodeAction(action!).padEnd(24)} -> TRN ${state.turn} LVL ${state.level} ARA ${state.partyArea} PH ${PHASE_CODE[state.phase]} GS ${state.gs} SEED ${state.seed} EV ${r.events.map((e) => e.type).join(",") || "-"}`,
      );
      continue;
    }
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
      `AREA ${i} CARD ${a.card} COORD ${a.coord} FU ${a.faceUp ? 1 : 0} VIS ${a.visited ? 1 : 0} FLG ${a.flags} MIR ${a.mirroredStairs ?? 0} SD ${a.secretDoor ?? "-"} CONT ${list(a.contents)} DROP ${list(a.dropped)} SUNK ${sunkStr(a.sunkTreasure)}`,
    ),
  );
  lines.push("END");
  return lines.join("\n") + "\n";
}

// Base set = the solo golden firewall's seed × party coverage. The tagged runs are TARGETED
// fixtures found by seed sweep: outcomes the base policy never reaches (see the tag).
interface Run { seed: number; picks: number[]; policy: Policy; maxSteps: number; tag?: string; variants?: { extensionKit?: boolean } }
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
  // Extension kit (Task 17): the one kit-on vector, `variants.extensionKit: true` — same seed/party as
  // kit-golden.test.ts's own pinned playthrough (chosen by the same scratchpad seed sweep), replayed
  // here with the "kit" policy for a self-contained, port-consumable fixture. Exercises: Chasm/
  // Whirlpool/Well specials (SC-EXT-5/6/7) and a parked Crypt (SC-EXT-13); all four kit hazards —
  // Quarrel fizzles (SC-EXT-16), Spell remaps a tunnel (SC-EXT-28), Desertion (SC-EXT-14), Harpies
  // actually strikes (SC-EXT-15); two kit artifacts — Holy Water destroys a stranger and the Scroll is
  // read (SC-EXT-24/25); reactions to kit-creature strangers (a Witch, a Giant+Lion pair, and a final
  // mixed group including the Apprentice and the Thief); and a Demon materializing (SC-EXT-21). Ends
  // GS_DEAD (a full party wipe) — a natural end, not a step-cap truncation.
  { seed: 397, picks: [18, 20], policy: "kit", maxSteps: 300, tag: "kit", variants: { extensionKit: true } },
];

describe("conformance vectors — committed port fixtures match the engine", () => {
  for (const { seed, picks, policy, maxSteps, tag, variants } of RUNS) {
    const name = `solo-seed${seed}-party${picks.join("-")}${tag ? `-${tag}` : ""}`;
    it(`${name} (${policy}) matches its committed vector`, async () => {
      const text = buildVector(seed, picks, policy, maxSteps, variants);
      expect(text.split("\n").length).toBeGreaterThan(10); // sanity: the run did something
      // File snapshot = the committed, port-consumable fixture. Drift fails; regenerate with -u.
      await expect(text).toMatchFileSnapshot(`../../../docs/specs/conformance/${name}.txt`);
    });
  }
});
