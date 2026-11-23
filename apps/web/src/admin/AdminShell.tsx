import { useEffect, useState, type ReactNode } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Tabs } from './Tabs';
import { TestingTab } from './TestingTab';
import { AnalyticsTab } from './analytics/AnalyticsTab';
import { UsersTab } from './UsersTab';
import { SystemTab } from './SystemTab';
import { StoriesTab } from './stories/StoriesTab';

export type Role = 'SYSTEM' | 'USER' | 'ANALYTICS' | 'STORIES' | 'TEST';
type TabId = Role | 'STORIES';

// Tabs in display order. A tab is shown to a user holding any of its roles (the server expands SYSTEM to all of them). Stories is
// viewed with ANALYTICS or STORIES; its editing controls need STORIES (and the server checks that again).
const TABS: { id: TabId; roles: Role[]; label: string }[] = [
  { id: 'ANALYTICS', roles: ['ANALYTICS'], label: 'Game Analytics' },
  { id: 'STORIES', roles: ['ANALYTICS', 'STORIES'], label: 'Stories' },
  { id: 'TEST', roles: ['TEST'], label: 'Testing' },
  { id: 'USER', roles: ['USER'], label: 'Users' },
  { id: 'SYSTEM', roles: ['SYSTEM'], label: 'System' },
];

function panel(role: TabId, roles: Role[], userId: string | null): ReactNode {
  switch (role) {
    case 'TEST': return <TestingTab />;
    case 'ANALYTICS': return <AnalyticsTab />;
    case 'USER': return <UsersTab roles={roles} selfId={userId} />;
    case 'SYSTEM': return <SystemTab />;
    case 'STORIES': return <StoriesTab canEdit={roles.includes('STORIES')} />;
  }
}

export function AdminShell({ roles, username, userId }: { roles: Role[]; username: string; userId: string | null }) {
  const { signOut } = useAuthActions();
  const visible = TABS.filter((t) => t.roles.some((r) => roles.includes(r)));
  const [tab, setTab] = useState<TabId>(visible[0]!.id);
  // Roles can change underneath a signed-in session; never leave a tab selected that is no longer shown.
  useEffect(() => { if (!visible.some((t) => t.id === tab)) setTab(visible[0]!.id); }, [visible, tab]);

  return (
    <main className="scv-admin">
      {/* Same place as the splash screen's Admin button; stays signed in, and goes back to the welcome page. */}
      <button type="button" className="scv-ghost scv-splash-admin" onClick={() => window.location.assign('/')}>Quit Admin</button>
      <header className="scv-admin-bar">
        <h1 className="scv-admin-title">Administration</h1>
        <span className="scv-admin-user">{username}</span>
        <button className="scv-ghost" onClick={() => void signOut().then(() => window.location.assign('/'))}>Sign out</button>
      </header>
      <Tabs tabs={visible} value={tab} onChange={setTab} label="Admin sections">{panel(tab, roles, userId)}</Tabs>
    </main>
  );
}
