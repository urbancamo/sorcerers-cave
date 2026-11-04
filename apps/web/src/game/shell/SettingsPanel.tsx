import { activeCurses, scoreGame, type GameState } from '@sorcerers-cave/engine';

const T_IDOL = 18; // the Idol is worth a d6 rolled only at the end of the game, so it must not be revealed mid-game

/** The game information the old title bar chips carried, in a vertical list, plus the game log. */
/** The score if the expedition ended now. The Idol's deferred roll is left out (and flagged), so showing the score never peeks the die. */
function scoreSoFar(state: GameState): { score: number; idol: boolean } {
  const idol = state.party.some((m) => m.treasure.includes(T_IDOL));
  const bare = idol ? { ...state, party: state.party.map((m) => ({ ...m, treasure: m.treasure.filter((t) => t !== T_IDOL) })) } : state;
  return { score: scoreGame(bare), idol };
}

export function SettingsPanel({ state, code, kitActive, onLog, verbose, onVerbose }: {
  verbose?: boolean;
  onVerbose?: (on: boolean) => void;
  state: GameState;
  code?: string;
  kitActive: boolean;
  onLog?: () => void;
}) {
  const curses = activeCurses(state);
  const { score, idol } = scoreSoFar(state);
  const rows: [string, string][] = [
    ...(code ? [['Game code', code] as [string, string]] : []),
    ['Type', kitActive ? 'Extension kit' : 'Standard'],
    ['Level', String(state.level)],
    ['Turn', String(state.turn)],
    ['Party', String(state.party.length)],
    ['Score so far', idol ? `${score} + Idol` : String(score)],
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
