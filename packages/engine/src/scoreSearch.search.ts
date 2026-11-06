// The overnight search for the HIGHEST SCORE of any game that ends with the party back on the surface — no other requirement
// (the Sorcerer need not die, the Sibyl need not join, the Extension Kit need not be on). Run it with
// `scripts/overnight-search.sh`; it is never part of the build. The goal-driven search it grew from is `goldenSearch.search.ts`.
//
// It is a random search over everything the result depends on. Work item `i` derives, from `i` alone and a fixed salt:
//   - which rules are on (base game, kit, kit + Sibyl), a legal draft for them, and a seed;
//   - the heuristic's weights, how long the party keeps collecting before it is pulled home, and the beam's width and length.
// So the whole run is deterministic, any item can be replayed from its number, and a shard that is stopped and restarted resumes
// where it left off. Each shard handles the items i ≡ shard (mod shards) until the wall-clock deadline.
//
// Env: SEARCH_SHARD, SEARCH_SHARDS, SEARCH_OUT (dir), SEARCH_HOURS (default 7), SEARCH_SALT (default 1);
//      SEARCH_MERGE=<dir> instead merges the shard files into src/fixtures/best-score-search.json.
// @ts-ignore node types are not installed in this package; this file only ever runs under node
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newGame, replay } from "./index";
import { beamSearch, legalParties, power, type Weights } from "./goldenSearch";
import { scoreBreakdown } from "./score";
import { GS_ESCAPED } from "./state";
import type { GameAction } from "./actions";

declare const process: { env: Record<string, string | undefined> };
const env = (k: string, d: number) => Number(process.env[k] ?? d);

type Variants = { extensionKit?: boolean; sibyl?: boolean } | undefined;
const RULES: { name: string; variants: Variants; weight: number }[] = [
  { name: "base", variants: undefined, weight: 1 },
  { name: "kit", variants: { extensionKit: true }, weight: 2 },
  { name: "kit+sibyl", variants: { extensionKit: true, sibyl: true }, weight: 4 },
];
// Each rule set's legal drafts, strongest start first: the stronger drafts are the ones that get through the cave, so they are
// drawn more often (but not always — a weak draft that recruits well can score more).
const PARTIES = RULES.map((r) =>
  legalParties(r.variants)
    .map((p) => ({ p, pw: power(newGame(1, p, r.variants)) }))
    .sort((a, b) => b.pw - a.pw || a.p.join().localeCompare(b.p.join()))
    .map((x) => x.p),
);

const SALT = env("SEARCH_SALT", 1);
const OUT = process.env.SEARCH_OUT ?? "search-out-score";
const FIXTURE = "src/fixtures/best-score-search.json";
const TOP_FIXTURE = "src/fixtures/top-score-games.json";
const TOP_N = 25;
const TABLES = "../../docs/testing/search-scenario-tables.md";
const PREFIX = ["B", "K", "S"];

/** A small deterministic generator (mulberry32) seeded from the item number. */
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

interface Item {
  rules: number; // index into RULES
  picks: number[];
  seed: number;
  killFirst: boolean; // true: the beam only lets the party leave once the Sorcerer is dead (the route that has scored best); false: it roams, then heads home
  weights: Weights;
  exitAfter: number;
  width: number;
  steps: number;
}

