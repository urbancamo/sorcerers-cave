import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CREATURES, TREASURES, GS_ESCAPED, GS_DEAD, GS_QUIT, type PartyMember } from "@sorcerers-cave/engine";

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

const STATUS_NOTE: Record<number, string> = { 2: "petrified", 3: "fallen" };
const survived = (m: PartyMember) => m.status === 0 || m.status === 1;

/** Roll-call detail for one score: who walked out, and the treasure & artifacts they carried. */
function ScoreDetail({ row, rank, onBack }: { row: LeaderboardRow; rank?: number; onBack: () => void }) {
  const left = row.party.filter(survived);
  const artifacts = left.flatMap((m) => m.treasure).filter((t) => TREASURES[t]?.kind === "artifact").length;
  return (
    <div className="scv-hs-detail" data-testid="hs-detail">
      <button className="scv-hs-back" onClick={onBack}>← Back to scores</button>
      <div className="scv-hs-detail-hd">
        <span className="scv-hs-detail-name">{rank ? `#${rank} ` : ""}{row.name}</span>
        <span className="scv-hs-detail-meta">{OUTCOME_LABEL[row.outcome] ?? "—"} · {row.score} pts</span>
      </div>
      <p className="scv-muted scv-hs-detail-sub">
        {left.length} of {row.party.length} left the cave
        {artifacts > 0 ? ` with ${artifacts} artifact${artifacts > 1 ? "s" : ""}` : ""}.
      </p>
      <ul className="scv-rollcall">
        {row.party.map((m, i) => {
          const c = CREATURES[m.creatureId];
          const note = STATUS_NOTE[m.status];
          return (
            <li key={i} className={"scv-rc-member" + (survived(m) ? "" : " scv-rc-out")}>
              <div className="scv-rc-head">
                <span className="scv-rc-name">
                  {c?.name ?? `Creature ${m.creatureId}`}
                  {m.dragonKills > 0 && <span className="scv-rc-tag"> dragon-slayer</span>}
                  {note && <span className="scv-rc-tag"> {note}</span>}
                </span>
              </div>
              {m.treasure.length > 0 ? (
                <ul className="scv-rc-items">
                  {m.treasure.map((tid, j) => {
                    const t = TREASURES[tid];
                    return (
                      <li key={j}>
                        <span>
                          {t?.name ?? `Treasure ${tid}`}
                          {t?.kind === "artifact" && <span className="scv-rc-tag"> artifact</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="scv-muted scv-hs-detail-empty">— carried nothing —</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Presentational leaderboard. Rows are clickable to reveal the party & artifacts that left the
 *  cave. `rows === undefined` means still loading. */
export function HighScores({ rows, highlightId }: { rows: LeaderboardRow[] | undefined; highlightId?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (rows === undefined) return <p className="scv-muted scv-hs-status">Loading high scores…</p>;
  if (rows.length === 0) return <p className="scv-muted scv-hs-status">No scores recorded yet — be the first.</p>;

  const openIndex = rows.findIndex((r) => r._id === openId);
  if (openIndex !== -1) {
    return <ScoreDetail row={rows[openIndex]!} rank={openIndex + 1} onBack={() => setOpenId(null)} />;
  }

  return (
    <table className="scv-hs-table" data-testid="high-scores">
      <thead>
        <tr>
          <th className="scv-hs-rank">#</th>
          <th>Name</th>
          <th>Outcome</th>
          <th className="scv-hs-num">Party</th>
          <th className="scv-hs-num">Score</th>
          <th aria-hidden="true"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const survivors = r.party.filter(survived).length;
          const open = () => setOpenId(r._id);
          return (
            <tr
              key={r._id}
              className={"scv-hs-row" + (r._id === highlightId ? " scv-hs-me" : "")}
              onClick={open}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
              title="View the party & artifacts that left the cave"
            >
              <td className="scv-hs-rank">{i + 1}</td>
              <td>{r.name}</td>
              <td>{OUTCOME_LABEL[r.outcome] ?? "—"}</td>
              <td className="scv-hs-num">{survivors}/{r.party.length}</td>
              <td className="scv-hs-num">{r.score}</td>
              <td className="scv-hs-chev" aria-hidden="true">›</td>
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
