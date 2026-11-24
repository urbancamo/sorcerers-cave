import { useRef, useState } from "react";
import { scoreBreakdown, GS_ESCAPED, GS_DEAD, GS_QUIT, type GameState } from "@sorcerers-cave/engine";
import { LeaderboardPanel } from "./HighScores";
import { downloadLog, type GameLog } from "./gameLog";
import { DiceRoll } from "./DiceRoll";
import { HelpButton } from "../manual/HelpButton";

const OUTCOME: Record<number, string> = {
  [GS_ESCAPED]: "Your party escaped the cave!",
  [GS_DEAD]: "The party perished in the dark.",
  [GS_QUIT]: "You abandoned the expedition.",
};

/** The answer to saving a score: recorded, or refused with a reason to show beside the name. */
export type ScoreResult = { ok: true; id: string } | { ok: false; reason: string };

const STATUS_NOTE: Record<number, string> = { 2: "petrified", 3: "fallen" };

export function GameOverScreen({
  state,
  onNewGame,
  onSaveScore,
  newGameLabel,
  log,
  code,
  onReplay,
}: {
  state: GameState;
  onNewGame: () => void;
  /** Label for the primary button (default "New game"; e.g. "Back to Standings" in multiplayer). */
  newGameLabel?: string;
  /** Persist the score under `name`. The name is screened: when it is refused (offensive, or it could not be checked) the answer carries the
   *  reason and the form stays up for another; otherwise it carries the new record id (to highlight it). */
  onSaveScore?: (name: string) => Promise<ScoreResult>;
  /** Leaderboard rows for the post-save table (undefined = loading). */
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
  const [nameError, setNameError] = useState<string | null>(null); // why the last name was turned away; the form stays up for another
  const nameInput = useRef<HTMLInputElement>(null);
  const saved = savedId !== null;
  // Extension kit (SC-EXT-23, design US-25): the Idol's game-over reveal — a visible d6 animates onto
  // its final value before the rest of the roll call is shown. `breakdown.idolRoll` is undefined
  // whenever no surviving member carries it (never rolled — see score.ts), so the overlay is skipped
  // entirely in that case (and always, in a kit-off game — the Idol doesn't exist there).
  const [idolRevealed, setIdolRevealed] = useState(breakdown.idolRoll === undefined);

  const save = async () => {
    if (!onSaveScore || saving) return;
    setSaving(true);
    setNameError(null);
    try {
      const res = await onSaveScore(name.trim());
      if (res.ok) setSavedId(res.id);
      else { setNameError(res.reason); nameInput.current?.focus(); nameInput.current?.select(); }
    } catch {
      setNameError("The score could not be saved just now. Please try again.");
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
                    {m.dragonDoubled && <span className="scv-rc-tag"> dragon-slayer +10 each <HelpButton topics={["score-dragon-slayer"]} label="Help with dragon-slayers" /></span>}
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
            <div><dt>Sorcerer slain <HelpButton topics={["score-bounty"]} label="Help with the Sorcerer bounty" /></dt><dd className="scv-rc-pts">+{breakdown.sorcererBonus}</dd></div>
          )}
          {breakdown.bonusScore > 0 && (
            <div><dt>Treasure Chest loot <HelpButton topics={["score-chest"]} label="Help with Chest loot" /></dt><dd className="scv-rc-pts">+{breakdown.bonusScore}</dd></div>
          )}
          {breakdown.cursePenalty > 0 && (
            <div><dt>Curses <HelpButton topics={["score-curse"]} label="Help with curses" /></dt><dd className="scv-rc-pts">−{breakdown.cursePenalty}</dd></div>
          )}
        </dl>
        <p className="scv-score">{breakdown.total}</p>
        <p className="scv-points">total points <HelpButton topics={["scoring", "all-or-nothing"]} label="Help with scoring" /></p>

        {/* Only an escaped party may record a score; others see why they can't. */}
        {onSaveScore && !canRecord && (
          <p className="scv-hs-status scv-muted" data-testid="no-record">
            {state.gs === GS_QUIT
              ? "Abandoned in the cave — only a party that climbs back to the surface can record a score."
              : "The party never made it out — only a party that escapes the cave can record a score."}
            <HelpButton topics={[state.gs === GS_QUIT ? "quit-abandon" : "all-or-nothing", "high-score-tables"]} label="Help with recording a score" />
          </p>
        )}

        {/* Name entry → save → leaderboard. */}
        {onSaveScore && canRecord && !saved && (
          <form
            className="scv-hs-entry"
            onSubmit={(e) => { e.preventDefault(); void save(); }}
          >
            <label className="scv-hs-label" htmlFor="scv-hs-name">Record this score as</label>
            <p className="scv-hs-hint" id="scv-hs-hint">
              The name goes on a public table and is checked first. Offensive names, and web addresses, email addresses and phone numbers, are turned away.
            </p>
            <div className="scv-hs-entryrow">
              <input
                id="scv-hs-name"
                ref={nameInput}
                className="scv-hs-input"
                type="text"
                maxLength={40}
                placeholder="Your name"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(null); }}
                aria-describedby={nameError ? "scv-hs-hint scv-hs-error" : "scv-hs-hint"}
                aria-invalid={nameError ? true : undefined}
                autoFocus
              />
              <button type="submit" className="scv-primary" disabled={saving}>
                {saving ? "Checking…" : "Save score"}
              </button>
            </div>
            {nameError && <p className="scv-hs-error" id="scv-hs-error" role="alert" data-testid="name-error">{nameError}</p>}
          </form>
        )}

        {saved && (
          <div className="scv-hs-wrap">
            <h3 className="scv-hs-heading">High Scores</h3>
            <LeaderboardPanel defaultKit={!!state.variants?.extensionKit} defaultSibyl={!!state.variants?.sibyl} highlightId={savedId || undefined} onReplay={onReplay} />
          </div>
        )}

        {/* Keep a copy of the game — a readable narrative (.txt), a wide-carriage printer report (.log), or the
            machine-readable debug log (.json: replayable, and what a bug report needs). */}
        {log && (
          <div className="scv-hs-entry" data-testid="download-log">
            <span className="scv-hs-label">Download this game&rsquo;s log</span>
            <div className="scv-hs-entryrow wrap">
              <button type="button" className="scv-primary" onClick={() => downloadLog(log, "human")}>Readable log (.txt)</button>
              <button type="button" className="scv-primary" onClick={() => downloadLog(log, "printer")}>Printer log (.log)</button>
              <button type="button" className="scv-primary" onClick={() => downloadLog(log, "machine")}>Debug log (.json)</button>
            </div>
          </div>
        )}

        <button className="scv-primary" onClick={onNewGame}>{newGameLabel ?? "New game"}</button>
      </section>
    </>
  );
}
