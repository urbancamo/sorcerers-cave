import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ExitPanel } from './ExitPanel';

describe('ExitPanel — save', () => {
  it('offers Save only when a handler is given', () => {
    const onSave = vi.fn();
    const { rerender } = render(<ExitPanel />);
    expect(screen.queryByRole('button', { name: 'Save game' })).toBeNull();
    rerender(<ExitPanel onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }));
    expect(onSave).toHaveBeenCalledOnce();
  });
});

describe('ExitPanel', () => {
  it('offers Abandon only when a handler is given, and asks before acting', () => {
    const onAbandon = vi.fn();
    const { rerender } = render(<ExitPanel />);
    expect(screen.queryByRole('button', { name: /Abandon/ })).toBeNull();
    rerender(<ExitPanel onAbandon={onAbandon} />);
    fireEvent.click(screen.getByRole('button', { name: /Abandon/ }));
    expect(onAbandon).not.toHaveBeenCalled(); // a second tap is required: it ends the game
    expect(screen.getByTestId('confirm-prompt')).toHaveTextContent(/do not escape/);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onAbandon).toHaveBeenCalledOnce();
  });

  it('lets the player back out', () => {
    const onAbandon = vi.fn();
    render(<ExitPanel onAbandon={onAbandon} />);
    fireEvent.click(screen.getByRole('button', { name: /Abandon/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onAbandon).not.toHaveBeenCalled();
  });
});
