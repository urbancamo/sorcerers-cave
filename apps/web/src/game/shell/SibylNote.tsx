import { C_SIBYL, type GameState } from '@sorcerers-cave/engine';
import type { Card } from '../../view/ports';

/**
 * At the foot of the Sibyl's own card once the party has tested her and found her indifferent: she is tested once only, so the card
 * records that she stayed behind and will not be asked again. Nothing on any other card, or while she travels with the party.
 */
export function SibylNote({ state, card }: { state: GameState; card: Pick<Card, 'category' | 'entityId'> }) {
  if (card.category !== 'creature' || Number(card.entityId) !== C_SIBYL) return null;
  if (!state.sibylMet || state.hasSibyl) return null;
  return (
    <p className="scv-cp-text scv-muted" data-testid="sibyl-indifferent">
      You tested the Sibyl and found her indifferent. She stays here and will not be tested again.
    </p>
  );
}
