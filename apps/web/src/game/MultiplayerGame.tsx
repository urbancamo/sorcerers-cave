import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ChatPanel } from "./ChatPanel";
import { PartyDraft } from "./PartyDraft";
import { MultiplayerPlay } from "./MultiplayerPlay";

/** A multiplayer game once the lobby has started: the party draft, then (Phase 4) shared play. */
export function MultiplayerGame({ gameId, onExit }: { gameId: Id<"games">; onExit: () => void }) {
  const proj = useQuery(api.multiplayer.gameState, { gameId });

  if (proj === undefined) return <section className="scv-panel scv-mp"><p className="scv-muted">Loading…</p></section>;
  if (proj === null) return <section className="scv-panel scv-mp"><h2 className="scv-hd">Game not found</h2><button className="scv-primary" onClick={onExit}>Back to menu</button></section>;

  // Shared 3D play renders full-screen (its own layout); the finished phase reuses it for the frozen
  // scoreboard over the read-only cave.
  if (proj.phase === "playing" || proj.phase === "finished") return <MultiplayerPlay gameId={gameId} onExit={onExit} />;

  let body: React.ReactNode;
  if (proj.phase === "partySelect") {
    body = <PartyDraft gameId={gameId} proj={proj} />;
  } else {
    body = <section className="scv-panel scv-mp"><p className="scv-muted">Waiting…</p></section>;
  }

  return (
    <div className="scv-mp-wrap">
      {body}
      <section className="scv-panel scv-mp">
        <ChatPanel gameId={gameId} />
        <button className="scv-primary ghost" onClick={onExit}>Leave to menu</button>
      </section>
    </div>
  );
}
