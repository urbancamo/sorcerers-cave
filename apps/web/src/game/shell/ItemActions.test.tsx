import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { newGame, type GameState } from '@sorcerers-cave/engine';
import { ItemActions } from './ItemActions';

const T = { chest: 14, carpet: 4, balm: 6, lotus: 5, elixir: 15, scroll: 19, holyWater: 16, sword: 3, silver: 0 };

// A one-member (or more) party where member 0 carries `item`.
const carrying = (picks: number[], item: number, over: Partial<GameState> = {}, kit = false): GameState => {
  const s = newGame(1, picks, kit ? { extensionKit: true } : undefined);
  s.party[0]!.treasure.push(item);
  return { ...s, ...over };
};
const idxOf = (s: GameState, item: number) => s.party[0]!.treasure.indexOf(item);

const show = (s: GameState, item: number, dispatch = vi.fn()) => {
  render(<ItemActions state={s} dispatch={dispatch} mi={0} idx={idxOf(s, item)} />);
  return dispatch;
};

describe('ItemActions — use', () => {
  it('opens a carried Treasure Chest', () => {
    const d = show(carrying([0], T.chest), T.chest);
    fireEvent.click(screen.getByRole('button', { name: /open the treasure chest/i }));
    expect(d).toHaveBeenCalledWith({ type: 'openChest' });
  });

  it("condenses the Magic Carpet's directions into one picker", () => {
    const d = show(carrying([4], T.carpet), T.carpet); // a Priest can command it
    fireEvent.change(screen.getByLabelText('Use'), { target: { value: '0' } });
    expect(d).toHaveBeenCalledWith(expect.objectContaining({ type: 'useArtifact', artifact: 4 }));
  });

  it('offers a single use as one button, naming the target', () => {
    const s = newGame(1, [6, 5]); // Woman + Man
    s.party[0]!.treasure.push(T.balm);
    s.party[1]!.status = 3; // the Man fell this turn, in this area: within the Balm's window
    s.party[1]!.diedTurn = s.turn;
    s.party[1]!.diedArea = s.partyArea;
    const d = show(s, T.balm);
    fireEvent.click(screen.getByRole('button', { name: /revive man/i }));
    expect(d).toHaveBeenCalledWith({ type: 'useArtifact', artifact: 6, target: 1 });
  });

  it("labels the Sorcerer's Lotus Dust option as weakening, not sleeping (SC-11-12)", () => {
    const s = carrying([0], T.lotus, { phase: 'encounter', strangers: [11] });
    show(s, T.lotus);
    expect(screen.getByRole('button', { name: /sorcerer — weakens him by 2, he cannot be slept/i })).toBeInTheDocument();
  });

  it('puts the Elixir behind a drinker picker and the verbatim confirm (US-19)', () => {
    const d = show(carrying([0], T.elixir), T.elixir);
    fireEvent.change(screen.getByLabelText('Elixir'), { target: { value: '0' } });
    expect(screen.getByTestId('confirm-prompt')).toHaveTextContent(/1: death\. 2–3: nothing\. 4–6: \+2 strength, forever\./);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(d).toHaveBeenCalledWith({ type: 'useArtifact', artifact: 15, target: 0 });
  });

  it('puts the Scroll behind a confirm (US-21)', () => {
    const d = show(carrying([0], T.scroll, { phase: 'encounter', strangers: [3] }), T.scroll);
    fireEvent.click(screen.getByRole('button', { name: 'Read the Scroll' }));
    expect(screen.getByTestId('confirm-prompt')).toHaveTextContent(/curses the party/i);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(d).toHaveBeenCalledWith({ type: 'useArtifact', artifact: 19 });
  });

  it("names Holy Water's targets, a Gallery statue by its own name (US-20)", () => {
    const base = newGame(1, [0], { extensionKit: true });
    const s: GameState = { ...base, party: [{ ...base.party[0]!, treasure: [T.holyWater] }], statues: [18] }; // the Witch statue
    const d = show(s, T.holyWater);
    fireEvent.click(screen.getByRole('button', { name: /witch/i }));
    expect(d).toHaveBeenCalledWith(expect.objectContaining({ type: 'useArtifact', artifact: 16, target: 1000 }));
  });

  it('offers nothing to use when the artifact is not usable now', () => {
    show(carrying([0], T.carpet), T.carpet); // a Hero cannot command the carpet
    expect(screen.queryByLabelText('Use')).toBeNull();
    expect(screen.queryByRole('button', { name: /^use/i })).toBeNull();
  });
});

describe('ItemActions — wield, give, drop', () => {
  it('wields and stows a borneable item', () => {
    const s = carrying([0], T.sword);
    const d = show(s, T.sword);
    fireEvent.click(screen.getByRole('button', { name: 'Wield' }));
    expect(d).toHaveBeenCalledWith({ type: 'setBorne', mi: 0, idx: idxOf(s, T.sword), borne: true });
  });

  it('offers Stow once it is wielded', () => {
    const s = carrying([0], T.sword);
    s.party[0]!.borne = [T.sword];
    show(s, T.sword);
    expect(screen.getByRole('button', { name: 'Stow (carry)' })).toBeInTheDocument();
  });

  it('gives an item to another member who can carry it', () => {
    const s = carrying([5, 6], T.sword);
    const d = show(s, T.sword);
    fireEvent.change(screen.getByLabelText('Give to'), { target: { value: '1' } });
    expect(d).toHaveBeenCalledWith({ type: 'moveTreasure', from: 0, to: 1, idx: idxOf(s, T.sword) });
  });

  it('drops an item where the party stands', () => {
    const s = carrying([0], T.sword);
    const d = show(s, T.sword);
    fireEvent.click(screen.getByRole('button', { name: 'Drop here' }));
    expect(d).toHaveBeenCalledWith({ type: 'dropTreasure', mi: 0, idx: idxOf(s, T.sword) });
  });

  it('offers no moving, wielding or dropping in a fight', () => {
    show(carrying([5, 6], T.sword, { phase: 'fight' }), T.sword);
    expect(screen.queryByRole('button', { name: 'Wield' })).toBeNull();
    expect(screen.queryByLabelText('Give to')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Drop here' })).toBeNull();
  });
});
