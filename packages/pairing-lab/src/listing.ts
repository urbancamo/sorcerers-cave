// The line-printer listing of a run: ONE SCENARIO PER LINE, fixed width, uppercase 3-letter mnemonics, in the style of the
// game's own log (apps/web/src/game/gameLog.ts): a spaced banner, a header, rules, a footer, a summary and a KEY.
// There is no fixed width: each column is as wide as its widest value, so nothing is ever truncated.
import { ALL_CREATURES, ALL_TREASURES } from "@sorcerers-cave/engine";
import { CR3, TR3 } from "./mnemonics";
import { fromPlain, type PlainUnit, type Run, type ScenarioRecord } from "./runlog";
import { simulate } from "./sim";
import type { TraceEvent } from "./types";

const END3 = { strangersWin: "SWN", partyWin: "PWN", retreat: "RET", cap: "CAP" } as const;

/** A creature as `CODE+ARTEFACT...`, then `!` Strength Potion, `^` Elixir, `*n` dragons slain. */
const unitCode = (u: PlainUnit): string =>
  [CR3[u.cid] ?? "???", ...u.gear.map((g) => TR3[g] ?? "???")].join("+") + (u.potion ? "!" : "") + (u.fsBonus ? "^" : "") + (u.dragonKills ? `*${u.dragonKills}` : "");

interface Col { name: string; right: boolean; get: (r: ScenarioRecord) => string }
const f3 = (x: number) => x.toFixed(3);
const COLS: Col[] = [
  { name: "SCN#", right: true, get: (r) => String(r.id) },
  { name: "DCK", right: false, get: () => "" },   // filled per run below
  { name: "LVL", right: true, get: (r) => String(r.scenario.level) },
  { name: "CRS", right: true, get: (r) => String(r.scenario.curses) },
  { name: "EYE", right: false, get: (r) => (r.scenario.eye ? "Y" : "-") },
  { name: "SUP", right: true, get: (r) => String(r.scenario.strangerSurprise) },
  { name: "NP", right: true, get: (r) => String(r.scenario.party.length) },
  { name: "NS", right: true, get: (r) => String(r.scenario.strangers.length) },
  { name: "END", right: false, get: (r) => END3[r.outcome.end] },
  { name: "RDS", right: true, get: (r) => String(r.outcome.rounds) },
  { name: "PAL", right: true, get: (r) => String(r.outcome.partyAlive) },
  { name: "SAL", right: true, get: (r) => String(r.outcome.strangersAlive) },
  { name: "PVL", right: true, get: (r) => String(r.outcome.partyValueLost) },
  { name: "SVL", right: true, get: (r) => String(r.outcome.strangerValueLost) },
  { name: "R1", right: true, get: (r) => f3(r.outcome.r1) },
  { name: "R2", right: true, get: (r) => f3(r.outcome.r2) },
  { name: "R3", right: true, get: (r) => f3(r.outcome.r3) },
  { name: "SEED", right: true, get: (r) => String(r.seed) },
  { name: "PARTY", right: false, get: (r) => r.scenario.party.map(unitCode).join(" ") },
  { name: "STRANGERS", right: false, get: (r) => r.scenario.strangers.map(unitCode).join(" ") },
];

