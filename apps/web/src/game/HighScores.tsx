import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CREATURES, TREASURES, GS_ESCAPED, GS_DEAD, GS_QUIT, type PartyMember } from "@sorcerers-cave/engine";
import { loadManifest, resolveCard, resolveCardVariant, type CardArt } from "../data/manifest";
import { downloadLog, type GameLog } from "./gameLog";

export interface LeaderboardRow {
  _id: string;
  name: string;
  score: number;
  outcome: number;
  party: PartyMember[];
  createdAt: number;
  // Extension kit (SC-EXT-29, design US-01): labels this score as a kit game. Absent/false on
  // every score recorded before the kit existed.
  extensionKit?: boolean;
}

const OUTCOME_LABEL: Record<number, string> = {
  [GS_ESCAPED]: "Escaped",
  [GS_DEAD]: "Perished",
  [GS_QUIT]: "Abandoned",
};

const STATUS_NOTE: Record<number, string> = { 2: "petrified", 3: "fallen" };
const survived = (m: PartyMember) => m.status === 0 || m.status === 1;

/** Roll-call detail for one score: who walked out, and the treasure & artifacts they carried —
 *  shown with the actual card art (progressive enhancement; falls back to names if art can't load). */
function ScoreDetail({ row, rank, onBack, onReplay }: {
  row: LeaderboardRow;
  rank?: number;
  onBack: () => void;
  /** Open the replay viewer for a game code — resolves null on success, or an explanatory
   *  message (e.g. the game predates full logging) to surface here. */
  onReplay?: (code: string) => Promise<string | null>;
}) {
  const [cards, setCards] = useState<CardArt[]>([]);
  const [replayErr, setReplayErr] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  useEffect(() => {
    let alive = true;
    loadManifest().then(({ cards }) => { if (alive) setCards(cards); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Expedition stats are derived on demand from the stored state + event log (see highScores.stats).
  const stats = useQuery(api.highScores.stats, { id: row._id as Id<"highScores"> });
  // This score's full move log, for the .txt / .log downloads (same cost as `stats` — both read the
  // game's event rows). `undefined` while loading, `null` if the game/log is gone.
  const log = useQuery(api.highScores.log, { id: row._id as Id<"highScores"> }) as GameLog | null | undefined;

  const left = row.party.filter(survived);
  const artifacts = left.flatMap((m) => m.treasure).filter((t) => TREASURES[t]?.kind === "artifact").length;
  // Each member's copy-index among same-creature members → its own card illustration (so two Men
  // don't share one image), mirroring the in-game party panel.
  const copyIdx = new Map<number, number>(), tally = new Map<number, number>();
  row.party.forEach((m, i) => { const k = tally.get(m.creatureId) ?? 0; copyIdx.set(i, k); tally.set(m.creatureId, k + 1); });

  return (
    <div className="scv-hs-detail" data-testid="hs-detail">
      <button className="scv-hs-back" onClick={onBack}>← Back to scores</button>
      <div className="scv-hs-detail-hd">
        <span className="scv-hs-detail-name">{rank ? `#${rank} ` : ""}{row.name}</span>
        <span className="scv-hs-detail-meta">
          {OUTCOME_LABEL[row.outcome] ?? "—"} · {row.score} pts{row.extensionKit ? " · Extension kit" : ""}
        </span>
      </div>
      <p className="scv-muted scv-hs-detail-sub">
        {left.length} of {row.party.length} left the cave
        {artifacts > 0 ? ` with ${artifacts} artifact${artifacts > 1 ? "s" : ""}` : ""}.
      </p>
      {/* The recorded game's code — replay the whole run from the title screen (comes with the log). */}
      {log?.game?.code && (
        <p className="scv-go-code" data-testid="game-code">
          Game code <b>{log.game.code}</b> — replay this run from the title screen.
        </p>
      )}
      {stats && (
        <dl className="scv-hsd-stats" data-testid="hs-stats">
          <div><dt>Max depth</dt><dd>Level {stats.maxDepth}</dd></div>
          <div><dt>Turns</dt><dd>{stats.turns}</dd></div>
          <div><dt>Areas mapped</dt><dd>{stats.areasMapped}</dd></div>
          <div><dt>Rounds fought</dt><dd>{stats.roundsFought}</dd></div>
          <div><dt>Enemies slain</dt><dd>{stats.enemiesSlain}</dd></div>
          <div><dt>Artifacts used</dt><dd>{stats.artifactsUsed}</dd></div>
          <div><dt>Dragons slain</dt><dd>{stats.dragonsSlain}</dd></div>
          <div><dt>Members lost</dt><dd>{stats.membersLost}</dd></div>
          {stats.sorcererSlain && <div><dt>Sorcerer</dt><dd>slain!</dd></div>}
        </dl>
      )}
      <ul className="scv-hsd-list">
        {row.party.map((m, i) => {
          const c = CREATURES[m.creatureId];
          const note = STATUS_NOTE[m.status];
          const cimg = resolveCardVariant("creature", m.creatureId, copyIdx.get(i) ?? 0, cards)?.file ?? null;
          return (
            <li key={i} className={"scv-hsd-member" + (survived(m) ? "" : " out")}>
              <div className="scv-hsd-card">
                {cimg ? <img src={cimg} alt={c?.name ?? ""} /> : <span className="ph">{(c?.name ?? "?")[0]}</span>}
              </div>
              <div className="scv-hsd-info">
                <div className="scv-hsd-name">
                  {c?.name ?? `Creature ${m.creatureId}`}
                  {m.dragonKills > 0 && <span className="scv-rc-tag"> dragon-slayer</span>}
                  {note && <span className="scv-rc-tag"> {note}</span>}
                </div>
                <div className="scv-hsd-items">
                  {m.treasure.length === 0 && <span className="scv-hsd-empty">carried nothing out</span>}
                  {m.treasure.map((tid, j) => {
                    const t = TREASURES[tid];
                    const timg = resolveCard("treasure", tid, cards)?.file ?? null;
                    return (
                      <span
                        key={j}
                        className={"scv-hsd-item" + (t?.kind === "artifact" ? " art" : "")}
                        title={t ? t.name + (t.kind === "artifact" ? " · artifact" : ` · ${t.weight}kg`) : `Treasure ${tid}`}
                      >
                        <span className="scv-hsd-thumb">
                          {timg ? <img src={timg} alt={t?.name ?? ""} /> : <span className="ph">{(t?.name ?? "?")[0]}</span>}
                        </span>
                        <span className="scv-hsd-item-nm">{t?.name ?? `Treasure ${tid}`}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {/* This expedition's record — watch it replayed move by move, or download its log
          as a readable narrative (.txt) / wide-carriage printer report (.log). */}
      {log && (
        <div className="scv-hsd-downloads" data-testid="download-log">
          <span className="scv-hsd-dl-label">This game</span>
          {onReplay && log.game?.code && (
            <button
              type="button"
              className="scv-hsd-dl"
              disabled={replaying}
              onClick={() => {
                if (!log.game?.code) return;
                setReplaying(true);
                setReplayErr(null);
                void onReplay(log.game.code).then((err) => { setReplaying(false); if (err) setReplayErr(err); });
              }}
            >
              {replaying ? "Loading…" : "▶ Replay"}
            </button>
          )}
          <button type="button" className="scv-hsd-dl" onClick={() => downloadLog(log, "human")}>Readable (.txt)</button>
          <button type="button" className="scv-hsd-dl" onClick={() => downloadLog(log, "printer")}>Printer (.log)</button>
        </div>
      )}
      {replayErr && <p className="scv-resume-err" role="alert">{replayErr}</p>}
    </div>
  );
}

/** Presentational leaderboard. Rows are clickable to reveal the party & artifacts that left the
 *  cave. `rows === undefined` means still loading. */
export function HighScores({ rows, highlightId, onReplay }: {
  rows: LeaderboardRow[] | undefined;
  highlightId?: string;
  /** When provided, the score detail offers a "Replay" of the recorded game (see ScoreDetail). */
  onReplay?: (code: string) => Promise<string | null>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (rows === undefined) return <p className="scv-muted scv-hs-status">Loading high scores…</p>;
  if (rows.length === 0) return <p className="scv-muted scv-hs-status">No scores recorded yet — be the first.</p>;

  const openIndex = rows.findIndex((r) => r._id === openId);
  if (openIndex !== -1) {
    return <ScoreDetail row={rows[openIndex]!} rank={openIndex + 1} onBack={() => setOpenId(null)} onReplay={onReplay} />;
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
              <td>
                {OUTCOME_LABEL[r.outcome] ?? "—"}
                {r.extensionKit && <span className="scv-ext-badge" title="Extension kit game">EXT</span>}
              </td>
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
export function HighScoresModal({ onClose, onReplay }: {
  onClose: () => void;
  onReplay?: (code: string) => Promise<string | null>;
}) {
  const rows = useQuery(api.highScores.list) as LeaderboardRow[] | undefined;
  return (
    <div className="scv-hs-overlay" role="dialog" aria-label="high scores" onClick={onClose}>
      <div className="scv-hs-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="scv-hd">High Scores</h2>
        <HighScores rows={rows} onReplay={onReplay} />
        <button className="scv-primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
