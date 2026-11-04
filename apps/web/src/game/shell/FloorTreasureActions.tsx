import { ALL_CREATURES, carriedWeight, legalActions, type GameAction, type GameState } from '@sorcerers-cave/engine';
import type { Card } from '../../view/ports';
import { memberLabel } from '../memberLabels';
import { uncarryableNotes } from '../uncarryableNotes';
import { HelpButton } from '../../manual/HelpButton';

const T_LOST_RUBY = 11;

/**
 * What the card panel offers for a treasure or artefact lying on the chamber floor during a pickup: the party leader chooses
 * who carries it. It lives on the treasure's own card, so the card view stays free to inspect anything else while treasure is on offer.
 * Nobody has to take anything: the party can simply walk on.
 */
export function FloorTreasureActions({ state, dispatch, card }: { state: GameState; dispatch: (a: GameAction) => void; card: Pick<Card, 'category' | 'entityId'> }) {
  if (card.category !== 'treasure' && card.category !== 'artifact') return null;
  const tid = Number(card.entityId);
  // Treasure left in the chamber once the pickup is over (parked as 200+id): there is nothing to choose, but the card says why nobody can carry it.
  if (state.phase !== 'pickup') {
    if (!state.areas[state.partyArea]?.contents.includes(200 + tid)) return null;
    const note = uncarryableNotes(state, [tid])[0];
    return note ? <p className="scv-cp-text scv-muted" data-testid="floor-treasure-note">{note}</p> : null;
  }
  const ti = state.treasures.indexOf(tid); // equal pieces are interchangeable, so the first one stands for any of them
  if (ti < 0) return null;
  const takers = legalActions(state).flatMap((a) => (a.type === 'takeTreasure' && a.ti === ti ? [a.mi] : []));
  const who = (mi: number) => {
    const m = state.party[mi]!, c = ALL_CREATURES[m.creatureId]!;
    const base = memberLabel(state.party, mi);
    return c.carry > 0 ? `${base} (${carriedWeight(m)}/${c.carry}kg)` : base;
  };
  // The Lost Ruby sits in a strength-8 statue that must be beaten; once freed (SC-11-47) it is ordinary treasure.
  const guarded = tid === T_LOST_RUBY && !state.rubyFreed;
  const reason = takers.length === 0 ? uncarryableNotes(state, [tid])[0] ?? 'No one can carry this.' : null;
  return (
    <div className="scv-ia" data-testid="floor-treasure-actions">
      <div><HelpButton topics={['pickup-capacity']} label="Help with picking up treasure" /></div>
      {guarded && takers.length > 0 ? (
        // One list instead of a button per member: each choice risks the member's life against the statue, so it is a deliberate pick.
        <select className="scv-enc-select" aria-label="Who will wrest the Lost Ruby from the statue" value=""
                onChange={(e) => { if (e.target.value !== '') dispatch({ type: 'takeTreasure', ti, mi: Number(e.target.value) }); }}>
          <option value="">Who wrests it from the statue?</option>
          {takers.map((mi) => <option key={mi} value={mi}>{who(mi)}</option>)}
        </select>
      ) : takers.map((mi) => (
        <button key={mi} type="button" className="scv-enc-btn" onClick={() => dispatch({ type: 'takeTreasure', ti, mi })}>
          {`Give to ${who(mi)}`}
        </button>
      ))}
      {reason && (
        <>
          <button type="button" className="scv-enc-btn" disabled title={reason}>Give to…</button>
          <p className="scv-cp-text scv-muted">{reason}</p>
        </>
      )}
    </div>
  );
}
