import { describe, it, expect } from 'vitest';
import { cardText } from './cardText';

describe('cardText', () => {
  it('writes artifact wording from the manual', () => {
    expect(cardText('artifact', 'Strength Potion')).toMatch(/\+2 for one fight/);
  });

  it('builds creature wording from the engine numbers', () => {
    expect(cardText('creature', 'Dragon')).toMatch(/^Fighting strength \d+/);
  });

  it('describes heavy treasure from its weight and points', () => {
    expect(cardText('treasure', 'Silver')).toBe('Heavy treasure (25 kg), worth 5 points.');
  });

  it('has nothing to say about hazards or unknown names', () => {
    expect(cardText('hazard', 'Pit')).toBeNull();
    expect(cardText('creature', 'Nobody')).toBeNull();
  });
});
