import { useState } from 'react';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { goldenBundle } from '../game/goldenGame';
import type { ReplayBundle } from '../game/ReplayView';

/** Opens a game's replay by code (a bundled scenario such as K001, or a saved game). `open` resolves null on success, or why not. */
export function useReplayBundle() {
  const convex = useConvex();
  const [bundle, setBundle] = useState<ReplayBundle | null>(null);
  const open = async (code: string): Promise<string | null> => {
    const golden = await goldenBundle(code);
    if (golden) { setBundle(golden); return null; }
    const found = (await convex.query(api.game.replayByCode, { code })) as ReplayBundle | null;
    if (!found) return 'No replayable game found with that code.';
    if (!found.replayable) return 'This game predates full logging and cannot be replayed.';
    setBundle(found);
    return null;
  };
  return { bundle, open, close: () => setBundle(null) };
}
