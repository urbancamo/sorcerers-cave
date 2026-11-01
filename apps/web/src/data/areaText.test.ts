import { describe, it, expect } from 'vitest';
import { newGame, type GameState } from '@sorcerers-cave/engine';
import { describeArea } from './areaText';

// area 0 is the Gateway start; build a plain second area by hand.
const base = (): GameState => {
  const s = newGame(1, [0]);
  s.areas = [s.areas[0]!, { ...s.areas[0]!, card: 31, faceUp: true, flags: 0, contents: [] }];
  return s;
};

describe('describeArea', () => {
  it('says fogged areas are unexplored, in either voice', () => {
    const s = base(); s.areas[1]!.faceUp = false;
    expect(describeArea(s, 1, false)).toBe('You have not yet explored that area.');
    expect(describeArea(s, 1, true)).toBe('You have not yet explored that area.');
  });
  it('words an empty chamber tersely and in story voice', () => {
    const s = base();
    expect(describeArea(s, 1, false)).toMatch(/^Chamber — north, east, south, west/);
    expect(describeArea(s, 1, true)).toBe('A chamber, with exits north, east, south and west.');
  });
  it('mentions a parked Demon', () => {
    const s = base(); s.areas[1]!.contents = [100 + 15];
    expect(describeArea(s, 1, false)).toMatch(/Demon/);
    expect(describeArea(s, 1, true)).toMatch(/Something evil lurks/);
  });
  it('recalls withdrawing from, or approaching, parked strangers', () => {
    const s = base(); s.areas[1]!.contents = [100 + 8, 100 + 6, 200 + 1];
    s.withdrewAreas = [1];
    expect(describeArea(s, 1, true)).toMatch(/guarding some .*You recall withdrawing from the entrance; they did not see you\./);
    s.withdrewAreas = []; s.indiffCounts = { 1: 1 };
    expect(describeArea(s, 1, true)).toMatch(/You recall approaching the strangers here .* indifferent to you\./);
  });
  it('always reads a special chamber in full', () => {
    const s = base(); s.areas[1]!.card = 16 | (9 << 7) | 15; // Whirlpool, NESW
    expect(describeArea(s, 1, false)).toMatch(/Dark water churns here/);
  });
});
