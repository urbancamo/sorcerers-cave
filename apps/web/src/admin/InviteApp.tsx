import { useState, type FormEvent } from 'react';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { errorText } from './errorText';

const MIN_PASSWORD = 10; // matches the server (convex/passwords.ts), which is what actually enforces it

/** The page an invited admin opens from their link (/invite/<token>): choose a password, then sign in. Never mounts the game. */
export default function InviteApp({ token }: { token: string }) {
  const who = useQuery(api.invites.check, { token });
  const redeem = useAction(api.invites.redeem);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    setError(null);
    try {
      setDone((await redeem({ token, password })).username);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  if (done) {
    return (
      <main className="scv-admin scv-admin-login">
        <section className="scv-panel scv-admin-card">
          <h1 className="scv-admin-title">Password set</h1>
          <p className="scv-admin-note">Your account <strong>{done}</strong> is ready.</p>
          <a className="scv-primary scv-admin-link" href="/login">Sign in</a>
        </section>
      </main>
    );
  }
  if (who === undefined) return <main className="scv-admin"><p className="scv-admin-note">Connecting…</p></main>;
  if (who === null) {
    return (
      <main className="scv-admin scv-admin-login">
        <section className="scv-panel scv-admin-card">
          <h1 className="scv-admin-title">Link not valid</h1>
          <p className="scv-admin-note">This link is invalid, has expired, or has already been used. Ask for a new one.</p>
        </section>
      </main>
    );
  }
  return (
    <main className="scv-admin scv-admin-login">
      <form className="scv-panel scv-bug-form scv-admin-card" onSubmit={(e) => void submit(e)} aria-label="Set your password">
        <h1 className="scv-admin-title">Set your password</h1>
        <p className="scv-admin-note">Choose a password for <strong>{who.username}</strong>. Use at least {MIN_PASSWORD} characters.</p>
        <div className="scv-bug-field">
          <div className="scv-bug-head"><label htmlFor="scv-inv-pass">Password</label></div>
          <input id="scv-inv-pass" type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="scv-bug-field">
          <div className="scv-bug-head"><label htmlFor="scv-inv-confirm">Confirm password</label></div>
          <input id="scv-inv-confirm" type="password" value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p className="scv-resume-err" role="alert">{error}</p>}
        <button className="scv-primary" type="submit" disabled={busy || password.length < MIN_PASSWORD || !confirm}>{busy ? 'Saving…' : 'Set password'}</button>
      </form>
    </main>
  );
}
