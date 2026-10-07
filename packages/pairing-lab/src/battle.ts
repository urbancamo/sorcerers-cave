// A battle, ready to show: one stored scenario replayed with the trace, turned into round-by-round data (who fought whom, the
// dice, who fell, who was left standing). It is the data behind the standalone battle viewer (battleHtml.ts).
import { ALL_CREATURES, ALL_TREASURES } from "@sorcerers-cave/engine";
import { CR3, TR3 } from "./mnemonics";
import { fromPlain, type Run } from "./runlog";
import { fsOf, mpOf, POINTS } from "./rules";
import { simulate } from "./sim";
import type { Ctx, Outcome, Rules, TraceEvent, Unit } from "./types";

export interface BattleUnit {
  idx: number; cid: number; code: string; name: string;
  fs: number; mp: number; total: number; points: number;
  gear: { tid: number; code: string; name: string }[];
  potion: boolean; elixir: boolean; dragonKills: number;
}

export interface Fall { side: "party" | "strangers"; idx: number; nominated?: string; roll?: number }

export interface BattleMatch {
  n: number;                                   // match number within its round
  partyIdx: number[]; partyBackIdx: number[]; strangersIdx: number[]; strangersBackIdx: number[];
  partyStrength: number; strangerStrength: number;
  partyBonus: number; strangerBonus: number;
  partyDie: number; strangerDie: number;
  partyTotal: number; strangerTotal: number;
  result: "S" | "P" | "T";
  fallen: Fall[];                              // who died in this match
  saved: { side: "party" | "strangers"; idx: number }[];   // a level 4+ Ring bearer who could not be killed
}

export interface BattleRound {
  n: number;
  attacker: "strangers" | "party";
  matches: BattleMatch[];
  partyAlive: number[]; strangersAlive: number[];          // indices still standing at the end of the round
}

export interface Battle {
  meta: {
    runId: string; scenarioId: number; seed: number; deck: "base" | "kit";
    level: number; curses: number; eye: boolean; strangerSurprise: boolean;
    partyStyle: string; strangerStyle: string; rules: Rules;
    partyRing: boolean; strangerRing: boolean;
  } & Outcome;
  party: BattleUnit[];
  strangers: BattleUnit[];
  rounds: BattleRound[];
}

export function buildBattle(run: Run, scenarioId: number): Battle {
  const rec = run.scenarios.find((r) => r.id === scenarioId);
  if (!rec) throw new Error(`scenario ${scenarioId} is not in run ${run.run.id}`);
  const { rules, partyStyle, strangerStyle } = run.run;
  const sc = fromPlain(rec.scenario);
  const ctx: Ctx = { eye: sc.eye, curses: sc.curses, level: sc.level, surprise: sc.strangerSurprise, rules };

  const events: TraceEvent[] = [];
  const outcome = simulate(sc, rules, partyStyle, strangerStyle, rec.seed, { trace: (e) => events.push(e) });
  if (JSON.stringify(outcome) !== JSON.stringify(rec.outcome)) throw new Error(`scenario ${scenarioId} does not reproduce its recorded outcome`);

  const describe = (u: Unit, idx: number): BattleUnit => {
    const fs = fsOf(u, ctx), mp = mpOf(u, ctx);
    return {
      idx, cid: u.cid, code: CR3[u.cid] ?? "???", name: ALL_CREATURES[u.cid]?.name ?? `creature ${u.cid}`, fs, mp, total: fs + mp, points: POINTS[u.cid]!,
      gear: u.gear.map((tid) => ({ tid, code: TR3[tid] ?? "???", name: ALL_TREASURES[tid]?.name ?? `treasure ${tid}` })),
      potion: u.potion, elixir: u.fsBonus > 0, dragonKills: u.dragonKills,
    };
  };
  const party = sc.party.map(describe), strangers = sc.strangers.map(describe);

  const rounds: BattleRound[] = [];
  const partyAlive = new Set(party.map((u) => u.idx)), strangersAlive = new Set(strangers.map((u) => u.idx));
  let current: BattleMatch | null = null;
  for (const e of events) {
    if (e.type === "match") {
      let r = rounds[rounds.length - 1];
      if (!r || r.n !== e.round) {
        const strAtt = rules.alternate ? (e.round % 2 === 1) === rules.strangersAttackFirst : rules.strangersAttackFirst;
        r = { n: e.round, attacker: strAtt ? "strangers" : "party", matches: [], partyAlive: [], strangersAlive: [] };
        rounds.push(r);
      }
      current = {
        n: r.matches.length + 1,
        partyIdx: e.partyIdx, partyBackIdx: e.partyBackIdx, strangersIdx: e.strangersIdx, strangersBackIdx: e.strangersBackIdx,
        partyStrength: e.partyStrength, strangerStrength: e.strangerStrength, partyBonus: e.partyBonus, strangerBonus: e.strangerBonus,
        partyDie: e.partyDie, strangerDie: e.strangerDie,
        partyTotal: e.partyStrength + e.partyDie + e.partyBonus, strangerTotal: e.strangerStrength + e.strangerDie + e.strangerBonus,
        result: e.result, fallen: [], saved: [],
      };
      r.matches.push(current);
    } else if (e.type === "casualty" && current) {
      current.fallen.push({ side: e.side, idx: e.index, ...(e.nominated ? { nominated: e.nominated, roll: e.roll } : {}) });
      (e.side === "party" ? partyAlive : strangersAlive).delete(e.index);
    } else if (e.type === "saved" && current) {
      current.saved.push({ side: e.side, idx: e.index });
    } else if (e.type === "round") {
      const r = rounds.find((x) => x.n === e.round);
      if (r) { r.partyAlive = [...partyAlive].sort((a, b) => a - b); r.strangersAlive = [...strangersAlive].sort((a, b) => a - b); }
    }
  }

  const partyRing = sc.party.some((u) => u.gear.includes(10)), strangerRing = sc.strangers.some((u) => u.gear.includes(10));
  return {
    meta: {
      runId: run.run.id, scenarioId, seed: rec.seed, deck: run.run.deck, level: sc.level, curses: sc.curses, eye: sc.eye, strangerSurprise: sc.strangerSurprise === 1,
      partyStyle, strangerStyle, rules, partyRing: partyRing && !sc.eye, strangerRing: strangerRing && !sc.eye, ...outcome,
    },
    party, strangers, rounds,
  };
}
