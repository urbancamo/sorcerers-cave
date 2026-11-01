import { useEffect, useState } from 'react';
import { topicById, topicVisible } from './index';
import { useVariants } from './HelpContext';
import { TopicView } from './TopicView';

/**
 * A small "?" that opens the named manual topics in a popover beside the control it explains (a bottom sheet on a
 * phone). Topics the game's options switch off are left out; with none left it renders nothing.
 */
export function HelpButton({ topics, label = 'Help', up = false }: { topics: string[]; label?: string; up?: boolean }) {
  const flags = useVariants();
  const [open, setOpen] = useState(false);
  const shown = topics.map(topicById).filter((t): t is NonNullable<typeof t> => !!t && topicVisible(t, flags));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (shown.length === 0) return null;
  return (
    <span className="scv-hb">
      <button type="button" className="scv-hb-btn" aria-label={label} aria-expanded={open} title={shown[0]!.brief ?? label} onClick={() => setOpen((o) => !o)}>?</button>
      {open && (
        <div className={"scv-hb-pop" + (up ? " up" : "")} role="dialog" aria-label={label} data-testid="help-popover">
          <button type="button" className="scv-hb-close" aria-label="Close help" onClick={() => setOpen(false)}>×</button>
          {shown.map((t) => <TopicView key={t.id} topic={t} flags={flags} />)}
        </div>
      )}
    </span>
  );
}
