import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { unpackCoord, type GameState } from "@sorcerers-cave/engine";
import { createCaveAdapter, type CaveAdapter } from "../view/engineAdapter";
import { loadManifest } from "../data/manifest";
import type { ArtTables } from "../view/projection";
import { CaveCanvas, type OtherPartyToken } from "../view/CaveCanvas";
import { DEFAULT_PARTY_COLOR, type PartyColor } from "./partyColors";

/**
 * Read-only "follow along" view: renders the cave exactly as the spectated party sees it (their
 * composed state from `spectateView`), with no controls. Returns to the standings via onBack.
 */
export function SpectateView({ gameId, seat, onBack }: { gameId: Id<"games">; seat: number; onBack: () => void }) {
  const view = useQuery(api.multiplayer.spectateView, { gameId, seat });
  const [art, setArt] = useState<ArtTables | null>(null);
  useEffect(() => { void loadManifest().then(setArt); }, []);

  const adapterRef = useRef<CaveAdapter | null>(null);
  const syncedRef = useRef<GameState | null>(null);
  const state = (view?.state as GameState | undefined) ?? null;

  // Bind a read-only adapter (canAct false → no controls offered) to the spectated party's state.
  if (art && state) {
    if (!adapterRef.current) adapterRef.current = createCaveAdapter(state, art, { canAct: () => false });
    else if (syncedRef.current !== state) adapterRef.current.sync(state);
    syncedRef.current = state;
  }

  if (view === undefined || view === null || !art || !state || !adapterRef.current) {
    return <p className="scv-mp-loading">Loading view…</p>;
  }

  const color = (view.color as PartyColor) ?? DEFAULT_PARTY_COLOR;
  const otherParties: OtherPartyToken[] = view.parties
    .filter((p) => p.seat !== seat && p.status === "exploring")
    .map((p) => {
      const area = state.areas[p.partyArea];
      if (!area) return null;
      const c = unpackCoord(area.coord);
      return { color: p.color, col: c.x, row: c.y, level: c.level };
    })
    .filter((x): x is OtherPartyToken => x !== null);

  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas key={`spectate:${seat}`} engine={adapterRef.current} state={state} color={color} otherParties={otherParties} multiplayer />
      <div className="scv-spectate-banner">Following <b>{view.name}</b></div>
      <button className="scv-mp-standings" onClick={onBack}>← Back to Standings</button>
    </div>
  );
}
