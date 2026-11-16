/**
 * Test Mode's Restart: asks how to start the fresh test game — with the party just played, with a newly
 * chosen one, or not at all. Mirrors the dice/save modal shell.
 */
export function RestartTestModal({ onSameParty, onNewParty, onCancel }: { onSameParty: () => void; onNewParty: () => void; onCancel: () => void }) {
  return (
    <div className="scv-dice-overlay" role="dialog" aria-label="restart test game" data-testid="restart-test-modal">
      <div className="scv-dice-card">
        <div className="scv-dice-title">Restart test game?</div>
        <div className="scv-dice-msg">
          <p>This abandons the current game and starts a new test game.</p>
        </div>
        <button className="scv-primary" onClick={onSameParty}>Restart with Same Party</button>
        <button className="scv-primary" onClick={onNewParty}>Select New Party</button>
        <button className="scv-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
