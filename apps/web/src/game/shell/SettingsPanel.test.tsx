import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { GameState } from '@sorcerers-cave/engine';
import { SettingsPanel } from './SettingsPanel';

const state = { level: 2, turn: 14, party: [0, 0, 0].map(() => ({ creatureId: 0, status: 0, dragonKills: 0, treasure: [] })), largePack: new Array(90), largeIdx: 2, curses: 0, sorcererKilled: false, bonusScore: 0, gs: 1, seed: 1, variants: {} } as unknown as GameState;

describe('SettingsPanel', () => {
  it('lists the game information vertically', () => {
    render(<SettingsPanel state={state} code="SY2A" kitActive />);
    const text = screen.getByLabelText('Settings').textContent ?? '';
    expect(text).toContain('SY2A');
    expect(text).toContain('Extension kit');
    expect(text).toContain('14');
    expect(text).toContain('88 / 90');
  });
});

describe('SettingsPanel — score so far', () => {
  const held = (treasure: number[]) => ({ ...state, gs: 1, bonusScore: 0, sorcererKilled: false, seed: 1, variants: {},
    party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure }] }) as unknown as GameState;

  it('shows what the party would score if the expedition ended now', () => {
    render(<SettingsPanel state={held([])} kitActive={false} />);
    expect(screen.getByText('Score so far').nextSibling).toHaveTextContent(/^\d+$/);
  });

  it('flags a carried Idol instead of revealing its deferred roll', () => {
    render(<SettingsPanel state={held([18])} kitActive />);
    expect(screen.getByText('Score so far').nextSibling).toHaveTextContent(/ \+ Idol$/);
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
