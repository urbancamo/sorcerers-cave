import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HelpButton } from './HelpButton';
import { HelpProvider } from './HelpContext';
import { TitleBar } from '../game/shell/TitleBar';
import { SplashScreen } from '../game/SplashScreen';

describe('HelpButton', () => {
  it('opens its topics in a popover and closes with the button or Escape', () => {
    render(<HelpButton topics={['encounter-choices', 'reaction-roll']} label="Help with strangers" />);
    expect(screen.queryByTestId('help-popover')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Help with strangers' }));
    expect(screen.getByTestId('help-popover')).toHaveTextContent(/Withdraw/);
    expect(screen.getByTestId('help-popover')).toHaveTextContent(/The reaction roll/);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('help-popover')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Help with strangers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close help' }));
    expect(screen.queryByTestId('help-popover')).toBeNull();
  });

  it('renders nothing when every topic is switched off or unknown', () => {
    const { container } = render(<HelpProvider variants={{}}><HelpButton topics={['rc-overview', 'no-such-topic']} /></HelpProvider>);
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves out house-rule wording the game does not use', () => {
    const { rerender } = render(<HelpProvider variants={{}}><HelpButton topics={['fight-surprise']} /></HelpProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByTestId('help-popover')).not.toHaveTextContent(/on purpose/);
    rerender(<HelpProvider variants={{ trapRules: true }}><HelpButton topics={['fight-surprise']} /></HelpProvider>);
    expect(screen.getByTestId('help-popover')).toHaveTextContent(/on purpose/);
  });
});

describe('no general help', () => {
  it('has no Help icon on the title bar', () => {
    render(<TitleBar left={null} right={null} testMode={false} onLeft={() => {}} onRight={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
  });

  it('has no How to Play button or nudge on the splash screen', () => {
    render(<SplashScreen onStartSolitaire={() => {}} />);
    expect(screen.queryByRole('button', { name: /how to play/i })).toBeNull();
    expect(screen.queryByTestId('howto-nudge')).toBeNull();
    expect(screen.queryByText(/read how to play/i)).toBeNull();
  });
});

describe('phase 3: house rules and the revised combat', () => {
  it('tags every revised-combat step for the revised fight screen, and only when that rule is on', async () => {
    const { topicsForScreen } = await import('./index');
    const ids = topicsForScreen('fight-revised', { combatRevision: true }).map((t) => t.id);
    for (const id of ['rc-overview', 'rc-scroll', 'rc-front-line', 'rc-pairing', 'rc-extras', 'rc-tags', 'rc-look', 'rc-roll']) expect(ids).toContain(id);
    expect(topicsForScreen('fight-revised', {}).map((t) => t.id)).not.toContain('rc-scroll');
  });

  it('gives the Sorcerer, trap and dead-end screens their own rule only when it is on', async () => {
    const { topicsForScreen } = await import('./index');
    expect(topicsForScreen('sorcerer', { sorcererTeleport: true }).map((t) => t.id)).toEqual(['house-sorcerer-terms']);
    expect(topicsForScreen('sorcerer', {})).toEqual([]);
    expect(topicsForScreen('trap', { trapRules: true }).map((t) => t.id)).toEqual(['house-standing-traps']);
    expect(topicsForScreen('explore', { forcedRedraw: true }).map((t) => t.id)).toContain('house-dead-end');
    expect(topicsForScreen('explore', {}).map((t) => t.id)).not.toContain('house-dead-end');
  });

  it('lists in the overview only the house rules in force, and nothing when none are', () => {
    const { unmount } = render(<HelpProvider variants={{ trapRules: true, combatRevision: true }}><HelpButton topics={['house-overview']} /></HelpProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const pop = screen.getByTestId('help-popover');
    expect(pop).toHaveTextContent(/Standing traps/);
    expect(pop).toHaveTextContent(/revised combat/);
    expect(pop).not.toHaveTextContent(/Dead End rule/);
    expect(pop).not.toHaveTextContent(/Sorcerer's terms/);
    unmount();
    const { container } = render(<HelpProvider variants={{ extensionKit: true }}><HelpButton topics={['house-overview']} /></HelpProvider>);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens a popover upward when asked', () => {
    render(<HelpButton topics={['rc-scroll']} up />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByTestId('help-popover')).toHaveClass('up');
  });
});

describe('phase 4: party, inventory, scoring, tooltips', () => {
  it('has help for each of the new screens', async () => {
    const { topicsForScreen, briefForCard } = await import('./index');
    expect(topicsForScreen('party-select').map((t) => t.id)).toEqual(expect.arrayContaining(['party-budget', 'kit-overview', 'sibyl-overview']));
    expect(topicsForScreen('inventory').map((t) => t.id)).toEqual(['inventory-status', 'item-actions']);
    expect(topicsForScreen('pickup').map((t) => t.id)).toEqual(['pickup-capacity']);
    expect(topicsForScreen('game-over').map((t) => t.id)).toEqual(expect.arrayContaining(['scoring', 'score-curse', 'score-bounty', 'all-or-nothing']));
    expect(briefForCard('creature', 'Dwarf')).toMatch(/trap/);
  });

  it('gives the title-bar icons descriptive tooltips while keeping their short names', () => {
    render(<TitleBar left={null} right={null} testMode={false} onLeft={() => {}} onRight={() => {}} />);
    const party = screen.getByRole('button', { name: 'Party' });
    expect(party).toHaveAttribute('title', expect.stringMatching(/^Party — /));
  });

  it('hides the sibyl and kit overviews in a game that has neither, but shows them with no game', async () => {
    const { topicsForScreen } = await import('./index');
    expect(topicsForScreen('party-select', {}).map((t) => t.id)).toEqual(['party-budget']);
    expect(topicsForScreen('party-select').length).toBe(3);
  });
});

describe('phase 5: multiplayer', () => {
  it('has help for every multiplayer screen', async () => {
    const { topicsForScreen } = await import('./index');
    const ids = (s: Parameters<typeof topicsForScreen>[0]) => topicsForScreen(s).map((t) => t.id);
    expect(ids('mp-setup')).toEqual(['mp-create-join']);
    expect(ids('mp-lobby')).toEqual(expect.arrayContaining(['mp-options', 'mp-opt-fog', 'mp-opt-concurrent']));
    expect(ids('mp-draft')).toEqual(['mp-draft']);
    expect(ids('mp-play')).toEqual(expect.arrayContaining(['mp-turns', 'mp-chat', 'mp-meeting', 'mp-leave-vs-abandon']));
    expect(ids('mp-standings')).toEqual(expect.arrayContaining(['mp-finish', 'mp-standings']));
    expect(ids('mp-trade')).toEqual(['mp-trade']);
    expect(ids('mp-pvp')).toEqual(['mp-pvp']);
    expect(ids('mp-union')).toEqual(['mp-union']);
  });

  it('notes the multiplayer secret-door rule on the secret door topic', async () => {
    const { topicById } = await import('./index');
    expect(JSON.stringify(topicById('area-secret-door'))).toMatch(/personal in a shared cave/);
  });
});
