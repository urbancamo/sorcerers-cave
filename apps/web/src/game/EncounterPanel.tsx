import { CREATURES, TREASURES, legalActions, type GameState, type GameAction } from "@sorcerers-cave/engine";

const ACTIVE = new Set<GameState["phase"]>(["encounter", "fight", "pickup"]);

/** Human label for a legal action button. */
function label(a: GameAction, state: GameState): string {
  switch (a.type) {
    case "test": return "Test reaction";
    case "attack": return "Attack";
    case "withdraw": return "Withdraw";
    case "fightOn": return "Fight on";
    case "retreat": return "Retreat";
    case "leaveTreasure": return "Leave the treasure";
    case "focusTarget": return `Focus ${CREATURES[state.strangers[a.idx]!]?.name ?? a.idx}`;
    case "takeTreasure": return `Take ${TREASURES[state.treasures[a.ti]!]?.name ?? "treasure"} → ${CREATURES[state.party[a.mi]!.creatureId]!.name}`;
    case "useArtifact": return `Use artifact ${TREASURES[a.artifact]?.name ?? a.artifact}`;
    case "quit": return "Abandon the expedition";
    default: return a.type;
  }
}

export function EncounterPanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  if (!ACTIVE.has(state.phase)) return null;
  const actions = legalActions(state);
  const strangers = state.strangers.map((id) => CREATURES[id]!.name);
  const treasures = state.treasures.map((id) => TREASURES[id]!.name);

  return (
    <div className="scv-enc" data-testid="encounter-panel">
      <h3 className="scv-enc-hd">{state.phase}</h3>
      {strangers.length > 0 && (
        <p className="scv-enc-line scv-enc-strangers"><span className="k">Strangers: </span>{strangers.join(", ")}</p>
      )}
      {treasures.length > 0 && (
        <p className="scv-enc-line scv-enc-treasure"><span className="k">Treasure: </span>{treasures.join(", ")}</p>
      )}
      {state.fight && <p className="scv-enc-round">Round {state.fight.round}</p>}
      <div className="scv-enc-actions">
        {actions.map((a, i) => (
          <button key={i} className="scv-enc-btn" onClick={() => dispatch(a)}>
            {label(a, state)}
          </button>
        ))}
      </div>
    </div>
  );
}
