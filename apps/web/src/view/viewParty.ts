import { ALL_CREATURES, ALL_TREASURES, FLAG_CHARISMA, type GameState } from "@sorcerers-cave/engine";
import { resolveCard, type CardArt } from "../data/manifest";
import { memberLabels } from "../game/memberLabels";
import type { ViewPartyMember } from "./cave3d";

const isAlive = (status: number) => status === 0 || status === 1; // original or ally (not stone/dead)

/** Map the engine's party into the renderer/reveal party shape, resolving carried-item art.
 *  Fallen/dead members (status 3) drop out of the on-screen roster (the full party — including
 *  the fallen — remains in the engine state and the expanded party panel). Living members
 *  (status 0/1) are listed before the petrified. */
export function viewParty(state: GameState, cards: CardArt[] = []): ViewPartyMember[] {
  // Disambiguation numbers are assigned by the authoritative party order, then carried through the
  // roster's own filter/sort so a member's "#N" is stable (and matches the party panel + dropdowns).
  const labels = memberLabels(state.party);
  return state.party
    .map((m, origIdx) => ({ m, origIdx }))
    .filter(({ m }) => m.status !== 3)
    .sort((a, b) => Number(isAlive(b.m.status)) - Number(isAlive(a.m.status))) // alive first; stable otherwise
    .map(({ m, origIdx }, i) => {
    // ALL_CREATURES/ALL_TREASURES (not the base-only tables): a kit-on game's party/carried items
    // can be kit ids (14-20 / 15-21, SC-EXT-2) the moment the roster first renders — the base
    // tables don't cover them and would crash on frame 1 of any kit-on game (SC-EXT-29).
    const c = ALL_CREATURES[m.creatureId]!;
    const items = m.treasure.map((tid) => {
      const t = ALL_TREASURES[tid]!;
      const art = resolveCard("treasure", tid, cards);
      return { name: t.name, file: art?.file ?? null, weight: t.weight, artifact: t.kind === "artifact" };
    });
    const load = m.treasure.reduce((sum, tid) => sum + ALL_TREASURES[tid]!.weight, 0);
    return {
      sig: c.name[0]!.toUpperCase(),
      name: c.name,               // plain creature name — kept stable for the desertion-diff (by name)
      label: labels[origIdx]!,    // display name with a party-wide "#N" when the class is duplicated
      lead: i === 0,
      card: resolveCard("creature", m.creatureId, cards)?.file ?? null,
      items,
      carry: c.carry,
      load,
      fs: c.fs,
      mp: c.mp,
      charisma: (c.flags & FLAG_CHARISMA) !== 0,
      ally: m.status === 1,
      petrified: m.status === 2,
      stoneArea: m.status === 2 ? (m.stoneArea ?? null) : null,
    };
  });
}
