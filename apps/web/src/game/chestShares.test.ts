import { describe, it, expect } from 'vitest';
import { chestAction, chestRows, initialShares, assigned, shareSentence } from './chestShares';
import type { GameState } from '@sorcerers-cave/engine';

// Two members: a Giant (carry 150) holding a Silver (25 kg), and an Ogre (carry 100); a Chest on the floor.
const state = (extra: Partial<GameState['party'][number]> = {}) => ({
  phase: 'pickup', partyArea: 0, areas: [{ card: 31, coord: 0, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
  party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [1] }, { creatureId: 2, status: 0, dragonKills: 0, treasure: [], ...extra }],
}) as unknown as GameState;

describe('chest picker model', () => {
  it('limits each bearer to what they can carry beside their other load, in 25 kg steps', () => {
    const rows = chestRows(state(), { floor: 0 });
    expect(rows.map((r) => [r.mi, r.max])).toEqual([[0, 100], [1, 100]]);
    const loaded = chestRows(state({ treasure: [1, 1] }), { floor: 0 });
    expect(loaded[1]!.max).toBe(50);
  });
  it('counts an existing share out of a member\'s load when re-splitting', () => {
    const s = state({ chestShares: [{ chest: 1, kg: 75 }] });
    expect(chestRows(s, { chest: 1 })[1]!.base).toBe(0);
    expect(initialShares(s, { chest: 1 }, chestRows(s, { chest: 1 }))).toEqual({ 1: 75 });
  });
  it('builds the action from non-zero shares', () => {
    expect(chestAction({ floor: 0 }, { 0: 50, 1: 50, 2: 0 })).toEqual({ type: 'setChestShares', source: { floor: 0 }, shares: [{ mi: 0, kg: 50 }, { mi: 1, kg: 50 }] });
    expect(assigned({ 0: 50, 1: 25 })).toBe(75);
  });
  it('reads a share aloud', () => {
    expect(shareSentence(50, [{ label: 'Ogre', kg: 50 }])).toBe('Bearing 50 kg of the Treasure Chest, shared with Ogre (50 kg).');
  });
});
