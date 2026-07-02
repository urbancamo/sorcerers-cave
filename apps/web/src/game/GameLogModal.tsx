import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { downloadLog, type GameLog } from "./gameLog";

/** HUD "Game log" panel: download the current game's full move log — a human-readable record (.txt)
 *  or a machine-readable, replayable debug log (.json). The log is fetched from the owner-scoped
 *  `game.log` query; both downloads are produced entirely client-side (see gameLog.ts). */
export function GameLogModal({ gameId, onClose }: { gameId: Id<"games">; onClose: () => void }) {
  const log = useQuery(api.game.log, { id: gameId }) as GameLog | null | undefined;

  return (
    <div className="scv-dice-overlay" role="dialog" aria-label="game log" data-testid="log-modal">
      <div className="scv-dice-card">
        <div className="scv-dice-title">Game log</div>
        {log === undefined ? (
          <p>Loading the log…</p>
        ) : log === null ? (
          <p>No log is available for this game.</p>
        ) : (
          <>
            <div className="scv-dice-msg">
              <p>
                {log.moves.length} move{log.moves.length === 1 ? "" : "s"} recorded.
                {log.game.seed == null && " This game predates full logging, so it can't be replayed from scratch."}
              </p>
            </div>
            <button className="scv-primary" data-testid="log-dl-human" onClick={() => downloadLog(log, "human")}>
              Download readable log (.txt)
            </button>
            <button className="scv-primary" data-testid="log-dl-machine" onClick={() => downloadLog(log, "machine")}>
              Download debug log (.json)
            </button>
          </>
        )}
        <button className="scv-primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
