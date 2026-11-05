import { describe, expect, it } from 'vitest';
import type { PartyMember } from '@sorcerers-cave/engine';
import { fightGear } from './wielding';

const member = (treasure: number[], borne?: number[]) => ({ creatureId: 0, status: 0, treasure, borne }) as unknown as PartyMember;

describe('fightGear', () => {
  it('hides a carried weapon but shows a wielded one', () => {
    expect(fightGear(member([3, 17], [3]))).toEqual([3]);
  });
  it('shows nothing wieldable when nothing is in use, and keeps other items', () => {
    expect(fightGear(member([3, 10, 7, 12]))).toEqual([12]);
  });
});
