import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TitleBar } from './TitleBar';

const bar = (over = {}) => {
  const onLeft = vi.fn();
  const onRight = vi.fn();
  render(<TitleBar left={null} right={null} testMode={false} onLeft={onLeft} onRight={onRight} {...over} />);
  return { onLeft, onRight };
};

describe('TitleBar', () => {
  it('shows the title and the party, inventory, card and settings icons', () => {
    bar();
    expect(screen.getByText("SORCERER'S CAVE")).toBeInTheDocument();
    for (const name of ['Party', 'Inventory', 'Card panel', 'Settings']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('shows the T icon only in test mode', () => {
    bar();
    expect(screen.queryByRole('button', { name: 'Test panel' })).toBeNull();
  });

  it('shows the T icon when test mode is on', () => {
    bar({ testMode: true });
    expect(screen.getByRole('button', { name: 'Test panel' })).toBeInTheDocument();
  });

  it('reports presses and marks the active icon', () => {
    const { onLeft, onRight } = bar({ left: 'party', right: 'settings' });
    expect(screen.getByRole('button', { name: 'Party' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Inventory' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }));
    fireEvent.click(screen.getByRole('button', { name: 'Card panel' }));
    expect(onLeft).toHaveBeenCalledWith('inventory');
    expect(onRight).toHaveBeenCalledWith('card');
  });
});

describe('TitleBar in a fight', () => {
  it('turns the party and inventory icons off, leaving the right-hand icons', () => {
    bar({ inFight: true });
    expect(screen.getByRole('button', { name: 'Party' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Inventory' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Card panel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled();
  });
});
