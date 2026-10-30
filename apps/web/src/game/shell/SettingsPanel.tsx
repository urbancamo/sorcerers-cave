import { activeCurses, type GameState } from '@sorcerers-cave/engine';

/** The game information the old title bar chips carried, in a vertical list, plus the game controls. */
export function SettingsPanel({ state, code, kitActive, onSave, onLog }: {
  state: GameState;
  code?: string;
  kitActive: boolean;
  onSave?: () => void;
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
      <div className="scv-settings-actions">
        {onSave && <button type="button" onClick={onSave}>Save game</button>}
        {onLog && <button type="button" onClick={onLog}>Game log</button>}
      </div>
    </aside>
  );
}
