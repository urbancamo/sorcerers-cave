import { useState } from "react";

/**
 * Shown after the player saves from the HUD (or restores a Test Mode scenario, 2026-09-11): reveals
 * the four-letter code, then dismisses on close — `onClose`'s default use (a plain save) returns to
 * the splash screen; a restore instead just closes the modal so play continues on the newly forked
 * game, hence the overridable `closeLabel`/heading/message. Mirrors the dice/notice modal shell.
 */
export function SaveGameModal({
  code, onClose, heading = "Game saved", message = "Note your game code to resume later:", closeLabel = "Back to menu",
  onViewReplay, onCopyDebugBundle,
}: {
  code: string;
  onClose: () => void;
  heading?: string;
  message?: string;
  closeLabel?: string;
  /** Opens the read-only replay viewer for this code (reuses the existing replay-by-code path). */
  onViewReplay?: () => void;
  /** Copies the game's { game, moves } log bundle (game.log) as JSON — a paste-able debug artifact
   *  more directly useful for a bug report than a human-oriented replay screen. */
  onCopyDebugBundle?: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [bundleCopied, setBundleCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => {}, // clipboard may be unavailable (insecure context / denied) — the code is still on screen
    );
  };

  const copyBundle = () => {
    if (!onCopyDebugBundle) return;
    void onCopyDebugBundle().then(
      () => setBundleCopied(true),
      () => {}, // clipboard may be unavailable — the code above still lets the tester share the scenario
    );
  };

  return (
    <div className="scv-dice-overlay" role="dialog" aria-label="game saved" data-testid="save-modal">
      <div className="scv-dice-card">
        <div className="scv-dice-title">{heading}</div>
        <div className="scv-dice-msg good">
          <p>{message}</p>
        </div>
        <div
          data-testid="save-code"
          style={{
            fontFamily: "var(--mono, ui-monospace, monospace)",
            fontSize: "2.6rem",
            letterSpacing: "0.5rem",
            fontWeight: 700,
            textAlign: "center",
            padding: "0.4rem 0 0.2rem",
          }}
        >
          {code}
        </div>
        <button className="scv-primary" onClick={copy}>{copied ? "Copied ✓" : "Copy code"}</button>
        {onViewReplay && <button className="scv-primary" onClick={onViewReplay}>View replay</button>}
        {onCopyDebugBundle && (
          <button className="scv-primary" onClick={copyBundle}>{bundleCopied ? "Copied ✓" : "Copy debug bundle"}</button>
        )}
        <button className="scv-primary" onClick={onClose}>{closeLabel}</button>
      </div>
    </div>
  );
}