/** Pack whole entries into lines of at most `w` characters, two spaces apart. */
function pack(items: string[], w: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const it of items) { if (line && line.length + 2 + it.length > w) { out.push(line); line = it; } else line = line ? `${line}  ${it}` : it; }
  if (line) out.push(line);
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function formatListing(run: Run, o: { printed?: string } = {}): string {
  const { run: meta, scenarios } = run;
  const dck = meta.deck === "kit" ? "KIT" : "BAS";
  const cols = COLS.map((c) => (c.name === "DCK" ? { ...c, get: () => dck } : c));
  const cells = scenarios.map((r) => cols.map((c) => c.get(r)));
  const widths = cols.map((c, i) => Math.max(c.name.length, ...cells.map((row) => row[i]!.length)));
  const pad = (s: string, i: number) => (cols[i]!.right ? s.padStart(widths[i]!) : s.padEnd(widths[i]!));
  const header = cols.map((c, i) => pad(c.name, i)).join(" ");
  const rows = cells.map((row) => row.map((s, i) => pad(s, i)).join(" "));

  const rl = meta.rules;
  const meta1 = `RUN ${meta.id}   GEN ${meta.generator === "balanced" ? "BAL" : "RND"}   DECK ${dck}   BASE SEED ${meta.baseSeed}   SCENARIOS ${scenarios.length}   PARTY ${meta.partyStyle}   STRANGERS ${meta.strangerStyle}`;
  const meta2 = `RULES ATK=${rl.strangersAttackFirst ? "S" : "P"} ALT=${rl.alternate ? 1 : 0} CAS=${rl.strangerCasualty === "nominate" ? "NOM" : "STR"} SHW=${rl.shieldWardsBackers ? 1 : 0} STF=${rl.staffPriest} RET=${rl.partyRetreatRatio.toFixed(2)} MAX=${rl.maxRounds}   PRINTED ${o.printed ?? "----------------"}`;
  const W = Math.max(header.length, meta1.length, meta2.length + 12);
  const RULE = "=".repeat(W), THIN = "-".repeat(W);
  const centre = (s: string) => (" ".repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s).replace(/\s+$/, "");
  const n = scenarios.length;
  const count = (e: keyof typeof END3) => scenarios.filter((r) => r.outcome.end === e).length;

  const creatureNames = Object.keys(CR3).filter((id) => meta.deck === "kit" || Number(id) <= 13).map((id) => `${CR3[Number(id)]}=${(ALL_CREATURES[Number(id)]?.name ?? "?").toUpperCase()}`);
  const keyRows = (label: string, items: string[]) => pack(items, W - 5 - 10 - 1).map((l, i) => "KEY".padEnd(5) + (i === 0 ? label.padEnd(10) : " ".repeat(10)) + " " + l);
  const artefacts = [3, 9, 10, 17, 20].filter((t) => meta.deck === "kit" || t <= 10).map((t) => `${TR3[t]}=${(ALL_TREASURES[t]?.name ?? "?").toUpperCase()}`);

  const out = [
    RULE, centre("P A I R I N G   S I M U L A T O R   R U N   L O G"), centre("O N E   S C E N A R I O   P E R   L I N E"), RULE,
    meta1, meta2 + `   WIDTH ${W}`, THIN, header, THIN,
    ...rows,
    THIN, centre(`* * *   E N D   O F   L I S T I N G   -   ${n}   S C E N A R I O S   * * *`), THIN,
    `SUMMARY N=${n} SWN=${count("strangersWin")} PWN=${count("partyWin")} RET=${count("retreat")} CAP=${count("cap")}`,
    `MEAN   RDS=${mean(scenarios.map((r) => r.outcome.rounds)).toFixed(2)} PVL=${mean(scenarios.map((r) => r.outcome.partyValueLost)).toFixed(2)} SVL=${mean(scenarios.map((r) => r.outcome.strangerValueLost)).toFixed(2)} R1=${f3(mean(scenarios.map((r) => r.outcome.r1)))} R2=${f3(mean(scenarios.map((r) => r.outcome.r2)))} R3=${f3(mean(scenarios.map((r) => r.outcome.r3)))}`,
    THIN,
    ...keyRows("CREATURE", creatureNames),
    ...keyRows("ARTEFACT", artefacts),
    ...keyRows("UNIT", ["CODE+ART=CREATURE BEARING ARTEFACT", "!=STRENGTH POTION ACTIVE", "^=ELIXIR (+2 STRENGTH)", "*N=N DRAGONS SLAIN"]),
    ...keyRows("DECK", ["BAS=BASE DECK", "KIT=EXTENSION KIT"]),
    ...keyRows("STYLE", ["GRD=GREEDY (STRONGEST FIRST, THE HEU BASELINE)", "CAU=CAUTIOUS (CHEAPEST FIRST, NEVER JOINS)", "MAG=MAGIC-HEAVY (CASTERS BACK)", "RLG=RANDOM LEGAL"]),
    ...keyRows("END", ["SWN=STRANGERS WON (PARTY WIPED OUT)", "PWN=PARTY WON (STRANGERS WIPED OUT)", "RET=PARTY RETREATED", "CAP=ROUND CAP REACHED"]),
    ...keyRows("COLUMN", [
      "SCN#=SCENARIO (JSON id)", "DCK=DECK", "LVL=DUNGEON LEVEL", "CRS=CURSES ON THE PARTY", "EYE=EYE OF GOD PRESENT", "SUP=STRANGERS' ROUND 1 SURPRISE",
      "NP=PARTY SIZE", "NS=NUMBER OF STRANGERS", "END=HOW THE FIGHT ENDED", "RDS=ROUNDS", "PAL=PARTY SURVIVORS", "SAL=STRANGER SURVIVORS",
      "PVL=PARTY VALUE LOST (VP)", "SVL=STRANGER VALUE LOST (VP)", "R1=SHARE OF ROUND 1 MATCHES THE STRANGERS WON", "R2=1 IF STRANGERS WIN OR PARTY RETREATS",
      "R3=VALUE DESTROYED MINUS LOST, 0 TO 1", "SEED=SCENARIO AND DICE SEED",
    ]),
    RULE,
  ];
  return out.join("\n") + "\n";
}

