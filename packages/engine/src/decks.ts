import { shuffle } from "./rng";
import { AREA_CARDS, EXT_AREA_CARDS, GATEWAY_INDEX } from "./data/areaCards";
import { smallPackTemplate, smallPackExtension } from "./data/smallPack";

/** Solo game variants (§EXT, state.ts) — threaded through the deck builders so the extension kit's
 *  entries can be appended to the template before the shuffle (SC-EXT-4). Absent/false ⇒ the exact
 *  same template shuffled as before this variant existed — the byte-identity guarantee (SC-EXT-1). */
type DeckVariants = { extensionKit?: boolean };

/** 60 (90 with the kit) shuffled area-card values (Gateway removed). Returns the advanced seed. */
export function buildLargePack(seed: number, variants?: DeckVariants): { seed: number; pack: number[] } {
  const values = AREA_CARDS.filter((_, i) => i !== GATEWAY_INDEX);
  const template = variants?.extensionKit ? values.concat(EXT_AREA_CARDS) : values;
  const { seed: nextSeed, result } = shuffle(seed, template);
  return { seed: nextSeed, pack: result };
}

/** 71 (101 with the kit) shuffled small-pack card codes. Returns the advanced seed. */
export function buildSmallPack(seed: number, variants?: DeckVariants): { seed: number; pack: number[] } {
  const template = variants?.extensionKit
    ? smallPackTemplate().concat(smallPackExtension())
    : smallPackTemplate();
  const { seed: nextSeed, result } = shuffle(seed, template);
  return { seed: nextSeed, pack: result };
}
