// The invariant soak (engine rules validation, pilot): plays many random games, in the base game, with the Extension Kit, with kit + Sibyl,
// each under the classic and the revised combat, and after EVERY action checks that
//   - the state satisfies every invariant of `invariants.ts`,
//   - `reduce` did not mutate the state it was given,
//   - the action offered as legal was not refused (`blocked`) and did not throw,
//   - a game that is still on always has something to do (no deadlock).
// Every violation is written with the seed, draft, variants and the action list that reached it, so `replay()` reproduces it exactly.
// Never part of the build (`*.soak.ts`, `npm run soak`). Like the score search it is sharded, deterministic and resumable by game number.
//
// Env: SOAK_REDRAW=1 (play with variants.forcedRedraw on), SOAK_SECONDS (default 60), SOAK_SHARD, SOAK_SHARDS, SOAK_OUT (dir, default invariants-out), SOAK_SALT (default 1), SOAK_MAX_STEPS (default 2500).
// @ts-ignore node types are not installed in this package; this file only ever runs under node
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newGame } from "./index";
import { reduce } from "./reduce";
import { candidateActions, legalParties } from "./goldenSearch";
import { checkInvariants } from "./invariants";
import { driveStrangers } from "./strangerDriver";
import { partyAction } from "./partyPlay";
import { validatePlan } from "./combatPlan";
import { GS_ESCAPED, GS_PLAYING } from "./state";
import type { GameAction } from "./actions";

declare const process: { env: Record<string, string | undefined> };
const env = (k: string, d: number) => Number(process.env[k] ?? d);

const RULES = [
  { name: "base", variants: {} },
  { name: "kit", variants: { extensionKit: true } },
  { name: "kit+sibyl", variants: { extensionKit: true, sibyl: true } },
] as const;
const COMBAT = [{ name: "classic", variants: {} }, { name: "revised", variants: { combatRevision: true } }] as const;
const PARTIES = RULES.map((r) => legalParties(r.variants));

