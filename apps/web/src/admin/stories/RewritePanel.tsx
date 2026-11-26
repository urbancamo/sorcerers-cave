import { useState } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { errorText } from '../errorText';
import { ago, num } from '../analytics/format';
import { download, usd } from './format';
import { buildStoryPdf } from '../../story/storyPdf';

const STORY_SEPARATOR = '\n\n---\n\n';


type Kind = 'older' | 'failed' | 'all' | 'one';
const KINDS: { id: Kind; label: string; help: string }[] = [
  { id: 'older', label: 'Stories written with an older prompt', help: 'The usual choice after saving a new prompt version.' },
  { id: 'failed', label: 'Failed stories', help: 'Try again the ones that did not come out.' },
  { id: 'all', label: 'Every story', help: 'Rewrites even those already on the latest prompt.' },
  { id: 'one', label: 'One game', help: 'Rewrite the story of a single game by its code.' },
];
const CONFIRM_WORD = 'REWRITE';

/**
 * Bulk rewrites after a prompt change. Pick a scope, see the count and a cost estimate, type the confirmation word, and the job runs
 * in small batches in the background: it can be stopped, and it halts by itself when generation is paused or a cap is reached.
 * A story whose rewrite fails keeps its old text.
 */
export function RewritePanel({ canEdit }: { canEdit: boolean }) {
  const [kind, setKind] = useState<Kind>('older');
  const [code, setCode] = useState('');
  const scope = kind === 'one' ? ({ kind, gameCode: code } as const) : ({ kind } as const);
  const preview = useQuery(api.storyAdmin.rewritePreview, canEdit && (kind !== 'one' || code.trim().length >= 4) ? { scope } : 'skip');
  const jobs = useQuery(api.storyAdmin.jobs);
  const start = useMutation(api.storyAdmin.startRewrite);
  const stop = useMutation(api.storyAdmin.stopJob);
  const convex = useConvex();
  const [exporting, setExporting] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const running = jobs?.find((j) => j.status === 'running');
  const ready = !!preview && preview.count > 0 && typed === CONFIRM_WORD && !running && !preview.paused && !busy;

  /** Download the stories a finished job wrote, as one Markdown file or one PDF. */
  const exportJob = async (jobId: (typeof jobs extends (infer J)[] | undefined ? J : never)['_id'], format: 'md' | 'pdf') => {
    setExporting(`${jobId}:${format}`); setMsg(null);
    try {
      const stories = await convex.query(api.storyAdmin.jobStories, { jobId });
      if (!stories.length) { setMsg({ ok: false, text: 'No stories were found for that rewrite.' }); return; }
      const markdown = stories.map((x) => x.text.trim()).join(STORY_SEPARATOR) + '\n';
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'md') download(`rewrite-${stamp}.md`, new Blob([markdown], { type: 'text/markdown' }));
      else { const pdf = await buildStoryPdf(markdown, 'The Sorcerer\'s Cave'); download(`rewrite-${stamp}.pdf`, new Blob([pdf.output()], { type: 'application/pdf' })); }
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setExporting(null); }
  };

  const go = async () => {
    if (!preview) return;
    setBusy(true); setMsg(null);
    try {
      await start({ scope, expected: preview.count });
      setTyped('');
      setMsg({ ok: true, text: 'Rewrite started. Progress is shown below.' });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="scv-st-rewrite">
      {canEdit && (
        <fieldset className="scv-panel scv-admin-card">
          <legend className="scv-sys-legend">Rewrite stories</legend>
          <div role="radiogroup" aria-label="Which stories" className="scv-st-scope">
            {KINDS.map((k) => (
              <label key={k.id} className="scv-st-radio">
                <input type="radio" name="scope" checked={kind === k.id} onChange={() => { setKind(k.id); setTyped(''); setMsg(null); }} />
                <span><b>{k.label}</b><br /><span className="scv-admin-note">{k.help}</span></span>
              </label>
            ))}
          </div>
          {kind === 'one' && (
            <label className="scv-bug-field">Game code
              <input value={code} maxLength={8} placeholder="e.g. VWGO" onChange={(e) => { setCode(e.target.value); setTyped(''); }} />
            </label>
          )}
          {preview && (
            <div role="status" className="scv-st-preview">
              <p><b>{num(preview.count)}</b> {preview.count === 1 ? 'story' : 'stories'} selected ({preview.label.toLowerCase()}). Estimated cost <b>{usd(preview.estimatedUsd)}</b> at about {usd(preview.perStoryUsd)} each.</p>
              {preview.count === 0 && <p className="scv-resume-err">{preview.note ?? 'Nothing matches that choice, so there is nothing to rewrite.'}</p>}
              {preview.truncated && <p className="scv-admin-note">Only the first 500 are included in one job; run another job afterwards for the rest.</p>}
              {preview.paused && <p className="scv-resume-err">Generation is paused (Overview tab). Resume it to start a rewrite.</p>}
              {preview.exceedsDailyCap && <p className="scv-resume-err">That is more than the {usd(preview.remainingTodayUsd)} left under today's cap. The job will stop when the cap is reached and can be resumed tomorrow by starting another.</p>}
            </div>
          )}
          <div className="scv-st-row">
            <label className="scv-bug-field scv-st-grow">Type {CONFIRM_WORD} to confirm
              <input value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
            </label>
            <button type="button" className="scv-primary" disabled={!ready} onClick={() => void go()}>{busy ? 'Starting…' : 'Start rewrite'}</button>
          </div>
          {running && <p className="scv-admin-note">A rewrite is already running. Wait for it to finish or stop it below.</p>}
        </fieldset>
      )}
      {!canEdit && <p className="scv-admin-note">Starting rewrites needs the System role. The jobs below can still be watched.</p>}
      {msg && <p className={msg.ok ? 'scv-sys-ok' : 'scv-resume-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}

      <h3 className="scv-st-h">Rewrite jobs</h3>
      {!jobs ? <p className="scv-admin-note">Loading…</p> : jobs.length === 0 ? <p className="scv-admin-note">No rewrites have been run.</p> : (
        <table className="scv-hs-table">
          <thead><tr><th>Started</th><th>What</th><th>Status</th><th className="scv-hs-num">Done</th><th className="scv-hs-num">Failed</th><th className="scv-hs-num">Total</th><th /></tr></thead>
          <tbody>{jobs.map((j) => (
            <tr key={j._id}>
              <td>{ago(j.createdAt, Date.now())}</td><td>{j.scope}</td>
              <td>{j.status}{j.reason ? ` (${j.reason})` : ''}</td>
              <td className="scv-hs-num">{j.done}</td><td className="scv-hs-num">{j.failed}</td><td className="scv-hs-num">{j.total}</td>
              <td>
                {canEdit && j.status === 'running' && <button type="button" className="scv-ghost" onClick={() => void stop({ jobId: j._id })}>Stop</button>}
                {j.status === 'done' && j.done > 0 && (
                  <span className="scv-st-export">
                    <button type="button" className="scv-ghost" disabled={exporting !== null} onClick={() => void exportJob(j._id, 'pdf')}>{exporting === `${j._id}:pdf` ? 'Making…' : 'PDF'}</button>
                    <button type="button" className="scv-ghost" disabled={exporting !== null} onClick={() => void exportJob(j._id, 'md')}>Markdown</button>
                  </span>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
