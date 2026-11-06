import { useEffect, useState } from "react";
import { SCENARIO_SETS, scenarioSummaries, type ScenarioSummary } from "./goldenGame";

/** Test Mode: browse the 75 searched games (top 25 of each rule set) and open one in the replay viewer. */
export function ScenarioBrowserModal({ onClose, onOpen }: {
  onClose: () => void;
  /** Open a scenario code in the replay viewer; resolves null on success or an explanatory message. */
  onOpen?: (code: string) => Promise<string | null>;
}) {
  const [prefix, setPrefix] = useState<string>(SCENARIO_SETS[0].prefix);
  const [rows, setRows] = useState<ScenarioSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    void scenarioSummaries(prefix).then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [prefix]);

  const open = async (code: string) => {
    setErr(null);
    const e = await onOpen?.(code);
    if (e) setErr(e);
  };

  return (
    <div className="scv-hs-overlay" role="dialog" aria-label="scenario games" onClick={onClose}>
      <div className="scv-hs-modal scv-sc-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="scv-hd">Scenario games</h2>
        <p className="scv-muted">The best 25 games found by the overnight search for each rule set. Pick a row to replay it.</p>
        <div className="scv-hs-tabs" role="tablist">
          {SCENARIO_SETS.map((s) => (
            <button
              key={s.prefix}
              role="tab"
              aria-selected={prefix === s.prefix}
              className={"scv-hs-tab" + (prefix === s.prefix ? " scv-hs-tab-on" : "")}
              onClick={() => setPrefix(s.prefix)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {rows === null ? (
          <p className="scv-muted scv-hs-status">Loading scenarios…</p>
        ) : (
          <table className="scv-hs-table" data-testid="scenario-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Starting party</th>
                <th className="scv-hs-num">Score</th>
                <th className="scv-hs-num" title="Members who walked out / party at the end">Party</th>
                <th className="scv-hs-num">Moves</th>
                <th title="Sorcerer slain">Sorc.</th>
                <th title="Sibyl joined">Sibyl</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.code}
                  className="scv-hs-row"
                  tabIndex={0}
                  onClick={() => void open(r.code)}
                  onKeyDown={(e) => { if (e.key === "Enter") void open(r.code); }}
                >
                  <td className="scv-sc-code">{r.code}</td>
                  <td>{r.draft}</td>
                  <td className="scv-hs-num">{r.score}</td>
                  <td className="scv-hs-num">{r.alive}/{r.total}</td>
                  <td className="scv-hs-num">{r.moves}</td>
                  <td>{r.slain ? "✓" : "—"}</td>
                  <td>{r.sibyl ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {err && <p className="scv-resume-err" role="alert">{err}</p>}
        <button className="scv-primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
