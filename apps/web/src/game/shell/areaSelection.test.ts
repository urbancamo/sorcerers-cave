import { describe, it, expect } from 'vitest';
import { newGame, type GameState } from '@sorcerers-cave/engine';
import type { Area } from '../../view/ports';
import type { TileArt } from '../../data/manifest';
import { arrivalSelection } from './areaSelection';

const tiles = [{ tileId: 's9-1', file: '/t/chasm.png' }] as TileArt[];
const here = { name: 'The Chasm', tileId: 's9-1', rot: 90 } as Area;
const withSpecial = (n: number): GameState => {
  const s = newGame(1, [0]);
  s.areas[0] = { ...s.areas[0]!, card: 16 | (n << 7) };
  return s;
};

describe('arrivalSelection', () => {
  it('selects the area card on arrival at a special chamber, with its art as laid', () => {
    expect(arrivalSelection(withSpecial(6), here, tiles)).toEqual({ kind: 'area', index: 0, name: 'The Chasm', file: '/t/chasm.png', rot: 90 });
  });
  it('selects nothing at the Gateway or an ordinary chamber', () => {
    expect(arrivalSelection(newGame(1, [0]), here, tiles)).toBeNull();
  });
  it('still selects it when the art is missing', () => {
    expect(arrivalSelection(withSpecial(7), { ...here, tileId: 'nope' } as Area, tiles)).toMatchObject({ kind: 'area', file: null });
  });
});
