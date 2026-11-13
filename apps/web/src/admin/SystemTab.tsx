import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { errorText } from './errorText';

/** A modal that must be answered before the page can be used again: Escape or Cancel leaves things as they were. */
function GuardDialog({ title, children, confirmLabel, onConfirm, onCancel }: {
  title: string; children: React.ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // The safe answer has focus, so Enter by accident does nothing; Escape cancels.
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="scv-guard-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <section className="scv-panel scv-guard" role="alertdialog" aria-modal="true" aria-labelledby="scv-guard-title" aria-describedby="scv-guard-body">
        <h2 id="scv-guard-title" className="scv-guard-title">{title}</h2>
        <div id="scv-guard-body" className="scv-guard-body">{children}</div>
        <div className="scv-guard-actions">
          <button type="button" className="scv-ghost" ref={cancelRef} onClick={onCancel}>Cancel</button>
          <button type="button" className="scv-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

/**
 * System administration (SYSTEM role). One form of site-wide options: a change is first confirmed in a guard dialog, then held as a
 * draft until "Save modified options" writes it; Cancel throws the draft away. The saved value is what the welcome page follows.
 */
export function SystemTab() {
  const saved = useQuery(api.settings.get);
  const setOptions = useMutation(api.settings.setOptions);
  const [draft, setDraft] = useState<boolean | null>(null); // null: nothing changed yet
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!saved) return <p className="scv-admin-note">Loading…</p>;

  const multiplayer = draft ?? saved.multiplayerEnabled;
  const dirty = multiplayer !== saved.multiplayerEnabled;

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await setOptions({ multiplayerEnabled: multiplayer });
      setDraft(null);
      setMsg({ kind: 'ok', text: 'Options saved.' });
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) });
    } finally { setBusy(false); }
  };

  return (
    <form className="scv-sys" onSubmit={(e) => { e.preventDefault(); if (dirty && !busy) void save(); }} aria-label="System options">
      <fieldset className="scv-panel scv-admin-card scv-sys-option">
        <legend className="scv-sys-legend">Multiplayer mode</legend>
        <p className="scv-admin-note">
          When ON, the welcome page offers <b>Start Multiplayer Game</b> and <b>Join Multiplayer Game</b>. When OFF, those options are not shown at all.
          Games already in progress are not affected.
        </p>
        <button type="button" role="switch" aria-checked={multiplayer} className="scv-switch" onClick={() => { setMsg(null); setAsking(true); }}>
          <span className="scv-switch-track" aria-hidden="true"><span className="scv-switch-knob" /></span>
          <span className="scv-switch-text">Multiplayer is <b>{multiplayer ? 'ON' : 'OFF'}</b></span>
        </button>
        {dirty && <p className="scv-sys-pending" role="status">Changed from {saved.multiplayerEnabled ? 'ON' : 'OFF'}: not saved yet.</p>}
      </fieldset>

      <div className="scv-sys-actions">
        {msg && <p className={msg.kind === 'ok' ? 'scv-sys-ok' : 'scv-resume-err'} role={msg.kind === 'ok' ? 'status' : 'alert'}>{msg.text}</p>}
        <button type="button" className="scv-ghost" disabled={!dirty || busy} onClick={() => { setDraft(null); setMsg(null); }}>Cancel</button>
        <button type="submit" className="scv-primary" disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save modified options'}</button>
      </div>

      {asking && (
        <GuardDialog
          title={multiplayer ? 'Turn Multiplayer OFF?' : 'Turn Multiplayer ON?'}
          confirmLabel={multiplayer ? 'Turn it off' : 'Turn it on'}
          onCancel={() => setAsking(false)}
          onConfirm={() => { setDraft(!multiplayer); setAsking(false); }}
        >
          {multiplayer
            ? <p>Players will no longer see the multiplayer options on the welcome page. This takes effect when you press Save modified options.</p>
            : <p>Every player will see the multiplayer options on the welcome page. This takes effect when you press Save modified options.</p>}
        </GuardDialog>
      )}
    </form>
  );
}
