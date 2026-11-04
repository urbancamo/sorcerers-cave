import type { GameEvent } from "@sorcerers-cave/engine";

/**
 * How the scene should treat a move that included a Whirlpool crossing. Its die is shown before the party moves (the engine's
 * pre-move snapshot holds the backdrop), so the scene must not walk the token ahead of it; and a drag drops the party a level,
 * after which the view goes "home" so only the new level shows. Null for any other move.
 */
export function whirlpoolMove(events: readonly GameEvent[]): { dragged: boolean } | null {
  const roll = events.find((e): e is Extract<GameEvent, { type: "whirlpoolRoll" }> => e.type === "whirlpoolRoll");
  if (roll) return { dragged: roll.dragged };
  // The Viper Pit is the same in this respect: its dice come before the party is seen to leave the pit (nobody is dragged down a level).
  return events.some((e) => e.type === "viperPit") ? { dragged: false } : null;
}
