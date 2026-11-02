import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { GameState } from '@sorcerers-cave/engine';
import { SettingsPanel } from './SettingsPanel';

const state = { level: 2, turn: 14, party: [{}, {}, {}], largePack: new Array(90), largeIdx: 2, curses: 0, sorcererKilled: false } as unknown as GameState;

describe('SettingsPanel', () => {
  it('lists the game information vertically', () => {
    render(<SettingsPanel state={state} code="SY2A" kitActive />);
    const text = screen.getByLabelText('Settings').textContent ?? '';
    expect(text).toContain('SY2A');
    expect(text).toContain('Extension kit');
    expect(text).toContain('14');
    expect(text).toContain('88 / 90');
  });

  it('offers Save and Log only when handlers are given', () => {
    const onSave = vi.fn();
    const { rerender } = render(<SettingsPanel state={state} kitActive={false} />);
    expect(screen.queryByRole('button', { name: 'Save game' })).toBeNull();
    rerender(<SettingsPanel state={state} kitActive={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }));
    expect(onSave).toHaveBeenCalledOnce();
  });
});

describe('SettingsPanel — verbose descriptions', () => {
  it('toggles the option through onVerbose', () => {
    const onVerbose = vi.fn();
    render(<SettingsPanel state={state} kitActive={false} verbose={false} onVerbose={onVerbose} />);
    fireEvent.click(screen.getByLabelText('Verbose descriptions'));
    expect(onVerbose).toHaveBeenCalledWith(true);
  });
});

describe('SettingsPanel — abandon', () => {
  it('offers Abandon only when a handler is given, and asks before acting', () => {
    const onAbandon = vi.fn();
    const { rerender } = render(<SettingsPanel state={state} kitActive={false} />);
    expect(screen.queryByRole('button', { name: /Abandon/ })).toBeNull();
    rerender(<SettingsPanel state={state} kitActive={false} onAbandon={onAbandon} />);
    fireEvent.click(screen.getByRole('button', { name: /Abandon/ }));
    expect(onAbandon).not.toHaveBeenCalled(); // a second tap is required: it ends the game
    expect(screen.getByTestId('confirm-prompt')).toHaveTextContent(/do not escape/);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onAbandon).toHaveBeenCalledOnce();
  });

  it('lets the player back out', () => {
    const onAbandon = vi.fn();
    render(<SettingsPanel state={state} kitActive={false} onAbandon={onAbandon} />);
    fireEvent.click(screen.getByRole('button', { name: /Abandon/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onAbandon).not.toHaveBeenCalled();
  });
});
