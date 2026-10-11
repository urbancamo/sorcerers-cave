import { AF_DESTROYED, AF_UNRESOLVED, type GameState } from "./state";

/** The Sibyl's creature id and small-pack code (`100 + id`) — the optional variant card (SC-SIB-1). */
export const C_SIBYL = 21;
export const SIBYL_CODE = 100 + C_SIBYL;

/** The Sibyl stands in the chamber working set's parked-awake slot (`state.lulled`, shared with
 *  flute-lulled Dragons): every leave-the-chamber path already parks that slot as `100 + id`, so she
 *  rides along without any new parking code, and no fight/mutiny/scoring code ever sees her as a
 *  stranger (SC-SIB-2). */
export const sibylHere = (state: GameState): boolean => (state.lulled ?? []).includes(C_SIBYL);

/** She is ready to be met: here, not yet met by this party, and no other stranger is left to deal
 *  with first — she is tested "after other STRANGERS have been dealt with, and only once" (SC-SIB-4). */
export function sibylWaiting(state: GameState): boolean {
  return state.strangers.length === 0 && state.sibylMet !== true && sibylHere(state);
}

/** A parked content code that is a stranger guarding the chamber — any stranger but the Sibyl, who
 *  guards nothing ("She does not guard treasure found with her", SC-SIB-6). */
export const isGuardCode = (code: number): boolean => code >= 100 && code < 200 && code !== SIBYL_CODE;

/** Indices of placed tiles the Sibyl may show (SC-SIB-8): tiles lying face-down — dead-end cards laid
 *  unseen, and Spell-remapped tiles — that are not collapsed. */
export function examinableAreas(state: GameState): number[] {
  const out: number[] = [];
  state.areas.forEach((a, i) => {
    const faceDown = !a.faceUp || (a.flags & AF_UNRESOLVED) !== 0;
    if (faceDown && (a.flags & AF_DESTROYED) === 0) out.push(i);
  });
  return out;
}
