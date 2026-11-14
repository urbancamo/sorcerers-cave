import { ALL_CREATURES, C_STATUE, carriedWeight, eyeActive, legalActions, type GameAction, type GameState } from '@sorcerers-cave/engine';
import type { Card } from '../../view/ports';
import { memberLabel } from '../memberLabels';
import { uncarryableNotes } from '../uncarryableNotes';
import { HelpButton } from '../../manual/HelpButton';
import { ConfirmButton } from '../ConfirmButton';

const T_LOST_RUBY = 11;
const T_CRYPT = 21;
const CRYPT_CONFIRM = 'Enter? A trap here cannot be avoided.';

/**
 * What the card panel offers for a treasure or artefact lying on the chamber floor during a pickup: the party leader chooses
 * who carries it. It lives on the treasure's own card, so the card view stays free to inspect anything else while treasure is on offer.
 * Nobody has to take anything: the party can simply walk on.
 */
export function FloorTreasureActions({ state, dispatch, card }: { state: GameState; dispatch: (a: GameAction) => void; card: Pick<Card, 'category' | 'entityId'> }) {
  // The Lost Ruby is set in the Statue's forehead (Peter, GitHub #59): while the Statue guards it the Ruby has no card of its own and is
  // taken from the Lost Ruby Statue's card, which stands on the floor in its place (see `withStatueForRuby`).
  const onStatue = card.category === 'creature' && Number(card.entityId) === C_STATUE;
  if (!onStatue && card.category !== 'treasure' && card.category !== 'artifact') return null;
  if (onStatue && (state.phase !== 'pickup' || state.rubyFreed)) return null;
  const tid = onStatue ? T_LOST_RUBY : Number(card.entityId);
  // The sealed crypt is shown as the Crypt/Gems card; its one action lives on that card (SC-EXT-13).
  if (tid === T_CRYPT) {
    const enter = legalActions(state).find((a) => a.type === 'enterCrypt');
    if (enter) return (
      <div className="scv-ia" data-testid="crypt-actions">
        <ConfirmButton label="Enter the crypt" confirmText={CRYPT_CONFIRM} onConfirm={() => dispatch(enter)} />
      </div>
    );
  }
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
  // The Lost Ruby sits in a strength-8 Statue, which the party fights if a member reaches for it; once freed (SC-11-47) it is ordinary treasure.
  // Nothing warns the player (Peter, GitHub #59), so the choice reads as an ordinary take, except that a held Eye of God is named for its power.
  const guarded = tid === T_LOST_RUBY && !state.rubyFreed;
  const reason = takers.length === 0 ? uncarryableNotes(state, [tid])[0] ?? 'No one can carry this.' : null;
  return (
    <div className="scv-ia" data-testid="floor-treasure-actions">
      <div>{onStatue
        ? <HelpButton topics={['house-ruby-statue']} label="Help with the Lost Ruby Statue" />
        : <HelpButton topics={['pickup-capacity']} label="Help with picking up treasure" />}</div>
      {guarded && takers.length > 0 ? (
        // One list instead of a button per member: it is a deliberate pick, as the one who reaches for the Ruby is the one named.
        <select className="scv-enc-select" aria-label="Who will take the Lost Ruby" value=""
                onChange={(e) => { if (e.target.value !== '') dispatch({ type: 'takeTreasure', ti, mi: Number(e.target.value) }); }}>
          <option value="">{eyeActive(state) ? 'Who takes it? The Eye of God holds the Statue powerless' : 'Who takes it?'}</option>
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
