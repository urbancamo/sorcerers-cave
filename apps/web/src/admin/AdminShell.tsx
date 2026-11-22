import { useEffect, useState, type ReactNode } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Tabs } from './Tabs';
import { TestingTab } from './TestingTab';
import { AnalyticsTab } from './analytics/AnalyticsTab';
import { UsersTab } from './UsersTab';
import { SystemTab } from './SystemTab';
import { StoriesTab } from './stories/StoriesTab';

export type Role = 'SYSTEM' | 'USER' | 'ANALYTICS' | 'TEST';
type TabId = Role | 'STORIES';

// Tabs in display order. A tab is shown only to a user holding its role (the server expands SYSTEM to all four). Stories is viewed
// with ANALYTICS; its editing controls need SYSTEM (and the server checks that again).
const TABS: { id: TabId; role: Role; label: string }[] = [
  { id: 'ANALYTICS', role: 'ANALYTICS', label: 'Game Analytics' },
  { id: 'STORIES', role: 'ANALYTICS', label: 'Stories' },
  { id: 'TEST', role: 'TEST', label: 'Testing' },
  { id: 'USER', role: 'USER', label: 'Users' },
  { id: 'SYSTEM', role: 'SYSTEM', label: 'System' },
];

function panel(role: TabId, roles: Role[], userId: string | null): ReactNode {
  switch (role) {
    case 'TEST': return <TestingTab />;
    case 'ANALYTICS': return <AnalyticsTab />;
    case 'USER': return <UsersTab roles={roles} selfId={userId} />;
    case 'SYSTEM': return <SystemTab />;
    case 'STORIES': return <StoriesTab canEdit={roles.includes('SYSTEM')} />;
  }
}

export function AdminShell({ roles, username, userId }: { roles: Role[]; username: string; userId: string | null }) {
  const { signOut } = useAuthActions();
  const visible = TABS.filter((t) => roles.includes(t.role));
  const [tab, setTab] = useState<TabId>(visible[0]!.id);
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
