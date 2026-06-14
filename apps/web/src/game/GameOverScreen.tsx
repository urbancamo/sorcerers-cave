import { useState } from "react";
import { scoreBreakdown, GS_ESCAPED, GS_DEAD, GS_QUIT, type GameState } from "@sorcerers-cave/engine";
import { HighScores, type LeaderboardRow } from "./HighScores";

const OUTCOME: Record<number, string> = {
  [GS_ESCAPED]: "Your party escaped the cave!",
  [GS_DEAD]: "The party perished in the dark.",
  [GS_QUIT]: "You abandoned the expedition.",
};

const STATUS_NOTE: Record<number, string> = { 2: "petrified", 3: "fallen" };

export function GameOverScreen({
  state,
  onNewGame,
  onSaveScore,
  leaderboard,
}: {
  state: GameState;
  onNewGame: () => void;
  /** Persist the score under `name`; returns the new record id (to highlight it). */
  onSaveScore?: (name: string) => Promise<string | void>;
  /** Leaderboard rows for the post-save table (undefined = loading). */
  leaderboard?: LeaderboardRow[];
}) {
  const breakdown = scoreBreakdown(state);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const saved = savedId !== null;

  const save = async () => {
    if (!onSaveScore || saving) return;
    setSaving(true);
    try {
      const id = await onSaveScore(name.trim());
      setSavedId(typeof id === "string" ? id : "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="scv-panel scv-gameover" data-testid="game-over">
      <h2 className="scv-hd">{OUTCOME[state.gs] ?? "The expedition ends."}</h2>

      {/* Roll call — every member, their carried items, and the points each is worth. */}
      <ul className="scv-rollcall">
        {breakdown.members.map((m, i) => {
          const note = STATUS_NOTE[m.status];
          return (
            <li key={i} className={"scv-rc-member" + (m.counts ? "" : " scv-rc-out")}>
              <div className="scv-rc-head">
                <span className="scv-rc-name">
                  {m.name}
                  {m.dragonDoubled && <span className="scv-rc-tag"> dragon-slayer ×2</span>}
                  {note && <span className="scv-rc-tag"> {note}</span>}
                </span>
                <span className="scv-rc-pts">{m.counts ? m.creaturePoints : 0}</span>
              </div>
              {m.treasures.length > 0 && (
                <ul className="scv-rc-items">
                  {m.treasures.map((t, j) => (
                    <li key={j}>
                      <span>{t.name}{t.kind === "artifact" && <span className="scv-rc-tag"> artifact</span>}</span>
                      <span className="scv-rc-pts">{m.counts ? t.points : 0}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/* Bonuses / penalties, then the grand total. */}
      <dl className="scv-rc-totals">
        {breakdown.sorcererBonus > 0 && (
          <div><dt>Sorcerer slain</dt><dd className="scv-rc-pts">{breakdown.sorcererBonus}</dd></div>
        )}
        {breakdown.bonusScore > 0 && (
          <div><dt>Banked treasure</dt><dd className="scv-rc-pts">{breakdown.bonusScore}</dd></div>
        )}
        {breakdown.cursePenalty > 0 && (
          <div><dt>Curses</dt><dd className="scv-rc-pts">−{breakdown.cursePenalty}</dd></div>
        )}
      </dl>
      <p className="scv-score">{breakdown.total}</p>
      <p className="scv-points">total points</p>

      {/* Name entry → save → leaderboard. */}
      {onSaveScore && !saved && (
        <form
          className="scv-hs-entry"
          onSubmit={(e) => { e.preventDefault(); void save(); }}
        >
          <label className="scv-hs-label" htmlFor="scv-hs-name">Record this score as</label>
          <div className="scv-hs-entryrow">
            <input
              id="scv-hs-name"
              className="scv-hs-input"
              type="text"
              maxLength={40}
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <button type="submit" className="scv-primary" disabled={saving}>
              {saving ? "Saving…" : "Save score"}
            </button>
          </div>
        </form>
      )}

      {saved && (
        <div className="scv-hs-wrap">
          <h3 className="scv-hs-heading">High Scores</h3>
          <HighScores rows={leaderboard} highlightId={savedId || undefined} />
        </div>
      )}

      <button className="scv-primary" onClick={onNewGame}>New game</button>
    </section>
  );
}
