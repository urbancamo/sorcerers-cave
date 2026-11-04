import type { Selected } from './CardPanel';

/** A stable identity for what the card panel is showing, so a second click on the same thing can be told from a click on another. */
function key(s: Selected): string {
  switch (s.kind) {
    case 'card': return `card|${s.card.id}`;
    case 'area': return `area|${s.index}`;
    case 'recruit': return `recruit|${s.id}`;
    case 'member': return `member|${s.member.label}`;
    case 'award': return `award|${s.from.label}|${s.award.kind}`;
    case 'item': return `item|${s.from.label}|${s.at ? `${s.at.mi}:${s.at.idx}` : s.item.name}`;
  }
}

/** Is `a` the very same card, tile, member or item as `b`? (A second click on it tidies the card view away.) */
export function sameSelection(a: Selected | null, b: Selected | null): boolean {
  return a !== null && b !== null && key(a) === key(b);
}
