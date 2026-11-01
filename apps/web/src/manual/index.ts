import { AREAS } from './areas';
import { HAZARDS } from './hazards';
import { CREATURES } from './creatures';
import { TREASURE } from './treasure';
import { PLAY } from './play';
import { HOUSE } from './house';
import { PARTY } from './party';
import { SCORING } from './scoring';
import { MULTIPLAYER } from './multiplayer';
import type { Block, CardCategory, HelpScreen, Requires, Section, Topic, VariantFlags } from './types';

export type { Block, CardRef, Section, Topic, Variant, CardCategory, HelpScreen, VariantFlags, VariantKey, Requires } from './types';

/** The structured manual. Sections not yet transcribed (see docs/requirements/structured-manual/) are absent. */
export const MANUAL: Section[] = [PLAY, PARTY, AREAS, HAZARDS, CREATURES, TREASURE, SCORING, MULTIPLAYER, HOUSE];

const TOPICS: Topic[] = MANUAL.flatMap((s) => s.topics);

export const topicById = (id: string): Topic | undefined => TOPICS.find((t) => t.id === id);

const on = (flags: VariantFlags | undefined, req: Requires | undefined) =>
  !req || !flags || [req].flat().some((k) => !!flags[k]);
const topicKey = (t: Topic): Requires | undefined => t.requires ?? (t.variant === 'kit' ? 'extensionKit' : t.variant === 'sibyl' ? 'sibyl' : undefined);

/** Is the topic relevant to a game running under `flags`? (`undefined` flags = no game, show everything.) */
export const topicVisible = (t: Topic, flags?: VariantFlags) => on(flags, topicKey(t));

/** The topic's blocks that apply under `flags`. */
export const visibleBlocks = (t: Topic, flags?: VariantFlags): Block[] => t.blocks.filter((b) => on(flags, b.requires));

/** The sections with only their relevant topics; sections left empty are dropped. */
export function manualFor(flags?: VariantFlags): Section[] {
  return MANUAL.map((s) => ({ ...s, topics: s.topics.filter((t) => topicVisible(t, flags)) })).filter((s) => s.topics.length > 0);
}

/** Treasure and artefact cards share a deck and the UI is not always sure which it holds, so they match each other. */
const isLoot = (c: CardCategory) => c === 'treasure' || c === 'artifact';
const sameKind = (a: CardCategory, b: CardCategory) => a === b || (isLoot(a) && isLoot(b));

/**
 * The topics that explain a card: its own first, then — when `general` — topics about its whole category
 * (a `*` card ref), such as how reactions work for any creature met on the floor.
 */
export function topicsForCard(category: CardCategory, name: string, { general = false, flags }: { general?: boolean; flags?: VariantFlags } = {}): Topic[] {
  const live = TOPICS.filter((t) => topicVisible(t, flags));
  const own = live.filter((t) => t.cards.some((c) => sameKind(c.category, category) && c.name === name));
  if (!general) return own;
  const wide = live.filter((t) => !own.includes(t) && t.cards.some((c) => sameKind(c.category, category) && c.name === '*'));
  return [...own, ...wide];
}

/** The topics tagged for a screen, in manual order. */
export const topicsForScreen = (screens: HelpScreen | HelpScreen[], flags?: VariantFlags): Topic[] => {
  const want = Array.isArray(screens) ? screens : [screens];
  return TOPICS.filter((t) => topicVisible(t, flags) && t.screens?.some((s) => want.includes(s)));
};

const textOf = (b: Block): string => (b.type === 'list' ? b.items.join(' ') : b.text);

/** Topics whose title, summary or words contain every word of `query` (case-insensitive), most title-like first. */
export function searchTopics(query: string, flags?: VariantFlags): Topic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: [Topic, number][] = [];
  for (const t of TOPICS) {
    if (!topicVisible(t, flags)) continue;
    const title = t.title.toLowerCase();
    const body = `${t.brief ?? ''} ${visibleBlocks(t, flags).map(textOf).join(' ')}`.toLowerCase().replace(/\*/g, '');
    if (!words.every((w) => title.includes(w) || body.includes(w))) continue;
    scored.push([t, words.some((w) => title.includes(w)) ? 0 : 1]);
  }
  return scored.sort((a, b) => a[1] - b[1]).map(([t]) => t);
}

/** A topic's one-sentence summary, for tooltips; `undefined` when the card has none. */
export const briefForCard = (category: CardCategory, name: string): string | undefined =>
  topicsForCard(category, name).find((t) => t.brief)?.brief;
