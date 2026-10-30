import { describe, it, expect } from 'vitest';
import { toggleLeft, toggleRight } from './shellState';

describe('shell slots', () => {
  it('switches between party and inventory in the one left slot', () => {
    expect(toggleLeft(null, 'party')).toBe('party');
    expect(toggleLeft('party', 'inventory')).toBe('inventory');
    expect(toggleLeft('inventory', 'inventory')).toBeNull();
  });

  it('keeps card, settings and test exclusive in the right slot', () => {
    expect(toggleRight('card', 'settings')).toBe('settings');
    expect(toggleRight('settings', 'test')).toBe('test');
    expect(toggleRight('test', 'card')).toBe('card');
    expect(toggleRight('card', 'card')).toBeNull();
  });
});
