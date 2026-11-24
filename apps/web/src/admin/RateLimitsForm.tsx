import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { errorText } from './errorText';

const UNITS = [
  { id: 'seconds', sec: 1 },
  { id: 'minutes', sec: 60 },
  { id: 'hours', sec: 3600 },
  { id: 'days', sec: 86400 },
] as const;
type Unit = (typeof UNITS)[number]['id'];
type Row = { max: string; amount: string; unit: Unit };

const SCOPE = { user: 'per player', game: 'per game', site: 'whole site' } as const;

/** A period in seconds as the largest unit that divides it exactly (3600 → 1 hour). */
function toRow(max: number, windowSec: number): Row {
  const unit = [...UNITS].reverse().find((u) => windowSec % u.sec === 0) ?? UNITS[0];
  return { max: String(max), amount: String(windowSec / unit.sec), unit: unit.id };
}
const toSeconds = (r: Row) => Number(r.amount) * UNITS.find((u) => u.id === r.unit)!.sec;
const same = (a: Row, b: Row) => Number(a.max) === Number(b.max) && toSeconds(a) === toSeconds(b);
const describe = (max: number, windowSec: number) => {
  const r = toRow(max, windowSec);
  return `${r.max} per ${r.amount === '1' ? r.unit.replace(/s$/, '') : `${r.amount} ${r.unit}`}`;
};

/**
 * The rate limits (SYSTEM role): how many times a player, a game or the whole site may do each thing in a period. Edits are held as a draft
 * until Save writes them all; a change takes effect on the next use, and a value left at its default is simply not stored.
 */
export function RateLimitsForm() {
  const saved = useQuery(api.settings.rateLimits);
  const setLimits = useMutation(api.settings.setRateLimits);
  const [draft, setDraft] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!saved) return <p className="scv-admin-note">Loading…</p>;

  const current = (l: (typeof saved)[number]) => toRow(l.max, l.windowSec);
  const rowOf = (l: (typeof saved)[number]) => draft[l.name] ?? current(l);
  const dirty = saved.some((l) => !same(rowOf(l), current(l)));
  const edit = (name: string, base: Row, patch: Partial<Row>) => { setMsg(null); setDraft((d) => ({ ...d, [name]: { ...(d[name] ?? base), ...patch } })); };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await setLimits({ limits: saved.map((l) => ({ name: l.name, max: Number(rowOf(l).max), windowSec: toSeconds(rowOf(l)) })) });
      setDraft({});
      setMsg({ kind: 'ok', text: 'Rate limits saved.' });
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) });
    } finally { setBusy(false); }
  };

  return (
    <form className="scv-sys" onSubmit={(e) => { e.preventDefault(); if (dirty && !busy) void save(); }} aria-label="Rate limits">
      <fieldset className="scv-panel scv-admin-card scv-sys-option">
        <legend className="scv-sys-legend">Rate limits</legend>
        <p className="scv-admin-note">
          How many times each thing can be done in a period. A player who goes over is told to wait and for how long. A change takes effect
          straight away. Limits are counted in fixed periods, so a burst across a boundary can briefly reach twice the figure.
        </p>
        <ul className="scv-rl-list">
          {saved.map((l) => {
            const row = rowOf(l);
            const atDefault = same(row, toRow(l.defaultMax, l.defaultWindowSec));
            const changed = !same(row, current(l));
            return (
              <li key={l.name} className="scv-rl-row" data-changed={changed || undefined}>
                <div className="scv-rl-what">
                  <b>{l.label}</b> <span className="scv-rl-scope">{SCOPE[l.scope]}</span>
                  <span className="scv-rl-note">{l.note} Default: {describe(l.defaultMax, l.defaultWindowSec)}.</span>
                </div>
                <div className="scv-rl-ctl">
                  <input
                    className="scv-hs-input scv-rl-num"
                    type="number" inputMode="numeric" min={1} step={1}
                    value={row.max}
                    aria-label={`${l.label}: number allowed`}
                    onChange={(e) => edit(l.name, row, { max: e.target.value })}
                  />
                  <span>per</span>
                  <input
                    className="scv-hs-input scv-rl-num"
                    type="number" inputMode="numeric" min={1} step={1}
                    value={row.amount}
                    aria-label={`${l.label}: period`}
                    onChange={(e) => edit(l.name, row, { amount: e.target.value })}
                  />
                  <select
                    className="scv-hs-input scv-rl-unit"
                    value={row.unit}
                    aria-label={`${l.label}: period unit`}
                    onChange={(e) => edit(l.name, row, { unit: e.target.value as Unit })}
                  >
                    {UNITS.map((u) => <option key={u.id} value={u.id}>{u.id}</option>)}
                  </select>
                  <button type="button" className="scv-ghost scv-rl-reset" disabled={atDefault} aria-label={`Reset ${l.label} to its default`}
                    onClick={() => { setMsg(null); setDraft((d) => ({ ...d, [l.name]: toRow(l.defaultMax, l.defaultWindowSec) })); }}>
                    Default
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <div className="scv-sys-actions">
        {msg && <p className={msg.kind === 'ok' ? 'scv-sys-ok' : 'scv-resume-err'} role={msg.kind === 'ok' ? 'status' : 'alert'}>{msg.text}</p>}
        <button type="button" className="scv-ghost" disabled={!dirty || busy} onClick={() => { setDraft({}); setMsg(null); }}>Cancel</button>
        <button type="submit" className="scv-primary" disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save rate limits'}</button>
      </div>
    </form>
  );
}
