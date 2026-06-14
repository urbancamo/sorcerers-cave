import type { GameEvent } from "@sorcerers-cave/engine";
import type { Lane } from "./DiceRoll";

export type Tone = "good" | "bad" | "neutral";
export type RollView = { title: string; lanes: Lane[]; message: string; tone: Tone };

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

/** Build the dice overlay (if any) for the events an action produced — reaction first, else combat. */
export function rollFromEvents(events: GameEvent[]): RollView | null {
  const reaction = events.find((e): e is Extract<GameEvent, { type: "reaction" }> => e.type === "reaction");
  if (reaction) {
    const joined = events.find((e): e is Extract<GameEvent, { type: "strangersJoined" }> => e.type === "strangersJoined")?.count ?? 0;
    return reactionView(reaction, joined);
  }
  return combatView(events);
}
