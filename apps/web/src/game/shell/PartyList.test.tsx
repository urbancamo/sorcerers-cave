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
