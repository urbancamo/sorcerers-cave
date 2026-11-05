import { ALL_TREASURES, BORNEABLE, canUseArtifact, isBorne, legalActions, staffBonus, type GameState } from '@sorcerers-cave/engine';
import { memberLabels } from './memberLabels';
import { useVerbs } from './wielding';

// Draft classification for the inventory (docs/requirements/ui-review, "Artifact classification"); it still needs a
// rules review. Active artifacts need a player action; passive ones work by being carried or wielded.
const ACTIVE = new Set([4, 5, 6, 8, 9, 12, 15, 16, 19]);
const T_CHARMED_FLUTE = 12;
const T_MAGIC_SHIELD = 20;
const T_MAGIC_STAFF = 9;
const SHIELD_ELIGIBLE = new Set([0, 1, 5, 6]); // Hero, W-Hero, Man, Woman: the only bearers for whom the shield's ward works

export type ArtifactColor = 'gray' | 'yellow' | 'green';

export interface InventoryRow {
  mi: number;        // the carrier's index in state.party
  idx: number;       // the item's index in that member's treasure list
  tid: number;
  name: string;
  weight: number;
  artifact: boolean;
  carrier: string;
  color: ArtifactColor;
  tag: string;       // the second cue: colour alone is not enough
}

/** Gray: the carrier cannot use it, or it has no use. Yellow: carried by someone who can use it, but not usable now (includes wielded or passive items). Green: usable now. */
export function artifactState(state: GameState, mi: number, tid: number, usable: ReadonlySet<number>): { color: ArtifactColor; tag: string } {
  const m = state.party[mi]!;
  const t = ALL_TREASURES[tid]!;
  if (m.status !== 0 && m.status !== 1) return { color: 'gray', tag: 'carrier cannot act' };
  if (t.kind === 'heavy' || tid === 11) return { color: 'gray', tag: 'treasure only' };
  // The Staff adds magical power to a Priest (+1) and a Wizard (+2) just by being carried, so the label says how much; only the Wizard
  // can also use its powers (ward off Medusa, wake the stone), so a Priest is told what it cannot do rather than "carrier cannot use".
  const bonus = tid === T_MAGIC_STAFF ? staffBonus(m.creatureId) : 0;
  // Wielded or worn items work only while in use (wielding weapons): say so rather than imply the item is helping.
  if (bonus > 0 && !isBorne(m, tid)) return { color: 'yellow', tag: 'carried · not wielded' };
  if (bonus > 0) {
    if (!canUseArtifact(m.creatureId, tid)) return { color: 'yellow', tag: `+${bonus} magic · cannot use against Medusa` };
    return usable.has(tid) ? { color: 'green', tag: `+${bonus} magic · usable now` } : { color: 'yellow', tag: `+${bonus} magic · not usable now` };
  }
  // Played at the Viper Pit, the Flute keeps the Vipers asleep until the party leaves; say so rather than "not usable now".
  if (tid === T_CHARMED_FLUTE && canUseArtifact(m.creatureId, tid) && state.vipersLulledArea === state.partyArea) {
    return { color: 'yellow', tag: 'played · Vipers asleep' };
  }
  if (ACTIVE.has(tid)) {
    if (!canUseArtifact(m.creatureId, tid)) return { color: 'gray', tag: 'carrier cannot use' };
    return usable.has(tid) ? { color: 'green', tag: 'usable now' } : { color: 'yellow', tag: 'not usable now' };
  }
  if (tid === T_MAGIC_SHIELD && !SHIELD_ELIGIBLE.has(m.creatureId)) return { color: 'gray', tag: 'inert for this carrier' };
  if (BORNEABLE.includes(tid)) {
    const state = useVerbs(tid).state;
    return { color: 'yellow', tag: isBorne(m, tid) ? state : `carried · not ${state}` };
  }
  return { color: 'yellow', tag: 'passive' };
}

/** Every item the party carries, from the item's point of view: what it is, who has it, and whether it can be used now. */
export function inventoryRows(state: GameState): InventoryRow[] {
  const labels = memberLabels(state.party);
  const usable = new Set(legalActions(state).flatMap((a) => (a.type === 'useArtifact' ? [a.artifact] : [])));
  // Revised combat: the Scroll is read in a window at the start of the attack, not as a useArtifact action.
  if (state.fight?.pending?.kind === 'scroll') usable.add(19);
  return state.party.flatMap((m, mi) =>
    m.status === 3 ? [] : m.treasure.map((tid, idx) => {
      const t = ALL_TREASURES[tid]!;
      return { mi, idx, tid, name: t.name, weight: t.weight, artifact: t.kind === 'artifact', carrier: labels[mi]!, ...artifactState(state, mi, tid, usable) };
    }));
}
