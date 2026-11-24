import { describe, expect, it } from 'vitest';
import { TUTORIAL_SCRIPT } from './script';
import { PARTY_SCRIPT } from './partyScript';

const CARDS = [...PARTY_SCRIPT, ...TUTORIAL_SCRIPT];

describe('coach cards', () => {
  // Peter: the Coach never says what the next draw, fight or event will be.
  it('never announce what is coming', () => {
    const banned = /next (fight|card|draw|battle)|you will (meet|face|find|need)|will not need|ahead|about to (meet|face)|coming up|what comes next/i;
    for (const c of CARDS) expect(`${c.title} ${c.body}`, c.id).not.toMatch(banned);
  });

  // Beta readiness: there is no manual or general help, so the tutorial must not point at one.
  it('do not point at a manual, a Help button or How to Play', () => {
    for (const c of CARDS) expect(`${c.title} ${c.body}`, c.id).not.toMatch(/manual|help button|how to play/i);
  });

  it('do not name keyboard keys (Peter: no touch or keyboard controls)', () => {
    for (const c of CARDS) expect(c.body, c.id).not.toMatch(/\b(N|E|S|W|U|D) key|press its key/);
  });
});
