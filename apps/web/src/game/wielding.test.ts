import { describe, expect, it } from 'vitest';
import type { GameState, PartyMember } from '@sorcerers-cave/engine';
import { fightGear, unusedGear } from './wielding';

const member = (treasure: number[], borne?: number[]) => ({ creatureId: 0, status: 0, treasure, borne }) as unknown as PartyMember;

describe('fightGear', () => {
  it('hides a carried weapon but shows a wielded one', () => {
    expect(fightGear(member([3, 17], [3]))).toEqual([3]);
  });
  it('shows nothing wieldable when nothing is in use, and keeps other items', () => {
    expect(fightGear(member([3, 10, 7, 12]))).toEqual([12]);
  });
});

describe('unusedGear', () => {
  const party = (creatureId: number): GameState => ({ party: [{ creatureId, status: 0, dragonKills: 0, treasure: [7] }] }) as unknown as GameState;
  it('mentions a Talisman a human carries without wearing, but not one an Ogre carries (humans and magic users only)', () => {
    expect(unusedGear(party(5))).toEqual(['Talisman (Man) carried, not worn']);
    expect(unusedGear(party(2))).toEqual([]);
  });
});
