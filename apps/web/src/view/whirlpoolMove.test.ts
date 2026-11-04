import { describe, it, expect } from 'vitest';
import { whirlpoolMove } from './whirlpoolMove';

describe('whirlpoolMove', () => {
  it('reports a drag', () => {
    expect(whirlpoolMove([{ type: 'whirlpoolRoll', roll: 1, dragged: true }])).toEqual({ dragged: true });
  });
  it('reports a safe wade, which still waits for its die', () => {
    expect(whirlpoolMove([{ type: 'whirlpoolRoll', roll: 5, dragged: false }])).toEqual({ dragged: false });
  });
  it('is null for any other move', () => {
    expect(whirlpoolMove([{ type: 'blocked' }])).toBeNull();
  });
});
