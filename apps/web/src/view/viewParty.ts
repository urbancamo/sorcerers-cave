import { CREATURES, FLAG_CHARISMA, type GameState } from "@sorcerers-cave/engine";
import type { ViewPartyMember } from "./cave3d";

/** Map the engine's living party into the renderer/reveal party shape. */
export function viewParty(state: GameState): ViewPartyMember[] {
  return state.party.map((m, i) => {
    const c = CREATURES[m.creatureId]!;
    return {
      sig: c.name[0]!.toUpperCase(),
      name: c.name,
      lead: i === 0,
      items: m.treasure.map((t) => String(t)),
      fs: c.fs,
      mp: c.mp,
      charisma: (c.flags & FLAG_CHARISMA) !== 0,
    };
  });
}
