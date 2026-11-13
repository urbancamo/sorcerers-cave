import { useConvexAuth, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../../convex/_generated/api';
import { LoginForm } from './LoginForm';
import { AdminShell } from './AdminShell';

/**
 * The hidden admin area (/login, /admin). It never mounts GameScreen, whose effect would sign the visitor in
 * anonymously. What the visitor may see comes from the server's role query, not from being authenticated:
 * anonymous players are authenticated too, but hold no roles.
 */
export default function AdminApp() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const me = useQuery(api.roles.me, isAuthenticated ? {} : 'skip');

  if (isLoading || (isAuthenticated && me === undefined)) return <main className="scv-admin"><p className="scv-admin-note">Connecting…</p></main>;
  if (!isAuthenticated || !me || (me.roles.length === 0 && !me.username)) return <LoginForm />;
  if (me.roles.length === 0) {
    return (
      <main className="scv-admin scv-admin-login">
        <section className="scv-panel scv-admin-card">
          <h1 className="scv-admin-title">No access</h1>
          <p className="scv-admin-note">This account has no admin roles.</p>
          <button className="scv-ghost" onClick={() => void signOut().then(() => window.location.assign('/'))}>Sign out</button>
        </section>
      </main>
    );
  }
  return <AdminShell roles={me.roles} username={me.username ?? ''} />;
}
