import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { GS_ESCAPED, GS_DEAD, GS_QUIT, type PartyMember } from "@sorcerers-cave/engine";

export interface LeaderboardRow {
  _id: string;
  name: string;
  score: number;
  outcome: number;
  party: PartyMember[];
  createdAt: number;
}

const OUTCOME_LABEL: Record<number, string> = {
  [GS_ESCAPED]: "Escaped",
  [GS_DEAD]: "Perished",
  [GS_QUIT]: "Abandoned",
};

/** Presentational leaderboard table. `rows === undefined` means still loading. */
export function HighScores({ rows, highlightId }: { rows: LeaderboardRow[] | undefined; highlightId?: string }) {
  if (rows === undefined) return <p className="scv-muted scv-hs-status">Loading high scores…</p>;
  if (rows.length === 0) return <p className="scv-muted scv-hs-status">No scores recorded yet — be the first.</p>;
  return (
    <table className="scv-hs-table" data-testid="high-scores">
      <thead>
        <tr>
          <th className="scv-hs-rank">#</th>
          <th>Name</th>
          <th>Outcome</th>
          <th className="scv-hs-num">Party</th>
          <th className="scv-hs-num">Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const survivors = r.party.filter((m) => m.status === 0 || m.status === 1).length;
          return (
            <tr key={r._id} className={r._id === highlightId ? "scv-hs-me" : undefined}>
              <td className="scv-hs-rank">{i + 1}</td>
              <td>{r.name}</td>
              <td>{OUTCOME_LABEL[r.outcome] ?? "—"}</td>
              <td className="scv-hs-num">{survivors}/{r.party.length}</td>
              <td className="scv-hs-num">{r.score}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Self-fetching modal used from the splash screen (only mounts when opened). */
export function HighScoresModal({ onClose }: { onClose: () => void }) {
  const rows = useQuery(api.highScores.list) as LeaderboardRow[] | undefined;
  return (
    <div className="scv-hs-overlay" role="dialog" aria-label="high scores" onClick={onClose}>
      <div className="scv-hs-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="scv-hd">High Scores</h2>
        <HighScores rows={rows} />
        <button className="scv-primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
