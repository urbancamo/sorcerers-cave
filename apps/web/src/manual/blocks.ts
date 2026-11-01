import type { Block, CardCategory, CardRef, Requires } from './types';

export const p = (text: string, requires?: Requires): Block => ({ type: 'p', text, ...(requires && { requires }) });
export const list = (...items: string[]): Block => ({ type: 'list', items });
export const note = (tone: 'good' | 'danger' | 'info', tag: string, text: string, requires?: Requires): Block =>
  ({ type: 'note', tone, tag, text, ...(requires && { requires }) });
export const cards = (category: CardCategory, ...names: string[]): CardRef[] => names.map((name) => ({ category, name }));