/** The menu actions of a revised-combat fight: the harness's classic `resolveRound` plans do not apply to it. */
const legalOnly = (cands: GameAction[]) => cands.filter((a) => a.type !== "resolveRound");

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("invariant soak: one shard", () => {
  it("plays games until the deadline and records every violation", () => {
    const shard = env("SOAK_SHARD", 0), shards = env("SOAK_SHARDS", 1), salt = env("SOAK_SALT", 1), maxSteps = env("SOAK_MAX_STEPS", 2500);
    const out = process.env.SOAK_OUT ?? "invariants-out";
    if (!existsSync(out)) mkdirSync(out, { recursive: true });
    const deadline = Date.now() + env("SOAK_SECONDS", 60) * 1000;
    const stats = { games: 0, steps: 0, escaped: 0, dead: 0, hitStepCap: 0, violations: 0, byKind: {} as Record<string, number>, byConfig: {} as Record<string, { games: number; steps: number; violations: number }> };

    for (let g = shard; Date.now() < deadline; g += shards) {
      const r = rng(Math.imul(g + 1, 2654435761) ^ Math.imul(salt, 40503));
      const ri = Math.floor(r() * RULES.length), ci = Math.floor(r() * COMBAT.length);
      const picks = PARTIES[ri]![Math.floor(r() * PARTIES[ri]!.length)]!;
      const seed = 1 + Math.floor(r() * 1_000_000);
      const variants = { ...RULES[ri]!.variants, ...COMBAT[ci]!.variants, ...(process.env.SOAK_REDRAW === "1" ? { forcedRedraw: true } : {}) }; // SOAK_REDRAW=1: play with the Dead End rescue on, as the server can
      const config = `${RULES[ri]!.name}/${COMBAT[ci]!.name}`;
      const cfg = (stats.byConfig[config] ??= { games: 0, steps: 0, violations: 0 });
      let state = newGame(seed, picks, variants as never);
      const actions: GameAction[] = [];
      const violate = (kind: string, detail: string) => {
        stats.violations++; cfg.violations++; stats.byKind[kind] = (stats.byKind[kind] ?? 0) + 1;
        appendFileSync(`${out}/shard-${shard}.jsonl`, JSON.stringify({ game: g, config, seed, picks, variants, kind, detail, actions }) + "\n");
      };
      let step = 0;
      for (; step < maxSteps && state.gs === GS_PLAYING; step++) {
        // Leaving is only offered late, so games get to explore; every other action is chosen uniformly.
        // Revised combat: the strangers' turn is played by the app's own driver (its actions are logged, so replay reproduces them),
        // and the party's deploy / engage / redeploy / scroll / casualty decisions by the standard party play, mixed with the menu actions.
        if (state.fight?.pending?.by === "strangers") {
          let driven: ReturnType<typeof driveStrangers>;
          try { driven = driveStrangers(state); } catch (e) { violate("revised-view-threw", `the strangers' turn: ${String(e)}`); break; }
          for (const a of driven.applied) actions.push(a.action);
          state = driven.state;
          const badDriven = checkInvariants(state);
          if (badDriven.length) { violate("invariant", `${badDriven[0]} (after the strangers' turn)`); break; }
          if (!driven.applied.length) { violate("deadlock", "the strangers' decision is pending and the driver made none"); break; }
          continue;
        }
        let cands = candidateActions(state, step > 600, false);
        if (state.phase === "fight" && state.fight?.rev) {
          let pa: GameAction | null = null;
          try { pa = partyAction(state); } catch (e) { violate("revised-view-threw", `building the party's decision: ${String(e)}`); break; }
          cands = pa ? [pa, pa, pa, ...legalOnly(cands)] : legalOnly(cands);
        } else if (state.phase === "fight" && !state.fight?.casualtyQueue?.length && validatePlan(state, { matches: [] }).ok) {
          // Foes the party cannot engage (a Spectre or Demon, no magic): the empty round is the legal way to go on.
          cands = [{ type: "resolveRound", matches: [] }, ...cands];
        } else if (state.phase === "fight" && !state.fight?.casualtyQueue?.length && !cands.some((a) => a.type === "resolveRound")) {
          // The bots' plan builders do not think of every fighter (a magic-capable ally can face a Demon); try each one alone against each stranger.
          for (let i = 0; i < state.party.length; i++) for (let j = 0; j < state.strangers.length; j++) {
            const matches = [{ front: [i], backers: [], strangers: [j] }];
            if (validatePlan(state, { matches }).ok) cands = [{ type: "resolveRound", matches }, ...cands];
          }
        }
        if (!cands.length) { violate("deadlock", `no action is offered in phase "${state.phase}"`); break; }
        const action = cands[Math.floor(r() * cands.length)]!;
        const before = JSON.stringify(state);
        let res: ReturnType<typeof reduce>;
        try { res = reduce(state, action); } catch (e) { actions.push(action); violate("threw", `${action.type}: ${String(e)}`); break; }
        actions.push(action);
        if (JSON.stringify(state) !== before) { violate("mutated-input", `reduce changed the state it was given (${action.type})`); break; }
        if (res.events.some((e) => e.type === "blocked")) { violate("legal-action-refused", `${action.type} was offered as legal and refused`); break; }
        state = res.state;
        const bad = checkInvariants(state);
        if (bad.length) { violate("invariant", `${bad[0]} (after ${action.type})`); break; }
      }
      stats.games++; stats.steps += step; cfg.games++; cfg.steps += step;
      if (state.gs === GS_ESCAPED) stats.escaped++; else if (state.gs !== GS_PLAYING) stats.dead++; else if (step >= maxSteps) stats.hitStepCap++;
    }
    writeFileSync(`${out}/summary-${shard}.json`, JSON.stringify(stats, null, 1) + "\n");
    expect(stats.games).toBeGreaterThan(0);
  });
});
