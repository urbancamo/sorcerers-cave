import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { DIR_S } from "./coords";

/**
 * Movement, dead ends and secret doors, checked against the Consolidated Rules V2 (§Exploring the Cave, §Starting a New Level,
 * §Secret doors). Clause list: docs/validation/clauses/movement.md. R-31 is open and asserted with `it.fails`.
 */
describe('Exploring the Cave: a dead end', () => {
  it('"he places the card face down and leaves his party where it is"', () => {
    const s = makeState({ largePack: [12], largeIdx: 0, turn: 1 });
    const { state } = reduce(s, { type: 'move', dir: DIR_S });
    expect(state.partyArea).toBe(s.partyArea);
    expect(state.areas.at(-1)!.faceUp).toBe(false);
    expect(state.largeIdx).toBe(1);
  });
  // R-31: the book's (*) makes the dead end the end of the turn; the engine does not count a turn.
  it.fails('R-31: the dead end uses up the turn', () => {
    const { state } = reduce(makeState({ largePack: [12], largeIdx: 0, turn: 1 }), { type: 'move', dir: DIR_S });
    expect(state.turn).toBe(2);
  });
});

describe('Exploring the Cave: leaving the cave', () => {
  it('a stairway up from the first level is an exit, and the game ends in escape', () => {
    const { state } = reduce(makeState(), { type: 'exitCave' });
    expect(state.phase).toBe('gameOver');
  });
});
