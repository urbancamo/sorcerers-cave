import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CR3, TR3 } from "./mnemonics";
import { simulateRun, toJson, parseRun, replayRun, type Run } from "./runlog";
import { formatListing, formatMatchListing } from "./listing";
import { simulate } from "./sim";
import { fromPlain } from "./runlog";
import { randomScenario } from "./scenario";
import { DEFAULT_RULES } from "./rules";

const opts = { id: "t1", deck: "base" as const, generator: "balanced" as const, seed: 100, count: 40, partyStyle: "GRD" as const, strangerStyle: "GRD" as const };
const PRINTED = "2026-10-07 09:00:00";
const unitCode = (u: { cid: number; gear: number[]; potion: boolean; fsBonus: number; dragonKills: number }) =>
  [CR3[u.cid], ...u.gear.map((g) => TR3[g])].join("+") + (u.potion ? "!" : "") + (u.fsBonus ? "^" : "") + (u.dragonKills ? `*${u.dragonKills}` : "");
const rowsOf = (listing: string) => listing.split("\n").filter((l) => /^ *\d+ (BAS|KIT) /.test(l));

describe("mnemonics", () => {
  it("are identical to the game log's creature and treasure codes (one source of truth)", () => {
    const src = readFileSync(fileURLToPath(new URL("../../../apps/web/src/game/gameLog.ts", import.meta.url)), "utf8");
    const table = (name: string): Record<number, string> => {
      const m = new RegExp(`const ${name}: Record<number, string> = \\{([^}]*)\\}`).exec(src);
      expect(m, name).not.toBeNull();
      return Object.fromEntries([...m![1]!.matchAll(/(\d+): "([A-Z]{3})"/g)].map((x) => [Number(x[1]), x[2]!]));
    };
    expect(CR3).toEqual({ ...table("CR3_BASE"), ...table("CR3_KIT") });
    expect(TR3).toEqual({ ...table("TR3_BASE"), ...table("TR3_KIT") });
  });
});

describe("simulateRun", () => {
  it("records every scenario with its inputs and its outcome, deterministically", () => {
    const a = simulateRun(opts), b = simulateRun(opts);
    expect(a).toEqual(b);
    expect(a.scenarios.length).toBe(40);
    for (const r of a.scenarios) {
      expect(r.scenario.party.length).toBeGreaterThan(0);
      expect(["strangersWin", "partyWin", "retreat", "cap"]).toContain(r.outcome.end);
    }
  });
  it("uses the random generator when asked", () => {
    const r = simulateRun({ ...opts, generator: "random", count: 5 });
    expect(r.scenarios.length).toBe(5);
    expect(r.scenarios[0]!.scenario.party.length).toBe(randomScenario(r.scenarios[0]!.seed, "base").party.length);
  });
});

describe("the JSON replay file", () => {
  it("round-trips and replays exactly", () => {
    const run = simulateRun(opts);
    const back = parseRun(toJson(run));
    expect(back).toEqual(run);
    expect(replayRun(back)).toEqual({ ok: true, mismatches: [] });
  });
  it("carries a version and the run settings, and every scenario in full", () => {
    const j = JSON.parse(toJson(simulateRun({ ...opts, count: 3 })));
    expect(j.version).toBe(1);
    expect(j.kind).toBe("pairing-sim-run");
    expect(j.run).toMatchObject({ id: "t1", deck: "base", baseSeed: 100, count: 3, partyStyle: "GRD", strangerStyle: "GRD" });
    expect(j.run.rules).toEqual(DEFAULT_RULES);
    expect(j.scenarios[0].scenario).toHaveProperty("party");
    expect(j.scenarios[0].scenario).toHaveProperty("strangers");
    expect(j.scenarios[0].outcome).toHaveProperty("r3");
  });
  it("replay notices a tampered result", () => {
    const run = simulateRun(opts);
    const bad: Run = JSON.parse(toJson(run));
    bad.scenarios[7]!.outcome.rounds += 1;
    const r = replayRun(bad);
    expect(r.ok).toBe(false);
    expect(r.mismatches).toEqual([bad.scenarios[7]!.id]);
  });
});

