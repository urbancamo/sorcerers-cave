// Stage 6.6 measurement: play revised fights with the strangers on an EXTERNAL level, through the same ask / apply halves the Convex
// mutation uses (driveStrangers -> markAwaiting -> the real endpoint client -> applyStrangerDecision), against any endpoint, normally
// the lab's stub. Reports the numbers the stage's exit criterion asks for: fallback rate, latency, legality, and whether any fight stuck.
import {
  applyStrangerDecision, awaitingRequest, driveStrangers, getStrategy, markAwaiting, partyAction, pendingContext, reduce,
  type GameAction, type GameState,
} from "@sorcerers-cave/engine";
import { askEndpoint, type Endpoint } from "../../../apps/web/convex/endpointClient";
import { engineStart } from "./levelBench";

export interface AsyncRun {
  end: "won" | "lost" | "standoff" | "stuck";
  state: GameState;
  actions: GameAction[];                        // every action applied, in order: enough to replay the fight offline
  decisions: number;                            // asked of the endpoint
  fallbacks: number;                            // replaced by `standard`, for any reason
  illegal: number;                              // of those, answers that arrived but broke the rules (the legality layer caught them)
  reasons: Record<string, number>;
  latenciesMs: number[];                        // one per decision, request to settled
}

/** One fight, to its end. `deadlineMs` overrides the level's own, to let a lab cut a hanging endpoint off sooner. */
export async function playAsync(start: GameState, endpoint: Endpoint & { deadlineMs?: number }, maxSteps = 5000): Promise<AsyncRun> {
  const run: AsyncRun = { end: "stuck", state: start, actions: [], decisions: 0, fallbacks: 0, illegal: 0, reasons: {}, latenciesMs: [] };
  let state = start;
  for (let i = 0; i < maxSteps; i++) {
    const driven = driveStrangers(state);
    for (const a of driven.applied) run.actions.push(a.action);
    state = driven.state;
    if (driven.awaiting) {
      const strategy = getStrategy(state.variants?.strangerLevel ?? "standard");
      const asked = pendingContext(state)!, began = performance.now();
      state = markAwaiting(state, `lab:${run.decisions}`, Date.now());
      const deadlineMs = endpoint.deadlineMs ?? awaitingRequest(state)!.deadlineMs;
      const answer = await askEndpoint(
        { requestId: `lab:${run.decisions}`, kind: asked.kind, context: asked.context, strategyId: strategy.id, strategyVersion: strategy.version, deadlineMs },
        endpoint,
      );
      const meta = { strategyId: strategy.id, strategyVersion: strategy.version };
      const applied = "raw" in answer ? applyStrangerDecision(state, answer.raw, meta) : applyStrangerDecision(state, undefined, meta, answer.failure);
      run.latenciesMs.push(performance.now() - began);
      run.decisions++;
      const fallback = (applied.applied.action as { fallback?: { reason: string } }).fallback;
      if (fallback) {
        run.fallbacks++;
        if ("raw" in answer) run.illegal++;
        run.reasons[fallback.reason] = (run.reasons[fallback.reason] ?? 0) + 1;
      }
      run.actions.push(applied.applied.action);
      state = applied.state;
      continue;
    }
    run.state = state;
    if (!state.fight) { run.end = state.phase === "gameOver" ? "lost" : "won"; return run; }
    if (state.fight.rev?.standoff) { run.end = "standoff"; return run; }
    const action = partyAction(state);
    if (!action) return run;
    const r = reduce(state, action);
    if (r.events.length === 1 && (r.events[0]!.type === "blocked" || r.events[0]!.type === "planRejected")) throw new Error(`the engine refused the party's ${action.type}`);
    run.actions.push(action);
    state = r.state;
  }
  run.state = state;
  return run;
}

export interface AsyncReport {
  level: string; band: [number, number]; fights: number; stuck: number;
  decisions: number; fallbacks: number; illegal: number; fallbackRate: number;
  reasons: Record<string, number>; p50Ms: number; p95Ms: number;
}

const percentile = (sorted: number[], p: number): number => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]! : 0);

/** `scenarios` fights on `level` against one endpoint, summed. */
export async function measureAsync(o: { level: string; scenarios: number; deck: "base" | "kit"; band: [number, number]; strangerOdds?: number; endpoint: Endpoint & { deadlineMs?: number } }): Promise<AsyncReport> {
  const report: AsyncReport = { level: o.level, band: o.band, fights: 0, stuck: 0, decisions: 0, fallbacks: 0, illegal: 0, fallbackRate: 0, reasons: {}, p50Ms: 0, p95Ms: 0 };
  const latencies: number[] = [];
  for (let seed = 1; report.fights < o.scenarios && seed < o.scenarios * 400; seed++) {
    const start = engineStart(seed, o.deck, o.level, o.band, o.strangerOdds ?? 0.5);
    if (!start) continue;
    const run = await playAsync(start, o.endpoint);
    report.fights++;
    if (run.end === "stuck") report.stuck++;
    report.decisions += run.decisions; report.fallbacks += run.fallbacks; report.illegal += run.illegal;
    for (const [k, n] of Object.entries(run.reasons)) report.reasons[k] = (report.reasons[k] ?? 0) + n;
    latencies.push(...run.latenciesMs);
  }
  latencies.sort((a, b) => a - b);
  report.fallbackRate = report.decisions ? report.fallbacks / report.decisions : 0;
  report.p50Ms = percentile(latencies, 50); report.p95Ms = percentile(latencies, 95);
  return report;
}

export function formatAsync(r: AsyncReport): string {
  const reasons = Object.entries(r.reasons).map(([k, n]) => `${k} x${n}`).join(", ") || "none";
  return [
    `level ${r.level}, ${r.band[0]}-${r.band[1]} strangers: ${r.fights} fights, ${r.decisions} decisions asked of the endpoint`,
    `  fallback rate ${(r.fallbackRate * 100).toFixed(1)}% (${r.fallbacks}/${r.decisions}); reasons: ${reasons}`,
    `  legality: ${r.illegal} illegal answers caught and replaced by standard`,
    `  latency p50 ${r.p50Ms.toFixed(1)} ms, p95 ${r.p95Ms.toFixed(1)} ms`,
    `  stuck fights: ${r.stuck}`,
  ].join("\n");
}
