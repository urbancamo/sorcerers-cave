import { ALL_TREASURES, BORNEABLE, canUseArtifact, isBorne, legalActions, type GameState } from '@sorcerers-cave/engine';
import { memberLabels } from './memberLabels';

// Draft classification for the inventory (docs/requirements/ui-review, "Artifact classification"); it still needs a
// rules review. Active artifacts need a player action; passive ones work by being carried or wielded.
const ACTIVE = new Set([4, 5, 6, 8, 9, 12, 15, 16, 19]);
const T_MAGIC_SHIELD = 20;
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
  if (ACTIVE.has(tid)) {
    if (!canUseArtifact(m.creatureId, tid)) return { color: 'gray', tag: 'carrier cannot use' };
    return usable.has(tid) ? { color: 'green', tag: 'usable now' } : { color: 'yellow', tag: 'not usable now' };
  }
  if (tid === T_MAGIC_SHIELD && !SHIELD_ELIGIBLE.has(m.creatureId)) return { color: 'gray', tag: 'inert for this carrier' };
  return { color: 'yellow', tag: BORNEABLE.includes(tid) && isBorne(m, tid) ? 'wielded' : 'passive' };
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
