import { describe, it, expect } from 'vitest';
import { newGame } from '@sorcerers-cave/engine';
import type { CardArt } from '../../data/manifest';
import { medusaSelection } from './medusaSelection';

const cards = [{ category: 'hazard', entityId: 3, name: 'Medusa', file: '/c/medusa.png' }] as unknown as CardArt[];

describe('medusaSelection', () => {
  it('selects the Medusa card at the Medusa pause', () => {
    const s = newGame(1, [0]);
    s.phase = 'medusa';
    expect(medusaSelection(s, cards, 'The Lair')).toMatchObject({ kind: 'card', where: 'The Lair', card: { category: 'hazard', name: 'Medusa' } });
  });
  it('selects nothing in any other phase', () => {
    expect(medusaSelection(newGame(1, [0]), cards, 'x')).toBeNull();
  });
});
