import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PartyList, type PartyRowFight } from './PartyList';
import type { ViewPartyMember } from '../../view/cave3d';

const member = (over: Partial<ViewPartyMember> = {}): ViewPartyMember => ({
  sig: 'H', name: 'Hero', label: 'Hero', partyIndex: 0, card: null, items: [], awards: [], dragonCard: null,
  carry: 50, load: 10, fs: 5, mp: 0, charisma: false, ally: false, petrified: false, stoneArea: null, ...over,
});
const fightRow = (over: Partial<PartyRowFight> = {}): PartyRowFight => ({ strength: 5, caster: false, selected: false, dim: false, ...over });

describe('PartyList', () => {
  it('lists every member with load and a badge for allies', () => {
    render(<PartyList members={[member(), member({ label: 'Wizard', name: 'Wizard', sig: 'W', partyIndex: 1, ally: true })]} />);
    expect(screen.getAllByText('10/50 kg · 40 free')).toHaveLength(2);
    expect(screen.getByText('ally')).toBeInTheDocument();
  });

  it('offers to expand from its heading only when wired (not in a fight), and says which way it will go', () => {
    const onToggleExpand = vi.fn();
    const { rerender } = render(<PartyList members={[member()]} />);
    expect(screen.queryByRole('button', { name: /party view/ })).toBeNull();
    rerender(<PartyList members={[member()]} onToggleExpand={onToggleExpand} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand the party view' }));
    expect(onToggleExpand).toHaveBeenCalledOnce();
    rerender(<PartyList members={[member()]} expanded onToggleExpand={onToggleExpand} />);
    expect(screen.getByRole('button', { name: 'Collapse the party view' })).toBeInTheDocument();
  });

  it('expanded, the same panel widens and shows each member\'s strength, magic and charisma', () => {
    render(<PartyList expanded onToggleExpand={() => {}}
                      members={[member({ fs: 5, mp: 0, charisma: true }), member({ label: 'Priest', name: 'Priest', sig: 'P', partyIndex: 1, fs: 2, mp: 2 })]} />);
    expect(screen.getByLabelText('Party')).toHaveClass('expanded');
    expect(screen.getByText('Strength 5 · Charisma')).toBeInTheDocument();
    expect(screen.getByText('Strength 2 · Magic 2')).toBeInTheDocument();
  });

  it('expanded, totals the printed strength and magic of those able to fight', () => {
    render(<PartyList expanded onToggleExpand={() => {}}
                      members={[member({ fs: 5 }), member({ label: 'Priest', partyIndex: 1, fs: 2, mp: 2 }),
                                member({ label: 'Man', partyIndex: 2, fs: 3, petrified: true }),
                                member({ label: 'The Sibyl', partyIndex: 3, fs: 0, sibyl: true })]} />);
    // the petrified Man and the Sibyl add nothing
    expect(screen.getByTestId('pl-total')).toHaveTextContent('2 able to fight · strength 7 · magic 2');
  });

  it('collapsed, shows neither the stats nor the total', () => {
    render(<PartyList members={[member()]} onToggleExpand={() => {}} />);
    expect(screen.getByLabelText('Party')).not.toHaveClass('expanded');
    expect(screen.queryByText(/^Strength/)).toBeNull();
    expect(screen.queryByTestId('pl-total')).toBeNull();
  });

  it('reports a tapped member when browsing', () => {
    const onSelect = vi.fn();
    render(<PartyList members={[member()]} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Hero'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ label: 'Hero' }));
  });

  it('in a fight shows strength, a caption and the selection, and a tap both picks and shows the card', () => {
    const onPick = vi.fn(); const onSelect = vi.fn();
    render(<PartyList members={[member()]} onSelect={onSelect}
                      fight={new Map([[0, fightRow({ selected: true, caster: true, caption: 'in front', onPick })]])} />);
    const row = screen.getByTestId('rev-free-0');
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).toHaveTextContent('5 ✦');
    expect(row).toHaveTextContent('in front');
    fireEvent.click(row);
    expect(onPick).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
