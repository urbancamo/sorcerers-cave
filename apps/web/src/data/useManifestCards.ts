import { useEffect, useState } from "react";
import { loadManifest, type CardArt, type TileArt } from "./manifest";

type Art = { tiles: TileArt[]; cards: CardArt[] };

// One fetch of the manifest, shared by every hook below.
let art: Art | null = null;
let inflight: Promise<Art> | null = null;
// A failed fetch clears `inflight` so a later mount can retry; callers treat art as optional (no art ⇒ no images).
const loadArt = (): Promise<Art> => (inflight ??= loadManifest().then((a) => (art = a)).catch((e) => { inflight = null; throw e; }));

/** The small-card art, loaded once and shared. `null` until ready. */
export function useManifestCards(): CardArt[] | null {
  const [cards, setCards] = useState<CardArt[] | null>(art?.cards ?? null);
  useEffect(() => {
    if (art) { setCards(art.cards); return; }
    let live = true;
    loadArt().then((a) => { if (live) setCards(a.cards); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return cards;
}

/** Tile and card art together (the area map needs both), loaded once and shared. `null` until ready. */
export function useManifestArt(): Art | null {
  const [loaded, setLoaded] = useState<Art | null>(art);
  useEffect(() => {
    if (art) { setLoaded(art); return; }
    let live = true;
    loadArt().then((a) => { if (live) setLoaded(a); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return loaded;
}
