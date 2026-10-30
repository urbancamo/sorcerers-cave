// The engine's revised round engine (`variants.combatRevision`) and the lab's simulator implement the same rules twice; this
// keeps them honest. Both play the same positions many times with the `standard` / GRD heuristics on each side (the lab's party never
// retreats, the engine's headless party likewise) and must agree on how fights end, within sampling noise.
import { describe, it, expect } from "vitest";
import { playRevisedFight, reduce } from "@sorcerers-cave/engine";
import { makeState } from "@engine-testkit";
import { DEFAULT_RULES, unit } from "./rules";
import { simulate } from "./sim";
import type { Scenario } from "./types";

const RULES = { ...DEFAULT_RULES, partyRetreatRatio: 0 };
const N = 400;

interface Tally { won: number; lost: number; standoff: number; partyLost: number }

function engineTally(party: number[], strangers: number[]): Tally {
  const t: Tally = { won: 0, lost: 0, standoff: 0, partyLost: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const start = reduce(makeState({
      phase: "encounter", seed: seed * 7919, strangers, treasures: [], variants: { combatRevision: true },
      party: party.map((creatureId) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure: [] })),
    }), { type: "attack" }).state;
    const p = playRevisedFight(start);
    if (p.end === "stuck") throw new Error("the engine fight did not finish");
    t[p.end]++;
    t.partyLost += p.state.party.filter((m) => m.status === 3).length;
  }
  return t;
}

function labTally(party: number[], strangers: number[]): Tally {
  const t: Tally = { won: 0, lost: 0, standoff: 0, partyLost: 0 };
  const scn: Scenario = { party: party.map((c) => unit(c)), strangers: strangers.map((c) => unit(c)), eye: false, curses: 0, level: 1, attacker: "party", surprise: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const o = simulate(scn, RULES, "GRD", "GRD", seed * 104729);
    if (o.end === "partyWin") t.won++; else if (o.end === "strangersWin") t.lost++; else t.standoff++;
    t.partyLost += party.length - o.partyAlive;
  }
  return t;
}

const CASES: { name: string; party: number[]; strangers: number[] }[] = [
  { name: "an even fight: Hero and Man v Ogre and Troll", party: [0, 5], strangers: [2, 3] },
  { name: "a big party v a few", party: [0, 4, 5, 6, 7], strangers: [2, 3, 7] },
  { name: "a lone Hero v four", party: [0], strangers: [2, 3, 5, 7] },
  { name: "casters on both sides", party: [4, 8, 5, 0], strangers: [4, 8, 2, 3] },
  { name: "heroes v a Dragon", party: [0, 0, 4, 4], strangers: [10] },
];

describe("engine revised fights agree with the lab simulator", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const e = engineTally(c.party, c.strangers), l = labTally(c.party, c.strangers);
      const se = (a: number, b: number): number => Math.sqrt((a / N) * (1 - a / N) / N + (b / N) * (1 - b / N) / N);
      for (const k of ["won", "lost", "standoff"] as const) {
        expect(Math.abs(e[k] - l[k]) / N, `${k}: engine ${e[k]} lab ${l[k]}`).toBeLessThan(4 * se(e[k], l[k]) + 0.01);
      }
      expect(Math.abs(e.partyLost - l.partyLost) / N / c.party.length).toBeLessThan(0.05);
    });
  }
});
