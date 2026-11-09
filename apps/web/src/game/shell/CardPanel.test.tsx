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

  it('shows the actions a floor card offers (such as who carries the treasure)', () => {
    render(<CardPanel selected={{ kind: 'card', card: { id: 'x', name: 'Silver', category: 'treasure', file: '/s.png' }, where: 'Gold Hall' }} onItem={noop} onMember={noop}
                      actions={<button type="button">Give to Dwarf</button>} />);
    expect(screen.getByRole('button', { name: 'Give to Dwarf' })).toBeInTheDocument();
  });

  describe('the chamber floor strip', () => {
    const dragon = { id: 'c1', name: 'Dragon', category: 'creature' as const, file: '/d.png' };
    const gold = { id: 't1', name: 'Gold', category: 'treasure' as const, file: '/g.png' };
    const sel = { kind: 'card' as const, card: dragon, where: 'Lair' };

    it('shows every card on the floor as a mini-card, with the enlarged one marked', () => {
      render(<CardPanel selected={sel} floor={[dragon, gold]} onFloor={() => {}} onItem={noop} onMember={noop} />);
      expect(screen.getByRole('button', { name: 'Dragon' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Gold' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('enlarges the card that is clicked', () => {
      const onFloor = vi.fn();
      render(<CardPanel selected={sel} floor={[dragon, gold]} onFloor={onFloor} onItem={noop} onMember={noop} />);
      fireEvent.click(screen.getByRole('button', { name: 'Gold' }));
      expect(onFloor).toHaveBeenCalledWith(gold);
    });

    it('shows no strip for a lone card, or for a card that is not on this chamber floor', () => {
      const { rerender } = render(<CardPanel selected={sel} floor={[dragon]} onFloor={() => {}} onItem={noop} onMember={noop} />);
      expect(screen.queryByLabelText('In this chamber')).toBeNull();
      rerender(<CardPanel selected={sel} floor={[gold, { ...gold, id: 't2' }]} onFloor={() => {}} onItem={noop} onMember={noop} />);
      expect(screen.queryByLabelText('In this chamber')).toBeNull();
    });
  });

  it('shows a party member with mini-cards, and a mini-card opens that artifact', () => {
    const onItem = vi.fn();
    render(<CardPanel selected={{ kind: 'member', member }} onItem={onItem} onMember={noop} />);
    expect(screen.getByText(/Strength 1 · magic 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Charmed Flute' }));
    expect(onItem).toHaveBeenCalledWith(flute, member);
  });

  it('shows the bonuses in effect against a member\'s strength and magic', () => {
    const witch = { ...member, name: 'Witch', label: 'Witch', fs: 1, mp: 4, mpParts: [{ label: 'Magic Staff', n: 1 }], fsParts: [{ label: 'Dragon Slayer', n: 1 }] };
    render(<CardPanel selected={{ kind: 'member', member: witch }} onItem={vi.fn()} onMember={noop} />);
    expect(screen.getByText(/Strength 1 \+ 1 \(Dragon Slayer\) · magic 4 \+ 1 \(Magic Staff\)/)).toBeInTheDocument();
  });

  it('shows an artifact with its carrier and a way back to the member', () => {
    const onMember = vi.fn();
    render(<CardPanel selected={{ kind: 'item', item: flute, from: member }} onItem={noop} onMember={onMember} />);
    expect(screen.getByText(/held by Wizard/)).toBeInTheDocument();
    expect(screen.getByText(/Lulls Dragons/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /← Wizard/ }));
    expect(onMember).toHaveBeenCalledWith(member);
  });

  it('puts a member\'s own actions at the foot of the card (the Sibyl\'s look)', () => {
    render(<CardPanel selected={{ kind: 'member', member: { ...member, sibyl: true, items: [] } }} onItem={noop} onMember={noop} actions={<button>Look at the top of the pack</button>} />);
    expect(screen.getByRole('button', { name: 'Look at the top of the pack' })).toBeInTheDocument();
  });

  it('describes the Sibyl without fighting numbers', () => {
    render(<CardPanel selected={{ kind: 'member', member: { ...member, name: 'Sibyl', label: 'Sibyl', sibyl: true, items: [] } }} onItem={noop} onMember={noop} />);
    expect(screen.getByText(/Travels with the party\. She cannot fight, carry or be harmed/)).toBeInTheDocument();
    expect(screen.queryByText(/Strength/)).toBeNull();
  });
});

describe('CardPanel — area card', () => {
  it('shows the area name and the words it is given', () => {
    render(<CardPanel selected={{ kind: 'area', index: 3, name: 'Chamber', file: '/t.png', rot: 90 }} areaText="A chamber, with exits north." onItem={() => {}} onMember={() => {}} />);
    expect(screen.getByTestId('area-text')).toHaveTextContent('A chamber, with exits north.');
    expect(screen.getByAltText('Chamber card')).toHaveStyle({ transform: 'rotate(90deg)' });
  });
});

describe('CardPanel — awards', () => {
  const slayer = { ...member, dragonCard: '/dragon.png', awards: [{ kind: 'dragon-slayer', count: 2, title: 'Dragon-slayer — +1 fighting strength' }] } as unknown as ViewPartyMember;

  it('lists an earned Dragon-slayer mark among the mini-cards and opens it', () => {
    const onAward = vi.fn();
    render(<CardPanel selected={{ kind: 'member', member: slayer }} onItem={() => {}} onMember={() => {}} onAward={onAward} />);
    fireEvent.click(screen.getByTitle('Dragon-slayer — +1 fighting strength'));
    expect(onAward).toHaveBeenCalledWith(expect.objectContaining({ kind: 'dragon-slayer', count: 2 }), slayer);
  });

  it('shows the award card with what it does and a way back to the member', () => {
    const onMember = vi.fn();
    render(<CardPanel selected={{ kind: 'award', award: slayer.awards[0]!, from: slayer }} onItem={() => {}} onMember={onMember} />);
    expect(screen.getByAltText('Dragon slain')).toBeInTheDocument();
    expect(screen.getByText(/2 slain by Wizard/)).toBeInTheDocument();
    expect(screen.getByText(/10 more points at scoring/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /wizard/i }));
    expect(onMember).toHaveBeenCalledWith(slayer);
  });
});

describe('CardPanel help', () => {
  it('folds the manual under a closed Help disclosure for a floor card', () => {
    render(<CardPanel selected={{ kind: 'card', card: { id: 'm', name: 'Medusa', category: 'hazard', file: '/m.png' }, where: 'Hall' }} onItem={noop} onMember={noop} />);
    const help = screen.getByTestId('card-help') as HTMLDetailsElement;
    expect(help.open).toBe(false);
    expect(screen.getByText('Help')).toBeInTheDocument();
    expect(help).toHaveTextContent(/lurks for good/);
  });

  it('shows general reaction rules for a creature on the floor but not for a party member', () => {
    const { unmount } = render(<CardPanel selected={{ kind: 'card', card: { id: 'd', name: 'Dragon', category: 'creature', file: '/d.png' }, where: 'Hall' }} onItem={noop} onMember={noop} />);
    expect(screen.getByTestId('card-help')).toHaveTextContent(/Meeting strangers/);
    unmount();
    render(<CardPanel selected={{ kind: 'member', member: { ...member, name: 'Dwarf', label: 'Dwarf', items: [] } }} onItem={noop} onMember={noop} />);
    expect(screen.getByTestId('card-help')).toHaveTextContent(/Guides the party safely past a trap/);
    expect(screen.getByTestId('card-help')).not.toHaveTextContent(/Meeting strangers/);
  });

  it('offers help on an artifact and on an area, and none for a card the manual does not know', () => {
    const { unmount } = render(<CardPanel selected={{ kind: 'item', item: flute, from: member }} onItem={noop} onMember={noop} />);
    expect(screen.getByTestId('card-help')).toHaveTextContent(/lulls Dragons and Vipers/);
    unmount();
    const { unmount: u2 } = render(<CardPanel selected={{ kind: 'area', index: 0, name: 'Viper Pit', file: null, rot: 0 }} areaText="x" onItem={noop} onMember={noop} />);
    expect(screen.getByTestId('card-help')).toHaveTextContent(/narrow ledge/);
    u2();
    render(<CardPanel selected={{ kind: 'member', member: { ...member, name: 'Nonesuch', label: 'Nonesuch', items: [] } }} onItem={noop} onMember={noop} />);
    expect(screen.queryByTestId('card-help')).toBeNull();
  });
});
