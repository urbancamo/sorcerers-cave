import { ConfirmButton } from '../ConfirmButton';

/** Saving the game and ending it: kept apart from Settings so a stray tap there cannot reach them. */
export function ExitPanel({ onSave, onAbandon }: { onSave?: () => void; onAbandon?: () => void }) {
  return (
    <aside className="scv-slot scv-slot-right scv-settings" aria-label="Exit">
      <h2 className="scv-slot-hd">Exit</h2>
      <div className="scv-settings-actions">
        {onSave && <button type="button" onClick={onSave}>Save game</button>}
      </div>
      {/* Abandoning ends the game, so it asks first. */}
      {onAbandon && (
        <ConfirmButton label="Abandon the expedition" className="scv-enc-btn ghost"
                       confirmText="You forsake your party to the Cave — they do not escape. Your final score is tallied."
                       onConfirm={onAbandon} />
      )}
    </aside>
  );
}
