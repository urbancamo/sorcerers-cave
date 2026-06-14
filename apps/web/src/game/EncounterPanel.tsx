import { useState } from "react";
import { CREATURES, TREASURES, legalActions, type GameState, type GameAction, type GameEvent } from "@sorcerers-cave/engine";
import { DiceRoll, type Lane } from "./DiceRoll";

const ACTIVE = new Set<GameState["phase"]>(["encounter", "fight", "pickup"]);

type Tone = "good" | "bad" | "neutral";
type RollView = { title: string; lanes: Lane[]; message: string; tone: Tone };

/** Turn a reaction event (+ any join) into a single-die overlay. */
function reactionView(reaction: Extract<GameEvent, { type: "reaction" }>, joined: number): RollView {
  const message =
    reaction.outcome === "friendly"
      ? joined > 0
        ? "Friendly — they join your party!"
        : "Friendly — but they keep their distance."
      : reaction.outcome === "indifferent"
        ? "Indifferent — they pay you no heed."
        : "Hostile — they ready for a fight!";
  const tone: Tone =
    reaction.outcome === "friendly" ? "good" : reaction.outcome === "hostile" ? "bad" : "neutral";
  return { title: "Reaction roll", lanes: [{ enemy: { value: reaction.roll } }], message, tone };
}

/** Turn a fight round's combat rolls into a party-vs-enemy overlay with both dice side by side. */
function combatView(events: GameEvent[]): RollView | null {
  const rolls = events.filter((e): e is Extract<GameEvent, { type: "combatRoll" }> => e.type === "combatRoll");
  if (rolls.length === 0) return null;
  const lanes: Lane[] = rolls.map((r) => ({
    party: { name: r.party, value: r.partyRoll, total: r.partyTotal, outcome: r.result === "partyWon" ? "win" : r.result === "enemyWon" ? "lose" : "tie" },
    enemy: { name: r.enemy, value: r.enemyRoll, total: r.enemyTotal, outcome: r.result === "enemyWon" ? "win" : r.result === "partyWon" ? "lose" : "tie" },
  }));

  const over = events.some((e) => e.type === "gameOver");
  const won = events.some((e) => e.type === "fightWon");
  const killed = events.filter((e) => e.type === "strangerKilled").length;
  const lost = events.filter((e) => e.type === "memberDied" || e.type === "spectreSlew").length;
  const message = over
    ? "The party is slain…"
    : won
      ? "Victory — the foes have fallen!"
      : `Round resolved — ${killed} foe(s) down, ${lost} of yours lost.`;
  const tone: Tone = over || lost > 0 ? "bad" : killed > 0 ? "good" : "neutral";
  return { title: "Combat round", lanes, message, tone };
}

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

export function EncounterPanel({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (a: GameAction) => Promise<{ events: GameEvent[] } | null> | void;
}) {
  const [roll, setRoll] = useState<RollView | null>(null);

  // Dispatch, then surface any reaction or combat rolls as a dice overlay the player must dismiss.
  async function act(a: GameAction) {
    const res = await dispatch(a);
    const events = (res as { events?: GameEvent[] } | null | undefined)?.events ?? [];
    const reaction = events.find((e): e is Extract<GameEvent, { type: "reaction" }> => e.type === "reaction");
    if (reaction) {
      const joined = events.find((e): e is Extract<GameEvent, { type: "strangersJoined" }> => e.type === "strangersJoined")?.count ?? 0;
      setRoll(reactionView(reaction, joined));
      return;
    }
    const combat = combatView(events);
    if (combat) setRoll(combat);
  }

  if (roll) {
    return (
      <DiceRoll
        title={roll.title}
        lanes={roll.lanes}
        message={roll.message}
        tone={roll.tone}
        onContinue={() => setRoll(null)}
      />
    );
  }
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
          <button key={i} className="scv-enc-btn" onClick={() => act(a)}>
            {label(a, state)}
          </button>
        ))}
      </div>
    </div>
  );
}
