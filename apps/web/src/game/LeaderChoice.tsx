import { ALL_CREATURES, type GameAction, type GameState } from "@sorcerers-cave/engine";
import { HelpButton } from "../manual/HelpButton";

/** The party has lost its last original member (death, Desertion, Mutiny, whatever the cause): the player names a new leader from the
 *  allies who remain (engine phase `leader`, rulings R-07/R-10). The leader counts as an original member from then on. Blocking, like
 *  the trap choice: nothing else can be done until it is made. */
export function LeaderChoice({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const allies = state.party.map((m, idx) => ({ m, idx })).filter((x) => x.m.status === 1);
  return (
    <div className="scv-dice-overlay"
         role="dialog"
         aria-label="Choose a new leader"
         data-testid="leader-choice">
      <div className="scv-dice-card scv-tp-card">
        <div className="scv-dice-title">
          The party needs a new leader <HelpButton topics={["party-leader"]} label="Help with choosing a leader" />
        </div>
        <p className="scv-tp-text">
          No original member of the party is left. Choose who leads from here on — that member counts as an original adventurer, no longer an ally.
        </p>
        <div className="scv-tp-actions">
          {allies.map(({ m, idx }) => (
            <button key={idx}
                    className="scv-primary"
                    onClick={() => dispatch({ type: "chooseLeader", idx })}>
              {ALL_CREATURES[m.creatureId]?.name ?? `Creature ${m.creatureId}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
