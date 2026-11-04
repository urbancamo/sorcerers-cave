import { useEffect, useRef } from 'react';

/**
 * When treasure comes on offer (after a win, a befriending, or an unguarded chamber), put the first piece on the card panel so the
 * "Give to" choices are in view. `key` names this pickup (the area and what lies there): a new key is a new offer, a re-render is not.
 */
export function useOfferOnPickup(active: boolean, key: string, offer: () => void): void {
  const offerRef = useRef(offer);
  offerRef.current = offer;
  useEffect(() => {
    if (active) offerRef.current();
  }, [active, key]);
}