describe("formatListing: one scenario per line, fixed width, mnemonics", () => {
  const run = simulateRun(opts);
  const listing = formatListing(run, { printed: PRINTED });
  const rows = rowsOf(listing);

  it("has exactly one row per scenario, all the same width", () => {
    expect(rows.length).toBe(40);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
  });
  it("has a banner, a header naming every column, a key and a summary", () => {
    for (const w of ["P A I R I N G", `RUN t1`, "PRINTED " + PRINTED, "SCN#", "DCK", "END", "RDS", "PVL", "SVL", "PARTY", "STRANGERS", "KEY", "SUMMARY"]) expect(listing).toContain(w);
  });
  it("is deterministic", () => {
    expect(formatListing(simulateRun(opts), { printed: PRINTED })).toBe(listing);
  });
  it("shows each side's creatures and artefacts as 3-letter codes", () => {
    const r0 = run.scenarios[0]!;
    const party = r0.scenario.party.map(unitCode).join(" ");
    expect(rows[0]).toContain(party);
  });
  it("never truncates: a party of 40 appears in full, and every row stays the same width", () => {
    const big = simulateRun({ ...opts, deck: "kit", generator: "random", count: 6 });
    big.scenarios[2]!.scenario = randomScenario(5, "kit", { strangers: 4, party: 40 });
    const out = formatListing(big, { printed: PRINTED });
    const rs = rowsOf(out);
    expect(new Set(rs.map((r) => r.length)).size).toBe(1);
    const sc = big.scenarios[2]!.scenario;
    const full = sc.party.map(unitCode).join(" ");
    expect(rs[2]).toContain(full);
  });
  it("the summary counts add up to the number of scenarios", () => {
    const line = listing.split("\n").find((l) => l.startsWith("SUMMARY"))!;
    const n = (k: string) => Number(new RegExp(`${k}=(\\d+)`).exec(line)![1]);
    expect(n("SWN") + n("PWN") + n("RET") + n("CAP")).toBe(40);
    expect(n("N")).toBe(40);
  });
  it("a golden listing for a small run, so any change to the format or the rules shows up in review", () => {
    expect(formatListing(simulateRun({ ...opts, id: "golden", count: 12, seed: 7 }), { printed: PRINTED })).toMatchSnapshot();
  });
});

describe("formatMatchListing: one match per line", () => {
  const run = simulateRun({ ...opts, count: 6 });
  const out = formatMatchListing(run, { printed: PRINTED });
  const rows = out.split("\n").filter((l) => /^ *\d+ +\d+ +\d+ /.test(l));

  it("has one row for every match fought in the run, all the same width", () => {
    let expected = 0;
    for (const r of run.scenarios) simulate(fromPlain(r.scenario), run.run.rules, run.run.partyStyle, run.run.strangerStyle, r.seed, { trace: (e) => { if (e.type === "match") expected++; } });
    expect(rows.length).toBe(expected);
    expect(expected).toBeGreaterThan(6);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
  });
  it("shows the strengths, bonuses, dice, result and the creatures of both sides", () => {
    for (const w of ["SCN#", "RD", "MN", "PST", "SST", "PB", "SB", "PD", "SD", "RES", "PARTY", "STRANGERS", "KEY", "PRINTED " + PRINTED]) expect(out).toContain(w);
    const first: string[] = [];
    const r0 = run.scenarios[0]!;
    simulate(fromPlain(r0.scenario), run.run.rules, run.run.partyStyle, run.run.strangerStyle, r0.seed, { trace: (e) => { if (e.type === "match") first.push(e.party.join("+") + (e.partyBack.length ? "~" + e.partyBack.join("+") : "")); } });
    expect(rows[0]).toContain(first[0]!);
  });
  it("can be limited to the first few scenarios", () => {
    const some = formatMatchListing(run, { printed: PRINTED, scenarios: 2 });
    const ids = new Set(some.split("\n").filter((l) => /^ *\d+ +\d+ +\d+ /.test(l)).map((l) => l.trim().split(/ +/)[0]));
    expect([...ids]).toEqual(["1", "2"]);
  });
});
