import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef<T extends string> { id: T; label: string }

/**
 * A tab pane: a row of tabs joined to the pane they control. Follows the WAI-ARIA tabs pattern: one tab is in the tab order
 * (the selected one), the arrow keys, Home and End move between tabs and select as they go, and the pane is labelled by its tab.
 * Controlled: the parent holds the selected id and renders the matching content as `children`.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label, variant = 'main', children }: {
  tabs: TabDef<T>[]; value: T; onChange: (id: T) => void; label: string; variant?: 'main' | 'sub'; children: ReactNode;
}) {
  const uid = useId();
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const select = (id: T) => { onChange(id); refs.current.get(id)?.focus(); };

  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    const to = e.key === 'ArrowRight' ? (i + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    select(tabs[to]!.id);
  };

  return (
    <div className={`scv-tabs scv-tabs-${variant}`}>
      <div className="scv-tabs-list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => { if (el) refs.current.set(t.id, el); else refs.current.delete(t.id); }}
            id={`${uid}-tab-${t.id}`}
            role="tab"
            type="button"
            className="scv-tab"
            aria-selected={t.id === value}
            aria-controls={`${uid}-pane`}
            tabIndex={t.id === value ? 0 : -1}
            onClick={() => onChange(t.id)}
          >{t.label}</button>
        ))}
      </div>
      <div className="scv-tabs-pane" role="tabpanel" id={`${uid}-pane`} aria-labelledby={`${uid}-tab-${value}`} tabIndex={0}>{children}</div>
    </div>
  );
}
