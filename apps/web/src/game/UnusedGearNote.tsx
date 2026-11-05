import type { GameState } from "@sorcerers-cave/engine";
import { unusedGear } from "./wielding";

/** Tells the player, in a fight, about gear that would help but is only carried. It never acts: nothing is wielded for them. */
export function UnusedGearNote({ state }: { state: GameState }) {
  const notes = unusedGear(state);
  if (notes.length === 0) return null;
  return <p className="scv-fight-reason" role="status" data-testid="unused-gear">{notes.join(" · ")}</p>;
}
