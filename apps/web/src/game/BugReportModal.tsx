import { useEffect, useId, useState } from 'react';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { HelpButton } from '../manual/HelpButton';

type Category = 'rules' | 'display' | 'crash' | 'other';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'rules', label: 'A rule is wrong' },
  { value: 'display', label: 'Something looks wrong' },
  { value: 'crash', label: 'Stuck or crashed' },
  { value: 'other', label: 'Something else' },
];

/** The "Report a bug" form. Submitting stores the report (and, server-side, files a GitHub issue with
 *  the game attached). It dispatches nothing to the game, so it is safe to open at any moment. */
export function BugReportModal({ gameId, screenshot = null, onClose }: { gameId: Id<'games'> | null; screenshot?: Promise<Blob | null> | null; onClose: () => void }) {
  const submit = useMutation(api.bugReport.submit);
  const generateUploadUrl = useMutation(api.bugReport.generateUploadUrl);
  const uid = useId();
  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ ref: string; code: string | null } | null>(null);

  // The picture taken as the bug button was pressed. `shot` is undefined while it is still being taken,
  // null if it could not be (the section is then left out), else the image. Attached unless the player opts out.
  const [shot, setShot] = useState<Blob | null | undefined>(screenshot ? undefined : null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [attach, setAttach] = useState(true);
  useEffect(() => {
    let live = true;
    if (!screenshot) { setShot(null); return; }
    void screenshot.then((b) => { if (live) setShot(b); }, () => { if (live) setShot(null); });
    return () => { live = false; };
  }, [screenshot]);
  useEffect(() => {
    if (!shot) { setShotUrl(null); return; }
    const url = URL.createObjectURL(shot);
    setShotUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [shot]);

  const ready = description.trim().length >= 10 && !sending;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      // A screenshot that cannot be uploaded must not cost the player their report: send it without.
      let screenshotId: Id<'_storage'> | undefined;
      if (attach && shot) {
        try {
          const up = await fetch(await generateUploadUrl(), { method: 'POST', headers: { 'Content-Type': shot.type || 'image/jpeg' }, body: shot });
          if (up.ok) screenshotId = ((await up.json()) as { storageId: Id<'_storage'> }).storageId;
        } catch { /* sent without it */ }
      }
      const res = await submit({
        gameId: gameId ?? undefined,
        description: description.trim(),
        expected: expected.trim() || undefined,
        category,
        contact: contact.trim() || undefined,
        screenshotId,
        client: {
          userAgent: navigator.userAgent.slice(0, 400),
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          build: String(import.meta.env.VITE_BUILD_ID ?? 'dev'),
        },
      });
      setSent(res);
    } catch (e) {
      // A ConvexError carries a message written for the player (too short, too many reports…).
      setError(e instanceof ConvexError && typeof e.data === 'string' ? e.data : 'Could not send your report. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="scv-dice-overlay" role="dialog" aria-label="report a bug" data-testid="bug-modal">
      <div className="scv-dice-card scv-bug">
        <div className="scv-dice-title"><span>Report a bug</span><HelpButton topics={['bug-report']} label="Help with bug reports" /></div>
        {sent ? (
          <>
            <p className="scv-dice-msg good scv-bug-thanks">Thank you — your report was received.</p>
            <dl className="scv-bug-receipt">
              <div><dt>Reference</dt><dd data-testid="bug-ref">{sent.ref}</dd></div>
              {sent.code && <div><dt>Game code</dt><dd className="code" data-testid="bug-code">{sent.code}</dd></div>}
            </dl>
            <div className="scv-bug-actions"><button type="button" className="scv-primary" onClick={onClose}>Close</button></div>
          </>
        ) : (
          <form className="scv-bug-form" noValidate onSubmit={(e) => { e.preventDefault(); if (ready) void send(); }}>
            <div className="scv-bug-field">
              <div className="scv-bug-head">
                <label htmlFor={`${uid}-what`}>What happened?</label>
                <span className="scv-bug-hint" id={`${uid}-count`}>{description.trim().length < 10 ? 'At least 10 characters' : `${description.length} / 5000`}</span>
              </div>
              <textarea id={`${uid}-what`} aria-describedby={`${uid}-count`} value={description} rows={5} maxLength={5000}
                        placeholder="Describe what you saw, and what you did just before."
                        onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="scv-bug-field">
              <div className="scv-bug-head"><label htmlFor={`${uid}-expected`}>What did you expect?</label></div>
              <textarea id={`${uid}-expected`} className="short" value={expected} rows={3} maxLength={2000} onChange={(e) => setExpected(e.target.value)} />
            </div>
            <div className="scv-bug-pair">
              <div className="scv-bug-field">
                <div className="scv-bug-head"><label htmlFor={`${uid}-category`}>Category</label></div>
                <select id={`${uid}-category`} className="scv-enc-select scv-bug-select" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="scv-bug-field">
                <div className="scv-bug-head">
                  <label htmlFor={`${uid}-contact`}>Contact</label>
                  <span className="scv-bug-hint" id={`${uid}-contact-hint`}>optional; never published</span>
                </div>
                <input id={`${uid}-contact`} aria-describedby={`${uid}-contact-hint`} type="text" value={contact} maxLength={200} onChange={(e) => setContact(e.target.value)} />
              </div>
            </div>
            {shot !== null && (
              <div className="scv-bug-shot" data-testid="bug-shot">
                {shotUrl ? <img src={shotUrl} alt="Screenshot of the game window, as it was when you pressed the bug button" /> : <span className="scv-bug-hint">Capturing the game window…</span>}
                <label className="scv-bug-check">
                  <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
                  Attach this screenshot
                </label>
              </div>
            )}
            <p className="scv-bug-note" data-testid="bug-privacy">
              Your report is sent with this game's moves, its game code and your browser details, and becomes a public issue
              on GitHub, with the screenshot if you leave it attached (untick it to send without). Please don't include anything private.
            </p>
            {error && <p className="scv-bug-error" role="alert">{error}</p>}
            <div className="scv-bug-actions">
              <button type="button" className="scv-ghost" onClick={onClose}>Close</button>
              <button type="submit" className="scv-primary" disabled={!ready}>{sending ? 'Sending…' : 'Send report'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
