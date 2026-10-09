// Simulate a run and store it: a line-printer listing (.log, one scenario per line) and an exact JSON file (.json) that can be
// replayed.  Usage:  pnpm --filter @sorcerers-cave/pairing-lab report -- --count 1000 --deck kit --party CAU
//   --id NAME  --deck base|kit  --generator balanced|random  --seed N  --count N  --party GRD|CAU|MAG|RLG  --strangers GRD|CAU|MAG|RLG  --out DIR
//   --detail N  also writes NAME.matches.log: one line per MATCH for the first N scenarios
//   or:  report -- --replay runs/NAME.json   (re-simulates every scenario and checks the recorded outcomes)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatListing, formatMatchListing } from "./listing";
import { parseRun, replayRun, simulateRun, toJson } from "./runlog";
import type { Style } from "./types";

const args = new Map<string, string>();
const argv = process.argv.slice(2).filter((a) => a !== "--");
for (let i = 0; i < argv.length; i += 2) args.set(argv[i]!.replace(/^--/, ""), argv[i + 1] ?? "");
const get = (k: string, d: string) => args.get(k) ?? d;

if (args.has("replay")) {
  const run = parseRun(readFileSync(get("replay", ""), "utf8"));
  const r = replayRun(run);
  console.log(r.ok ? `REPLAY OK: all ${run.scenarios.length} scenarios reproduced exactly` : `REPLAY FAILED: ${r.mismatches.length} scenarios differ (ids ${r.mismatches.slice(0, 20).join(", ")})`);
  process.exit(r.ok ? 0 : 1);
}

const style = (k: string): Style => {
  const v = get(k, "GRD").toUpperCase();
  if (!["GRD", "CAU", "MAG", "RLG"].includes(v)) throw new Error(`--${k} must be GRD, CAU, MAG or RLG`);
  return v as Style;
};
const deck = get("deck", "base") as "base" | "kit";
const generator = get("generator", "balanced") as "balanced" | "random";
if (!["base", "kit"].includes(deck)) throw new Error("--deck must be base or kit");
if (!["balanced", "random"].includes(generator)) throw new Error("--generator must be balanced or random");
const count = Number(get("count", "1000")), seed = Number(get("seed", "1"));
const partyStyle = style("party"), strangerStyle = style("strangers");
const id = get("id", `${generator === "balanced" ? "bal" : "rnd"}-${deck}-p${partyStyle}-s${strangerStyle}-seed${seed}-n${count}`);
const out = get("out", "runs");

const run = simulateRun({ id, deck, generator, seed, count, partyStyle, strangerStyle });
const now = new Date(), p = (n: number) => String(n).padStart(2, "0");
const printed = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${id}.log`), formatListing(run, { printed }));
writeFileSync(join(out, `${id}.json`), toJson(run));
if (args.has("detail")) writeFileSync(join(out, `${id}.matches.log`), formatMatchListing(run, { printed, scenarios: Number(get("detail", "20")) }));
console.log(`wrote ${join(out, id)}.log and .json${args.has("detail") ? " and .matches.log" : ""}  (${count} scenarios)`);
