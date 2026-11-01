import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { newGame, type GameState } from '@sorcerers-cave/engine';
import { ChamberPickup } from './ChamberPickup';

const pickup = (picks: number[], treasures: number[], over: Partial<GameState> = {}): GameState =>
  ({ ...newGame(1, picks), phase: 'pickup', treasures, ...over });

describe('ChamberPickup', () => {
  it('shows each treasure with a button per member who can carry it', () => {
    const d = vi.fn();
    render(<ChamberPickup state={pickup([5, 6], [1])} dispatch={d} cards={[]} />); // Gold
    expect(screen.getByLabelText('Gold')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^give to/i })[0]!);
    expect(d).toHaveBeenCalledWith(expect.objectContaining({ type: 'takeTreasure', ti: 0 }));
  });

  it('words the Lost Ruby as wresting it from the guardian statue', () => {
    const { container } = render(<ChamberPickup state={pickup([0], [11])} dispatch={() => {}} cards={[]} />);
    expect(container.querySelector('.scv-enc-guard')).not.toBeNull();
    expect(screen.getByRole('button', { name: /wrests it from the statue/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^give to/i })).toBeNull();
  });

  it('SC-11-47: a freed Lost Ruby reads as an ordinary pickup', () => {
    const { container } = render(<ChamberPickup state={pickup([0], [11], { rubyFreed: true })} dispatch={() => {}} cards={[]} />);
    expect(container.textContent).not.toMatch(/guarded by a statue/i);
    expect(screen.getByRole('button', { name: /^give to/i })).toBeInTheDocument();
  });

  it('lists only what someone can carry, and nothing when nothing can be taken', () => {
    const { container, rerender } = render(<ChamberPickup state={pickup([5, 6], [14, 1])} dispatch={() => {}} cards={[]} />);
    expect(screen.queryByLabelText('Treasure Chest')).toBeNull(); // too heavy for anyone
    expect(screen.getByLabelText('Gold')).toBeInTheDocument();
    rerender(<ChamberPickup state={pickup([5, 6], [14])} dispatch={() => {}} cards={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists artifacts first, then treasure by points, highest first (artifacts too)', () => {
    // floor order: Silver 5, Magic Carpet (artifact), Gems 20, Magic Sword (artifact, 15), Gold 10
    render(<ChamberPickup state={pickup([5, 6], [0, 4, 2, 3, 1])} dispatch={() => {}} cards={[]} />);
    const names = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(names).toEqual(['Magic Sword', 'Magic Carpet', 'Gems', 'Gold', 'Silver']);
  });
});
