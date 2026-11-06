// The offline search that FINDS the golden game pinned in `fixtures/golden-search.json` (the committed test that replays it is
// `goldenSearch.pinned.test.ts`). Run it with `npm run search -w packages/engine`; it is never part of the build.
//
// Shape of the search (the budget is recorded in the fixture, because "highest score" only means "highest found by this search"):
//   1. Parties: the SEARCH_PARTIES legal kit drafts with the greatest starting power.
//   2. Seeds: the first SEARCH_SEEDS seeds whose small pack puts the Sorcerer between cards SEARCH_IDX_LO and SEARCH_IDX_HI —
//      early enough to be reached, late enough that the party can gather strength first (decks are known at the start).
//   3. For every (party, seed): one beam search of SEARCH_WIDTH states and SEARCH_STEPS steps, with the kit and the Sibyl on. A
//      finished game only counts if the Sorcerer is dead, the Sibyl is in the party and the party reached the surface.
//   4. The best counting game by final score wins; `SEARCH_MERGE` combines the shard files into the fixture.
//
// Parallel use: start one process per core with SEARCH_SHARD=k SEARCH_SHARDS=n SEARCH_OUT=<dir>, then once with SEARCH_MERGE=<dir>.
// @ts-ignore node types are not installed in this package; this file only ever runs under node
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newGame, replay } from "./index";
import { beamSearch, legalParties, power, DEFAULT_WEIGHTS, type Weights } from "./goldenSearch";
import { scoreBreakdown } from "./score";
import { GS_ESCAPED } from "./state";
import type { GameAction } from "./actions";

declare const process: { env: Record<string, string | undefined>; cwd(): string };
const env = (k: string, d: number) => Number(process.env[k] ?? d);

const VARIANTS = { extensionKit: true, sibyl: true };
const PARTIES = env("SEARCH_PARTIES", 20);
const SEEDS = env("SEARCH_SEEDS", 300);
const IDX_LO = env("SEARCH_IDX_LO", 15);
const IDX_HI = env("SEARCH_IDX_HI", 70);
const WIDTH = env("SEARCH_WIDTH", 8);
const STEPS = env("SEARCH_STEPS", 700);
// The weights this search was tuned with: the Sibyl must be wanted (the default would let a run find a Sorcerer-slayer without
// her), and the pull towards the stairs is gentle so the party keeps gathering until the Sorcerer is dead.
const WEIGHTS: Weights = { ...DEFAULT_WEIGHTS, sibyl: 300, home: 1 };
const OUT = process.env.SEARCH_OUT ?? "search-out";
const FIXTURE = "src/fixtures/golden-search.json";

interface Row { picks: number[]; seed: number; score: number; expanded: number; killedAt: number | null; actions?: GameAction[] }

function candidates(): { parties: number[][]; seeds: number[] } {
  const parties = legalParties(VARIANTS)
    .map((p) => ({ p, pw: power(newGame(1, p, VARIANTS)) }))
    .sort((a, b) => b.pw - a.pw || a.p.join().localeCompare(b.p.join()))
    .slice(0, PARTIES)
    .map((x) => x.p);
  const seeds: number[] = [];
  for (let s = 1; seeds.length < SEEDS && s <= 100000; s++) {
    const i = newGame(s, [4, 6], VARIANTS).smallPack.indexOf(111); // the pack does not depend on the draft
    if (i >= IDX_LO && i <= IDX_HI) seeds.push(s);
  }
  return { parties, seeds };
}

describe.skipIf(!!process.env.SEARCH_MERGE)("golden search: one shard", () => {
  it("searches its share of the (party, seed) pairs", () => {
    const shard = env("SEARCH_SHARD", 0);
    const shards = env("SEARCH_SHARDS", 1);
    const { parties, seeds } = candidates();
    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    const file = `${OUT}/shard-${shard}.jsonl`;
    writeFileSync(file, "");
    let k = 0;
    for (const picks of parties) {
      for (const seed of seeds) {
        if (k++ % shards !== shard) continue;
        const r = beamSearch(newGame(seed, picks, VARIANTS), { width: WIDTH, maxSteps: STEPS, weights: WEIGHTS });
        const good = r.finished.filter((f) => f.sorcererKilled && f.hasSibyl);
        const top = good.reduce<(typeof good)[number] | null>((m, f) => (!m || f.score > m.score ? f : m), null);
        const row: Row = { picks, seed, score: top?.score ?? -1, expanded: r.expanded, killedAt: r.sorcererKilledAt, actions: top?.actions };
        appendFileSync(file, JSON.stringify(row) + "\n");
      }
    }
    expect(k).toBeGreaterThan(0);
  });
});

describe.skipIf(!process.env.SEARCH_MERGE)("golden search: merge the shards into the fixture", () => {
  it("keeps the best game found and records the budget that found it", () => {
    const dir = process.env.SEARCH_MERGE!;
    const rows: Row[] = readdirSync(dir)
      .filter((f: string) => f.endsWith(".jsonl"))
      .flatMap((f: string) => readFileSync(`${dir}/${f}`, "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l) as Row));
    expect(rows.length).toBeGreaterThan(0);
    const best = rows.filter((r) => r.actions).sort((a, b) => b.score - a.score)[0];
    expect(best, "no search found a game that slays the Sorcerer, keeps the Sibyl and reaches the surface").toBeDefined();
    // Check it on the real engine before pinning it: replay() is the authority, not the search's own bookkeeping.
    const frames = replay(best!.seed, best!.picks, best!.actions!, VARIANTS);
    const end = frames[frames.length - 1]!.state;
    expect(end.gs).toBe(GS_ESCAPED);
    expect(scoreBreakdown(end).total).toBe(best!.score);
    const record = {
      note: "Found by src/goldenSearch.search.ts. 'Maximised' means the highest score that search found within the budget below, not a proven maximum.",
      variants: VARIANTS,
      seed: best!.seed,
      picks: best!.picks,
      score: best!.score,
      budget: {
        parties: PARTIES, seeds: SEEDS, sorcererIndexWindow: [IDX_LO, IDX_HI], beamWidth: WIDTH, maxSteps: STEPS, weights: WEIGHTS,
        searches: rows.length, searchesThatCounted: rows.filter((r) => r.score >= 0).length,
        statesExpanded: rows.reduce((n, r) => n + r.expanded, 0),
      },
      actions: best!.actions,
    };
    mkdirSync("src/fixtures", { recursive: true });
    writeFileSync(FIXTURE, JSON.stringify(record, null, 1) + "\n");
  });
});
