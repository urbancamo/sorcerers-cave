import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { loadManifest } from "../data/manifest";
import { createCaveAdapter, type CaveAdapter } from "../view/engineAdapter";
import type { ArtTables } from "../view/projection";
import type { GameState, GameAction, GameEvent } from "@sorcerers-cave/engine";
import { DEFAULT_PARTY_COLOR, type PartyColor } from "./partyColors";

/**
 * Bind a Convex-authoritative game to a synchronous CaveEngine adapter.
 * The adapter mirrors the authoritative snapshot (reconciled on every query update)
 * and forwards accepted actions to the `applyAction` mutation (server authority).
 */
export function useCaveGame(
  id: Id<"games"> | null,
  onResolved?: (events: GameEvent[], midState?: GameState) => void,
) {
  const game = useQuery(api.game.get, id ? { id } : "skip");
  const apply = useMutation(api.game.applyAction);
  const [art, setArt] = useState<ArtTables | null>(null);
  const adapterRef = useRef<CaveAdapter | null>(null);
  const adapterIdRef = useRef<Id<"games"> | null>(null);
  const syncedRef = useRef<GameState | null>(null);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => { void loadManifest().then(setArt); }, []);

  const state = (game as { state?: GameState } | null | undefined)?.state ?? null;
  const color = (game as { color?: PartyColor } | null | undefined)?.color ?? DEFAULT_PARTY_COLOR;
  // The four-letter resume code, shown in the HUD so the player can note it and resume at any time
  // (assigned at game creation; the game is authoritatively persisted on every action — no Save needed).
  const code = (game as { code?: string } | null | undefined)?.code ?? null;

  // Create the adapter when the game binds; the caller drives WHICH state the renderer mirrors
  // via `present` (below) so the presentation can lag the authoritative state while a die roll
  // shows (the background must not change until the roll has completed).
  if (art && state && id) {
    if (!adapterRef.current || adapterIdRef.current !== id) {
      adapterIdRef.current = id;
      adapterRef.current = createCaveAdapter(state, art, {
        // Surface dice rolled by a renderer-initiated action (e.g. ghouls fighting each member on
        // entry) — these bypass the panel dispatch path that normally shows the DiceRoll.
        onAction: (action: GameAction) => {
          if (!id) return;
          void apply({ id, action }).then((res) => {
            const r = res as { events?: GameEvent[]; midState?: GameState } | null;
            onResolvedRef.current?.(r?.events ?? [], r?.midState);
          });
        },
      });
      syncedRef.current = state;
    }
  }

  // Reconcile the adapter mirror to the given (display) state DURING render, not in an effect:
  // child effects (e.g. CaveCanvas's refresh) run before this hook's effects would, so a
  // render-phase sync guarantees consumers that read engine.current see the presented state
  // (otherwise a withdraw/retreat leaves the view on the old tile). Idempotent per state.
  const present = (s: GameState) => {
    if (adapterRef.current && syncedRef.current !== s) {
      adapterRef.current.sync(s);
      syncedRef.current = s;
    }
  };

  // Returns the action's result ({ state, events }) so callers can react to events
  // (e.g. animate a reaction roll); null when there is no game.
  const dispatch = (action: GameAction) => (id ? apply({ id, action }) : Promise.resolve(null));
  return { engine: adapterRef.current, loading: !art || game === undefined, state, color, code, dispatch, present };
}
