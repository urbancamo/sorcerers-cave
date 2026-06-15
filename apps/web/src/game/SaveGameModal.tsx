import { useState } from "react";

/** Shown after the player saves from the HUD: reveals the four-letter resume code, then returns to
 *  the splash screen on dismiss. Mirrors the dice/notice modal shell. */
export function SaveGameModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => {}, // clipboard may be unavailable (insecure context / denied) — the code is still on screen
    );
  };

  return (
    <div className="scv-dice-overlay" role="dialog" aria-label="game saved" data-testid="save-modal">
      <div className="scv-dice-card">
        <div className="scv-dice-title">Game saved</div>
        <div className="scv-dice-msg good">
          <p>Note your game code to resume later:</p>
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
        <button className="scv-primary" onClick={onClose}>Back to menu</button>
      </div>
    </div>
  );
}
