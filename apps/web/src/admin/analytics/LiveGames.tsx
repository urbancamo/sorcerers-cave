import { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { ago } from './format';

const WINDOW_MS = 30 * 60_000; // "live" = touched in the last half hour
const STEP_MS = 5 * 60_000; // the cut-off moves in steps, so the reactive query is not rebuilt every tick

/** Games in progress right now: active and touched recently. Updates itself as games are played. */
export function LiveGames() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const games = useQuery(api.analytics.liveGames, { since: Math.floor((now - WINDOW_MS) / STEP_MS) * STEP_MS });
  if (games === undefined) return <p className="scv-admin-note">Loading…</p>;
  if (!games.length) return <p className="scv-admin-note">No games in progress. Active games appear here when they have moved in the last 30 minutes.</p>;
  return (
    <div className="scv-an-scroll">
      <table className="scv-hs-table" data-testid="live-games">
        <thead><tr><th>Code</th><th>Mode</th><th className="scv-hs-num">Party</th><th className="scv-hs-num">Level</th><th className="scv-hs-num">Turn</th><th className="scv-hs-num">Score</th><th>Area</th><th>Doing</th><th>Rules</th><th>Last move</th></tr></thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.id}>
              <td>{g.code ?? '–'}{g.testMode && <span className="scv-an-tag">test</span>}</td>
              <td>{g.mode === 'multi' ? 'Multiplayer' : 'Solo'}{g.lobby === 'open' && ' (lobby)'}</td>
              <td className="scv-hs-num">{g.mode === 'multi' ? `${g.parties ?? 0} parties` : g.partySize ?? '–'}</td>
              <td className="scv-hs-num">{g.level ?? '–'}</td>
              <td className="scv-hs-num">{g.turn ?? '–'}</td>
              <td className="scv-hs-num">{g.score ?? '–'}</td>
              <td>{g.area ?? '–'}</td>
              <td>{g.activity ? <span className={g.activity === 'Combat' ? 'scv-an-out scv-an-out-dead' : undefined}>{g.activity}</span> : '–'}</td>
              <td>{g.extensionKit ? 'Extension kit' : 'Base'}</td>
              <td>{ago(g.updatedAt, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
