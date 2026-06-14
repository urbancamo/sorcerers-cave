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
    <div className="absolute right-4 bottom-24 z-50 flex w-72 flex-col gap-2 rounded bg-stone-900/95 p-4 text-stone-100 ring-1 ring-amber-700/40" data-testid="encounter-panel">
      <h3 className="font-semibold capitalize">{state.phase}</h3>
      {strangers.length > 0 && <p className="text-sm text-rose-300">Strangers: {strangers.join(", ")}</p>}
      {treasures.length > 0 && <p className="text-sm text-amber-300">Treasure: {treasures.join(", ")}</p>}
      {state.fight && <p className="text-xs text-stone-400">Round {state.fight.round}</p>}
      <div className="flex flex-col gap-1">
        {actions.map((a, i) => (
          <button key={i} className="rounded bg-amber-800 px-3 py-1 text-left text-sm hover:bg-amber-700" onClick={() => dispatch(a)}>
            {label(a, state)}
          </button>
        ))}
      </div>
    </div>
  );
}
