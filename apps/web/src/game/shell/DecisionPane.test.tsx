import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { newGame, type GameState } from '@sorcerers-cave/engine';
import { DecisionPane } from './DecisionPane';

vi.mock('../../data/manifest', () => ({
  resolveCard: (cat: string, id: number) => (cat === 'creature' ? { file: `/c${id}.png` } : null),
}));

const encounter = (): GameState => ({ ...newGame(1, [5, 6]), phase: 'encounter', strangers: [5] });
const pickup = (): GameState => ({ ...newGame(1, [5, 6]), phase: 'pickup', treasures: [1] }); // Gold

describe('DecisionPane — what the player is looking at', () => {
  const label = (s: GameState) => {
    render(<DecisionPane state={s} dispatch={() => {}} cards={[]} verbose={false} />);
    return screen.getByRole('heading', { level: 2 }).textContent;
  };

  it('is an Encounter when strangers (or a special chamber) must be dealt with', () => {
    expect(label(encounter())).toBe('Encounter');
  });

  it('is Treasure for a heavy pickup', () => {
    expect(label(pickup())).toBe('Treasure');
  });

  it('is an Artifact when only artefacts lie on the floor', () => {
    expect(label({ ...newGame(1, [5, 6]), phase: 'pickup', treasures: [3] })).toBe('Artifact'); // Magic Sword
  });

  it('is Treasure when artefacts lie among heavy treasure', () => {
    expect(label({ ...newGame(1, [5, 6]), phase: 'pickup', treasures: [3, 1] })).toBe('Treasure');
  });

  it('is the Medusa pause while she looms', () => {
    expect(label({ ...newGame(1, [5, 6]), phase: 'medusa' })).toBe('Medusa');
  });
});

describe('DecisionPane', () => {
  it('puts the chamber, the strangers and the choices in one pane at the right', () => {
    render(<DecisionPane state={encounter()} dispatch={() => {}} cards={[]} verbose={false} />);
    const pane = screen.getByTestId('decision-pane');
    expect(pane).toHaveClass('scv-slot-right');
    expect(screen.getByTestId('decision-where')).toBeInTheDocument(); // the words for where the party stands
    expect(screen.getByAltText('Man card')).toBeInTheDocument(); // the stranger's card
    expect(screen.getByRole('button', { name: /test reaction/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /attack/i })).toBeInTheDocument();
  });

  it('dispatches the chosen action', () => {
    const d = vi.fn();
    render(<DecisionPane state={encounter()} dispatch={d} cards={[]} verbose={false} />);
    fireEvent.click(screen.getByRole('button', { name: /withdraw/i }));
    expect(d).toHaveBeenCalledWith({ type: 'withdraw' });
  });

  it('a pickup is decided in the same pane: give the treasure, or leave it', () => {
    const d = vi.fn();
    render(<DecisionPane state={pickup()} dispatch={d} cards={[]} verbose={false} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^give to/i })[0]!);
    expect(d).toHaveBeenCalledWith(expect.objectContaining({ type: 'takeTreasure' }));
    fireEvent.click(screen.getByRole('button', { name: /leave the treasure/i }));
    expect(d).toHaveBeenCalledWith({ type: 'leaveTreasure' });
  });

  it('shows nothing when there is no decision to make', () => {
    const { container } = render(<DecisionPane state={newGame(1, [5, 6])} dispatch={() => {}} cards={[]} verbose={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing, and leaves a pickup alone, when the only choice is to leave (the panel skips it itself)', () => {
    const d = vi.fn();
    const tooHeavy: GameState = { ...newGame(1, [7]), phase: 'pickup', treasures: [2] }; // Gems, and the lone Dwarf is already full
    tooHeavy.party[0]!.treasure = [0];
    const { container } = render(<DecisionPane state={tooHeavy} dispatch={d} cards={[]} verbose={false} />);
    expect(container.querySelector('[data-testid="decision-pane"]')).toBeNull();
  });
});
