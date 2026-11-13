import { useEffect, useState, type ReactNode } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { TestingTab } from './TestingTab';
import { AnalyticsTab } from './analytics/AnalyticsTab';

export type Role = 'SYSTEM' | 'USER' | 'ANALYTICS' | 'TEST';

// One tab per role, in display order. A tab is shown only to a user holding its role (the server expands SYSTEM to all four).
const TABS: { role: Role; label: string }[] = [
  { role: 'ANALYTICS', label: 'Game Analytics' },
  { role: 'TEST', label: 'Testing' },
  { role: 'USER', label: 'Users' },
  { role: 'SYSTEM', label: 'System' },
];

function Soon({ what }: { what: string }) {
  return <p className="scv-admin-note">{what} is not built yet.</p>;
}

function panel(role: Role): ReactNode {
  switch (role) {
    case 'TEST': return <TestingTab />;
    case 'ANALYTICS': return <AnalyticsTab />;
    case 'USER': return <Soon what="User administration" />;
    case 'SYSTEM': return <Soon what="System administration" />;
  }
}

export function AdminShell({ roles, username }: { roles: Role[]; username: string }) {
  const { signOut } = useAuthActions();
  const visible = TABS.filter((t) => roles.includes(t.role));
  const [tab, setTab] = useState<Role>(visible[0]!.role);
  // Roles can change underneath a signed-in session; never leave a tab selected that is no longer shown.
  useEffect(() => { if (!visible.some((t) => t.role === tab)) setTab(visible[0]!.role); }, [visible, tab]);

  return (
    <main className="scv-admin">
      <header className="scv-admin-bar">
        <h1 className="scv-admin-title">Administration</h1>
        <span className="scv-admin-user">{username}</span>
        <button className="scv-ghost" onClick={() => void signOut().then(() => window.location.assign('/'))}>Sign out</button>
      </header>
      <nav className="scv-hs-tabs scv-admin-tabs" role="tablist" aria-label="Admin sections">
        {visible.map((t) => (
          <button key={t.role} role="tab" aria-selected={tab === t.role} className={`scv-hs-tab${tab === t.role ? ' scv-hs-tab-on' : ''}`}
                  onClick={() => setTab(t.role)}>{t.label}</button>
        ))}
      </nav>
      <section className="scv-admin-body" role="tabpanel">{panel(tab)}</section>
    </main>
  );
}
