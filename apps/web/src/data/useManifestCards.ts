import { useEffect, useState } from "react";
import { loadManifest, type CardArt } from "./manifest";

let cache: CardArt[] | null = null;
let inflight: Promise<CardArt[]> | null = null;

/** The small-card art, loaded once and shared. `null` until ready. */
export function useManifestCards(): CardArt[] | null {
  const [cards, setCards] = useState<CardArt[] | null>(cache);
  useEffect(() => {
    if (cache) { setCards(cache); return; }
    inflight ??= loadManifest().then(({ cards }) => (cache = cards));
    let live = true;
    void inflight.then((c) => { if (live) setCards(c); });
    return () => { live = false; };
  }, []);
  return cards;
}
