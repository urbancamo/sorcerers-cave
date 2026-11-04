import { describe, it, expect } from 'vitest';
import { sameSelection } from './sameSelection';
import type { Selected } from './CardPanel';
import type { Card } from '../../view/ports';
import type { ViewPartyMember } from '../../view/cave3d';

const card = (id: string): Card => ({ id, name: id, category: 'creature', file: `${id}.png` });
const member = (label: string) => ({ label, name: label, sig: label[0] } as unknown as ViewPartyMember);
const asCard = (id: string, where = 'here'): Selected => ({ kind: 'card', card: card(id), where });

describe('sameSelection', () => {
  it('knows the same card again, however it was reached', () => {
    expect(sameSelection(asCard('s01-3'), asCard('s01-3', 'elsewhere'))).toBe(true);
  });
  it('tells two different cards apart', () => {
    expect(sameSelection(asCard('s01-3'), asCard('s01-4'))).toBe(false);
  });
  it('matches an area by its index, a member by its label, an item by its place in the inventory', () => {
    expect(sameSelection({ kind: 'area', index: 4, name: 'a', file: null, rot: 0 }, { kind: 'area', index: 4, name: 'b', file: 'x', rot: 1 })).toBe(true);
    expect(sameSelection({ kind: 'area', index: 4, name: 'a', file: null, rot: 0 }, { kind: 'area', index: 5, name: 'a', file: null, rot: 0 })).toBe(false);
    expect(sameSelection({ kind: 'member', member: member('Hero') }, { kind: 'member', member: member('Hero') })).toBe(true);
    expect(sameSelection({ kind: 'member', member: member('Hero') }, { kind: 'member', member: member('Man #2') })).toBe(false);
    const item = { name: 'Sword', file: null, weight: 0, artifact: true };
    const hero = member('Hero');
    expect(sameSelection({ kind: 'item', item, from: hero, at: { mi: 0, idx: 1 } }, { kind: 'item', item, from: hero, at: { mi: 0, idx: 1 } })).toBe(true);
    expect(sameSelection({ kind: 'item', item, from: hero, at: { mi: 0, idx: 1 } }, { kind: 'item', item, from: hero, at: { mi: 0, idx: 2 } })).toBe(false);
  });
  it('never matches across kinds, or against nothing', () => {
    expect(sameSelection(asCard('x'), { kind: 'area', index: 0, name: 'x', file: null, rot: 0 })).toBe(false);
    expect(sameSelection(null, asCard('x'))).toBe(false);
    expect(sameSelection(asCard('x'), null)).toBe(false);
  });
});
