// ALL_CREATURES (base + kit + Sibyl + Ghoul), not the base-only table: a kit game's strangers include ids 16-22, which a plain
// CREATURES lookup returns undefined for. Identical for ids 0-13, so the kit-off vectors are unchanged.
import { ALL_CREATURES as CREATURES } from "./data/creatures";
import { casterMP } from "./combat";
import { eyeActive } from "./effects";
import { BORNEABLE, isBorne, wieldConflict } from "./loot";
import type { GameAction, GameState } from "./index";

// Helpers the scripted bots share: the conformance-vector policies (conformance-vectors.test.ts) and the golden-game
// search tool both drive games with them, so they live here rather than inside a test file.

const C_SPECTRE = 9;
const C_DEMON = 15; // extension kit (SC-EXT-21) — the same magic-only fight gate as the Spectre, plus a Magic Axe bypass
const T_MAGIC_SWORD = 3;
const T_MAGIC_AXE = 17; // extension kit (SC-EXT-21/26) — ANY bearer (no species restriction) may fight a Demon hand-to-hand

/** Greedy, always-valid battle plan: one capable free member per stranger, in order. Magic-only gate
 *  widened to the Demon (SC-EXT-21) alongside the Spectre — used by both the kit-off "base" policy
 *  (where a Demon can never appear, so this is a no-op) and the kit-on "kit" policy (Task 17), which
 *  needs it for real. */
export function buildPlan(state: GameState): { front: number[]; backers: number[]; strangers: number[] }[] {
  const usedM = new Set<number>();
  const matches: { front: number[]; backers: number[]; strangers: number[] }[] = [];
  const capable = (mi: number, si: number): boolean => {
    const m = state.party[mi]!;
    const sid = state.strangers[si];
    if (sid !== C_SPECTRE && sid !== C_DEMON) return true;
    // Sword-Spectre bypass stays species-restricted ([0,1,5,6], as it always was); the Axe-Demon
    // bypass is possession-only, no species restriction (SC-EXT-21/26) — the two do NOT collapse
    // into one flat "holds a magic item" check.
    const sword = m.treasure.includes(T_MAGIC_SWORD) && [0, 1, 5, 6].includes(m.creatureId);
    const axe = sid === C_DEMON && m.treasure.includes(T_MAGIC_AXE);
    const magicItem = !eyeActive(state) && (sword || axe);
    return casterMP(m, state) > 0 || magicItem;
  };
  for (let s = 0; s < state.strangers.length; s++) {
    const mi = state.party.findIndex((m, i) => (m.status === 0 || m.status === 1) && !usedM.has(i) && capable(i, s));
    if (mi >= 0) { usedM.add(mi); matches.push({ front: [mi], backers: [], strangers: [s] }); }
  }
  return matches;
}

/** Strongest-foe-first plan: 2 front on the toughest foe, leftover casters back it, 1v1 the rest. */
export function buildStrongPlan(state: GameState): { front: number[]; backers: number[]; strangers: number[] }[] {
  const alive = state.party.map((m, i) => ({ m, i })).filter(({ m }) => m.status === 0 || m.status === 1);
  const capable = (mi: number, si: number): boolean => {
    const m = state.party[mi]!;
    if (state.strangers[si] !== C_SPECTRE) return true;
    const sword = !eyeActive(state) && m.treasure.includes(T_MAGIC_SWORD) && [0, 1, 5, 6].includes(m.creatureId);
    return casterMP(m, state) > 0 || sword;
  };
  const foes = state.strangers
    .map((cid, si) => ({ cid, si }))
    .sort((a, b) => CREATURES[b.cid]!.fs + CREATURES[b.cid]!.mp - (CREATURES[a.cid]!.fs + CREATURES[a.cid]!.mp));
  const used = new Set<number>();
  const matches: { front: number[]; backers: number[]; strangers: number[] }[] = [];
  for (const { si } of foes) {
    const cands = alive
      .filter(({ i }) => !used.has(i) && capable(i, si))
      .sort((a, b) => CREATURES[b.m.creatureId]!.fs - CREATURES[a.m.creatureId]!.fs);
    if (!cands.length) continue;
    const front = cands.slice(0, matches.length === 0 ? 2 : 1).map(({ i }) => i);
    front.forEach((i) => used.add(i));
    matches.push({ front, backers: [], strangers: [si] });
  }
  if (matches.length) {
    for (const { m, i } of alive) if (!used.has(i) && casterMP(m, state) > 0) { used.add(i); matches[0]!.backers.push(i); }
  }
  return matches;
}

/** Tiny deterministic LCG so the policy varies per step without Math.random. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s; };
}

/** The "artifacts" policy prepares the party the way a player must: before anything else it wields or wears each weapon, shield, Ring and
 *  Talisman a living member carries (wielding weapons: an item's effect applies only in use, and nothing is put in use automatically). */
export function prepareAction(state: GameState): GameAction | null {
  for (let mi = 0; mi < state.party.length; mi++) {
    const m = state.party[mi]!;
    if (m.status !== 0 && m.status !== 1) continue;
    for (let idx = 0; idx < m.treasure.length; idx++) {
      const t = m.treasure[idx]!;
      if (BORNEABLE.includes(t) && !isBorne(m, t) && wieldConflict(m, t) === null) return { type: "setBorne", mi, idx, borne: true };
    }
  }
  return null;
}
