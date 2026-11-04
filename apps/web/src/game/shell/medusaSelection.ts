import { HAZARD_MEDUSA, type GameState } from '@sorcerers-cave/engine';
import type { CardArt } from '../../data/manifest';
import { laneCards } from '../../view/projection';
import type { Selected } from './CardPanel';

/**
 * At the Medusa pause the party must choose (throw the Lotus Dust, or brave her), so her card is shown in the card panel.
 * She is a lurking marker rather than a stranger, so the scene does not always report her (a return visit draws nothing).
 */
export function medusaSelection(state: GameState, cards: CardArt[], where: string): Selected | null {
  if (state.phase !== 'medusa') return null;
  const card = laneCards([300 + HAZARD_MEDUSA], cards).hazards[0];
  return card ? { kind: 'card', card, where } : null;
}
