import { useEffect, useRef, useState } from 'react';
import { driveStrangers, reduce, type GameAction, type GameEvent, type GameState } from '@sorcerers-cave/engine';
import { loadManifest } from '../data/manifest';
import { createCaveAdapter, type CaveAdapter } from '../view/engineAdapter';
import type { ArtTables } from '../view/projection';
import { DEFAULT_PARTY_COLOR } from './partyColors';

/**
 * An in-memory game session with the same shape as useCaveGame (the Convex-bound one): the tutorial plays the real game UI
 * against a local engine, so nothing is created, saved, logged or scored on the server. `make` builds the starting state;
 * passing null leaves the session idle (the hook is always called, so GameScreen can choose per mount).
 */
export function useLocalGame(
  make: (() => GameState) | null,
  onResolved?: (events: GameEvent[], midState?: GameState) => void,
  canAct?: () => boolean,
  // The tutorial's lock: returns the hidden set-up actions to apply first, or null to refuse the action.
  gate?: (action: GameAction) => GameAction[] | null,
) {
  const [art, setArt] = useState<ArtTables | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const adapterRef = useRef<CaveAdapter | null>(null);
  const syncedRef = useRef<GameState | null>(null);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;
  const canActRef = useRef(canAct);
  canActRef.current = canAct;
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const makeRef = useRef(make);
  makeRef.current = make;
  const active = make !== null;

  useEffect(() => { if (active) void loadManifest().then(setArt); }, [active]);
  // A fresh game each time the session becomes active; dropped when it goes idle.
  useEffect(() => {
    if (!active) { stateRef.current = null; adapterRef.current = null; syncedRef.current = null; setState(null); return; }
    const fresh = makeRef.current!();
    stateRef.current = fresh;
    setState(fresh);
  }, [active]);

  // The engine's reduce is synchronous and pure; this mirrors the server's applyAction (reduce, then the strangers' own moves).
  const apply = (action: GameAction) => {
    const cur = stateRef.current;
    if (!cur) return null;
    const before = gateRef.current ? gateRef.current(action) : [];
    if (before === null) return { state: cur, events: [] as GameEvent[], midState: undefined };
    const prepared = before.reduce((s, b) => reduce(s, b).state, cur); // forced reactions and dice, never shown
    const reduced = reduce(prepared, action);
    const driven = driveStrangers(reduced.state);
    stateRef.current = driven.state;
    setState(driven.state);
    return { state: driven.state, events: [...reduced.events, ...driven.applied.flatMap((a) => a.events)], midState: reduced.midState };
  };

  if (art && state && !adapterRef.current) {
    adapterRef.current = createCaveAdapter(state, art, {
      // Renderer-initiated actions (a move off a marker): surface their dice and notices as the server path does.
      onAction: (a: GameAction) => {
        const r = apply(a);
        onResolvedRef.current?.(r?.events ?? [], r?.midState);
      },
      canAct: () => !canActRef.current || canActRef.current(),
      leavePickupOnMove: true,
    });
    syncedRef.current = state;
  }

  const present = (s: GameState, canActNow?: boolean) => {
    if (!adapterRef.current) return;
    if (syncedRef.current !== s) {
      adapterRef.current.sync(s, canActNow);
      syncedRef.current = s;
    } else if (canActNow !== undefined) {
      adapterRef.current.sync(s, canActNow);
    }
  };

  const dispatch = (action: GameAction) => Promise.resolve(apply(action));
  return { engine: adapterRef.current, loading: !art || !state, state, color: DEFAULT_PARTY_COLOR, code: null as string | null, dispatch, present };
}
