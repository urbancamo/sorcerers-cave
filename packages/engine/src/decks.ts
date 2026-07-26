import { shuffle } from "./rng";
import { AREA_CARDS, GATEWAY_INDEX } from "./data/areaCards";
import { smallPackTemplate } from "./data/smallPack";

/** Solo game variants (§EXT, state.ts) — threaded through the deck builders so the extension kit's
 *  entries can be appended to the template before the shuffle. Unused for now: no variant currently
 *  changes either pack (SC-EXT-1); the parameter exists so later kit tasks need no signature change. */
type DeckVariants = { extensionKit?: boolean };

/** 60 shuffled area-card values (Gateway removed). Returns the advanced seed. */
export function buildLargePack(seed: number, _variants?: DeckVariants): { seed: number; pack: number[] } {
  const values = AREA_CARDS.filter((_, i) => i !== GATEWAY_INDEX);
  const { seed: nextSeed, result } = shuffle(seed, values);
  return { seed: nextSeed, pack: result };
}

/** 52 shuffled small-pack card codes. Returns the advanced seed. */
export function buildSmallPack(seed: number, _variants?: DeckVariants): { seed: number; pack: number[] } {
  const { seed: nextSeed, result } = shuffle(seed, smallPackTemplate());
  return { seed: nextSeed, pack: result };
}
