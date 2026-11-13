import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';

/** The hidden admin sign-in (/login): username and password only. No sign-up, no recovery. */
export function LoginForm() {
  const { signIn } = useAuthActions();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The password provider keys accounts on `email`; here it holds the username.
      await signIn('password', { flow: 'signIn', email: username, password });
      if (window.location.pathname === '/login') window.history.replaceState(null, '', '/admin');
    } catch {
      setError('Sign-in failed. Check the username and password.'); // one message for every failure: no hints
    }
    setBusy(false);
  };

  return (
    <main className="scv-admin scv-admin-login">
      <form className="scv-panel scv-bug-form scv-admin-card" onSubmit={(e) => void submit(e)} aria-label="Admin sign-in">
        <h1 className="scv-admin-title">Sign in</h1>
        <div className="scv-bug-field">
          <div className="scv-bug-head"><label htmlFor="scv-admin-user">Username</label></div>
          <input id="scv-admin-user" value={username} autoComplete="username" autoCapitalize="none" spellCheck={false}
                 onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="scv-bug-field">
          <div className="scv-bug-head"><label htmlFor="scv-admin-pass">Password</label></div>
          <input id="scv-admin-pass" type="password" value={password} autoComplete="current-password"
                 onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="scv-resume-err" role="alert">{error}</p>}
        <button className="scv-primary" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
