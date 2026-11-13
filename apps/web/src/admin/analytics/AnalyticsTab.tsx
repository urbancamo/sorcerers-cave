import { useState } from 'react';
import { useQuery } from 'convex/react';
import { ALL_CREATURES } from '@sorcerers-cave/engine';
import { api } from '../../../convex/_generated/api';
import { ReplayView } from '../../game/ReplayView';
import { useReplayBundle } from '../useReplayBundle';
import { Bars, Columns, type Item } from './charts';
import { History } from './History';
import { LiveGames } from './LiveGames';
import { num, OUTCOME_LABEL, pct } from './format';

// One colour per outcome, validated for colour-blind separation on the dark surface (blue / red-orange / violet: not red against green).
const OUT = { escaped: 'var(--out-escaped)', dead: 'var(--out-dead)', quit: 'var(--out-quit)' } as const;
const OUTCOMES = ['escaped', 'dead', 'quit'] as const;
const outcomeSegs = (o: Record<(typeof OUTCOMES)[number], number>) => OUTCOMES.map((k) => ({ key: k, label: OUTCOME_LABEL[k], color: OUT[k], value: o[k] }));
const one = (label: string, value: number, note?: string): Item => ({ label, note, segs: [{ key: 'n', label: 'Games', color: 'var(--brass)', value }] });

type Sub = 'overview' | 'live' | 'history';
const SUBS: { id: Sub; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'live', label: 'Live games' }, { id: 'history', label: 'History' }];

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="scv-an-tile"><span className="scv-an-tile-label">{label}</span><strong>{value}</strong>{sub && <span className="scv-an-tile-sub">{sub}</span>}</div>;
}

function Overview() {
  const s = useQuery(api.analytics.summary);
  if (s === undefined) return <p className="scv-admin-note">Loading…</p>;
  const { totals: t, window: w } = s;
  if (!t.games) return <p className="scv-admin-note">No finished games recorded yet. Games are recorded as they finish; earlier ones are added by the backfill commands.</p>;
  const outcomeRows: Item[] = [
    { label: 'Solo', segs: outcomeSegs(w.outcomes.solo) },
    { label: 'Multiplayer', segs: outcomeSegs(w.outcomes.multi) },
  ];
  return (
    <>
      <div className="scv-an-tiles">
        <Tile label="Games played" value={num(t.games)} sub={`${num(t.solo)} solo, ${num(t.multi)} multiplayer parties`} />
        <Tile label="Escape rate" value={pct(t.escaped, t.games)} sub={`${num(t.escaped)} escaped`} />
        <Tile label="Death rate" value={pct(t.dead, t.games)} sub={`${num(t.dead)} died`} />
        <Tile label="Quit rate" value={pct(t.quit, t.games)} sub={`${num(t.quit)} quit`} />
        <Tile label="Mean escaped score" value={num(t.meanEscapedScore)} sub={`best ${num(w.escapedScore.max)} in the newest ${num(w.n)}`} />
        <Tile label="Median escaped score" value={num(w.escapedScore.median)} sub={`mean ${num(w.escapedScore.meanTurns)} turns to escape`} />
      </div>
      <p className="scv-admin-note">Totals cover every recorded game. The charts cover the newest {num(s.windowSize)}. Test games are never recorded. Duration and cause of death are not kept.</p>
      <div className="scv-an-grid2">
        <Bars title="How games end" sub="Solo and multiplayer, by outcome" items={outcomeRows} labelWidth={96} />
        <Columns title="Games per day" sub="The last 30 days, by outcome" tickEvery={5} items={w.perDay.map((d) => ({ label: d.day.slice(5), segs: outcomeSegs(d) }))} />
        <Columns title="Escaped scores" sub="Games per 50 points" tickEvery={2}
                 items={w.scoreHistogram.map((b) => ({ ...one(String(b.from), b.count), note: `${b.from} to ${b.to - 1} points` }))} />
        <Bars title="Deepest level reached" sub="Games, by the deepest level any party entered" items={w.deepest.map((d) => one(`Level ${d.level}`, d.count))} />
        <Columns title="Dragons slain" sub="Games, by dragons killed" items={w.dragonKills.map((d) => one(String(d.kills), d.count))} />
        <Columns title="Members lost" sub="Games, by party members dead or turned to stone" items={w.membersLost.map((d) => one(String(d.lost), d.count))} />
        <Bars title="Starting parties" sub="How often each creature was picked (solo games)" labelWidth={110}
              items={w.creatures.slice(0, 10).map((c) => one(ALL_CREATURES[c.id]?.name ?? `#${c.id}`, c.count))} />
        <Bars title="Rules in play" sub="Games, by rule set" labelWidth={110}
              items={[one('Base', w.variants.base), one('Extension kit', w.variants.extensionKit), one('Kit + Sibyl', w.variants.sibyl)]} />
      </div>
    </>
  );
}

/** The Game Analytics tab: an overview of every game played, the games in progress, and the full history. */
export function AnalyticsTab() {
  const [sub, setSub] = useState<Sub>('overview');
  const { bundle, open, close } = useReplayBundle();
  if (bundle) return <ReplayView bundle={bundle} onExit={close} />;
  return (
    <div className="scv-an">
      <nav className="scv-hs-tabs scv-admin-tabs" role="tablist" aria-label="Analytics views">
        {SUBS.map((x) => (
          <button key={x.id} role="tab" aria-selected={sub === x.id} className={`scv-hs-tab${sub === x.id ? ' scv-hs-tab-on' : ''}`} onClick={() => setSub(x.id)}>{x.label}</button>
        ))}
      </nav>
      {sub === 'overview' && <Overview />}
      {sub === 'live' && <LiveGames />}
      {sub === 'history' && <History onReplay={open} />}
    </div>
  );
}
