import { useState } from 'react';
import { manualFor, searchTopics, topicsForScreen, type HelpScreen, type Topic, type VariantFlags } from './index';
import { TopicView } from './TopicView';

const Fold = ({ topic, flags, open }: { topic: Topic; flags?: VariantFlags; open?: boolean }) => (
  <details className="scv-help-fold" open={open}>
    <summary>{topic.title}{topic.brief && <span className="scv-help-brief"> — {topic.brief}</span>}</summary>
    <TopicView topic={topic} showTitle={false} flags={flags} />
  </details>
);

/**
 * The manual for the player: help for the screen they are on, then every section to browse, with a search box.
 * Shows only what applies under `flags` (the game's options); with no game (`undefined`) it shows everything.
 */
export function HelpBrowser({ screens, flags }: { screens: HelpScreen[]; flags?: VariantFlags }) {
  const [query, setQuery] = useState('');
  const here = topicsForScreen(screens, flags);
  const found = query.trim() ? searchTopics(query, flags) : null;
  return (
    <div className="scv-hbr">
      <input type="search" className="scv-hbr-search" placeholder="Search the manual" aria-label="Search the manual"
             value={query} onChange={(e) => setQuery(e.target.value)} />
      {found ? (
        <div data-testid="help-results">
          {found.length === 0 ? <p className="scv-muted">Nothing found.</p> : found.map((t) => <Fold key={t.id} topic={t} flags={flags} />)}
        </div>
      ) : (
        <>
          {here.length > 0 && (
            <div data-testid="help-here">
              <h3 className="scv-help-sec">For this screen</h3>
              {here.map((t) => <Fold key={t.id} topic={t} flags={flags} open={here.length === 1} />)}
            </div>
          )}
          <h3 className="scv-help-sec">The manual</h3>
          {manualFor(flags).map((s) => (
            <details key={s.id} className="scv-help-section">
              <summary>{s.title}</summary>
              {s.topics.map((t) => <Fold key={t.id} topic={t} flags={flags} />)}
            </details>
          ))}
        </>
      )}
    </div>
  );
}
