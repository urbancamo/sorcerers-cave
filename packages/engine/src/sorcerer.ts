// The Sorcerer's terms (§The Sorcerer; `variants.sorcererTeleport`): a player who defeats the Sorcerer and his
// companions may spare his life on condition that he transports the party and any treasure in the chamber, by
// magical means, to an area of the player's choice. This is the destination rule, shared by the legal-action
// list and the reducer so the two cannot disagree.
import { decodeArea } from "./decode";
import { AF_DESTROYED, AF_UNRESOLVED, type GameState } from "./state";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_WHIRLPOOL } from "./data/areaCards";

// Tiles with no firm floor to arrive on: the Whirlpool (no vertical or magical arrival ever lands on it) and the
// two pits, whose floor treasure is sunk or recoverable only by a Giant or the Charmed Flute.
const NO_LANDING = new Set([SPECIAL_WHIRLPOOL, SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT]);

/** May the party be teleported to `state.areas[idx]`? Any area card already discovered (face up, not
 *  collapsed, not a Spell-remapped card still face down) other than the one the party stands in. */
export function canTeleportTo(state: GameState, idx: number): boolean {
  const a = state.areas[idx];
  if (!a || idx === state.partyArea || !a.faceUp) return false;
  if ((a.flags & (AF_DESTROYED | AF_UNRESOLVED)) !== 0) return false;
  return !NO_LANDING.has(decodeArea(a.card).special);
}

/** Indices into `state.areas` of every area the party may be teleported to. */
export function teleportDestinations(state: GameState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.areas.length; i++) if (canTeleportTo(state, i)) out.push(i);
  return out;
}
