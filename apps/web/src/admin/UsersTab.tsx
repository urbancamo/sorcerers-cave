import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { Role } from './AdminShell';
import { errorText } from './errorText';
import { ago } from './analytics/format';

const ALL_ROLES: { role: Role; label: string }[] = [
  { role: 'SYSTEM', label: 'System' }, { role: 'USER', label: 'Users' }, { role: 'ANALYTICS', label: 'Analytics' }, { role: 'TEST', label: 'Testing' },
];

function RoleBoxes({ value, onChange, canSystem, idPrefix }: { value: Role[]; onChange: (r: Role[]) => void; canSystem: boolean; idPrefix: string }) {
  return (
    <fieldset className="scv-users-roles">
      <legend>Roles</legend>
      {ALL_ROLES.map(({ role, label }) => {
        const locked = role === 'SYSTEM' && !canSystem;
        return (
          <label key={role} className={locked ? 'scv-users-locked' : undefined} title={locked ? 'Only a SYSTEM user can grant SYSTEM' : undefined}>
            <input id={`${idPrefix}-${role}`} type="checkbox" checked={value.includes(role)} disabled={locked}
                   onChange={(e) => onChange(e.target.checked ? [...value, role] : value.filter((r) => r !== role))} />
            {label}
          </label>
        );
      })}
    </fieldset>
  );
}

const roleText = (roles: Role[]) => (roles.length ? roles.map((r) => ALL_ROLES.find((x) => x.role === r)?.label ?? r).join(', ') : 'none');

/** The one-time link, to copy and send. The server keeps only a hash, so it cannot be shown again; "New link" makes another. */
function InviteLink({ username, url, onClose }: { username: string; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <section className="scv-panel scv-admin-card scv-users-link" aria-label="Invite link">
      <h3 className="scv-admin-h2">Link for {username}</h3>
      <p className="scv-admin-note">Send this link to them. They use it once to choose their own password, and it expires in 7 days. It is shown only now.</p>
      <div className="scv-users-linkrow">
        <input readOnly value={url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
        <button className="scv-primary" type="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <button className="scv-ghost" type="button" onClick={onClose}>Done</button>
    </section>
  );
}

/** Two-step delete without a browser dialog: the first press asks, the second does it. */
function Confirm({ label, what, onConfirm }: { label: string; what: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  return asking ? (
    <span className="scv-users-confirm">
      <button className="scv-primary" type="button" aria-label={`Confirm ${what}`} onClick={() => { setAsking(false); onConfirm(); }}>Yes, {label.toLowerCase()}</button>
      <button className="scv-ghost" type="button" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  ) : <button className="scv-ghost" type="button" aria-label={`${label} ${what}`} onClick={() => setAsking(true)}>{label}</button>;
}

export function UsersTab({ roles, selfId }: { roles: Role[]; selfId: string | null }) {
  const data = useQuery(api.adminUsers.list);
  const create = useMutation(api.adminUsers.create);
  const setRoles = useMutation(api.adminUsers.setRoles);
  const remove = useMutation(api.adminUsers.remove);
  const reissue = useMutation(api.adminUsers.reissue);
  const removeInvite = useMutation(api.adminUsers.removeInvite);
  const isSystem = roles.includes('SYSTEM');
  const [username, setUsername] = useState('');
  const [newRoles, setNewRoles] = useState<Role[]>(['TEST']);
  const [link, setLink] = useState<{ username: string; url: string } | null>(null);
  const [editing, setEditing] = useState<{ id: Id<'users'>; roles: Role[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const now = Date.now();
  const linkFor = (token: string) => `${window.location.origin}/invite/${token}`;
  const run = async (f: () => Promise<unknown>) => { setErr(null); try { await f(); } catch (e) { setErr(errorText(e)); } };

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { token } = await create({ username, roles: newRoles });
      setLink({ username: username.trim().toLowerCase(), url: linkFor(token) });
      setUsername('');
    });
  };

  if (data === undefined) return <p className="scv-admin-note">Loading…</p>;
  const canTouch = (r: Role[]) => isSystem || !r.includes('SYSTEM'); // only SYSTEM may act on a SYSTEM user

  return (
    <div className="scv-users">
      {err && <p className="scv-resume-err" role="alert">{err}</p>}
      {link && <InviteLink username={link.username} url={link.url} onClose={() => setLink(null)} />}

      <form className="scv-panel scv-bug-form scv-admin-card" onSubmit={add} aria-label="Add a user">
        <h2 className="scv-admin-h2">Add a user</h2>
        <div className="scv-bug-field">
          <div className="scv-bug-head"><label htmlFor="scv-users-name">Username</label></div>
          <input id="scv-users-name" value={username} autoCapitalize="none" spellCheck={false} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
        </div>
        <RoleBoxes value={newRoles} onChange={setNewRoles} canSystem={isSystem} idPrefix="scv-new" />
        <button className="scv-primary" type="submit" disabled={!username.trim() || !newRoles.length}>Create user and link</button>
      </form>

      <h2 className="scv-admin-h2">Users</h2>
      <div className="scv-an-scroll">
        <table className="scv-hs-table" data-testid="users">
          <thead><tr><th>Username</th><th>Roles</th><th /></tr></thead>
          <tbody>
            {data.users.map((u) => {
              const me = u.id === selfId;
              const open = editing?.id === u.id;
              return (
                <tr key={u.id}>
                  <td>{u.username}{me && <span className="scv-an-tag">you</span>}</td>
                  <td>
                    {open
                      ? <RoleBoxes value={editing.roles} onChange={(r) => setEditing({ id: u.id, roles: r })} canSystem={isSystem} idPrefix={`scv-edit-${u.id}`} />
                      : roleText(u.roles)}
                  </td>
                  <td className="scv-users-actions">
                    {open ? (
                      <>
                        <button className="scv-primary" type="button" disabled={!editing.roles.length}
                                onClick={() => void run(async () => { await setRoles({ userId: u.id, roles: editing.roles }); setEditing(null); })}>Save</button>
                        <button className="scv-ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : !me && canTouch(u.roles) ? (
                      <>
                        <button className="scv-ghost" type="button" aria-label={`Edit roles of ${u.username}`} onClick={() => setEditing({ id: u.id, roles: u.roles })}>Edit roles</button>
                        <Confirm label="Delete" what={u.username} onConfirm={() => void run(() => remove({ userId: u.id }))} />
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.pending.length > 0 && (
        <>
          <h2 className="scv-admin-h2">Waiting for a password</h2>
          <div className="scv-an-scroll">
            <table className="scv-hs-table" data-testid="pending">
              <thead><tr><th>Username</th><th>Roles</th><th>Link</th><th /></tr></thead>
              <tbody>
                {data.pending.map((p) => (
                  <tr key={p.id}>
                    <td>{p.username}</td>
                    <td>{roleText(p.roles)}</td>
                    <td>{p.expiresAt <= now ? 'Expired' : `Expires ${ago(p.expiresAt, now) === 'just now' ? 'soon' : new Date(p.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}</td>
                    <td className="scv-users-actions">
                      {canTouch(p.roles) && (
                        <>
                          <button className="scv-ghost" type="button" aria-label={`New link for ${p.username}`}
                                  onClick={() => void run(async () => { const { token } = await reissue({ inviteId: p.id }); setLink({ username: p.username, url: linkFor(token) }); })}>New link</button>
                          <Confirm label="Cancel invite" what={p.username} onConfirm={() => void run(() => removeInvite({ inviteId: p.id }))} />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
