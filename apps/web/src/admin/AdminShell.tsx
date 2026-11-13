import { useEffect, useState, type ReactNode } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Tabs } from './Tabs';
import { TestingTab } from './TestingTab';
import { AnalyticsTab } from './analytics/AnalyticsTab';
import { UsersTab } from './UsersTab';

export type Role = 'SYSTEM' | 'USER' | 'ANALYTICS' | 'TEST';

// One tab per role, in display order. A tab is shown only to a user holding its role (the server expands SYSTEM to all four).
const TABS: { id: Role; label: string }[] = [
  { id: 'ANALYTICS', label: 'Game Analytics' },
  { id: 'TEST', label: 'Testing' },
  { id: 'USER', label: 'Users' },
  { id: 'SYSTEM', label: 'System' },
];

function Soon({ what }: { what: string }) {
  return <p className="scv-admin-note">{what} is not built yet.</p>;
}

function panel(role: Role, roles: Role[], userId: string | null): ReactNode {
  switch (role) {
    case 'TEST': return <TestingTab />;
    case 'ANALYTICS': return <AnalyticsTab />;
    case 'USER': return <UsersTab roles={roles} selfId={userId} />;
    case 'SYSTEM': return <Soon what="System administration" />;
  }
}

export function AdminShell({ roles, username, userId }: { roles: Role[]; username: string; userId: string | null }) {
  const { signOut } = useAuthActions();
  const visible = TABS.filter((t) => roles.includes(t.id));
  const [tab, setTab] = useState<Role>(visible[0]!.id);
  // Roles can change underneath a signed-in session; never leave a tab selected that is no longer shown.
  useEffect(() => { if (!visible.some((t) => t.id === tab)) setTab(visible[0]!.id); }, [visible, tab]);

  return (
    <main className="scv-admin">
      <header className="scv-admin-bar">
        <h1 className="scv-admin-title">Administration</h1>
        <span className="scv-admin-user">{username}</span>
        <button className="scv-ghost" onClick={() => void signOut().then(() => window.location.assign('/'))}>Sign out</button>
      </header>
      <Tabs tabs={visible} value={tab} onChange={setTab} label="Admin sections">{panel(tab, roles, userId)}</Tabs>
    </main>
  );
}
