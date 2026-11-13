import { useState } from 'react';
import { usePaginatedQuery } from 'convex/react';
import { ALL_CREATURES } from '@sorcerers-cave/engine';
import { api } from '../../../convex/_generated/api';
import { ago, OUTCOME_LABEL } from './format';

type Outcome = keyof typeof OUTCOME_LABEL;

const partyText = (picks: number[] | undefined, size: number) =>
  picks?.length ? picks.map((id) => ALL_CREATURES[id]?.name ?? `#${id}`).join(', ') : `${size} at the end`;

/** Every finished game, newest first, with an outcome filter and a way into the replay viewer. */
export function History({ onReplay }: { onReplay: (code: string) => Promise<string | null> }) {
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [err, setErr] = useState<string | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(api.analytics.history, outcome ? { outcome } : {}, { initialNumItems: 25 });
  const now = Date.now();
  return (
    <div className="scv-an-history">
      <div className="scv-bug-field scv-an-filter">
        <div className="scv-bug-head"><label htmlFor="scv-an-outcome">Outcome</label></div>
        <select id="scv-an-outcome" className="scv-bug-select scv-enc-select" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome | '')}>
          <option value="">All</option>
          {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
        </select>
      </div>
      {err && <p className="scv-resume-err" role="alert">{err}</p>}
      {status === 'LoadingFirstPage' ? <p className="scv-admin-note">Loading…</p> : !results.length ? <p className="scv-admin-note">No finished games recorded{outcome ? ' with that outcome' : ' yet'}.</p> : (
        <div className="scv-an-scroll">
          <table className="scv-hs-table" data-testid="history">
            <thead><tr><th>Finished</th><th>Code</th><th>Mode</th><th>Party</th><th>Outcome</th><th className="scv-hs-num">Score</th><th className="scv-hs-num">Level</th><th className="scv-hs-num">Turns</th><th>Rules</th><th /></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r._id}>
                  <td>{ago(r.finishedAt, now)}</td>
                  <td>{r.code ?? '–'}</td>
                  <td>{r.mode === 'multi' ? `Multi, seat ${r.seat + 1}` : 'Solo'}</td>
                  <td className="scv-an-party">{partyText(r.picks, r.partySize)}</td>
                  <td><span className={`scv-an-out scv-an-out-${r.outcome}`}>{OUTCOME_LABEL[r.outcome]}</span></td>
                  <td className="scv-hs-num">{r.score}</td>
                  <td className="scv-hs-num">{r.deepestLevel}</td>
                  <td className="scv-hs-num">{r.turn}</td>
                  <td>{r.sibyl ? 'Kit + Sibyl' : r.extensionKit ? 'Extension kit' : 'Base'}</td>
                  <td>{r.code && r.mode === 'solo' && <button className="scv-ghost" onClick={() => void onReplay(r.code!).then(setErr)}>Replay</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {status === 'CanLoadMore' && <button className="scv-ghost" onClick={() => loadMore(25)}>Load more</button>}
    </div>
  );
}
