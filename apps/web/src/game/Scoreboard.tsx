import { PARTY_COLOR_HEX, type PartyColor } from "./partyColors";

export interface ScoreboardParty {
  seat: number; name: string; color: string; status: string;
  members: number[]; score: number; depth: number; turns: number; kills: number;
}

const OUTCOME: Record<string, { label: string; cls: string }> = {
  left: { label: "Escaped", cls: "esc" },
  wiped: { label: "Perished", cls: "die" },
  quit: { label: "Abandoned", cls: "die" },
  exploring: { label: "In maze", cls: "live" },
  selecting: { label: "Choosing", cls: "live" },
};

/** Pure leaderboard for a multiplayer game. Parents supply the data and the footer callbacks. */
export function Scoreboard({
  parties, youSeat, frozen,
  onSpectate, onViewMyRun, onQuit, onResume, onBackToMenu, onRowClick,
}: {
  parties: ScoreboardParty[];
  youSeat: number;
  frozen?: boolean;
  onSpectate?: () => void;
  onViewMyRun?: () => void;
  onQuit?: () => void;
  onResume?: () => void;
  onBackToMenu?: () => void;
  onRowClick?: (seat: number) => void;
}) {
  const ranked = [...parties].sort((a, b) => b.score - a.score);
  return (
    <div className="scv-sb">
      <h3 className="scv-sb-hd">{frozen ? "Final standings" : "Standings"}</h3>
      <table className="scv-sb-table">
        <thead>
          <tr>
            <th>#</th><th>Party</th><th>Status</th>
            <th className="num">Depth</th><th className="num">Turns</th><th className="num">Slain</th><th className="num">Score</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((p, i) => {
            const o = OUTCOME[p.status] ?? { label: p.status, cls: "live" };
            const live = p.status === "exploring";
            return (
              <tr
                key={p.seat}
                data-testid="sb-row"
                className={"scv-sb-row" + (p.seat === youSeat ? " me" : "")}
                onClick={() => onRowClick?.(p.seat)}
              >
                <td>{i + 1}</td>
                <td>
                  <span className="scv-sb-chip" style={{ background: PARTY_COLOR_HEX[p.color as PartyColor] }} />
                  {p.name}{p.seat === youSeat && <em className="scv-sb-you"> (you)</em>}
                </td>
                <td><span className={"scv-sb-badge " + o.cls}>{o.label}</span></td>
                <td className="num">{live ? `L${p.depth}` : "—"}</td>
                <td className="num">{p.turns}</td>
                <td className="num">{p.kills}</td>
                <td className="num scv-sb-score">{p.score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="scv-sb-foot">
        {onSpectate && <button className="scv-primary" onClick={onSpectate}>▣ Dip into the cave</button>}
        {onViewMyRun && <button className="scv-primary ghost" onClick={onViewMyRun}>My run ▸</button>}
        {onResume && <button className="scv-primary" onClick={onResume}>Resume</button>}
        {onQuit && <button className="scv-primary ghost" onClick={onQuit}>Quit to menu</button>}
        {onBackToMenu && <button className="scv-primary" onClick={onBackToMenu}>Back to menu</button>}
      </div>
    </div>
  );
}
