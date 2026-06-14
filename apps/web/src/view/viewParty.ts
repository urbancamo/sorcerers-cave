import { CREATURES, TREASURES, FLAG_CHARISMA, type GameState } from "@sorcerers-cave/engine";
import { resolveCard, type CardArt } from "../data/manifest";
import type { ViewPartyMember } from "./cave3d";

/** Map the engine's party into the renderer/reveal party shape, resolving carried-item art.
 *  Fallen/dead members (status 3) drop out of the on-screen roster (the full party — including
 *  the fallen — remains in the engine state and the expanded party panel). */
export function viewParty(state: GameState, cards: CardArt[] = []): ViewPartyMember[] {
  return state.party.filter((m) => m.status !== 3).map((m, i) => {
    const c = CREATURES[m.creatureId]!;
    const items = m.treasure.map((tid) => {
      const t = TREASURES[tid]!;
      const art = resolveCard("treasure", tid, cards);
      return { name: t.name, file: art?.file ?? null, weight: t.weight, artifact: t.kind === "artifact" };
    });
    const load = m.treasure.reduce((sum, tid) => sum + TREASURES[tid]!.weight, 0);
    return {
      sig: c.name[0]!.toUpperCase(),
      name: c.name,
      lead: i === 0,
      items,
      carry: c.carry,
      load,
      fs: c.fs,
      mp: c.mp,
      charisma: (c.flags & FLAG_CHARISMA) !== 0,
    };
  });
}
