import { describe, it, expect } from 'vitest';
import { newGame, type GameState } from '@sorcerers-cave/engine';
import { describeArea, chamberName } from './areaText';

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

describe('chamberName', () => {
  const special = (n: number): GameState => {
    const s = base();
    s.areas[1] = { ...s.areas[1]!, card: 16 | (n << 7) };
    return s;
  };
  it('names a special chamber, so the action bar can be headed with it', () => {
    expect(chamberName(special(6), 1)).toBe('The Chasm');
    expect(chamberName(special(7), 1)).toBe('The Bell Rope');
    expect(chamberName(special(11), 1)).toBe('The Well');
    expect(chamberName(special(2), 1)).toBe('Deep Pool');
  });
  it('has no name for the Gateway, an ordinary chamber or a tunnel', () => {
    expect(chamberName(base(), 0)).toBeNull();   // the Gateway
    expect(chamberName(base(), 1)).toBeNull();   // a plain chamber
  });
});
