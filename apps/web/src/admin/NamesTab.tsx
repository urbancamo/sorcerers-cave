import { useState, type ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Tabs } from './Tabs';
import { errorText } from './errorText';

/** One name with its context, and the controls to change it or clear it. The saved change shows up through the live query. */
function NameRow({ name, detail, maxLength, onSave, onClear }: {
  name: string; detail: ReactNode; maxLength: number;
  onSave: (name: string) => Promise<unknown>; onClear: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<string | null>(null); // null: not editing
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (go: () => Promise<unknown>, done: () => void) => {
    setBusy(true); setErr(null);
    try { await go(); done(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <li className="scv-nm-row">
      {draft === null ? (
        <>
          <div className="scv-nm-what">
            <b className="scv-nm-name">{name}</b>
            <span className="scv-nm-detail">{detail}</span>
          </div>
          <div className="scv-nm-ctl">
            <button type="button" className="scv-ghost" disabled={busy} onClick={() => { setErr(null); setDraft(name); }} aria-label={`Edit ${name}`}>Edit</button>
            <button type="button" className="scv-ghost" disabled={busy} onClick={() => void run(onClear, () => {})} aria-label={`Clear ${name}`}>Clear</button>
          </div>
        </>
      ) : (
        <form className="scv-nm-edit" onSubmit={(e) => { e.preventDefault(); if (!busy) void run(() => onSave(draft), () => setDraft(null)); }}>
          <input
            className="scv-hs-input"
            value={draft}
            maxLength={maxLength}
            autoFocus
            aria-label={`New name for ${name}`}
            onChange={(e) => { setDraft(e.target.value); setErr(null); }}
          />
          <button type="submit" className="scv-primary" disabled={busy || !draft.trim()}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="scv-ghost" disabled={busy} onClick={() => { setDraft(null); setErr(null); }}>Cancel</button>
        </form>
      )}
      {err && <p className="scv-hs-error scv-nm-err" role="alert">{err}</p>}
    </li>
  );
}

function Filter({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input className="scv-hs-input scv-nm-filter" type="search" placeholder="Filter by name" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />;
}
const matches = (name: string, filter: string) => name.toLowerCase().includes(filter.trim().toLowerCase());
const when = (t: number) => new Date(t).toLocaleString();

function ScoresPane() {
  const rows = useQuery(api.adminNames.highScores);
  const rename = useMutation(api.adminNames.renameHighScore);
  const clear = useMutation(api.adminNames.clearHighScore);
  const [filter, setFilter] = useState('');
  if (!rows) return <p className="scv-admin-note">Loading…</p>;
  const shown = rows.filter((r) => matches(r.name, filter));
  return (
    <div className="scv-nm-pane">
      <p className="scv-admin-note">The latest {rows.length} high-score entries, newest first. A name an admin sets is not screened.</p>
      <Filter value={filter} onChange={setFilter} label="Filter high-score names" />
      {shown.length === 0 ? <p className="scv-admin-note">{rows.length === 0 ? 'No entries yet.' : 'No names match.'}</p> : (
        <ul className="scv-nm-list">
          {shown.map((r) => (
            <NameRow
              key={r._id}
              name={r.name}
              maxLength={40}
              detail={`${r.score} points · ${r.mode === 'multi' ? `multiplayer${r.gameCode ? ` ${r.gameCode}` : ''}` : 'solo'} · ${when(r.createdAt)}`}
              onSave={(name) => rename({ id: r._id, name })}
              onClear={() => clear({ id: r._id })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PartiesPane() {
  const rows = useQuery(api.adminNames.parties);
  const rename = useMutation(api.adminNames.renameParty);
  const clear = useMutation(api.adminNames.clearParty);
  const [filter, setFilter] = useState('');
  if (!rows) return <p className="scv-admin-note">Loading…</p>;
  const shown = rows.filter((r) => matches(r.partyName, filter));
  return (
    <div className="scv-nm-pane">
      <p className="scv-admin-note">
        Party names in the latest multiplayer games, newest first. A change reaches the party's seat, the game, its chat lines and its leaderboard
        entry. Chat messages and "joined" lines already written are left as they were.
      </p>
      <Filter value={filter} onChange={setFilter} label="Filter party names" />
      {shown.length === 0 ? <p className="scv-admin-note">{rows.length === 0 ? 'No multiplayer games yet.' : 'No names match.'}</p> : (
        <ul className="scv-nm-list">
          {shown.map((r) => (
            <NameRow
              key={r._id}
              name={r.partyName}
              maxLength={24}
              detail={`${r.color} · seat ${r.seat + 1}${r.withParties.length ? ` · with ${r.withParties.join(', ')}` : ''} · ${when(r.createdAt)}`}
              onSave={(name) => rename({ playerId: r._id, name })}
              onClear={() => clear({ playerId: r._id })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChangesPane() {
  const rows = useQuery(api.adminNames.audit);
  if (!rows) return <p className="scv-admin-note">Loading…</p>;
  if (rows.length === 0) return <p className="scv-admin-note">No names have been changed yet.</p>;
  return (
    <div className="scv-nm-pane">
      <p className="scv-admin-note">The latest changes, newest first. To undo one, edit the name back.</p>
      <ul className="scv-nm-list">
        {rows.map((a) => (
          <li key={a._id} className="scv-nm-row">
            <div className="scv-nm-what">
              <span><b className="scv-nm-name">{a.before}</b> → <b className="scv-nm-name">{a.after}</b></span>
              <span className="scv-nm-detail">{a.kind === 'highScore' ? 'high score' : 'party name'} · {when(a.at)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Pane = 'scores' | 'parties' | 'changes';
const PANES: { id: Pane; label: string }[] = [
  { id: 'scores', label: 'High scores' },
  { id: 'parties', label: 'Party names' },
  { id: 'changes', label: 'Changes' },
];

/** Names (SYSTEM role): edit or clear an offensive high-score name or multiplayer party name, with a record of what was changed. */
export function NamesTab() {
  const [pane, setPane] = useState<Pane>('scores');
  return (
    <Tabs tabs={PANES} value={pane} onChange={setPane} label="Names" variant="sub">
      {pane === 'scores' ? <ScoresPane /> : pane === 'parties' ? <PartiesPane /> : <ChangesPane />}
    </Tabs>
  );
}
