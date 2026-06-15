import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CREATURES } from "@sorcerers-cave/engine";
import { PARTY_COLOR_HEX, type PartyColor } from "./partyColors";
import { ChatPanel } from "./ChatPanel";
import { PartyDraft } from "./PartyDraft";

type Party = { seat: number; name: string; color: string; status: string; members: number[] };

/** Roster shown during play/finish (shared gameplay rendering arrives in Phase 4). */
function Roster({ parties, currentSeat }: { parties: Party[]; currentSeat: number | null }) {
  return (
    <ul className="scv-lobby-seats">
      {parties.map((p) => (
        <li key={p.seat} className={"scv-lobby-seat" + (p.seat === currentSeat ? " active" : "")}>
          <span className="scv-lobby-chip" style={{ background: PARTY_COLOR_HEX[p.color as PartyColor] }} />
          <span className="scv-lobby-nm">{p.name}{p.seat === currentSeat && <span className="scv-lobby-host"> turn</span>}</span>
          <span className="scv-lobby-ready">{p.members.map((id) => CREATURES[id]!.name).join(", ") || "—"}</span>
        </li>
      ))}
    </ul>
  );
}

/** A multiplayer game once the lobby has started: the party draft, then (Phase 4) shared play. */
export function MultiplayerGame({ gameId, onExit }: { gameId: Id<"games">; onExit: () => void }) {
  const proj = useQuery(api.multiplayer.gameState, { gameId });

  if (proj === undefined) return <section className="scv-panel scv-mp"><p className="scv-muted">Loading…</p></section>;
  if (proj === null) return <section className="scv-panel scv-mp"><h2 className="scv-hd">Game not found</h2><button className="scv-primary" onClick={onExit}>Back to menu</button></section>;

  let body: React.ReactNode;
  if (proj.phase === "partySelect") {
    body = <PartyDraft gameId={gameId} proj={proj} />;
  } else if (proj.phase === "playing") {
    body = (
      <section className="scv-panel scv-mp">
        <h2 className="scv-hd">Into the cave</h2>
        <p className="scv-lobby-started">The expedition has begun. <span className="scv-muted">(Shared 3D play arrives in the next update.)</span></p>
        <Roster parties={proj.parties} currentSeat={proj.currentSeat ?? null} />
      </section>
    );
  } else if (proj.phase === "finished") {
    body = (
      <section className="scv-panel scv-mp">
        <h2 className="scv-hd">Game over</h2>
        <Roster parties={proj.parties} currentSeat={null} />
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
