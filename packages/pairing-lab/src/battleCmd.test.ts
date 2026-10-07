import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBattleRef, writeBattleHtml } from "./battleCmd";
import { simulateRun, toJson } from "./runlog";

describe("parseBattleRef", () => {
  it("reads 'file.json#3555'", () => {
    expect(parseBattleRef("runs/a.json#3555")).toEqual({ path: "runs/a.json", scenario: 3555 });
  });
  it("reads a run name on its own, with the scenario given separately", () => {
    expect(parseBattleRef("kit-run", "42")).toEqual({ path: "runs/kit-run.json", scenario: 42 });
  });
  it("accepts a run name with the scenario after a hash", () => {
    expect(parseBattleRef("kit-run#7")).toEqual({ path: "runs/kit-run.json", scenario: 7 });
  });
  it("the separate scenario wins over one in the reference only when the reference has none", () => {
    expect(parseBattleRef("a.json#5", "9")).toEqual({ path: "a.json", scenario: 5 });
  });
  it("refuses a reference with no scenario number, or a bad one", () => {
    expect(() => parseBattleRef("runs/a.json")).toThrow(/scenario/);
    expect(() => parseBattleRef("runs/a.json#abc")).toThrow(/scenario/);
    expect(() => parseBattleRef("runs/a.json#0")).toThrow(/scenario/);
  });
});

describe("writeBattleHtml", () => {
  const dir = mkdtempSync(join(tmpdir(), "battle-"));
  const run = simulateRun({ id: "cmdrun", deck: "base", generator: "balanced", seed: 50, count: 10, partyStyle: "GRD", strangerStyle: "GRD" });
  const file = join(dir, "cmdrun.json");
  writeFileSync(file, toJson(run));

  it("reads the run, finds the scenario and writes a standalone page", () => {
    const out = writeBattleHtml({ ref: `${file}#4`, out: dir, art: false });
    expect(out.path).toBe(join(dir, "cmdrun-4.html"));
    expect(existsSync(out.path)).toBe(true);
    const html = readFileSync(out.path, "utf8");
    expect(html).toContain("<title>Scenario 4 - battle replay</title>");
    expect(out.bytes).toBe(statSync(out.path).size);
    expect(out.scenario).toBe(4);
    expect(out.cardsWithArt).toBe(0);
  });
  it("writes to an explicit .html path", () => {
    const target = join(dir, "mine.html");
    expect(writeBattleHtml({ ref: `${file}#2`, out: target, art: false }).path).toBe(target);
    expect(existsSync(target)).toBe(true);
  });
  it("embeds card art when it has any", () => {
    const out = writeBattleHtml({ ref: `${file}#3`, out: join(dir, "art.html"), art: true, loadArt: () => ({ creature: { 5: "data:image/jpeg;base64,AAAA" }, treasure: {} }) });
    expect(readFileSync(out.path, "utf8")).toContain("data:image/jpeg;base64,AAAA");
    expect(out.cardsWithArt).toBe(1);
  });
  it("asks for exactly the cards the battle needs", () => {
    let asked: { creature: number[]; treasure: number[] } | null = null;
    writeBattleHtml({ ref: `${file}#3`, out: join(dir, "ask.html"), art: true, loadArt: (n) => { asked = n; return { creature: {}, treasure: {} }; } });
    const sc = run.scenarios.find((r) => r.id === 3)!.scenario;
    const cids = new Set([...sc.party, ...sc.strangers].map((u) => u.cid));
    expect(new Set(asked!.creature)).toEqual(cids);
  });
  it("explains a missing run or scenario", () => {
    expect(() => writeBattleHtml({ ref: `${join(dir, "nope.json")}#1`, out: dir, art: false })).toThrow(/nope\.json/);
    expect(() => writeBattleHtml({ ref: `${file}#999`, out: dir, art: false })).toThrow(/scenario 999/);
  });
});
