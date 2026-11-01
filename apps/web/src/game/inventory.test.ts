import { describe, it, expect } from 'vitest';
import { newGame, type GameState } from '@sorcerers-cave/engine';
import { inventoryRows, artifactState } from './inventory';

const HERO = 0, DWARF = 7, WIZARD = 8;
const T = { silver: 0, sword: 3, carpet: 4, lotus: 5, flute: 12, shield: 20 };

const game = (carriers: [number, number[]][], over: Partial<GameState> = {}): GameState => {
  const s = newGame(1, [HERO]); // any valid pick: the party is replaced below
  s.party = carriers.map(([creatureId, treasure]) => ({ creatureId, status: 0, dragonKills: 0, treasure }));
  return { ...s, ...over };
};

describe('inventory', () => {
  it('lists each item with its carrier', () => {
    const rows = inventoryRows(game([[HERO, [T.sword]], [DWARF, [T.silver]]]));
    expect(rows.map((r) => [r.name, r.carrier])).toEqual([['Magic Sword', 'Hero'], ['Silver', 'Dwarf']]);
  });

  it('shows treasure as gray with a text tag', () => {
    const [r] = inventoryRows(game([[HERO, [T.silver]]]));
    expect(r).toMatchObject({ color: 'gray', tag: 'treasure only' });
  });

  it('shows a class that cannot use an active artifact as gray', () => {
    const [r] = inventoryRows(game([[HERO, [T.carpet]]]));
    expect(r).toMatchObject({ color: 'gray', tag: 'carrier cannot use' });
  });

  it('shows an active artifact its carrier can use but not now as yellow, and green once the action is offered', () => {
    const s = game([[WIZARD, [T.carpet]]]);
    expect(artifactState(s, 0, T.carpet, new Set())).toEqual({ color: 'yellow', tag: 'not usable now' });
    expect(artifactState(s, 0, T.carpet, new Set([T.carpet]))).toEqual({ color: 'green', tag: 'usable now' });
  });

  it('exploring with a Wizard carrying the carpet makes it green (the carpet is a legal action)', () => {
    const [r] = inventoryRows(game([[WIZARD, [T.carpet]]]));
    expect(r!.color).toBe('green');
  });

  it('shows passive and wielded items as yellow, and a shield on the wrong carrier as gray', () => {
    const s = game([[HERO, [T.sword]], [DWARF, [T.shield]]]);
    s.party[0]!.borne = [T.sword];
    const rows = inventoryRows(s);
    expect(rows[0]).toMatchObject({ color: 'yellow', tag: 'wielded' });
    expect(rows[1]).toMatchObject({ color: 'gray', tag: 'inert for this carrier' });
  });

  it('shows a carrier who cannot act as gray', () => {
    const s = game([[WIZARD, [T.carpet]]]);
    s.party[0]!.status = 2;
    expect(inventoryRows(s)[0]).toMatchObject({ color: 'gray', tag: 'carrier cannot act' });
  });

  it('leaves out the fallen', () => {
    const s = game([[HERO, [T.sword]]]);
    s.party[0]!.status = 3;
    expect(inventoryRows(s)).toEqual([]);
  });
});
