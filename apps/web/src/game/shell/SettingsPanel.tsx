import { activeCurses, type GameState } from '@sorcerers-cave/engine';

/** The game information the old title bar chips carried, in a vertical list, plus the game log. */
export function SettingsPanel({ state, code, kitActive, onLog, verbose, onVerbose }: {
  verbose?: boolean;
  onVerbose?: (on: boolean) => void;
  state: GameState;
  code?: string;
  kitActive: boolean;
  onLog?: () => void;
}) {
  const curses = activeCurses(state);
  const rows: [string, string][] = [
    ...(code ? [['Game code', code] as [string, string]] : []),
    ['Type', kitActive ? 'Extension kit' : 'Standard'],
    ['Level', String(state.level)],
    ['Turn', String(state.turn)],
    ['Party', String(state.party.length)],
    ['Deck', `${state.largePack.length - state.largeIdx} / ${state.largePack.length}`],
    ...(curses > 0 ? [['Curses', String(curses)] as [string, string]] : []),
  ];
  return (
    <aside className="scv-slot scv-slot-right scv-settings" aria-label="Settings">
      <h2 className="scv-slot-hd">Settings</h2>
      <dl className="scv-kv">
        {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
      </dl>
      {onVerbose && (
        <label className="scv-settings-opt">
          <input type="checkbox" checked={!!verbose} onChange={(e) => onVerbose(e.target.checked)} />
          Verbose descriptions
        </label>
      )}
      <div className="scv-settings-actions">
        {onLog && <button type="button" onClick={onLog}>Game log</button>}
      </div>
    </aside>
  );
}
