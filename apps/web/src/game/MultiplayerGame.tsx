import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CREATURES } from "@sorcerers-cave/engine";
import { PARTY_COLOR_HEX, type PartyColor } from "./partyColors";
import { ChatPanel } from "./ChatPanel";
import { PartyDraft } from "./PartyDraft";
import { MultiplayerPlay } from "./MultiplayerPlay";

type Party = { seat: number; name: string; color: string; status: string; members: number[]; score: number };

const OUTCOME: Record<string, string> = {
  left: "Escaped", wiped: "Perished", quit: "Abandoned", exploring: "Still in cave", selecting: "—",
};

/** Final standings once every party has finished: ranked by score, highest first. */
function Results({ parties }: { parties: Party[] }) {
  const ranked = [...parties].sort((a, b) => b.score - a.score);
  return (
    <ol className="scv-mp-results">
      {ranked.map((p, i) => (
        <li key={p.seat} className="scv-mp-result">
          <span className="scv-mp-rank">{i + 1}</span>
          <span className="scv-lobby-chip" style={{ background: PARTY_COLOR_HEX[p.color as PartyColor] }} />
          <span className="scv-mp-rnm">
            {p.name}
            <span className="scv-muted"> · {OUTCOME[p.status] ?? p.status} · {p.members.map((id) => CREATURES[id]!.name).join(", ") || "—"}</span>
          </span>
          <span className="scv-mp-rscore">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}

/** A multiplayer game once the lobby has started: the party draft, then (Phase 4) shared play. */
export function MultiplayerGame({ gameId, onExit }: { gameId: Id<"games">; onExit: () => void }) {
  const proj = useQuery(api.multiplayer.gameState, { gameId });

  if (proj === undefined) return <section className="scv-panel scv-mp"><p className="scv-muted">Loading…</p></section>;
  if (proj === null) return <section className="scv-panel scv-mp"><h2 className="scv-hd">Game not found</h2><button className="scv-primary" onClick={onExit}>Back to menu</button></section>;

  // Shared 3D play renders full-screen (its own layout), outside the panel/chat wrap below.
  if (proj.phase === "playing") return <MultiplayerPlay gameId={gameId} onExit={onExit} />;

  let body: React.ReactNode;
  if (proj.phase === "partySelect") {
    body = <PartyDraft gameId={gameId} proj={proj} />;
  } else if (proj.phase === "finished") {
    body = (
      <section className="scv-panel scv-mp">
        <h2 className="scv-hd">Final results</h2>
        <Results parties={proj.parties} />
      </section>
    );
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
