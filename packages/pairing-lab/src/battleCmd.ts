// The battle viewer as a utility: take a reference to a battle (a stored run and a scenario number), replay it, and write one
// self-contained HTML file with the game's card art. Used by the `battle` command.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildBattle } from "./battle";
import { renderBattleHtml } from "./battleHtml";
import { loadArt as defaultLoadArt, type CardArt, type LoadArtOptions } from "./cards";
import { parseRun } from "./runlog";

/** `runs/NAME.json#3555`, `NAME#3555` (a run in runs/), or a run plus a separate scenario number. */
export function parseBattleRef(ref: string, scenario?: string): { path: string; scenario: number } {
  const hash = ref.indexOf("#");
  const base = hash >= 0 ? ref.slice(0, hash) : ref;
  const idText = hash >= 0 ? ref.slice(hash + 1) : scenario;
  const id = Number(idText);
  if (idText === undefined || idText === "" || !Number.isInteger(id) || id < 1) throw new Error(`a battle reference needs a scenario number, like runs/NAME.json#3555 (got "${ref}")`);
  const path = base.endsWith(".json") || base.includes("/") ? base : join("runs", `${base}.json`);
  return { path, scenario: id };
}

export interface BattleCmdOptions {
  ref: string;
  scenario?: string;
  out?: string;                 // a folder (default runs/battles) or a .html path
  art?: boolean;                // use the card art (default true)
  assetDir?: string | null;
  width?: number;               // thumbnail width in pixels
  cacheDir?: string;
  loadArt?: (needed: { creature: number[]; treasure: number[] }, o?: LoadArtOptions) => CardArt;   // injectable for tests
}

export function writeBattleHtml(o: BattleCmdOptions): { path: string; bytes: number; scenario: number; cardsWithArt: number } {
  const { path: runPath, scenario } = parseBattleRef(o.ref, o.scenario);
  if (!existsSync(runPath)) throw new Error(`cannot find the run file ${runPath}`);
  const run = parseRun(readFileSync(runPath, "utf8"));
  const battle = buildBattle(run, scenario);

  const needed = {
    creature: [...new Set([...battle.party, ...battle.strangers].map((u) => u.cid))],
    treasure: [...new Set([...battle.party, ...battle.strangers].flatMap((u) => u.gear.map((g) => g.tid)))],
  };
  const art: CardArt = o.art === false ? { creature: {}, treasure: {} } : (o.loadArt ?? defaultLoadArt)(needed, { assetDir: o.assetDir, width: o.width, cacheDir: o.cacheDir });

  const html = renderBattleHtml(battle, art);
  const out = o.out ?? join("runs", "battles");
  const path = out.endsWith(".html") ? out : join(out, `${run.run.id}-${scenario}.html`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html);
  return { path, bytes: Buffer.byteLength(html), scenario, cardsWithArt: Object.keys(art.creature).length + Object.keys(art.treasure).length };
}
