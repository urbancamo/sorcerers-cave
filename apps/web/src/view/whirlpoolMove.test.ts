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

describe('whirlpoolMove — the Viper Pit shows its dice first too', () => {
  it('treats a crossing that rolled per member as a dice-first move, nobody dragged down', () => {
    expect(whirlpoolMove([{ type: 'viperPit', rolls: [{ creatureId: 0, roll: 4, died: false }] }])).toEqual({ dragged: false });
  });
});
