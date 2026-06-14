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
    case "chooseCasualty": {
      const m = state.party[a.idx]!;
      const carried = m.treasure.length;
      // Name + carried-count so two same-creature members can be told apart when choosing.
      return `Let ${CREATURES[m.creatureId]!.name} fall` + (carried ? ` (carrying ${carried})` : "");
    }
    case "takeTreasure": {
      const tid = state.treasures[a.ti]!;
      const tname = TREASURES[tid]?.name ?? "treasure";
      const member = CREATURES[state.party[a.mi]!.creatureId]!.name;
      // The Lost Ruby (id 11) is guarded by a strength-8 statue that must be beaten to claim it (§16).
      return tid === 11
        ? `Seize the ${tname} — ${member} must defeat the guardian statue`
        : `Take ${tname} → ${member}`;
    }
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
      {state.fight?.casualtyQueue?.length ? (
        <p className="scv-enc-line scv-enc-strangers">Two fell together — choose who is lost.</p>
      ) : null}
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
