import { useMemo, useState } from 'react';
import { usePaginatedQuery } from 'convex/react';
import { ALL_CREATURES } from '@sorcerers-cave/engine';
import { api } from '../../../convex/_generated/api';
import { ago, OUTCOME_LABEL } from './format';

type Outcome = keyof typeof OUTCOME_LABEL;

const partyText = (picks: number[] | undefined, size: number) =>
  picks?.length ? picks.map((id) => ALL_CREATURES[id]?.name ?? `#${id}`).join(', ') : `${size} at the end`;

type Row = NonNullable<ReturnType<typeof usePaginatedQuery<typeof api.analytics.history>>['results']>[number];
type SortKey = 'finishedAt' | 'code' | 'mode' | 'party' | 'outcome' | 'score' | 'deepestLevel' | 'turn' | 'rules';

const modeText = (r: Row) => (r.mode === 'multi' ? `Multi, seat ${r.seat + 1}` : 'Solo');
const rulesText = (r: Row) => (r.sibyl ? 'Kit + Sibyl' : r.extensionKit ? 'Extension kit' : 'Base');

// What each column sorts on: numbers numerically, everything else by the text shown.
const SORT_VALUE: Record<SortKey, (r: Row) => number | string> = {
  finishedAt: (r) => r.finishedAt,
  code: (r) => r.code ?? '',
  mode: modeText,
  party: (r) => partyText(r.picks, r.partySize),
  outcome: (r) => OUTCOME_LABEL[r.outcome],
  score: (r) => r.score,
  deepestLevel: (r) => r.deepestLevel,
  turn: (r) => r.turn,
  rules: rulesText,
};

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'finishedAt', label: 'Finished' }, { key: 'code', label: 'Code' }, { key: 'mode', label: 'Mode' }, { key: 'party', label: 'Party' },
  { key: 'outcome', label: 'Outcome' }, { key: 'score', label: 'Score', num: true }, { key: 'deepestLevel', label: 'Level', num: true },
  { key: 'turn', label: 'Turns', num: true }, { key: 'rules', label: 'Rules' },
];

/** Every finished game, newest first, with an outcome filter and a way into the replay viewer. */
export function History({ onReplay }: { onReplay: (code: string) => Promise<string | null> }) {
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [err, setErr] = useState<string | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(api.analytics.history, outcome ? { outcome } : {}, { initialNumItems: 25 });
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'finishedAt', dir: 'desc' });
  const now = Date.now();
  // Loaded games arrive newest first; the sort is applied to those, so "Load more" can bring in rows that belong higher up.
  const sorted = useMemo(() => {
    const val = SORT_VALUE[sort.key];
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...results].sort((a, b) => {
      const x = val(a), y = val(b);
      return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }));
    });
  }, [results, sort]);
  // Numbers and dates are most useful biggest-first; text A to Z.
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'finishedAt' || typeof SORT_VALUE[key](results[0] as Row) === 'number' ? 'desc' : 'asc' }));
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
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key}
                      className={c.num ? 'scv-hs-num' : undefined}
                      aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button"
                            className="scv-an-sort"
                            onClick={() => sortBy(c.key)}>
                      {c.label}
                      <span aria-hidden="true">{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r._id}>
                  <td>{ago(r.finishedAt, now)}</td>
                  <td>{r.code ?? '–'}</td>
                  <td>{modeText(r)}</td>
                  <td className="scv-an-party">{partyText(r.picks, r.partySize)}</td>
                  <td><span className={`scv-an-out scv-an-out-${r.outcome}`}>{OUTCOME_LABEL[r.outcome]}</span></td>
                  <td className="scv-hs-num">{r.score}</td>
                  <td className="scv-hs-num">{r.deepestLevel}</td>
                  <td className="scv-hs-num">{r.turn}</td>
                  <td>{rulesText(r)}</td>
                  <td>{r.code && r.mode === 'solo' && <button className="scv-ghost" onClick={() => void onReplay(r.code!).then(setErr)}>Replay</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {status === 'CanLoadMore' && <p className="scv-admin-note">Sorting applies to the {results.length} games loaded so far.</p>}
      {status === 'CanLoadMore' && <button className="scv-ghost" onClick={() => loadMore(25)}>Load more</button>}
    </div>
  );
}
