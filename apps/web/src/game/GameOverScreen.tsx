import { useState } from "react";
import { scoreBreakdown, GS_ESCAPED, GS_DEAD, GS_QUIT, type GameState } from "@sorcerers-cave/engine";
import { HighScores, type LeaderboardRow } from "./HighScores";
import { downloadLog, type GameLog } from "./gameLog";
import { DiceRoll } from "./DiceRoll";

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
  newGameLabel,
  log,
  code,
  onReplay,
}: {
  state: GameState;
  onNewGame: () => void;
  /** Label for the primary button (default "New game"; e.g. "Back to Standings" in multiplayer). */
  newGameLabel?: string;
  /** Persist the score under `name`; returns the new record id (to highlight it). */
  onSaveScore?: (name: string) => Promise<string | void>;
  /** Leaderboard rows for the post-save table (undefined = loading). */
  leaderboard?: LeaderboardRow[];
  /** This game's move log, if available — enables the .txt / .log downloads. */
  log?: GameLog | null;
  /** The game's four-letter code — the handle for replay-by-code on the splash screen. */
  code?: string | null;
  /** Open the replay viewer for a recorded game's code (threaded into the post-save leaderboard). */
  onReplay?: (code: string) => Promise<string | null>;
}) {
  const breakdown = scoreBreakdown(state);
  // Only a party that climbs back to the surface earns a recordable score (§Scoring). An abandoned or
  // wiped-out expedition still shows its tally, but it can't be saved to the high-score table.
  const canRecord = state.gs === GS_ESCAPED;
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const saved = savedId !== null;
  // Extension kit (SC-EXT-23, design US-25): the Idol's game-over reveal — a visible d6 animates onto
  // its final value before the rest of the roll call is shown. `breakdown.idolRoll` is undefined
  // whenever no surviving member carries it (never rolled — see score.ts), so the overlay is skipped
  // entirely in that case (and always, in a kit-off game — the Idol doesn't exist there).
  const [idolRevealed, setIdolRevealed] = useState(breakdown.idolRoll === undefined);

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
    <>
      {!idolRevealed && breakdown.idolRoll !== undefined && (
        <DiceRoll
          title="The Idol"
          lanes={[{ enemy: { value: breakdown.idolRoll } }]}
          message={`The Idol's eyes open: it is worth ${breakdown.idolRoll * 10}.`}
          tone="good"
          onContinue={() => setIdolRevealed(true)}
        />
      )}
      <section className="scv-panel scv-gameover" data-testid="game-over">
        <h2 className="scv-hd">{OUTCOME[state.gs] ?? "The expedition ends."}</h2>

        {/* Whatever the outcome, the code lets anyone replay this expedition from the title screen. */}
        {code && (
          <p className="scv-go-code" data-testid="game-code">
            Game code <b>{code}</b> — enter it under &ldquo;Replay a game&rdquo; on the title screen to
            step through this expedition.
          </p>
        )}

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

        {/* Awards and penalties NOT tied to a surviving member's creature/treasure points — the
            Sorcerer bounty and the Treasure Chest loot banked at scoring, less the curse penalty. */}
        <dl className="scv-rc-totals" data-testid="score-awards">
          {breakdown.sorcererBonus > 0 && (
            <div><dt>Sorcerer slain</dt><dd className="scv-rc-pts">+{breakdown.sorcererBonus}</dd></div>
          )}
          {breakdown.bonusScore > 0 && (
            <div><dt>Treasure Chest loot</dt><dd className="scv-rc-pts">+{breakdown.bonusScore}</dd></div>
          )}
          {breakdown.cursePenalty > 0 && (
            <div><dt>Curses</dt><dd className="scv-rc-pts">−{breakdown.cursePenalty}</dd></div>
          )}
        </dl>
        <p className="scv-score">{breakdown.total}</p>
        <p className="scv-points">total points</p>

        {/* Only an escaped party may record a score; others see why they can't. */}
        {onSaveScore && !canRecord && (
          <p className="scv-hs-status scv-muted" data-testid="no-record">
            {state.gs === GS_QUIT
              ? "Abandoned in the cave — only a party that climbs back to the surface can record a score."
              : "The party never made it out — only a party that escapes the cave can record a score."}
          </p>
        )}

        {/* Name entry → save → leaderboard. */}
        {onSaveScore && canRecord && !saved && (
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
            <HighScores rows={leaderboard} highlightId={savedId || undefined} onReplay={onReplay} />
          </div>
        )}

        {/* Keep a copy of the game — a readable narrative (.txt) or a wide-carriage printer report (.log). */}
        {log && (
          <div className="scv-hs-entry" data-testid="download-log">
            <span className="scv-hs-label">Download this game&rsquo;s log</span>
            <div className="scv-hs-entryrow">
              <button type="button" className="scv-primary" onClick={() => downloadLog(log, "human")}>Readable log (.txt)</button>
              <button type="button" className="scv-primary" onClick={() => downloadLog(log, "printer")}>Printer log (.log)</button>
            </div>
          </div>
        )}

        <button className="scv-primary" onClick={onNewGame}>{newGameLabel ?? "New game"}</button>
      </section>
    </>
  );
}