/** Everything about work item `i`, derived from `i` alone. */
export function itemFor(i: number): Item {
  const r = rng(Math.imul(i + 1, 2654435761) ^ Math.imul(SALT, 40503));
  const uniform = (lo: number, hi: number) => lo + (hi - lo) * r();
  const logUniform = (lo: number, hi: number) => Math.exp(uniform(Math.log(lo), Math.log(hi)));
  const choice = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  let pick = r() * RULES.reduce((n, x) => n + x.weight, 0);
  let rules = 0;
  while (pick >= RULES[rules]!.weight) pick -= RULES[rules++]!.weight;
  const parties = PARTIES[rules]!;
  // 80%: one of the strongest third of the drafts; 20%: any.
  const picks = r() < 0.8 ? parties[Math.floor(r() * Math.ceil(parties.length / 3))]! : parties[Math.floor(r() * parties.length)]!;
  const killFirst = r() < 0.85;
  // A kill-first game needs the Sorcerer to turn up in the pack, early enough to reach but late enough to arrive strong.
  let seed = 1 + Math.floor(r() * 1_000_000);
  if (killFirst && r() < 0.8) {
    for (let t = 0; t < 200; t++) {
      const idx = newGame(seed, picks, RULES[rules]!.variants).smallPack.indexOf(111);
      if (idx >= 15 && idx <= 70) break;
      seed = 1 + Math.floor(r() * 1_000_000);
    }
  }
  const exitAfter = killFirst ? choice([0, 0, 0, 100, 200]) : choice([150, 250, 350, 500]);
  return {
    rules,
    picks,
    seed,
    killFirst,
    weights: {
      power: round(uniform(1.5, 4)),
      areas: round(uniform(0.1, 0.6)),
      deck: round(uniform(3, 10)),
      sibyl: choice([0, 40, 300]),
      killBonus: choice([100, 300, 1000, 3000]),
      home: round(logUniform(0.5, 2)),
    },
    exitAfter,
    width: choice([8, 8, 16]),
    steps: exitAfter + choice([600, 800]),
  };
}
const round = (x: number) => Math.round(x * 100) / 100;

interface Facts { slain: boolean; sibyl: boolean; alive: number; total: number }

interface Row {
  i: number;
  item: Item;
  score: number; // best escaped score this search found; -1 when no branch escaped
  escapes: number;
  expanded: number;
  crashes: number;
  ms: number;
  actions?: GameAction[];
}

describe.skipIf(!!process.env.SEARCH_MERGE)("score search: one shard, until the deadline", () => {
  it("searches its work items", () => {
    const shard = env("SEARCH_SHARD", 0);
    const shards = env("SEARCH_SHARDS", 1);
    const deadline = Date.now() + env("SEARCH_HOURS", 7) * 3_600_000;
    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    const file = `${OUT}/shard-${shard}.jsonl`;
    // Resume: the next item is the first of this shard's after the last one already recorded.
    let best = -1;
    let next = shard;
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
        const row = JSON.parse(line) as Row;
        next = Math.max(next, row.i + shards);
        best = Math.max(best, row.score);
      }
    }
    let done = 0;
    for (let i = next; Date.now() < deadline; i += shards) {
      const item = itemFor(i);
      const t0 = Date.now();
      const r = beamSearch(newGame(item.seed, item.picks, RULES[item.rules]!.variants), {
        width: item.width,
        maxSteps: item.steps,
        weights: item.weights,
        exitAfter: item.exitAfter,
        requireSorcerer: item.killFirst,
      });
      const top = r.finished.reduce<(typeof r.finished)[number] | null>((m, f) => (!m || f.score > m.score ? f : m), null);
      const score = top?.score ?? -1;
      // Keep the moves only of searches that came close to this shard's best, so the files stay small.
      const keep = !!top && score >= Math.max(100, 0.9 * best);
      best = Math.max(best, score);
      const row: Row = { i, item, score, escapes: r.finished.length, expanded: r.expanded, crashes: r.crashes.length, ms: Date.now() - t0, actions: keep ? top!.actions : undefined };
      appendFileSync(file, JSON.stringify(row) + "\n");
      done++;
    }
    expect(done).toBeGreaterThanOrEqual(0);
  });
});

