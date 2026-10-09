import { describe, it, expect } from "vitest";
import { simulateRun, toJson, parseRun, type Run } from "./runlog";
import { buildBattle } from "./battle";
import { POINTS } from "./rules";

const run = simulateRun({ id: "bt", deck: "kit", generator: "balanced", seed: 500, count: 30, partyStyle: "GRD", strangerStyle: "GRD" });

describe("buildBattle", () => {
  it("reconstructs a stored scenario, round by round, and agrees with the recorded outcome", () => {
    for (const rec of run.scenarios) {
      const b = buildBattle(run, rec.id);
      expect(b.meta.scenarioId).toBe(rec.id);
      expect(b.meta.end).toBe(rec.outcome.end);
      expect(b.rounds.length).toBe(rec.outcome.rounds);
      expect(b.party.length).toBe(rec.scenario.party.length);
      expect(b.strangers.length).toBe(rec.scenario.strangers.length);
      const last = b.rounds[b.rounds.length - 1]!;
      expect(last.partyAlive.length).toBe(rec.outcome.partyAlive);
      expect(last.strangersAlive.length).toBe(rec.outcome.strangersAlive);
    }
  });
  it("the casualties add up to the recorded value lost, and nobody fights after falling", () => {
    for (const rec of run.scenarios) {
      const b = buildBattle(run, rec.id);
      let pv = 0, sv = 0;
      const fallen = new Set<string>();
      for (const r of b.rounds) {
        for (const m of r.matches) {
          for (const i of m.partyIdx) expect(fallen.has("P" + i)).toBe(false);
          for (const i of m.strangersIdx) expect(fallen.has("S" + i)).toBe(false);
          for (const f of m.fallen) {
            const key = (f.side === "party" ? "P" : "S") + f.idx;
            expect(fallen.has(key)).toBe(false);
            fallen.add(key);
            const cid = (f.side === "party" ? b.party : b.strangers)[f.idx]!.cid;
            if (f.side === "party") pv += POINTS[cid]!; else sv += POINTS[cid]!;
          }
        }
      }
      expect(pv).toBe(rec.outcome.partyValueLost);
      expect(sv).toBe(rec.outcome.strangerValueLost);
    }
  });
  it("each round's alive lists are what is left after that round's casualties", () => {
    const rec = run.scenarios.find((r) => r.outcome.rounds >= 2)!;
    const b = buildBattle(run, rec.id);
    let party = new Set(b.party.map((u) => u.idx)), strangers = new Set(b.strangers.map((u) => u.idx));
    for (const r of b.rounds) {
      for (const m of r.matches) for (const f of m.fallen) (f.side === "party" ? party : strangers).delete(f.idx);
      expect([...party].sort((a, b) => a - b)).toEqual([...r.partyAlive].sort((a, b) => a - b));
      expect([...strangers].sort((a, b) => a - b)).toEqual([...r.strangersAlive].sort((a, b) => a - b));
    }
  });
  it("describes each creature: name, code, strengths, artefacts", () => {
    const b = buildBattle(run, 1);
    for (const u of [...b.party, ...b.strangers]) {
      expect(u.name.length).toBeGreaterThan(0);
      expect(u.code).toMatch(/^[A-Z]{3}$/);
      expect(u.total).toBe(u.fs + u.mp);
      for (const g of u.gear) { expect(g.name.length).toBeGreaterThan(0); expect(g.code).toMatch(/^[A-Z]{3}$/); }
    }
  });
  it("records who attacked each round (the roles alternate, the strangers first by default)", () => {
    const rec = run.scenarios.find((r) => r.outcome.rounds >= 3)!;
    const b = buildBattle(run, rec.id);
    expect(b.rounds.map((r) => r.attacker)).toEqual(b.rounds.map((_, i) => (i % 2 === 0 ? "strangers" : "party")));
  });
  it("copes with a JSON round trip", () => {
    const b1 = buildBattle(run, 7), b2 = buildBattle(parseRun(toJson(run)), 7);
    expect(b2).toEqual(b1);
  });
  it("refuses an unknown scenario and a tampered recording", () => {
    expect(() => buildBattle(run, 9999)).toThrow(/scenario 9999/);
    const bad: Run = JSON.parse(toJson(run));
    bad.scenarios[2]!.outcome.rounds += 1;
    expect(() => buildBattle(bad, bad.scenarios[2]!.id)).toThrow(/does not reproduce/);
  });
});
