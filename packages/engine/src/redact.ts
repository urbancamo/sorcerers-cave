import type { GameState } from "./state";

/**
 * The state as a client may hold it: with everything that lets the future be worked out removed (docs/security/review-2026-11.md, finding 1).
 * `seed` (and a multiplayer party's `diceSeed`) is the generator behind every die and shuffle; the two packs are the draw order. A client
 * that held them could play the game ahead offline and send only the winning line. What is left keeps its shape and its lengths (the
 * decks are shown as "n of m left"), but the card values are zero, so a client must never `reduce` an action that draws: the server
 * decides those and sends back the result. The pack positions (`largeIdx`, `smallIdx`) stay: they say how many cards are gone, not which.
 */
export function redactState<T extends GameState>(state: T): T {
  const { diceSeed: _diceSeed, ...rest } = state as T & { diceSeed?: number };
  return { ...rest, seed: 0, largePack: state.largePack.map(() => 0), smallPack: state.smallPack.map(() => 0) } as T;
}
