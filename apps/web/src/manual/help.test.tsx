import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HelpButton } from './HelpButton';
import { HelpProvider } from './HelpContext';
import { HelpBrowser } from './HelpBrowser';
import { HelpModal } from './HelpModal';
import { markNudgeSeen, nudgeSeen } from './nudge';
import { HelpPanel } from '../game/shell/HelpPanel';
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

describe('HelpBrowser and panel', () => {
  it('leads with help for the screen, then the manual sections', () => {
    render(<HelpPanel screens={['encounter']} flags={{}} />);
    expect(screen.getByTestId('help-here')).toHaveTextContent(/Meeting strangers/);
    expect(screen.getByText('The manual')).toBeInTheDocument();
    expect(screen.getByText('Hazards')).toBeInTheDocument();
  });

  it('shows only the sections and rules in force', () => {
    const { unmount } = render(<HelpBrowser screens={['explore']} flags={{}} />);
    expect(screen.queryByText('The Whirlpool')).toBeNull();
    unmount();
    render(<HelpBrowser screens={['explore']} flags={{ extensionKit: true }} />);
    expect(screen.getByText('The Whirlpool')).toBeInTheDocument();
  });

  it('searches the whole manual', () => {
    render(<HelpBrowser screens={['explore']} />);
    fireEvent.change(screen.getByLabelText('Search the manual'), { target: { value: 'medusa' } });
    expect(screen.getByTestId('help-results')).toHaveTextContent('Medusa');
    expect(screen.queryByTestId('help-here')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search the manual'), { target: { value: 'qqqqzz' } });
    expect(screen.getByText('Nothing found.')).toBeInTheDocument();
  });
});

describe('title bar Help icon', () => {
  it('toggles the help slot', () => {
    const onRight = vi.fn();
    render(<TitleBar left={null} right="help" testMode={false} onLeft={() => {}} onRight={onRight} />);
    const b = screen.getByRole('button', { name: 'Help' });
    expect(b).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(b);
    expect(onRight).toHaveBeenCalledWith('help');
  });
});

describe('first-run How to play nudge', () => {
  beforeEach(() => localStorage.clear());
  const splash = () => render(<SplashScreen onStartSolitaire={() => {}} />);

  it('is offered once, opens the help modal, and is then remembered', () => {
    expect(nudgeSeen()).toBe(false);
    splash();
    fireEvent.click(within(screen.getByTestId('howto-nudge')).getByRole('button', { name: 'How to play' }));
    expect(screen.getByTestId('help-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('howto-nudge')).toBeNull();
    expect(nudgeSeen()).toBe(true);
  });

  it('can be dismissed, and does not return on the next visit', () => {
    const { unmount } = splash();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('howto-nudge')).toBeNull();
    unmount();
    splash();
    expect(screen.queryByTestId('howto-nudge')).toBeNull();
  });

  it('stays out of the way once seen, but How to Play is always available', () => {
    markNudgeSeen();
    splash();
    expect(screen.queryByTestId('howto-nudge')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'How to Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close help' }));
    expect(screen.queryByTestId('help-modal')).toBeNull();
  });

  it('the modal closes on Escape', () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
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
    expect(screen.getByRole('button', { name: 'Help' })).toHaveAttribute('title', expect.stringMatching(/whole manual/));
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

  it('the modal shows help for the screens it is given, under the game\'s options', () => {
    render(<HelpModal title="Help" screens={['mp-trade']} flags={{}} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByTestId('help-here')).toHaveTextContent(/Trading/);
    // a multiplayer game has none of the solo house rules or kit content unless the kit is on
    expect(screen.queryByText('The Whirlpool')).toBeNull();
  });

  it('notes the multiplayer secret-door rule on the secret door topic', async () => {
    const { topicById } = await import('./index');
    expect(JSON.stringify(topicById('area-secret-door'))).toMatch(/personal in a shared cave/);
  });
});
