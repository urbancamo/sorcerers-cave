import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CardPanel } from './CardPanel';
import type { ViewPartyMember, ViewItem } from '../../view/cave3d';

const flute: ViewItem = { name: 'Charmed Flute', file: '/flute.png', weight: 0, artifact: true };
const member = { sig: 'W', name: 'Wizard', label: 'Wizard', card: '/wiz.png', items: [flute], awards: [], dragonCard: null,
  carry: 50, load: 0, fs: 1, mp: 3, charisma: false, ally: false, petrified: false, stoneArea: null } as ViewPartyMember;
const noop = () => {};

describe('CardPanel', () => {
  it('shows a floor card with its category, place and wording', () => {
    render(<CardPanel selected={{ kind: 'card', card: { id: 'x', name: 'Silver', category: 'treasure', file: '/s.png' }, where: 'Gold Hall' }} onItem={noop} onMember={noop} />);
    expect(screen.getByText('Treasure')).toBeInTheDocument();
    expect(screen.getByText('Silver')).toBeInTheDocument();
    expect(screen.getByText('Gold Hall')).toBeInTheDocument();
    expect(screen.getByText(/Heavy treasure \(25 kg\)/)).toBeInTheDocument();
  });

  it('shows a party member with mini-cards, and a mini-card opens that artifact', () => {
    const onItem = vi.fn();
    render(<CardPanel selected={{ kind: 'member', member }} onItem={onItem} onMember={noop} />);
    expect(screen.getByText(/Strength 1 · magic 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Charmed Flute' }));
    expect(onItem).toHaveBeenCalledWith(flute, member);
  });

  it('shows an artifact with its carrier and a way back to the member', () => {
    const onMember = vi.fn();
    render(<CardPanel selected={{ kind: 'item', item: flute, from: member }} onItem={noop} onMember={onMember} />);
    expect(screen.getByText(/carried by Wizard/)).toBeInTheDocument();
    expect(screen.getByText(/Lulls Dragons/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /← Wizard/ }));
    expect(onMember).toHaveBeenCalledWith(member);
  });

  it('describes the Sibyl without fighting numbers', () => {
    render(<CardPanel selected={{ kind: 'member', member: { ...member, name: 'Sibyl', label: 'Sibyl', sibyl: true, items: [] } }} onItem={noop} onMember={noop} />);
    expect(screen.getByText(/cannot fight, carry or be harmed/)).toBeInTheDocument();
    expect(screen.queryByText(/Strength/)).toBeNull();
  });
});

describe('CardPanel — area card', () => {
  it('shows the area name and the words it is given', () => {
    render(<CardPanel selected={{ kind: 'area', index: 3, name: 'Chamber' }} areaText="A chamber, with exits north." onItem={() => {}} onMember={() => {}} />);
    expect(screen.getByTestId('area-text')).toHaveTextContent('A chamber, with exits north.');
  });
});
