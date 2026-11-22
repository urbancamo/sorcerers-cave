import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Tabs } from '../Tabs';
import { errorText } from '../errorText';
import { Bars, Columns, type Item } from '../analytics/charts';
import { ago, num } from '../analytics/format';
import { PromptEditor } from './PromptEditor';
import { RewritePanel } from './RewritePanel';
import { seconds, usd } from './format';

type Sub = 'overview' | 'prompt' | 'rewrite' | 'runs';
const SUBS: { id: Sub; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'prompt', label: 'Prompt' }, { id: 'rewrite', label: 'Rewrites' }, { id: 'runs', label: 'Runs' },
];

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="scv-an-tile"><span className="scv-an-tile-label">{label}</span><strong>{value}</strong>{sub && <span className="scv-an-tile-sub">{sub}</span>}</div>;
}

const one = (label: string, value: number, key = 'n', name = 'Stories'): Item => ({ label, segs: [{ key, label: name, color: 'var(--brass)', value }] });

/** Spending switches: pause and the two caps. Viewable by anyone on the tab, changed only by SYSTEM (the server checks again). */
function Controls({ settings, canEdit }: { settings: { paused: boolean; dailyCapUsd: number | null; monthlyCapUsd: number | null }; canEdit: boolean }) {
  const update = useMutation(api.storyAdmin.updateSettings);
  const [daily, setDaily] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (args: { paused?: boolean; dailyCapUsd?: number; monthlyCapUsd?: number }, done: string) => {
    setMsg(null);
    try { await update(args); setDaily(null); setMonthly(null); setMsg({ ok: true, text: done }); } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };
  const parse = (s: string) => (s.trim() === '' ? 0 : Number(s)); // an empty box removes the cap
  const d = daily ?? (settings.dailyCapUsd?.toString() ?? ''), m = monthly ?? (settings.monthlyCapUsd?.toString() ?? '');
  return (
    <fieldset className="scv-panel scv-admin-card scv-st-controls" disabled={!canEdit}>
      <legend className="scv-sys-legend">Spending controls</legend>
      <button type="button" role="switch" aria-checked={settings.paused} className="scv-switch"
              onClick={() => void run({ paused: !settings.paused }, settings.paused ? 'Generation resumed.' : 'Generation paused.')}>
        <span className="scv-switch-track" aria-hidden="true"><span className="scv-switch-knob" /></span>
        <span className="scv-switch-text">Generation is <b>{settings.paused ? 'PAUSED' : 'ON'}</b></span>
      </button>
      <div className="scv-st-caps">
        <label className="scv-bug-field">Daily cap (US $)
          <input inputMode="decimal" value={d} placeholder="none" onChange={(e) => setDaily(e.target.value)} />
        </label>
        <label className="scv-bug-field">Monthly cap (US $)
          <input inputMode="decimal" value={m} placeholder="none" onChange={(e) => setMonthly(e.target.value)} />
        </label>
        <button type="button" className="scv-primary" disabled={daily === null && monthly === null}
                onClick={() => void run({ ...(daily !== null ? { dailyCapUsd: parse(daily) } : {}), ...(monthly !== null ? { monthlyCapUsd: parse(monthly) } : {}) }, 'Caps saved.')}>Save caps</button>
      </div>
      <p className="scv-admin-note">When a cap is reached, no new story is written until the next day or month (or the cap is raised). Empty means no cap. Costs are estimates from a price table.</p>
      {!canEdit && <p className="scv-admin-note">Changing these needs the System role.</p>}
      {msg && <p className={msg.ok ? 'scv-sys-ok' : 'scv-resume-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </fieldset>
  );
}

function Overview({ canEdit }: { canEdit: boolean }) {
  const o = useQuery(api.storyAdmin.overview);
  if (o === undefined) return <p className="scv-admin-note">Loading…</p>;
  const total = o.counts.ready + o.counts.failed + o.counts.pending;
  const cap = (spent: number, c: number | null) => (c ? `of ${usd(c)} cap` : 'no cap set');
  return (
    <>
      <div className="scv-an-tiles">
        <Tile label="Stories" value={num(total)} sub={`${num(o.counts.ready)} ready, ${num(o.counts.pending)} pending, ${num(o.counts.failed)} failed`} />
        <Tile label="Success rate" value={o.successRate === null ? '–' : `${o.successRate}%`} sub={`${num(o.runs.ok)} of ${num(o.runs.total)} model calls ok (30 days)`} />
        <Tile label="Spend today" value={usd(o.spend.todayUsd)} sub={cap(o.spend.todayUsd, o.settings.dailyCapUsd)} />
        <Tile label="Spend this month" value={usd(o.spend.monthUsd)} sub={cap(o.spend.monthUsd, o.settings.monthlyCapUsd)} />
        <Tile label="Average cost per story" value={usd(o.runs.avgCostPerStoryUsd)} sub={`write ${usd(o.runs.byPass.write)}, check ${usd(o.runs.byPass.check)} (30 days)`} />
        <Tile label="Average length" value={o.avgWords ? `${num(o.avgWords)} words` : '–'} sub={`${seconds(o.runs.avgDurationMs)} per call; prompt v${o.activeVersion} active`} />
      </div>
      <Controls settings={o.settings} canEdit={canEdit} />
      <div className="scv-an-grid2">
        <Columns title="Spend per day" sub={`US cents, the last ${o.windowDays} days (estimate)`} tickEvery={5}
                 items={o.perDay.map((d) => one(d.day.slice(5), Math.round(d.cents), 'c', 'Cents'))} />
        <Columns title="Model calls per day" sub="Calls made, the last 30 days" tickEvery={5} items={o.perDay.map((d) => one(d.day.slice(5), d.calls, 'n', 'Calls'))} />
        <Bars title="Stories by prompt version" sub="Ready stories, by the prompt that wrote them" labelWidth={96}
              items={o.byVersion.length ? o.byVersion.map((v) => ({ ...one(`Version ${v.version}`, v.count), note: usd(v.costUsd) })) : [one('None yet', 0)]} />
        <Bars title="Why stories failed" sub="Failed attempts, by reason" labelWidth={190}
              items={o.failureReasons.length ? o.failureReasons.map((r) => one(r.reason, r.count)) : [one('No failures', 0)]} />
      </div>
    </>
  );
}

function Runs() {
  const r = useQuery(api.storyAdmin.recent);
  const [open, setOpen] = useState<string | null>(null);
  const text = useQuery(api.storyAdmin.storyText, open ? { storyId: open as never } : 'skip');
  if (r === undefined) return <p className="scv-admin-note">Loading…</p>;
  const now = Date.now();
  return (
    <>
      <h3 className="scv-st-h">Stories</h3>
      {r.stories.length === 0 ? <p className="scv-admin-note">No stories yet.</p> : (
        <table className="scv-hs-table">
          <thead><tr><th>Updated</th><th>Title</th><th>Status</th><th className="scv-hs-num">Words</th><th className="scv-hs-num">Prompt</th><th className="scv-hs-num">Tries</th><th /></tr></thead>
          <tbody>{r.stories.map((s) => (
            <tr key={s._id}>
              <td>{ago(s.updatedAt, now)}</td><td>{s.title ?? '–'}</td>
              <td>{s.status}{s.error ? ` (${s.error.slice(0, 60)})` : ''}</td>
              <td className="scv-hs-num">{num(s.words)}</td><td className="scv-hs-num">{s.promptVersion === null ? '–' : `v${s.promptVersion}`}</td><td className="scv-hs-num">{s.attempts}</td>
              <td>{s.status === 'ready' && <button type="button" className="scv-ghost" onClick={() => setOpen(open === s._id ? null : s._id)}>{open === s._id ? 'Hide' : 'Read'}</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {open && text && (
        <article className="scv-panel scv-admin-card scv-st-read" aria-label="Story text">
          <h4>{text.title}</h4>
          {text.text?.split('\n\n').filter((p) => !p.startsWith('# ')).map((p, i) => <p key={i}>{p}</p>)}
          {text.previousText && <p className="scv-admin-note">An earlier version of this story is kept and is restored if a rewrite fails.</p>}
        </article>
      )}
      <h3 className="scv-st-h">Model calls</h3>
      {r.runs.length === 0 ? <p className="scv-admin-note">No calls yet.</p> : (
        <table className="scv-hs-table">
          <thead><tr><th>When</th><th>Pass</th><th>Trigger</th><th className="scv-hs-num">Prompt</th><th>Result</th><th className="scv-hs-num">In / out tokens</th><th className="scv-hs-num">Cost</th><th className="scv-hs-num">Time</th></tr></thead>
          <tbody>{r.runs.map((x) => (
            <tr key={x._id}>
              <td>{ago(x.createdAt, now)}</td><td>{x.pass}</td><td>{x.trigger}</td><td className="scv-hs-num">{x.promptVersion < 0 ? 'trial' : `v${x.promptVersion}`}</td>
              <td>{x.status}{x.reason ? `: ${x.reason.slice(0, 70)}` : ''}</td>
              <td className="scv-hs-num">{num(x.inputTokens)} / {num(x.outputTokens)}</td><td className="scv-hs-num">{usd(x.costUsd)}</td><td className="scv-hs-num">{seconds(x.durationMs)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}

/** The Stories tab: how the auto-generated short stories are doing, the prompt behind them, and bulk rewrites. SYSTEM edits; ANALYTICS views. */
export function StoriesTab({ canEdit }: { canEdit: boolean }) {
  const [sub, setSub] = useState<Sub>('overview');
  return (
    <Tabs tabs={SUBS} value={sub} onChange={setSub} label="Story views" variant="sub">
      {sub === 'overview' && <Overview canEdit={canEdit} />}
      {sub === 'prompt' && <PromptEditor canEdit={canEdit} />}
      {sub === 'rewrite' && <RewritePanel canEdit={canEdit} />}
      {sub === 'runs' && <Runs />}
    </Tabs>
  );
}
