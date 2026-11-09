import { ALL_CREATURES, axeBonus, eyePresent, inUse, staffBonus, swordBonus, type GameState } from '@sorcerers-cave/engine';

// What a party member actually fights with, as the printed number plus each bonus now in effect ("Magic 4 + 1 (Magic Staff)").
// The bonus sizes come from the engine's own capability tables, and `figures.test.ts` checks that strength plus magic here equals the
// engine's `frontStrength`, so the panels cannot drift from what a fight uses. Only what is in effect counts: a Sword, Axe or Staff
// that is merely carried adds nothing, and under the Eye of God all magic and artefacts are powerless.

const T_SWORD = 3, T_STAFF = 9, T_AXE = 17;

export interface Part { label: string; n: number }

export interface Figures {
  fs: number; mp: number;        // printed
  fsParts: Part[]; mpParts: Part[]; // each bonus in effect (a loss is negative)
  fsTotal: number; mpTotal: number;
}

const sum = (parts: Part[]) => parts.reduce((n, p) => n + p.n, 0);

export function memberFigures(state: GameState, mi: number): Figures {
  const m = state.party[mi]!;
  const c = ALL_CREATURES[m.creatureId]!;
  const eye = eyePresent(state);
  const fsParts: Part[] = [
    { label: 'Magic Sword', n: !eye && inUse(m, T_SWORD) ? swordBonus(m.creatureId) : 0 },
    { label: 'Magic Axe', n: !eye && inUse(m, T_AXE) ? axeBonus(m.creatureId) : 0 },
    // Traits of the member, never nullified by the Eye.
    { label: 'Dragon Slayer', n: m.dragonKills },
    { label: 'Elixir', n: m.fsBonus ?? 0 },
    { label: 'Strength Potion', n: m.potionActive ? 2 : 0 },
  ].filter((p) => p.n !== 0);
  // The Eye renders all magic powerless: the caster's own magical power as well as the Staff's.
  const mpParts: Part[] = eye
    ? (c.mp > 0 ? [{ label: 'Eye of God', n: -c.mp }] : [])
    : inUse(m, T_STAFF) && staffBonus(m.creatureId) > 0 ? [{ label: 'Magic Staff', n: staffBonus(m.creatureId) }] : [];
  return { fs: c.fs, mp: c.mp, fsParts, mpParts, fsTotal: c.fs + sum(fsParts), mpTotal: c.mp + sum(mpParts) };
}

/** "5", or "4 + 1 (Magic Staff)", or "4 − 4 (Eye of God)". */
export function figureText(base: number, parts: readonly Part[] = []): string {
  return parts.reduce((s, p) => `${s} ${p.n < 0 ? '−' : '+'} ${Math.abs(p.n)} (${p.label})`, String(base));
}
