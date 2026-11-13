import { useState } from 'react';
import { useConvex, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PartySelect } from '../game/PartySelect';
import { ScenarioBrowserModal } from '../game/ScenarioBrowser';
import { ReplayView, type ReplayBundle } from '../game/ReplayView';
import { goldenBundle } from '../game/goldenGame';
import { setTestGameHandoff } from '../game/testHandoff';

// Opens the game screen on the given game. A full navigation, so GameScreen mounts fresh and reads the handoff.
const openGame = (id: string) => { setTestGameHandoff(id); window.location.assign('/'); };

/** Test Mode, moved here from the main screen: start a test game, fork a scenario by code, or browse and replay scenarios. */
export function TestingTab() {
  const startTestGame = useMutation(api.game.startTestGame);
  const restoreTestScenario = useMutation(api.game.restoreTestScenario);
  const convex = useConvex();
  const [picking, setPicking] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [bundle, setBundle] = useState<ReplayBundle | null>(null);

  const restore = async () => {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) { setErr('Enter a four-letter game code.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const restored = await restoreTestScenario({ code: c });
      openGame(restored.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /s, '') : 'Could not restore that scenario.');
      setBusy(false);
    }
  };

  const replay = async (c: string): Promise<string | null> => {
    const golden = await goldenBundle(c);
    if (golden) { setBundle(golden); return null; }
    const found = (await convex.query(api.game.replayByCode, { code: c })) as ReplayBundle | null;
    if (!found) return 'No replayable game found with that code.';
    if (!found.replayable) return 'This game predates full logging and cannot be replayed.';
    setBundle(found);
    return null;
  };

  if (bundle) return <ReplayView bundle={bundle} onExit={() => setBundle(null)} />;
  if (picking) {
    return (
      <PartySelect
        kitToggle
        sibylToggle
        testMode
        title="Choose the test party"
        onBack={() => setPicking(false)}
        onConfirm={async (picks, color, variants) => openGame(await startTestGame({ seed: Date.now(), picks, color, variants }))}
      />
    );
  }
  return (
    <div className="scv-admin-testing">
      <section className="scv-panel scv-admin-card">
        <h2 className="scv-admin-h2">Test game</h2>
        <p className="scv-admin-note">Any party, no budget or stock limits, with the test controls in the game. Never scored.</p>
        <button className="scv-primary" data-testid="start-test-game" onClick={() => setPicking(true)}>Start test game</button>
      </section>
      <section className="scv-panel scv-admin-card" data-testid="restore-test-scenario">
        <h2 className="scv-admin-h2">Restore a scenario</h2>
        <p className="scv-admin-note">Fork a saved Test Mode game by its four-letter code into a new game of your own.</p>
        <div className="scv-bug-field">
          <div className="scv-bug-head"><label htmlFor="scv-admin-restore">Scenario code</label></div>
          <input id="scv-admin-restore" value={code} maxLength={4} placeholder="ABCD" autoCapitalize="characters" spellCheck={false}
                 onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 4)); setErr(null); }}
                 onKeyDown={(e) => { if (e.key === 'Enter') void restore(); }} />
        </div>
        {err && <p className="scv-resume-err" role="alert">{err}</p>}
        <button className="scv-primary" onClick={() => void restore()} disabled={busy || code.trim().length !== 4}>
          {busy ? 'Restoring…' : 'Restore'}
        </button>
      </section>
      <section className="scv-panel scv-admin-card">
        <h2 className="scv-admin-h2">Scenario games</h2>
        <p className="scv-admin-note">Browse and replay the searched games (B001 to S025).</p>
        <button className="scv-primary" data-testid="scenario-browser" onClick={() => setBrowsing(true)}>Browse scenarios</button>
      </section>
      {browsing && <ScenarioBrowserModal onClose={() => setBrowsing(false)} onOpen={replay} />}
    </div>
  );
}
