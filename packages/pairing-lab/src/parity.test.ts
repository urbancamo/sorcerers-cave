// The lab's strength arithmetic must agree with the engine's own `previewPlan` (training spec T-A1) wherever
// the engine can express the position. Cases involving a stranger caster BACKING a match, or a Priest Staff
// of +2, differ by design (open rules O2 and D3) and are covered in rules.test.ts instead.
import { describe, it, expect } from "vitest";
import { previewPlan } from "@sorcerers-cave/engine";
import { makeState } from "@engine-testkit";
import { DEFAULT_RULES, matchStrength, T, unit } from "./rules";
import type { Ctx, Unit } from "./types";

const PRIEST_PLUS_ONE = { ...DEFAULT_RULES, staffPriest: 1 as const };

interface Case { name: string; party: Unit[]; backers?: Unit[]; strangers: Unit[]; eye?: boolean; level?: number }

function engineStrengths(c: Case) {
  const all = [...c.party, ...(c.backers ?? [])];
  const state = makeState({
    phase: "fight",
    level: c.level ?? 1,
    treasures: c.eye ? [T.EYE] : [],
    party: all.map((u) => ({ creatureId: u.cid, status: 0 as const, dragonKills: u.dragonKills, treasure: [...u.gear] })),
    strangers: c.strangers.map((u) => u.cid),
    fight: { surprise: 0, round: 1, focus: 0, gear: c.strangers.map((u) => [...u.gear]) },
  });
  const plan = { matches: [{
    front: c.party.map((_, i) => i),
    backers: (c.backers ?? []).map((_, i) => c.party.length + i),
    strangers: c.strangers.map((_, i) => i),
  }] };
  const m = previewPlan(state, plan).matches[0]!;
  return { party: m.partyStr, strangers: m.enemyStr };
}

const cases: Case[] = [
  { name: "Hero with the Sword v Ogre", party: [unit(0, [T.SWORD])], strangers: [unit(2)] },
  { name: "Wizard fighting in front v Troll", party: [unit(8)], strangers: [unit(3)] },
  { name: "Man backed by a Wizard with the Staff v Ogre", party: [unit(5)], backers: [unit(8, [T.STAFF])], strangers: [unit(2)] },
  { name: "Man backed by a Priest with the Staff v Ogre (Priest +1 as the engine has it)", party: [unit(5)], backers: [unit(4, [T.STAFF])], strangers: [unit(2)] },
  { name: "Hero with the Shield v stranger Wizard", party: [unit(0, [T.SHIELD])], strangers: [unit(8)] },
  { name: "Hero with the Shield v the Sorcerer", party: [unit(0, [T.SHIELD])], strangers: [unit(11)] },
  { name: "party Wizard v stranger Man with the Shield", party: [unit(8)], strangers: [unit(5, [T.SHIELD])] },
  { name: "Eye of God: Wizard and Sword Hero in front", party: [unit(8), unit(0, [T.SWORD])], strangers: [unit(2)], eye: true },
  { name: "Eye of God v the Sorcerer (reduced by 2, not zeroed)", party: [unit(0)], strangers: [unit(11)], eye: true },
  { name: "two against one: Man and Dwarf v Giant", party: [unit(5), unit(7)], strangers: [unit(12)] },
  { name: "stranger Hero with Sword and Staff-bearing Priest", party: [unit(5)], strangers: [unit(0, [T.SWORD]), unit(4, [T.STAFF])] },
];

describe("lab strength == engine previewPlan", () => {
  for (const c of cases) {
    it(c.name, () => {
      const rules = c.name.includes("Priest +1") || c.name.includes("Staff-bearing Priest") ? PRIEST_PLUS_ONE : DEFAULT_RULES;
      const ctx: Ctx = { eye: !!c.eye, curses: 0, level: c.level ?? 1, surprise: 0, rules };
      const lab = matchStrength({ pf: c.party, pb: c.backers ?? [], sf: c.strangers, sb: [] }, ctx);
      expect(lab).toEqual(engineStrengths(c));
    });
  }
});
