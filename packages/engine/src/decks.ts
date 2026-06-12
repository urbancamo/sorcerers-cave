import { shuffle } from "./rng";
import { AREA_CARDS, GATEWAY_INDEX } from "./data/areaCards";
import { smallPackTemplate } from "./data/smallPack";

/** 60 shuffled area-card values (Gateway removed). Returns the advanced seed. */
export function buildLargePack(seed: number): { seed: number; pack: number[] } {
  const values = AREA_CARDS.filter((_, i) => i !== GATEWAY_INDEX);
  const { seed: nextSeed, result } = shuffle(seed, values);
  return { seed: nextSeed, pack: result };
}

/** 52 shuffled small-pack card codes. Returns the advanced seed. */
export function buildSmallPack(seed: number): { seed: number; pack: number[] } {
  const { seed: nextSeed, result } = shuffle(seed, smallPackTemplate());
  return { seed: nextSeed, pack: result };
}
