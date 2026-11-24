import { describe, expect, it } from 'vitest';
import { ALL_CREATURES, type GameState, type PartyMember } from '@sorcerers-cave/engine';
import { fightGear, unusedGear } from './wielding';

const idOf = (name: string) => ALL_CREATURES.findIndex((c) => c?.name === name);
const member = (treasure: number[], borne?: number[], creature = 'Hero') => ({ creatureId: idOf(creature), status: 0, treasure, borne }) as unknown as PartyMember;

describe('fightGear', () => {
  it('hides a carried weapon but shows a wielded one', () => {
    expect(fightGear(member([3, 17], [3]))).toEqual([3]);
  });
  it('shows nothing when nothing is in use, and never treasure or unused artefacts', () => {
    expect(fightGear(member([3, 10, 7, 12]))).toEqual([]);
    expect(fightGear(member([12, 7, 19], [7]))).toEqual([]);
  });
  it('leaves off a wielded weapon that adds nothing for the class', () => {
    expect(fightGear(member([3], [3], 'Dwarf'))).toEqual([]); // a Dwarf gets no Sword bonus
    expect(fightGear(member([17], [17], 'Dwarf'))).toEqual([17]); // but +3 from the Axe
    expect(fightGear(member([9], [9], 'Ogre'))).toEqual([]);
  });
  it('shows a worn Ring only for a class it helps, and not the Shield or Talisman', () => {
    expect(fightGear(member([10, 20, 7], [10, 20, 7]))).toEqual([10]);
    expect(fightGear(member([10], [10], 'Ogre'))).toEqual([]);
  });
});

describe('unusedGear', () => {
  const party = (creatureId: number): GameState => ({ party: [{ creatureId, status: 0, dragonKills: 0, treasure: [7] }] }) as unknown as GameState;
  it('mentions a Talisman a human carries without wearing, but not one an Ogre carries (humans and magic users only)', () => {
    expect(unusedGear(party(5))).toEqual(['Talisman (Man) carried, not worn']);
    expect(unusedGear(party(2))).toEqual([]);
  });
});
