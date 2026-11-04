import type { GameState } from '@sorcerers-cave/engine';
import type { Area } from '../../view/ports';
import type { TileArt } from '../../data/manifest';
import { chamberName } from '../../data/areaText';
import type { Selected } from './CardPanel';

/**
 * On arrival at a special chamber (the Chasm, the Well, the Bell Rope...) with no card on its floor, the card panel shows the Area card:
 * its picture and the chamber's words. That is the Encounter Peter asked for, while the choices stay on the bar. Null anywhere else.
 */
export function arrivalSelection(state: GameState, here: Pick<Area, 'name' | 'tileId' | 'rot'>, tiles: TileArt[]): Selected | null {
  const name = chamberName(state, state.partyArea);
  if (!name) return null;
  return { kind: 'area', index: state.partyArea, name: here.name, file: tiles.find((t) => t.tileId === here.tileId)?.file ?? null, rot: here.rot };
}
