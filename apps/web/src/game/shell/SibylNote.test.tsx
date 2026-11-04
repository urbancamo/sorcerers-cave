import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { newGame, C_SIBYL, type GameState } from '@sorcerers-cave/engine';
import { SibylNote } from './SibylNote';

const sibylCard = { id: 'c-21', name: 'Sibyl', category: 'creature' as const, entityId: String(C_SIBYL), file: '' };
const state = (over: Partial<GameState> = {}): GameState => ({ ...newGame(1, [5, 6]), ...over });

describe('SibylNote', () => {
  it('says she was found indifferent once she has been tested and has not joined', () => {
    render(<SibylNote state={state({ sibylMet: true })} card={sibylCard} />);
    expect(screen.getByTestId('sibyl-indifferent')).toHaveTextContent(/indifferent/i);
  });

  it('says nothing before she is tested', () => {
    render(<SibylNote state={state()} card={sibylCard} />);
    expect(screen.queryByTestId('sibyl-indifferent')).toBeNull();
  });

  it('says nothing once she travels with the party', () => {
    render(<SibylNote state={state({ sibylMet: true, hasSibyl: true })} card={sibylCard} />);
    expect(screen.queryByTestId('sibyl-indifferent')).toBeNull();
  });

  it('says nothing on any other card', () => {
    render(<SibylNote state={state({ sibylMet: true })} card={{ ...sibylCard, entityId: '3' }} />);
    expect(screen.queryByTestId('sibyl-indifferent')).toBeNull();
  });
});
