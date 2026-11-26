import { useState, type ReactNode } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { errorText } from '../errorText';
import { num } from '../analytics/format';
import { saveRejected, usd } from './format';

/** The parts that can be switched off (as SWITCHABLE in convex/storyWriter.ts). The writer cannot: without it there is no story. */
type Part = 'planner' | 'factCheck' | 'editor' | 'voices' | 'bible' | 'characters';

interface Fields {
  writer: string; editor: string; model: string; minWords: number; maxWords: number;
  planner: string; factCheck: string; voices: string; bible: string; characters: string;
  disabled: Part[];
}

/** What switching a part off does to the pipeline, shown under its switch while it is off. */
const OFF_EFFECT: Record<Part, string> = {
  planner: 'Off: no plan is made; the writer works from the record and the voice alone.',
  factCheck: 'Off: nothing is fact-checked, so no story is ever rejected for its facts.',
  editor: 'Off: the draft is the story. It is still fact-checked and held to the length and form rules, and with nothing to repair it any problem rejects it.',
  voices: 'Off: no voice is given; the story is told in the writer\'s default manner.',
  bible: 'Off: no lore about the creatures, artefacts and places is given to the planner or the writer.',
  characters: 'Off: the party has no fixed names or traits, and the planner, writer and editor are not given them.',
};
type Tried = { ok: true; title: string; text: string; words: number; costUsd: number } | { ok: false; reason: string; costUsd: number; text?: string };

/** Only the editable fields: a saved version row carries more (version, note, timestamps) that the save call must not receive. */
const pick = (p: Fields): Fields => ({
  writer: p.writer, editor: p.editor, model: p.model, minWords: p.minWords, maxWords: p.maxWords,
  planner: p.planner, factCheck: p.factCheck, voices: p.voices, bible: p.bible, characters: p.characters,
  disabled: [...(p.disabled ?? [])].sort(),
});

const FIELD_NAMES: [Exclude<keyof Fields, 'disabled'>, string][] = [
  ['planner', 'planner prompt'], ['writer', 'writer prompt'], ['factCheck', 'fact-check prompt'], ['editor', 'editor prompt'],
  ['voices', 'voices'], ['bible', 'story bible'], ['characters', 'story characters'], ['model', 'model'], ['minWords', 'minimum words'], ['maxWords', 'maximum words'],
];

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
  if (fields.disabled.join() !== base.disabled.join()) changed.push('which parts are on');
  const isOn = (part: Part) => !fields.disabled.includes(part);
  const toggle = (part: Part) => set({ disabled: (isOn(part) ? [...fields.disabled, part] : fields.disabled.filter((x) => x !== part)).sort() });
  /** One prompt section: a heading with its on/off switch (none for the writer), the text, and what being off means. */
  const section = (part: Part | 'writer', title: string, help: ReactNode, rows: number) => {
    const on = part === 'writer' || isOn(part);
    return (
      <div className={`scv-st-part${on ? '' : ' scv-st-part-off'}`}>
        <div className="scv-st-part-head">
          <span className="scv-st-part-title" id={`st-${part}`}>{title}</span>
          {part === 'writer' ? <span className="scv-admin-note">Always on</span> : (
            <button type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${title}: ${on ? 'on' : 'off'}`}
                    className="scv-switch"
                    disabled={!canEdit}
                    onClick={() => toggle(part)}>
              <span className="scv-switch-track" aria-hidden="true"><span className="scv-switch-knob" /></span>
              <span className="scv-switch-text">{on ? 'On' : 'Off'}</span>
            </button>
          )}
        </div>
        <p className="scv-st-part-help">{help}</p>
        {!on && <p className="scv-admin-note">{OFF_EFFECT[part as Part]}</p>}
        <textarea className="scv-st-area"
                  aria-labelledby={`st-${part}`}
                  rows={on ? rows : 4}
                  value={fields[part]}
                  readOnly={!canEdit}
                  onChange={(e) => set({ [part]: e.target.value } as Partial<Fields>)}
                  spellCheck={false} />
      </div>
    );
  };
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
        The source files <code>convex/storyPrompt.ts</code> and <code>convex/storyBible.ts</code> and <code>convex/storyCharacters.ts</code> hold the defaults used until a version is saved here. A version saved before the planner, fact-check, voices, bible and characters were editable uses the source defaults for them.
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

      <h4 className="scv-st-h">The four calls, in the order they run</h4>
      <p className="scv-admin-note">Switch a part off to leave it out of the next stories (and of a trial). Its text is kept and saved with the version, ready to switch back on.</p>
      {section('planner', '1. Planner prompt', 'Reads the record and the voice, and plans what the story is about and how it ends.', 14)}
      {section('writer', '2. Writer prompt', 'Writes the first draft from the record, the plan and the voice.', 18)}
      {section('factCheck', '3. Fact-check prompt', 'Lists where the story departs from the record; run before and after the edit.', 12)}
      {section('editor', '4. Editor prompt', 'Fixes the fact problems and improves the telling; returns only the story.', 14)}

      <h4 className="scv-st-h">Voices and the world</h4>
      {section('voices', 'Voices', <>One per paragraph as <code>id: instruction</code>; each game is given one, always the same one.</>, 9)}
      {section('bible', 'Story bible', <>Sections <code>## header</code>, <code>## creatures</code>, <code>## artefacts</code>, <code>## places</code>; one <code>Name: entry</code> per line; a place is <code>keyword | keyword: entry</code>. Only the entries for what is in a game are given to the planner and writer.</>, 28)}
      {section('characters', 'Story characters', <>A <code>## header</code>, then one <code>## Class</code> block per creature with lines <code>general:</code>, <code>names:</code>, <code>habits:</code>, <code>worries:</code>, <code>wants:</code>, <code>strengths:</code> and, for classes that can start a party, <code>explorer:</code>; list items are separated by <code>|</code>. Last comes <code>## pairings</code> with <code>Class + Class: text</code>. Names are assigned by the code, the same for a game every time.</>, 32)}

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
            ) : (
              <div>
                <p className="scv-resume-err scv-st-why" role="alert">The trial did not produce a story: {tried.reason} (cost about {usd(tried.costUsd)}).</p>
                {tried.text && (
                  <button type="button"
                          className="scv-ghost"
                          onClick={() => saveRejected({ reason: tried.reason, at: Date.now(), text: tried.text!, label: 'prompt trial' })}>
                    Download rejected text
                  </button>
                )}
              </div>
            ))}
          </fieldset>
        </>
      ) : <p className="scv-admin-note">Editing the prompt needs the System role.</p>}
      {msg && <p className={msg.ok ? 'scv-sys-ok' : 'scv-resume-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  );
}
