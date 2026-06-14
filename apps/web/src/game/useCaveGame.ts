import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { loadManifest } from "../data/manifest";
import { createCaveAdapter, type CaveAdapter } from "../view/engineAdapter";
import type { ArtTables } from "../view/projection";
import type { GameState, GameAction } from "@sorcerers-cave/engine";
import { DEFAULT_PARTY_COLOR, type PartyColor } from "./partyColors";

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
  const syncedRef = useRef<GameState | null>(null);

  useEffect(() => { void loadManifest().then(setArt); }, []);

  const state = (game as { state?: GameState } | null | undefined)?.state ?? null;
  const color = (game as { color?: PartyColor } | null | undefined)?.color ?? DEFAULT_PARTY_COLOR;

  // Reconcile the adapter mirror to the authoritative snapshot DURING render, not in an
  // effect: child effects (e.g. CaveCanvas's refresh) run before this hook's effects would,
  // so syncing here guarantees consumers that read engine.current see the latest state
  // (otherwise a withdraw/retreat leaves the view on the old tile).
  if (art && state && id) {
    if (!adapterRef.current || adapterIdRef.current !== id) {
      adapterIdRef.current = id;
      adapterRef.current = createCaveAdapter(state, art, {
        onAction: (action: GameAction) => { if (id) void apply({ id, action }); },
      });
    } else if (syncedRef.current !== state) {
      adapterRef.current.sync(state);
    }
    syncedRef.current = state;
  }

  // Returns the action's result ({ state, events }) so callers can react to events
  // (e.g. animate a reaction roll); null when there is no game.
  const dispatch = (action: GameAction) => (id ? apply({ id, action }) : Promise.resolve(null));
  return { engine: adapterRef.current, loading: !art || game === undefined, state, color, dispatch };
}