describe.skipIf(!process.env.SEARCH_MERGE)("score search: merge the shards into the fixture", () => {
  it("keeps the best game, checked on the real engine, with the budget that found it", () => {
    const dir = process.env.SEARCH_MERGE!;
    const rows: Row[] = readdirSync(dir)
      .filter((f: string) => f.endsWith(".jsonl"))
      .flatMap((f: string) => readFileSync(`${dir}/${f}`, "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l) as Row));
    expect(rows.length).toBeGreaterThan(0);
    // The search's own bookkeeping is not the authority: replay each candidate on the engine, best first, and keep only games that
    // really end on the surface with the score recorded. The first per rule set is pinned as that set's best; the first TOP_N distinct
    // ones (a different draft or seed, so the list is not one game found many times) are saved as scenarios. A row keeps its moves
    // only when it was near its shard's best at the time, so the moves of the others are re-derived by running the item again
    // (every item is a pure function of its number).
    const movesOf = (row: Row): GameAction[] | undefined => {
      if (row.actions) return row.actions;
      const v = RULES[row.item.rules]!.variants;
      const r = beamSearch(newGame(row.item.seed, row.item.picks, v), { width: row.item.width, maxSteps: row.item.steps, weights: row.item.weights, exitAfter: row.item.exitAfter, requireSorcerer: row.item.killFirst });
      return r.finished.find((f) => f.score === row.score)?.actions;
    };
    const verifiedFor = (k: number) => {
      const out: { row: Row; variants: Variants; actions: GameAction[]; facts: Facts }[] = [];
      const seen = new Set<string>();
      for (const row of rows.filter((r) => r.item.rules === k && r.score >= 0).sort((x, y) => y.score - x.score || x.i - y.i)) {
        const key = `${row.item.picks.join()}|${row.item.seed}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const actions = movesOf(row);
        if (!actions) continue;
        const variants = RULES[k]!.variants;
        const frames = replay(row.item.seed, row.item.picks, actions, variants);
        const end = frames[frames.length - 1]!.state;
        if (end.gs !== GS_ESCAPED || scoreBreakdown(end).total !== row.score) continue;
        const ev = frames.flatMap((f) => f.events);
        out.push({ row, variants, actions, facts: { slain: ev.some((e) => e.type === "sorcererSlain"), sibyl: ev.some((e) => e.type === "sibylJoins"), alive: end.party.filter((m) => m.status === 0 || m.status === 1).length, total: end.party.length } });
        if (out.length === TOP_N) break;
      }
      return out;
    };
    const sets = RULES.map((_, k) => verifiedFor(k));
    expect(sets.every((v) => v.length > 0), "every rule set needs at least one escaped game").toBe(true);
    const verified = sets.flat().sort((x, y) => y.row.score - x.row.score);
    // What is needed to reproduce the run: run.json (written by the launcher), and which items each shard got through.
    const run = existsSync(`${dir}/run.json`) ? JSON.parse(readFileSync(`${dir}/run.json`, "utf8")) : null;
    const shards = Number(run?.shards ?? 0) || 1;
    const perShard = Array.from({ length: shards }, (_, k) => {
      const mine = rows.filter((r) => r.i % shards === k);
      return { shard: k, items: mine.length, firstItem: mine.length ? Math.min(...mine.map((r) => r.i)) : null, lastItem: mine.length ? Math.max(...mine.map((r) => r.i)) : null };
    });
    const budget = {
      run,
      perShard,
      salt: SALT,
      searches: rows.length,
      searchesThatEscaped: rows.filter((r) => r.score >= 0).length,
      statesExpanded: rows.reduce((n, r) => n + r.expanded, 0),
      cpuHours: Math.round(rows.reduce((n, r) => n + r.ms, 0) / 36000) / 100,
      byRules: RULES.map((x, k) => ({ rules: x.name, searches: rows.filter((r) => r.item.rules === k).length, best: Math.max(-1, ...rows.filter((r) => r.item.rules === k).map((r) => r.score)) })),
    };
    const game = ({ row, variants, actions }: { row: Row; variants: Variants; actions: GameAction[] }, rank: number) => ({
      rank,
      rules: RULES[row.item.rules]!.name,
      variants: variants ?? {},
      seed: row.item.seed,
      picks: row.item.picks,
      score: row.score,
      item: row.i,
      search: { weights: row.item.weights, exitAfter: row.item.exitAfter, beamWidth: row.item.width, maxSteps: row.item.steps, killFirst: row.item.killFirst },
      actions,
    });
    const NOTE = "Found by src/scoreSearch.search.ts: the highest score of any escaped game in a random search, no other requirement. (The search itself may choose to make the Sorcerer die first: that is a search tactic, not a requirement.) 'Best' means best found within the budget below, not a proven maximum.";
    mkdirSync("src/fixtures", { recursive: true });
    writeFileSync(FIXTURE, JSON.stringify({ note: NOTE, ...game(verified[0]!, 1), budget }, null, 1) + "\n");
    writeFileSync(TOP_FIXTURE, JSON.stringify({ note: NOTE, budget, perRules: TOP_N, games: sets.flatMap((v) => v.map((g, k) => game(g, k + 1))) }, null, 1) + "\n");
    writeFileSync(TABLES, tablesDoc(sets, budget));
    return;
  });
});

/** The generated reference tables (docs/testing/search-scenario-tables.md): the run's provenance and budget, then every pinned game. */
function tablesDoc(
  sets: { row: Row; actions: GameAction[]; facts: Facts }[][],
  budget: { run: Record<string, unknown> | null; perShard: { shard: number; items: number; firstItem: number | null; lastItem: number | null }[]; searches: number; searchesThatEscaped: number; statesExpanded: number; cpuHours: number; salt: number; byRules: { rules: string; searches: number; best: number }[] },
): string {
  const out: string[] = [
    "# Search scenarios — generated tables",
    "",
    "Generated by `scripts/pin-results.sh` (the merge in `packages/engine/src/scoreSearch.search.ts`). Do not edit by hand; see `search-scenarios.md` for what this is and how to re-run it.",
    "",
    "## The run",
    "",
    "| | |",
    "|---|---|",
    ...Object.entries(budget.run ?? {}).map(([k, v]) => `| ${k} | ${String(v)} |`),
    `| salt used by the merge | ${budget.salt} |`,
    `| searches | ${budget.searches.toLocaleString("en-GB")} |`,
    `| searches that escaped | ${budget.searchesThatEscaped.toLocaleString("en-GB")} |`,
    `| states expanded | ${budget.statesExpanded.toLocaleString("en-GB")} |`,
    `| CPU time | ${budget.cpuHours} h |`,
    "",
    "| Rules | Searches | Best score |",
    "|---|---|---|",
    ...budget.byRules.map((x) => `| ${x.rules} | ${x.searches.toLocaleString("en-GB")} | ${x.best} |`),
    "",
    "Items searched per shard (shard k works items k, k+shards, k+2·shards, …):",
    "",
    "| Shard | Items | First | Last |",
    "|---|---|---|---|",
    ...budget.perShard.map((x) => `| ${x.shard} | ${x.items.toLocaleString("en-GB")} | ${x.firstItem} | ${x.lastItem} |`),
  ];
  sets.forEach((games, k) => {
    out.push("", `## ${RULES[k]!.name} (codes ${PREFIX[k]}001–${PREFIX[k]}${String(games.length).padStart(3, "0")})`, "");
    out.push("| Code | Score | Draft | Seed | Item | Moves | Slain | Sibyl | Alive |", "|---|---|---|---|---|---|---|---|---|");
    games.forEach(({ row, actions, facts }, rank) => {
      out.push(`| ${PREFIX[k]}${String(rank + 1).padStart(3, "0")} | ${row.score} | [${row.item.picks.join(", ")}] | ${row.item.seed} | ${row.i} | ${actions.length} | ${facts.slain ? "yes" : "no"} | ${facts.sibyl ? "yes" : "no"} | ${facts.alive}/${facts.total} |`);
    });
  });
  return out.join("\n") + "\n";
}
