import { useState } from 'react';
import { activeCurses, scoreGame, type GameState } from '@sorcerers-cave/engine';
import { readMouseMode, readZoomSpeed, writeMouseMode, writeZoomSpeed, type MouseMode, type ZoomSpeed } from '../../view/mouseMode';

const T_IDOL = 18; // the Idol is worth a d6 rolled only at the end of the game, so it must not be revealed mid-game

/** The game information the old title bar chips carried, in a vertical list, plus the game log. */
/** The score if the expedition ended now. The Idol's deferred roll is left out (and flagged), so showing the score never peeks the die. */
function scoreSoFar(state: GameState): { score: number; idol: boolean } {
  const idol = state.party.some((m) => m.treasure.includes(T_IDOL));
  const bare = idol ? { ...state, party: state.party.map((m) => ({ ...m, treasure: m.treasure.filter((t) => t !== T_IDOL) })) } : state;
  return { score: scoreGame(bare), idol };
}

export function SettingsPanel({ state, code, kitActive, onLog, verbose, onVerbose, autoRoll, onAutoRoll }: {
  verbose?: boolean;
  onVerbose?: (on: boolean) => void;
  autoRoll?: boolean;
  onAutoRoll?: (on: boolean) => void;
  state: GameState;
  code?: string;
  kitActive: boolean;
  onLog?: () => void;
}) {
  const [mouse, setMouse] = useState<MouseMode>(readMouseMode);
  const [zoom, setZoom] = useState<ZoomSpeed>(readZoomSpeed);
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
    ['Curses', curses > 0 ? String(curses) : 'Uncursed'],
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
      {onAutoRoll && (
        <label className="scv-settings-opt">
          <input type="checkbox" checked={!!autoRoll} onChange={(e) => onAutoRoll(e.target.checked)} />
          Roll special dice automatically
        </label>
      )}
      <label className="scv-settings-opt scv-settings-mouse">
        Mouse buttons
        <select aria-label="Mouse buttons" value={mouse} onChange={(e) => { const m = e.target.value as MouseMode; setMouse(m); writeMouseMode(m); }}>
          <option value="classic">Classic: left drag orbits, right drag pans</option>
          <option value="tabletop">Tabletop: left selects, right drag orbits, middle drag pans</option>
        </select>
      </label>
      <label className="scv-settings-opt scv-settings-mouse">
        Zoom speed
        <select aria-label="Zoom speed" value={zoom} onChange={(e) => { const z = e.target.value as ZoomSpeed; setZoom(z); writeZoomSpeed(z); }}>
          <option value="slow">Slow</option>
          <option value="medium">Medium</option>
          <option value="fast">Fast</option>
        </select>
      </label>
      <div className="scv-settings-actions">
        {onLog && <button type="button" onClick={onLog}>Game log</button>}
      </div>
    </aside>
  );
}
