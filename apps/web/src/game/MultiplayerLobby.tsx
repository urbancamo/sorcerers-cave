import { useState, type CSSProperties } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { PARTY_COLORS, PARTY_COLOR_HEX, type PartyColor } from "./partyColors";
import { ChatPanel } from "./ChatPanel";
import { MultiplayerGame } from "./MultiplayerGame";

/** Reactive multiplayer lobby: seats, colour/ready controls, host start-lock and chat (Phase 1). */
export function MultiplayerLobby({ code, onExit }: { code: string; onExit: () => void }) {
  const lob = useQuery(api.multiplayer.lobby, { code });
  const setColor = useMutation(api.multiplayer.setColor);
  const setReady = useMutation(api.multiplayer.setReady);
  const leave = useMutation(api.multiplayer.leaveSeat);
  const start = useMutation(api.multiplayer.startGame);
  const [err, setErr] = useState<string | null>(null);

  if (lob === undefined) {
    return <section className="scv-panel scv-mp"><p className="scv-muted">Loading lobby…</p></section>;
  }
  if (lob === null) {
    return (
      <section className="scv-panel scv-mp">
        <h2 className="scv-hd">Lobby not found</h2>
        <button className="scv-primary" onClick={onExit}>Back to menu</button>
      </section>
    );
  }

  // Once the host starts, the lobby hands off to the in-game view (draft → play).
  if (lob.lobby !== "open") return <MultiplayerGame gameId={lob.gameId} onExit={onExit} />;

  const gameId = lob.gameId;
  const me = lob.seats.find((s) => s.isYou);
  const taken = new Set(lob.takenColors);

  const doLeave = async () => { await leave({ gameId }); onExit(); };
  const doStart = async () => {
    setErr(null);
    const res = await start({ gameId });
    if (!res.ok) setErr(res.reason === "need_players" ? "Need at least two players to start." : "Could not start.");
  };

  return (
    <section className="scv-panel scv-mp scv-lobby">
      <h2 className="scv-hd">Multiplayer lobby</h2>
      <p className="scv-lobby-code">Game code <b>{lob.code}</b> <span className="scv-muted">— share it to invite players</span></p>

      <ul className="scv-lobby-seats">
        {lob.seats.map((s) => (
          <li key={s.seat} className="scv-lobby-seat">
            <span className="scv-lobby-chip" style={{ background: PARTY_COLOR_HEX[s.color as PartyColor] }} />
            <span className="scv-lobby-nm">
              {s.partyName}
              {s.isYou && <span className="scv-muted"> (you)</span>}
              {s.isHost && <span className="scv-lobby-host"> host</span>}
            </span>
            <span className={"scv-lobby-ready" + (s.ready ? " on" : "")}>{s.ready ? "ready" : "…"}</span>
          </li>
        ))}
        {Array.from({ length: Math.max(0, lob.maxSeats - lob.seats.length) }).map((_, i) => (
          <li key={"empty" + i} className="scv-lobby-seat empty">
            <span className="scv-lobby-chip empty" />
            <span className="scv-muted">open seat</span>
          </li>
        ))}
      </ul>

      {me && (
        <div className="scv-lobby-controls">
          <div className="scv-mp-field">
            <span>Your colour</span>
            <div className="scv-mp-colors">
              {PARTY_COLORS.map((c) => {
                const isTaken = taken.has(c) && c !== me.color;
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={isTaken}
                    className={"scv-mp-swatch" + (me.color === c ? " sel" : "") + (isTaken ? " taken" : "")}
                    style={{ "--swatch": PARTY_COLOR_HEX[c] } as CSSProperties}
                    aria-label={c}
                    onClick={() => void setColor({ gameId, color: c })}
                  />
                );
              })}
            </div>
          </div>
          <button className="scv-primary" onClick={() => void setReady({ gameId, ready: !me.ready })}>
            {me.ready ? "Not ready" : "I'm ready"}
          </button>
        </div>
      )}

      {err && <p className="scv-resume-err" role="alert">{err}</p>}

      <div className="scv-lobby-actions">
        {lob.isHost && (
          <button className="scv-primary" disabled={lob.seats.length < 2} onClick={() => void doStart()}>
            Start game ({lob.seats.length})
          </button>
        )}
        <button className="scv-primary ghost" onClick={() => void doLeave()}>Leave</button>
      </div>

      <ChatPanel gameId={gameId} />
    </section>
  );
}
