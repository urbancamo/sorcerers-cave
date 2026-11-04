import { useEffect } from 'react';
import type { LeftSlot } from './shellState';

/**
 * Opens the party list when a game begins, so the player is reassured that the party they picked is the one in play.
 * It keys on the game id and not on the slot, so closing the list sticks: only the next game opens it again.
 */
export function useOpenPartyOnce(gameId: string | null, setLeft: (slot: LeftSlot) => void): void {
  useEffect(() => {
    if (gameId) setLeft('party');
  }, [gameId, setLeft]);
}
