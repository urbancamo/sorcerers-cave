import type { GameAction, GameState } from '@sorcerers-cave/engine';
import { ALL_CREATURES, ALL_TREASURES } from '@sorcerers-cave/engine';
import { describeArea } from '../../data/areaText';
import { resolveCard, type CardArt } from '../../data/manifest';
import { EncounterPanel, needsDecision } from '../EncounterPanel';
import { ChamberPickup } from './ChamberPickup';

/** The heading that tells the player what this pane is: an Encounter, Treasure or Artifact to take, or the Medusa pause. */
function decisionLabel(state: GameState): string {
  if (state.phase === 'medusa') return 'Medusa';
  if (state.phase === 'pickup') {
    const onlyArtifacts = state.treasures.length > 0 && state.treasures.every((id) => ALL_TREASURES[id]?.kind === 'artifact');
    return onlyArtifacts ? 'Artifact' : 'Treasure';
  }
  return 'Encounter';
}

/**
 * Where the party must decide something (meet strangers, take or leave treasure, face the Medusa pause), the whole decision
 * lives in one right-hand pane: the words for where the party stands, the strangers' cards, the treasure to give out, and the
 * choices. Peter's design (20261030) is that the doorway shows the Encounter version of the card panel; before this the
 * description sat on the right and the buttons at the bottom centre, two surfaces for one choice.
 *
 * It always mounts the encounter panel, even when there is nothing to decide: that panel also skips a pickup whose only
 * choice is to leave, and that has to keep happening with no pane showing.
 */
export function DecisionPane({ state, dispatch, cards, verbose }: {
  state: GameState;
  dispatch: (a: GameAction) => void;
  cards: CardArt[];
  verbose: boolean;
}) {
  if (!needsDecision(state)) return <EncounterPanel state={state} dispatch={dispatch} placement="panel" />;
  return (
    <aside className="scv-slot scv-slot-right scv-decision" data-testid="decision-pane" aria-label="Decision">
      <h2 className="scv-slot-hd">{decisionLabel(state)}</h2>
      <p className="scv-cp-text" data-testid="decision-where">{describeArea(state, state.partyArea, verbose)}</p>
      {state.strangers.length > 0 && (
        <div className="scv-decision-faces">
          {state.strangers.map((id, i) => {
            const name = ALL_CREATURES[id]?.name ?? 'Stranger';
            const face = resolveCard('creature', id, cards)?.file;
            return face
              ? <img key={i} className="scv-decision-face" src={face} alt={`${name} card`} />
              : <span key={i} className="scv-decision-face ph">{name}</span>;
          })}
        </div>
      )}
      {state.phase === 'pickup' && <ChamberPickup state={state} dispatch={dispatch} cards={cards} embedded />}
      <EncounterPanel state={state} dispatch={dispatch} placement="panel" />
    </aside>
  );
}
