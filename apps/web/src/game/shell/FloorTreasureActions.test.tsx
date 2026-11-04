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

  it('offers the guarded Lost Ruby as one drop-down of who wrests it from the statue, until it is freed (SC-11-47)', () => {
    const d = vi.fn();
    const { unmount } = render(<FloorTreasureActions state={pickup([5, 6], [11])} dispatch={d} card={card(11)} />);
    expect(screen.queryByRole('button', { name: /wrests it/i })).toBeNull();
    const list = screen.getByRole('combobox', { name: /wrest the lost ruby/i });
    expect(list.querySelectorAll('option').length).toBeGreaterThan(2); // the prompt, then each member who can try
    fireEvent.change(list, { target: { value: '1' } });
    expect(d).toHaveBeenCalledWith(expect.objectContaining({ type: 'takeTreasure', ti: 0, mi: 1 }));
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

// Treasure left in the chamber (parked, 200+id): once the pickup is over, the card explains why nobody can carry it.
describe('FloorTreasureActions — parked treasure outside a pickup', () => {
  const parked = (picks: number[], tid: number, over: Partial<GameState> = {}): GameState => {
    const s: GameState = { ...newGame(1, picks), ...over };
    s.areas[s.partyArea]!.contents = [200 + tid];
    return s;
  };

  it('says it is too heavy for anyone to carry', () => {
    render(<FloorTreasureActions state={parked([5, 6], 14)} dispatch={() => {}} card={card(14)} />);
    expect(screen.getByText('The Treasure Chest is too heavy for anyone to carry.')).toBeInTheDocument();
  });

  it("words a Giant-less Deep Pool's treasure as needing a Giant", () => {
    const s = parked([5, 6], 1);
    s.areas[s.partyArea]! = { ...s.areas[s.partyArea]!, card: 16 | (2 << 7), contents: [200 + 1] }; // Deep Pool
    render(<FloorTreasureActions state={s} dispatch={() => {}} card={card(1)} />);
    expect(screen.getByText('Only a Giant can lift the Gold from the pool.')).toBeInTheDocument();
  });

  it('says nothing for treasure someone could carry, a card not parked here, or a party that is down', () => {
    const { container, rerender } = render(<FloorTreasureActions state={parked([5, 6], 1)} dispatch={() => {}} card={card(1)} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<FloorTreasureActions state={parked([5, 6], 14)} dispatch={() => {}} card={card(2)} />);
    expect(container).toBeEmptyDOMElement();
    const down = parked([5], 14);
    down.party = down.party.map((m) => ({ ...m, status: 3 }));
    rerender(<FloorTreasureActions state={down} dispatch={() => {}} card={card(14)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
