import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { newGame, type GameState } from '@sorcerers-cave/engine';
import { FloorTreasureActions } from './FloorTreasureActions';

const pickup = (picks: number[], treasures: number[], over: Partial<GameState> = {}): GameState =>
  ({ ...newGame(1, picks), phase: 'pickup', treasures, ...over });
const card = (entityId: number, category: 'treasure' | 'artifact' | 'creature' = 'treasure') => ({ id: `t-${entityId}`, name: 'x', category, entityId: String(entityId), file: '' });

describe('FloorTreasureActions — what the treasure card on the floor offers', () => {
  it('gives the treasure to a member who can carry it', () => {
    const d = vi.fn();
    render(<FloorTreasureActions state={pickup([5, 6], [1])} dispatch={d} card={card(1)} />); // Gold
    fireEvent.click(screen.getAllByRole('button', { name: /^give to/i })[0]!);
    expect(d).toHaveBeenCalledWith(expect.objectContaining({ type: 'takeTreasure', ti: 0 }));
  });

  it('acts on the card that was clicked, not the first thing on the floor', () => {
    const d = vi.fn();
    render(<FloorTreasureActions state={pickup([5, 6], [14, 1])} dispatch={d} card={card(1)} />); // Chest then Gold
    fireEvent.click(screen.getAllByRole('button', { name: /^give to/i })[0]!);
    expect(d).toHaveBeenCalledWith(expect.objectContaining({ type: 'takeTreasure', ti: 1 }));
  });

  it('words the Lost Ruby as wresting it from the guardian statue, until it is freed (SC-11-47)', () => {
    const { unmount } = render(<FloorTreasureActions state={pickup([0], [11])} dispatch={() => {}} card={card(11)} />);
    expect(screen.getByRole('button', { name: /wrests it from the statue/i })).toBeInTheDocument();
    unmount();
    render(<FloorTreasureActions state={pickup([0], [11], { rubyFreed: true })} dispatch={() => {}} card={card(11)} />);
    expect(screen.getByRole('button', { name: /^give to/i })).toBeInTheDocument();
  });

  it('shows Give to… disabled, with the reason, when nobody can carry it', () => {
    const d = vi.fn();
    render(<FloorTreasureActions state={pickup([5, 6], [14])} dispatch={d} card={card(14)} />); // Treasure Chest: 100 kg
    const btn = screen.getByRole('button', { name: /give to/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/too heavy/i)).toBeInTheDocument();
    fireEvent.click(btn);
    expect(d).not.toHaveBeenCalled();
  });

  it('offers nothing for a stranger, a card not on the floor, or outside a pickup', () => {
    const { container, rerender } = render(<FloorTreasureActions state={pickup([5, 6], [1])} dispatch={() => {}} card={card(5, 'creature')} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<FloorTreasureActions state={pickup([5, 6], [1])} dispatch={() => {}} card={card(2)} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<FloorTreasureActions state={{ ...pickup([5, 6], [1]), phase: 'explore' }} dispatch={() => {}} card={card(1)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
