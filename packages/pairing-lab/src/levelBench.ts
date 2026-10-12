// Calibration of the stranger difficulty levels (pluggable stranger combat spec, stage 5): play the SAME strength-matched fights
// through the engine's revised round engine with each level on the stranger side, the party always playing `standard`, and compare
// the strangers' result by paired difference. Unlike the lab's simulator, every decision here is the real driver's, so a level that
// misbehaves (a rejected decision, a fallback) shows up in the count, not just in the score.
import { ALL_CREATURES, playRevisedFight, reduce, type GameState } from "@sorcerers-cave/engine";
import { makeState } from "../../engine/src/testkit";
import { balancedScenario } from "./scenario";

export interface LevelRun { r3: number; r2: number; fallbacks: number; decisions: number; end: "won" | "lost" | "standoff" | "stuck" }

const POINTS = ALL_CREATURES.map((c) => c.points);

/** The engine state for a lab scenario, with the strangers on `level`. Fights with the Eye or curses are not built (null). */
export function engineStart(seed: number, deck: "base" | "kit", level: string, band: [number, number], strangerOdds: number): GameState | null {
  const scn = balancedScenario(seed, deck, { deferLoadout: true, strangerOdds, maxStrangers: band[1], attacker: "party" });
  if (scn.eye || scn.curses > 0 || scn.strangers.length < band[0]) return null;
  const start = makeState({
    phase: "encounter", seed: (seed * 7919) >>> 0, level: scn.level,
    strangers: scn.strangers.map((u) => u.cid), treasures: scn.floor ?? [],
    party: scn.party.map((u) => ({ creatureId: u.cid, status: 0 as const, dragonKills: 0, treasure: u.gear.slice() })),
    variants: { combatRevision: true, strangerLevel: level },
  });
  return reduce(start, { type: "attack" }).state;
}

/** One fight to its end, scored from the strangers' side: R3 = value destroyed less value lost, as a fraction of everything in the fight
 *  (0.5 is even); R2 = 1 if the party did not win outright. */
export function playLevel(start: GameState): LevelRun {
  const total = start.party.reduce((a, m) => a + POINTS[m.creatureId]!, 0) + start.strangers.reduce((a, c) => a + POINTS[c]!, 0);
  const played = playRevisedFight(start);
  let svl = 0, pvl = 0;   // value the strangers lost, value the party lost
  for (const e of played.events) {
    if (e.type === "strangerKilled") svl += POINTS[e.creatureId]!;
    else if (e.type === "memberDied") pvl += POINTS[e.creatureId]!;
  }
  const mine = played.actions.filter((a) => a.type.startsWith("strangers"));
  return {
    r3: total ? 0.5 + (0.5 * (pvl - svl)) / total : 0.5, r2: played.end === "won" ? 0 : 1, end: played.end,
    fallbacks: mine.filter((a) => (a as { fallback?: unknown }).fallback).length, decisions: mine.length,
  };
}

export interface LevelRow { level: string; band: [number, number]; n: number; r3: number; r2: number; dR3: number; ci: number; dR2: number; fallbacks: number; decisions: number; stuck: number }

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ci95 = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return 1.96 * Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / (xs.length - 1)) / Math.sqrt(xs.length);
};

export interface CalibrationOptions { levels: readonly string[]; baseline?: string; scenarios: number; deck: "base" | "kit"; bands: [number, number][]; strangerOdds?: number }

/** Every level on identical fights; `dR3` / `dR2` are paired differences from the baseline (default `standard`). */
export function calibrate(o: CalibrationOptions): LevelRow[] {
  const baseline = o.baseline ?? "standard";
  const rows: LevelRow[] = [];
  for (const band of o.bands) {
    const per = new Map<string, LevelRun[]>(o.levels.map((l) => [l, []]));
    for (let seed = 1, done = 0; done < o.scenarios && seed < o.scenarios * 400; seed++) {
      const starts = o.levels.map((l) => engineStart(seed, o.deck, l, band, o.strangerOdds ?? 0.5));
      if (starts.some((s) => s === null)) continue;
      const runs = starts.map((s) => playLevel(s!));
      runs.forEach((r, i) => per.get(o.levels[i]!)!.push(r));
      done++;
    }
    const base = per.get(baseline)!;
    for (const level of o.levels) {
      const runs = per.get(level)!;
      const d3 = runs.map((r, i) => r.r3 - base[i]!.r3), d2 = runs.map((r, i) => r.r2 - base[i]!.r2);
      rows.push({
        level, band, n: runs.length, r3: mean(runs.map((r) => r.r3)), r2: mean(runs.map((r) => r.r2)), dR3: mean(d3), ci: ci95(d3), dR2: mean(d2),
        fallbacks: runs.reduce((a, r) => a + r.fallbacks, 0), decisions: runs.reduce((a, r) => a + r.decisions, 0), stuck: runs.filter((r) => r.end === "stuck").length,
      });
    }
  }
  return rows;
}

export function formatCalibration(rows: LevelRow[]): string {
  const f = (x: number, w = 7): string => x.toFixed(3).padStart(w);
  const head = "BAND   LEVEL      N      R3     dR3   +-95%     R2     dR2  decisions fallbacks stuck";
  return [head, ...rows.map((r) =>
    `${`${r.band[0]}-${r.band[1]}`.padEnd(6)} ${r.level.padEnd(9)} ${String(r.n).padStart(4)} ${f(r.r3)} ${f(r.dR3)} ${f(r.ci)} ${f(r.r2)} ${f(r.dR2)} ${String(r.decisions).padStart(10)} ${String(r.fallbacks).padStart(9)} ${String(r.stuck).padStart(5)}`)].join("\n");
}
