import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { loadManifest } from "../data/manifest";
import { createCaveAdapter, type CaveAdapter } from "../view/engineAdapter";
import type { ArtTables } from "../view/projection";
import type { GameState, GameAction } from "@sorcerers-cave/engine";

/**
 * Bind a Convex-authoritative game to a synchronous CaveEngine adapter.
 * The adapter mirrors the authoritative snapshot (reconciled on every query update)
 * and forwards accepted actions to the `applyAction` mutation (server authority).
 */
export function useCaveGame(id: Id<"games"> | null) {
  const game = useQuery(api.game.get, id ? { id } : "skip");
  const apply = useMutation(api.game.applyAction);
  const [art, setArt] = useState<ArtTables | null>(null);
  const adapterRef = useRef<CaveAdapter | null>(null);
  const adapterIdRef = useRef<Id<"games"> | null>(null);
  const [version, bump] = useState(0);

  useEffect(() => { void loadManifest().then(setArt); }, []);

  useEffect(() => {
    const state = (game as { state?: GameState } | null | undefined)?.state;
    if (!art || !state || !id) return;
    // Rebuild the adapter on first state OR when the bound game id changes (so a
    // switched/resumed game never keeps dispatching to the previous game's id).
    if (!adapterRef.current || adapterIdRef.current !== id) {
      adapterIdRef.current = id;
      adapterRef.current = createCaveAdapter(state, art, {
        onAction: (action: GameAction) => { void apply({ id, action }); },
      });
    } else {
      adapterRef.current.sync(state);
    }
    bump((n) => n + 1); // re-render consumers when the mirror changes
  }, [art, game, id, apply]);

  const state = (game as { state?: GameState } | null | undefined)?.state ?? null;
  return { engine: adapterRef.current, loading: !art || game === undefined, version, state };
}