/** The same run, one MATCH per line: re-simulates each scenario (deterministic) and prints every match fought, round by round,
 *  with its strengths, die bonuses, dice and result. `scenarios` limits it to the first N scenarios. */
export function formatMatchListing(run: Run, o: { printed?: string; scenarios?: number } = {}): string {
  const { run: meta } = run;
  const recs = run.scenarios.slice(0, o.scenarios ?? run.scenarios.length);
  const side = (front: string[], back: string[]) => front.join("+") + (back.length ? "~" + back.join("+") : "");
  interface Row { cells: string[] }
  const rows: Row[] = [];
  for (const r of recs) {
    const counter = new Map<number, number>();
    simulate(fromPlain(r.scenario), meta.rules, meta.partyStyle, meta.strangerStyle, r.seed, {
      trace: (e: TraceEvent) => {
        if (e.type !== "match") return;
        const mn = (counter.get(e.round) ?? 0) + 1; counter.set(e.round, mn);
        rows.push({ cells: [String(r.id), String(e.round), String(mn), String(e.partyStrength), String(e.strangerStrength),
          String(e.partyBonus), String(e.strangerBonus), String(e.partyDie), String(e.strangerDie), e.result, side(e.party, e.partyBack), side(e.strangers, e.strangersBack)] });
      },
    });
  }
  const names = ["SCN#", "RD", "MN", "PST", "SST", "PB", "SB", "PD", "SD", "RES", "PARTY", "STRANGERS"];
  const right = [true, true, true, true, true, true, true, true, true, false, false, false];
  const widths = names.map((n, i) => Math.max(n.length, ...rows.map((r) => r.cells[i]!.length)));
  const pad = (s: string, i: number) => (right[i] ? s.padStart(widths[i]!) : s.padEnd(widths[i]!));
  const header = names.map((n, i) => pad(n, i)).join(" ");
  const meta1 = `RUN ${meta.id}   MATCH DETAIL   DECK ${meta.deck === "kit" ? "KIT" : "BAS"}   SCENARIOS ${recs.length}   MATCHES ${rows.length}   PARTY ${meta.partyStyle}   STRANGERS ${meta.strangerStyle}   PRINTED ${o.printed ?? "----------------"}`;
  const W = Math.max(header.length, meta1.length);
  const RULE = "=".repeat(W), THIN = "-".repeat(W);
  const centre = (s: string) => (" ".repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s).replace(/\s+$/, "");
  const keyRows = (label: string, items: string[]) => pack(items, W - 5 - 10 - 1).map((l, i) => "KEY".padEnd(5) + (i === 0 ? label.padEnd(10) : " ".repeat(10)) + " " + l);
  return [
    RULE, centre("P A I R I N G   S I M U L A T O R   M A T C H   D E T A I L"), centre("O N E   M A T C H   P E R   L I N E"), RULE,
    meta1, THIN, header, THIN,
    ...rows.map((r) => r.cells.map((c, i) => pad(c, i)).join(" ")),
    THIN, centre(`* * *   E N D   O F   L I S T I N G   -   ${rows.length}   M A T C H E S   * * *`), THIN,
    ...keyRows("COLUMN", ["SCN#=SCENARIO", "RD=ROUND", "MN=MATCH NUMBER IN THE ROUND", "PST=PARTY TOTAL STRENGTH", "SST=STRANGERS' TOTAL STRENGTH", "PB=PARTY DIE BONUS (RING MINUS CURSES)",
      "SB=STRANGERS' DIE BONUS (RING PLUS SURPRISE)", "PD=PARTY DIE", "SD=STRANGERS' DIE", "RES=S STRANGERS WON, P PARTY WON, T TIE (MATCH CONTINUES)"]),
    ...keyRows("SIDES", ["FRONT+FRONT~BACKER+BACKER (~ SEPARATES THE BACKGROUND CASTERS)", "CODES AS IN THE SCENARIO LISTING"]),
    RULE,
  ].join("\n") + "\n";
}
