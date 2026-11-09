import { describe, it, expect } from 'vitest';
import { ALL_TREASURES, frontStrength, newGame, type GameState, type PartyMember } from '@sorcerers-cave/engine';
import { figureText, memberFigures } from './figures';

const HERO = 0, PRIEST = 4, DWARF = 7, WIZARD = 8, WITCH = 18;
const T = { sword: 3, staff: 9, axe: 17 };
const EYE = ALL_TREASURES.findIndex((t) => t.name === 'Eye of God');

// A one-member party; `borne` lists what that member has in use.
const game = (creatureId: number, treasure: number[], borne: number[] = [], over: Partial<PartyMember> = {}, state: Partial<GameState> = {}): GameState => {
  const s = newGame(1, [HERO], { extensionKit: true });
  s.party = [{ creatureId, status: 0, dragonKills: 0, treasure, borne, ...over }];
  return { ...s, ...state };
};

describe('memberFigures', () => {
  it('shows only the printed numbers when nothing is in effect', () => {
    const f = memberFigures(game(WITCH, []), 0);
    expect(f).toMatchObject({ fs: 1, mp: 4, fsParts: [], mpParts: [], fsTotal: 1, mpTotal: 4 });
  });

  it('a Staff that is only carried adds nothing', () => {
    expect(memberFigures(game(WITCH, [T.staff]), 0).mpParts).toEqual([]);
  });

  it("a wielded Staff adds +1 to a Witch's magic (Peter's report, ZYBP)", () => {
    const f = memberFigures(game(WITCH, [T.staff], [T.staff]), 0);
    expect(f.mpParts).toEqual([{ label: 'Magic Staff', n: 1 }]);
    expect(f.mpTotal).toBe(5);
  });

  it('a wielded Staff adds +2 for a Wizard and +1 for a Priest', () => {
    expect(memberFigures(game(WIZARD, [T.staff], [T.staff]), 0).mpParts).toEqual([{ label: 'Magic Staff', n: 2 }]);
    expect(memberFigures(game(PRIEST, [T.staff], [T.staff]), 0).mpParts).toEqual([{ label: 'Magic Staff', n: 1 }]);
  });

  it("lists a Hero's wielded Sword and Dragon kills against strength, Sword first", () => {
    const f = memberFigures(game(HERO, [T.sword], [T.sword], { dragonKills: 2 }), 0);
    expect(f.fsParts).toEqual([{ label: 'Magic Sword', n: 2 }, { label: 'Dragon Slayer', n: 2 }]);
    expect(f.fsTotal).toBe(f.fs + 4);
  });

  it('a carried Sword adds nothing, but Dragon kills always count', () => {
    expect(memberFigures(game(HERO, [T.sword], [], { dragonKills: 1 }), 0).fsParts).toEqual([{ label: 'Dragon Slayer', n: 1 }]);
  });

  it("counts a Dwarf's wielded Axe, an Elixir's permanent bonus and an active Strength Potion", () => {
    expect(memberFigures(game(DWARF, [T.axe], [T.axe]), 0).fsParts).toEqual([{ label: 'Magic Axe', n: 3 }]);
    expect(memberFigures(game(HERO, [], [], { fsBonus: 2 }), 0).fsParts).toEqual([{ label: 'Elixir', n: 2 }]);
    expect(memberFigures(game(HERO, [], [], { potionActive: true }), 0).fsParts).toEqual([{ label: 'Strength Potion', n: 2 }]);
  });

  it('the Eye of God makes magic and artefacts powerless, so only the traits stay', () => {
    const s = game(WITCH, [T.staff, T.sword], [T.staff], { dragonKills: 1 }, { treasures: [EYE] });
    const f = memberFigures(s, 0);
    expect(f.mpParts).toEqual([{ label: 'Eye of God', n: -4 }]);
    expect(f.mpTotal).toBe(0);
    expect(f.fsParts).toEqual([{ label: 'Dragon Slayer', n: 1 }]);
  });

  // The figures are a presentation of what the engine fights with: strength plus magic must equal its front-line total.
  describe('agrees with the engine', () => {
    const cases: [string, GameState][] = [
      ['plain Witch', game(WITCH, [])],
      ['Witch with the Staff wielded', game(WITCH, [T.staff], [T.staff])],
      ['Witch with the Staff carried', game(WITCH, [T.staff])],
      ['Wizard with the Staff wielded', game(WIZARD, [T.staff], [T.staff])],
      ['Hero with Sword and two Dragons', game(HERO, [T.sword], [T.sword], { dragonKills: 2 })],
      ['Dwarf with the Axe', game(DWARF, [T.axe], [T.axe])],
      ['Hero with a Sword carried, Elixir and Potion', game(HERO, [T.sword], [], { fsBonus: 2, potionActive: true })],
      ['Witch under the Eye', game(WITCH, [T.staff], [T.staff], { dragonKills: 1 }, { treasures: [EYE] })],
    ];
    it.each(cases)('%s', (_name, s) => {
      const f = memberFigures(s, 0);
      expect(f.fsTotal + f.mpTotal).toBe(frontStrength(s.party[0]!, s));
    });
  });
});

describe('figureText', () => {
  it('is just the number when nothing adds to it', () => {
    expect(figureText(5, [])).toBe('5');
  });
  it('names each source, as in "4 + 1 (Magic Staff)"', () => {
    expect(figureText(4, [{ label: 'Magic Staff', n: 1 }])).toBe('4 + 1 (Magic Staff)');
    expect(figureText(5, [{ label: 'Magic Sword', n: 2 }, { label: 'Dragon Slayer', n: 2 }])).toBe('5 + 2 (Magic Sword) + 2 (Dragon Slayer)');
  });
  it('shows a loss as a subtraction', () => {
    expect(figureText(4, [{ label: 'Eye of God', n: -4 }])).toBe('4 − 4 (Eye of God)');
  });
});
