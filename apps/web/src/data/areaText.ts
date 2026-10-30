import { ALL_CREATURES, ALL_TREASURES, AF_UNRESOLVED, decodeOpen, type GameState } from '@sorcerers-cave/engine';

// Words for an area card in the card panel (UI review, Peter 20261030). Terse by default; the "verbose
// descriptions" setting turns on the story voice. Special chambers always read in full.
const C_DEMON = 15;

// What a special area says about itself. `{exits}` is replaced by the open ways out.
const SPECIAL_TEXT: Record<number, string> = {
  1: 'The Gateway to the cave. Exits: {exits}.',
  2: 'A deep pool fills this chamber. Only a Giant can lift treasure from the water. Exits: {exits}.',
  3: 'A pit of vipers. Crossing it is dangerous unless the vipers are lulled. Exits: {exits}.',
  4: 'A tomb. Exits: {exits}.',
  5: 'A great hall. Exits: {exits}.',
  6: 'A chasm splits this chamber. You may cross on the reachable side, or descend. Exits: {exits}.',
  7: 'A bell rope hangs here. Pulling it stirs the cave. Exits: {exits}.',
  8: 'A lair. Exits: {exits}.',
  9: 'Dark water churns here. The exits are {exits}, but crossing the shallows risks the pull of the whirlpool.',
  10: 'A gallery of statues. Exits: {exits}.',
  11: 'A well stands here. Exits: {exits}.',
};

const list = (words: string[]) =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

const names = (codes: number[], base: number, table: readonly { id: number; name: string }[]) =>
  codes.filter((c) => c >= base && c < base + 100).map((c) => table[c - base]?.name ?? 'something');

const withArticle = (name: string) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

/** One area of the map as the card panel words it. `verbose` selects the story voice. */
export function describeArea(state: GameState, idx: number, verbose: boolean): string {
  const a = state.areas[idx];
  if (!a || !a.faceUp || (a.flags & AF_UNRESOLVED) !== 0) return 'You have not yet explored that area.';
  const d = decodeOpen(a);
  const dirs = [d.n && 'north', d.e && 'east', d.s && 'south', d.w && 'west'].filter((w): w is string => typeof w === 'string');
  const exits = list(dirs) || 'none';
  const stairs = [d.stairUp && 'upwards', d.stairDown && 'downwards'].filter((w): w is string => typeof w === 'string');
  const stairText = stairs.length ? `${verbose ? ' and' : ','} a ${a.secretDoor !== undefined ? 'secret ' : ''}stairway ${list(stairs)}` : '';

  if (d.special && SPECIAL_TEXT[d.special]) {
    return SPECIAL_TEXT[d.special]!.replace('{exits}', exits) + (stairText ? ` There is${stairText.replace(/^,? ?(and )?/, ' ')}.` : '');
  }

  const kind = d.chamber ? 'chamber' : 'tunnel';
  const demon = a.contents.includes(100 + C_DEMON);
  const strangers = names(a.contents.filter((c) => c !== 100 + C_DEMON), 100, ALL_CREATURES);
  const treasure = names(a.contents, 200, ALL_TREASURES).map((n) => n.toLowerCase());

  if (!verbose) {
    const bits = [`${kind[0]!.toUpperCase()}${kind.slice(1)} — ${dirs.join(', ') || 'no exits'}${stairs.length ? `, stairs ${stairs.join(' and ')}` : ''}`];
    if (demon) bits.push('a Demon lurks here');
    if (strangers.length) bits.push(`${list(strangers)} here`);
    return `${bits.join('. ')}.`;
  }

  let text = `${withArticle(kind)[0]!.toUpperCase()}${withArticle(kind).slice(1)}, with exits ${exits}${stairText}.`;
  if (demon) text += ' Something evil lurks in the darkness...';
  if (strangers.length) {
    const who = list(strangers.map(withArticle));
    const guard = treasure.length ? `, guarding some ${list(treasure)}` : '';
    if (state.hostileAreas?.includes(idx)) text += ` There are strangers here${guard} — ${who}. You fled from them, and they are hostile.`;
    else if (state.pacifiedAreas?.includes(idx) || (state.indiffCounts?.[idx] ?? 0) > 0) text += ` You recall approaching the strangers here — ${who}${guard}. They were indifferent to you.`;
    else if (state.withdrewAreas?.includes(idx)) text += ` There are strangers here — ${who}${guard}. You recall withdrawing from the entrance; they did not see you.`;
    else text += ` There are strangers here — ${who}${guard}.`;
  }
  return text;
}

const VERBOSE_KEY = 'scv-verbose-descriptions';

/** The player's choice of story-voice descriptions. Storage can be blocked, so it falls back to off. */
export function readVerbose(): boolean {
  try { return localStorage.getItem(VERBOSE_KEY) === '1'; } catch { return false; }
}

export function writeVerbose(on: boolean): void {
  try { localStorage.setItem(VERBOSE_KEY, on ? '1' : '0'); } catch { /* storage unavailable — the choice lasts this session */ }
}
