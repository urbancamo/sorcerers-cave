import { afterEach, describe, expect, it } from "vitest";
import { reduce } from "@sorcerers-cave/engine";
import { engineStart } from "./levelBench";
import { measureAsync, playAsync } from "./asyncBench";
import { startStub, type Stub } from "./stubEndpoint";

// Stage 6.6 (docs/requirements/combat/2026-10-13-stage-6-external-strategy-plan.md): a fight played through the asynchronous path against
// a local stub endpoint, with the real client, the real ask/apply halves and the real legality layer.

const stubs: Stub[] = [];
const stub = async (...args: Parameters<typeof startStub>) => { const s = await startStub(...args); stubs.push(s); return s; };
afterEach(async () => { await Promise.all(stubs.splice(0).map((s) => s.close())); });

const fight = (seed = 3) => {
  for (let s = seed; s < seed + 400; s++) { const st = engineStart(s, "kit", "ext-easy", [4, 6], 0.5); if (st) return st; }
  throw new Error("no scenario");
};

describe("the stub endpoint", () => {
  it("refuses a request without the secret", async () => {
    const s = await stub();
    const res = await fetch(s.url, { method: "POST", headers: { Authorization: "Bearer wrong" }, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("answers 500 when told to fail every request", async () => {
    const s = await stub({ faults: { error: 1 } });
    const res = await fetch(s.url, { method: "POST", headers: { Authorization: `Bearer ${s.secret}` }, body: JSON.stringify({ version: 1, kind: "casualty", context: {} }) });
    expect(res.status).toBe(500);
  });
});

describe("playAsync", () => {
  it("plays a whole fight through the endpoint with no fallback, and every decision is logged as the external level's", async () => {
    const s = await stub();
    const run = await playAsync(fight(), { url: s.url, secret: s.secret });
    expect(run.end).not.toBe("stuck");
    expect(run.decisions).toBeGreaterThan(0);
    expect(run.fallbacks).toBe(0);
    expect(run.latenciesMs).toHaveLength(run.decisions);
    expect(s.served).toBe(run.decisions);
    expect(run.actions.filter((a) => a.type.startsWith("strangers")).every((a) => (a as { strategyId?: string }).strategyId === "ext-easy")).toBe(true);
  });

  it("is replayable offline: the logged actions alone rebuild the final state (P6)", async () => {
    const s = await stub();
    const start = fight(5);
    const run = await playAsync(start, { url: s.url, secret: s.secret });
    await s.close();                                                        // nothing is asked of any endpoint from here on
    let state = start;
    for (const a of run.actions) state = reduce(state, a).state;
    expect(JSON.stringify(state)).toBe(JSON.stringify(run.state));
  });

  it("falls back to standard on every failing request and still finishes the fight", async () => {
    const s = await stub({ faults: { error: 1 } });
    const run = await playAsync(fight(), { url: s.url, secret: s.secret });
    expect(run.end).not.toBe("stuck");
    expect(run.fallbacks).toBe(run.decisions);
    expect(run.reasons).toEqual({ "endpoint answered 500": run.decisions });
    expect(run.illegal).toBe(0);                                            // a transport failure is not an illegal answer
  });

  it("counts an illegal answer as caught and replaced, not as a transport failure", async () => {
    const s = await stub({ faults: { illegal: 1 } });
    const run = await playAsync(fight(), { url: s.url, secret: s.secret });
    expect(run.end).not.toBe("stuck");
    expect(run.illegal).toBe(run.decisions);
    expect(run.fallbacks).toBe(run.decisions);
  });

  it("cuts off an endpoint that never answers at the deadline", async () => {
    const s = await stub({ faults: { hang: 1 } });
    const run = await playAsync(fight(), { url: s.url, secret: s.secret, deadlineMs: 40 });
    expect(run.end).not.toBe("stuck");
    expect(run.reasons).toEqual({ timeout: run.decisions });
    expect(Math.min(...run.latenciesMs)).toBeGreaterThanOrEqual(35);
  });
});

describe("measureAsync", () => {
  it("reports fallback rate, latency percentiles and the legality result over many fights", async () => {
    const s = await stub({ faults: { error: 0.2, seed: 7 } });
    const report = await measureAsync({ level: "ext-easy", scenarios: 6, deck: "kit", band: [4, 6], endpoint: { url: s.url, secret: s.secret } });
    expect(report.fights).toBe(6);
    expect(report.stuck).toBe(0);
    expect(report.decisions).toBeGreaterThan(6);
    expect(report.fallbackRate).toBeGreaterThan(0);
    expect(report.fallbackRate).toBeLessThan(0.6);
    expect(report.p95Ms).toBeGreaterThanOrEqual(report.p50Ms);
    expect(Object.keys(report.reasons)).toEqual(["endpoint answered 500"]);
  });
});
