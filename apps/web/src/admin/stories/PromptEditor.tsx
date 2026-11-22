import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { errorText } from '../errorText';
import { num } from '../analytics/format';
import { usd } from './format';

interface Fields { writer: string; editor: string; model: string; minWords: number; maxWords: number }
type Tried = { ok: true; title: string; text: string; words: number; costUsd: number } | { ok: false; reason: string; costUsd: number };

/** Only the five editable fields: a saved version row carries more (version, note, timestamps) that the save call must not receive. */
const pick = (p: Fields): Fields => ({ writer: p.writer, editor: p.editor, model: p.model, minWords: p.minWords, maxWords: p.maxWords });

const FIELD_NAMES: [keyof Fields, string][] = [['writer', 'writer prompt'], ['editor', 'editor prompt'], ['model', 'model'], ['minWords', 'minimum words'], ['maxWords', 'maximum words']];

/**
 * View and edit the prompt behind the stories. Saving never overwrites: it appends a new version, which becomes the one used for
 * every story written from then on. Existing stories keep the version that wrote them until a rewrite is run.
 */
export function PromptEditor({ canEdit }: { canEdit: boolean }) {
  const data = useQuery(api.storyAdmin.prompts);
  const recent = useQuery(api.storyAdmin.recent);
  const save = useMutation(api.storyAdmin.savePrompt);
  const tryPrompt = useAction(api.storyAdmin.tryPrompt);
  const [draft, setDraft] = useState<Fields | null>(null);
  const [from, setFrom] = useState<string | null>(null); // what the draft was loaded from, for the "changed" note
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [trialFor, setTrialFor] = useState('');
  const [trying, setTrying] = useState(false);
  const [tried, setTried] = useState<Tried | null>(null);

  if (!data) return <p className="scv-admin-note">Loading…</p>;
  const active = data.versions[0];
  const base: Fields = pick(active ?? data.defaults);
  const fields = draft ?? base;
  const baseLabel = from ?? (active ? `version ${active.version}` : 'the source defaults (version 0)');
  const changed = FIELD_NAMES.filter(([k]) => fields[k] !== base[k]).map(([, label]) => label);
  const set = (patch: Partial<Fields>) => { setMsg(null); setDraft({ ...fields, ...patch }); };
  const load = (label: string, f: Fields) => { setDraft(pick(f)); setFrom(label); setMsg(null); setTried(null); };
  const stories = (recent?.stories ?? []).filter((s) => s.status === 'ready');

  const doSave = async () => {
    setBusy(true); setMsg(null);
    try {
      const v = await save({ ...fields, note: note || undefined });
      setDraft(null); setFrom(null); setNote('');
      setMsg({ ok: true, text: `Saved as version ${v}. New stories use it now; existing stories keep their version until rewritten.` });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const doTry = async () => {
    setTrying(true); setTried(null); setMsg(null);
    try { setTried(await tryPrompt({ highScoreId: trialFor as never, ...fields })); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setTrying(false); }
  };

  return (
    <div className="scv-st-prompt">
      <p className="scv-admin-note">
        Active: <b>{active ? `version ${active.version}` : 'the defaults in the source code (version 0)'}</b>. Saving makes a new version and never overwrites an old one.
        The source file <code>convex/storyPrompt.ts</code> holds the defaults used until a version is saved here.
      </p>

      <div className="scv-st-row">
        <label className="scv-bug-field">Load a version
          <select className="scv-bug-select" value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'defaults') load('the source defaults (version 0)', data.defaults);
                    else { const p = data.versions.find((x) => String(x.version) === v); if (p) load(`version ${p.version}`, p); }
                  }}>
            <option value="" disabled>Choose…</option>
            {data.versions.map((p) => <option key={p.version} value={p.version}>{`Version ${p.version}${p.note ? `: ${p.note}` : ''}`}</option>)}
            <option value="defaults">Source defaults (version 0)</option>
          </select>
        </label>
        <label className="scv-bug-field">Model
          <select className="scv-bug-select" value={fields.model} disabled={!canEdit} onChange={(e) => set({ model: e.target.value })}>
            {data.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="scv-bug-field">Minimum words
          <input type="number" value={fields.minWords} disabled={!canEdit} onChange={(e) => set({ minWords: Number(e.target.value) })} />
        </label>
        <label className="scv-bug-field">Maximum words
          <input type="number" value={fields.maxWords} disabled={!canEdit} onChange={(e) => set({ maxWords: Number(e.target.value) })} />
        </label>
      </div>

      <label className="scv-bug-field">Writer prompt (writes the first draft from the record of the expedition)
        <textarea className="scv-st-area" rows={18} value={fields.writer} readOnly={!canEdit} onChange={(e) => set({ writer: e.target.value })} spellCheck={false} />
      </label>
      <label className="scv-bug-field">Editor prompt (checks the draft against the record and improves it)
        <textarea className="scv-st-area" rows={14} value={fields.editor} readOnly={!canEdit} onChange={(e) => set({ editor: e.target.value })} spellCheck={false} />
      </label>

      {canEdit ? (
        <>
          <p className="scv-admin-note" role="status">
            {changed.length ? `Changed from ${baseLabel}: ${changed.join(', ')}.` : `No changes from ${baseLabel}.`}
            {' '}The editor prompt is the line editor: it is given the facts, the voice, any fact problems to fix and the draft, and must return only the story (a "# Title" line, then paragraphs). Fact-checking is a separate call whose prompt lives in the code.
          </p>
          <div className="scv-st-row">
            <label className="scv-bug-field scv-st-grow">Note for this version (optional)
              <input value={note} maxLength={200} placeholder="e.g. shorter, less naming of artefacts" onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="button" className="scv-ghost" disabled={!draft} onClick={() => { setDraft(null); setFrom(null); setMsg(null); setTried(null); }}>Discard changes</button>
            <button type="button" className="scv-primary" disabled={busy || !changed.length} onClick={() => void doSave()}>{busy ? 'Saving…' : 'Save as a new version'}</button>
          </div>

          <fieldset className="scv-panel scv-admin-card scv-st-try">
            <legend className="scv-sys-legend">Try this prompt first</legend>
            <p className="scv-admin-note">Writes one story from a real game with the text above, without saving the prompt or touching that game's story. It costs about as much as one story, and counts against the caps.</p>
            <div className="scv-st-row">
              <label className="scv-bug-field scv-st-grow">Game to write from
                <select className="scv-bug-select" value={trialFor} onChange={(e) => setTrialFor(e.target.value)}>
                  <option value="">Choose a story…</option>
                  {stories.map((s) => <option key={s._id} value={s.highScoreId}>{s.title ?? 'Untitled'} ({num(s.words)} words)</option>)}
                </select>
              </label>
              <button type="button" className="scv-primary" disabled={!trialFor || trying} onClick={() => void doTry()}>{trying ? 'Writing (about a minute)…' : 'Write a trial story'}</button>
            </div>
            {tried && (tried.ok ? (
              <article className="scv-st-read" aria-label="Trial story">
                <h4>{tried.title}</h4>
                <p className="scv-admin-note">{num(tried.words)} words, cost about {usd(tried.costUsd)}. Not saved.</p>
                {tried.text.split('\n\n').filter((p) => !p.startsWith('# ')).map((p, i) => <p key={i}>{p}</p>)}
              </article>
            ) : <p className="scv-resume-err" role="alert">The trial did not produce a story: {tried.reason} (cost about {usd(tried.costUsd)}).</p>)}
          </fieldset>
        </>
      ) : <p className="scv-admin-note">Editing the prompt needs the System role.</p>}
      {msg && <p className={msg.ok ? 'scv-sys-ok' : 'scv-resume-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  );
}
