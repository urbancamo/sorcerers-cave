// The fight arithmetic, on lean units. It reuses the engine's pure capability table and creature data, and is
// parity-tested against the engine's own `previewPlan` (parity.test.ts).
import { ALL_CREATURES, swordBonus, axeBonus, staffBonus, shieldEligible } from "@sorcerers-cave/engine";
import type { Ctx, MatchView, Rules, Unit } from "./types";

/** Treasure ids that matter in a fight (engine data/treasures.ts). */
export const T = { SWORD: 3, STAFF: 9, RING: 10, EYE: 13, AXE: 17, SHIELD: 20, POTION: 8 } as const;

const B_SWORD = 1, B_STAFF = 2, B_RING = 4, B_AXE = 8, B_SHIELD = 16;
const BIT: Record<number, number> = { [T.SWORD]: B_SWORD, [T.STAFF]: B_STAFF, [T.RING]: B_RING, [T.AXE]: B_AXE, [T.SHIELD]: B_SHIELD };

export const DEFAULT_RULES: Rules = {
  strangersAttackFirst: true,
  alternate: true,
  strangerCasualty: "nominate",
  shieldWardsBackers: true,
  staffPriest: 2,
  partyRetreatRatio: 0.5,
  maxRounds: 30,
};

const FS = ALL_CREATURES.map((c) => c.fs);
const MP = ALL_CREATURES.map((c) => c.mp);
export const POINTS = ALL_CREATURES.map((c) => c.points);
const SWORD_B = ALL_CREATURES.map((c) => swordBonus(c.id));
const AXE_B = ALL_CREATURES.map((c) => axeBonus(c.id));
const STAFF_B = ALL_CREATURES.map((c) => staffBonus(c.id));
const SHIELD_OK = ALL_CREATURES.map((c) => shieldEligible(c.id));
const C_SORCERER = 11, C_APPRENTICE = 14;

export function unit(cid: number, gear: number[] = []): Unit {
  let g = 0;
  for (const t of gear) g |= BIT[t] ?? 0;
  return { cid, gear: [...gear], g, dragonKills: 0, fsBonus: 0, potion: false, alive: true, role: 0 };
}

export const isCaster = (u: Unit): boolean => MP[u.cid]! > 0;

/** Fighting strength: card strength, dragon kills, the Elixir, a Sword or Axe, a Strength Potion. The Eye switches off artefacts. */
export function fsOf(u: Unit, ctx: Ctx): number {
  let fs = FS[u.cid]! + u.dragonKills + u.fsBonus;
  if (!ctx.eye) {
    if (u.g & B_SWORD) fs += SWORD_B[u.cid]!;
    if (u.g & B_AXE) fs += AXE_B[u.cid]!;
  }
  if (u.potion) fs += 2;
  return fs;
}

/** Magical power: the card's, plus a Staff. The Eye zeroes it, except that the Sorcerer is only reduced by 2. */
export function mpOf(u: Unit, ctx: Ctx): number {
  let mp: number;
  if (u.cid === C_SORCERER) mp = 9 - (ctx.eye ? 2 : 0);
  else if (ctx.eye) return 0;
  else mp = MP[u.cid]!;
  if (!ctx.eye && (u.g & B_STAFF)) {
    const b = STAFF_B[u.cid]!;
    mp += b === 1 ? ctx.rules.staffPriest : b;
  }
  return mp;
}

/** A creature's strength as a front-line fighter (its total: fighting strength plus magic). */
export const totalOf = (u: Unit, ctx: Ctx): number => fsOf(u, ctx) + mpOf(u, ctx);

const shieldLive = (u: Unit, ctx: Ctx): boolean => u.alive && !ctx.eye && (u.g & B_SHIELD) !== 0 && SHIELD_OK[u.cid]!;

/** Total strength of each side in one match (Fighting a Match steps i and ii). */
export function matchStrength(m: MatchView, ctx: Ctx): { party: number; strangers: number } {
  let partyShielded = false, strShielded = false;
  for (const u of m.sf) if (shieldLive(u, ctx)) { partyShielded = true; break; }
  for (const u of m.pf) if (shieldLive(u, ctx)) { strShielded = true; break; }

  let party = 0;
  for (const u of m.pf) party += fsOf(u, ctx) + (partyShielded ? 0 : mpOf(u, ctx));
  if (!partyShielded) for (const u of m.pb) party += mpOf(u, ctx);

  const ward = (u: Unit): number => {
    const mp = mpOf(u, ctx);
    if (!strShielded || mp === 0) return mp;
    return u.cid === C_SORCERER || u.cid === C_APPRENTICE ? Math.max(0, mp - 2) : 0;
  };
  let strangers = 0;
  for (const u of m.sf) strangers += fsOf(u, ctx) + ward(u);
  for (const u of m.sb) strangers += ctx.rules.shieldWardsBackers ? ward(u) : mpOf(u, ctx);
  return { party, strangers };
}

const hasRing = (units: Unit[], ctx: Ctx): boolean => {
  if (ctx.eye) return false;
  for (const u of units) if (u.alive && (u.g & B_RING)) return true;
  return false;
};
export const partyHasRing = hasRing;

/** Added to every party die roll: +1 while a living member holds the Ring, minus one per curse. */
export const partyDieBonus = (party: Unit[], ctx: Ctx): number => (hasRing(party, ctx) ? 1 : 0) - ctx.curses;

/** Added to every stranger die roll: +1 for a Ring, and the surprise bonus in round 1. */
export const strangerDieBonus = (strangers: Unit[], ctx: Ctx, round: number): number =>
  (hasRing(strangers, ctx) ? 1 : 0) + (round === 1 ? ctx.surprise : 0);

/** The 36 dice outcomes for one match, from the strangers' point of view. `s` and `p` are the totals including die bonuses. */
export function outcomeCounts(s: number, p: number): { win: number; tie: number; lose: number } {
  let win = 0, tie = 0, lose = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const x = s + a, y = p + b;
    if (x > y) win++; else if (x === y) tie++; else lose++;
  }
  return { win, tie, lose };
}

/** A two-creature front line loses: which of the pair dies. The party's nominated creature dies on 4-6; for the strangers,
 *  as Peter's text reads, the OTHER creature dies on 4-6. A Ring adds 1 to the roll and 7 counts as 6. */
export function casualtyVictim(loser: "party" | "strangers", nominated: number, other: number, roll: number, ringBonus: number): number {
  const r = Math.min(6, roll + ringBonus);
  return loser === "party" ? (r >= 4 ? nominated : other) : (r >= 4 ? other : nominated);
}

/** A Ring bearer at level 4 or deeper cannot be killed (the Eye switches it off). */
export const invincible = (u: Unit, ctx: Ctx): boolean => ctx.level >= 4 && !ctx.eye && (u.g & B_RING) !== 0;
