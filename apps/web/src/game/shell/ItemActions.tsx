import { BORNEABLE, canCarry, isBorne, legalActions, type GameAction, type GameState } from '@sorcerers-cave/engine';
import { memberLabel } from '../memberLabels';
import { ConfirmButton, ConfirmPicker } from '../ConfirmButton';
import { useOptions, ELIXIR_CONFIRM, SCROLL_CONFIRM } from '../artifactUse';

const T_CHEST = 14;
const T_ELIXIR = 15;
const T_SCROLL = 19;

/** The actions an item's own card offers: use (with its picker), wield or stow, open the Chest, give to another member, drop. Nothing here suggests when to use an item; it only shows what can be done. */
export function ItemActions({ state, dispatch, mi, idx }: { state: GameState; dispatch: (a: GameAction) => void; mi: number; idx: number }) {
  const m = state.party[mi];
  const tid = m?.treasure[idx];
  if (!m || tid === undefined) return null;
  const alive = m.status === 0 || m.status === 1;
  const manage = alive && state.phase !== 'fight' && state.phase !== 'gameOver';
  const uses = useOptions(state, tid);
  const openChest = tid === T_CHEST ? legalActions(state).find((a) => a.type === 'openChest') : undefined;
  const heirs = state.party.flatMap((o, oi) => (oi !== mi && (o.status === 0 || o.status === 1) && canCarry(o, tid) ? [oi] : []));

  return (
    <div className="scv-ia">
      {tid === T_ELIXIR && uses.length > 0 && (
        <ConfirmPicker rowLabel="Elixir" placeholder="Choose a drinker…" options={uses.map((u) => ({ label: u.label, value: u.action }))}
                       confirmText={() => ELIXIR_CONFIRM} onConfirm={(a) => dispatch(a)} />
      )}
      {tid === T_SCROLL && uses[0] && (
        <ConfirmButton label="Read the Scroll" confirmText={SCROLL_CONFIRM} onConfirm={() => dispatch(uses[0]!.action)} />
      )}
      {tid !== T_ELIXIR && tid !== T_SCROLL && uses.length === 1 && (
        <button type="button" className="scv-enc-btn" onClick={() => dispatch(uses[0]!.action)}>Use — {uses[0]!.label}</button>
      )}
      {tid !== T_ELIXIR && tid !== T_SCROLL && uses.length > 1 && (
        <label className="scv-enc-row">
          <span className="scv-enc-row-nm">Use</span>
          <select className="scv-enc-select" aria-label="Use" value="" onChange={(e) => { if (e.target.value !== '') dispatch(uses[Number(e.target.value)]!.action); }}>
            <option value="">Choose…</option>
            {uses.map((u, k) => <option key={k} value={k}>{u.label}</option>)}
          </select>
        </label>
      )}
      {openChest && <button type="button" className="scv-enc-btn" onClick={() => dispatch(openChest)}>Open the Treasure Chest</button>}
      {/* Bearing: a borne item is wielded or worn and goes with its holder; a carried one spills when the holder falls. */}
      {manage && BORNEABLE.includes(tid) && (
        <button type="button" className="scv-enc-btn" onClick={() => dispatch({ type: 'setBorne', mi, idx, borne: !isBorne(m, tid) })}>
          {isBorne(m, tid) ? 'Stow (carry)' : 'Wield'}
        </button>
      )}
      {manage && heirs.length > 0 && (
        <label className="scv-enc-row">
          <span className="scv-enc-row-nm">Give to</span>
          <select className="scv-enc-select" aria-label="Give to" value="" onChange={(e) => { if (e.target.value !== '') dispatch({ type: 'moveTreasure', from: mi, to: Number(e.target.value), idx }); }}>
            <option value="">Choose a member…</option>
            {heirs.map((oi) => <option key={oi} value={oi}>{memberLabel(state.party, oi)}</option>)}
          </select>
        </label>
      )}
      {/* "Drop here" is right wherever the party stands: a tunnel, a Precise-Locations special, a chamber. */}
      {manage && <button type="button" className="scv-enc-btn ghost" onClick={() => dispatch({ type: 'dropTreasure', mi, idx })}>Drop here</button>}
    </div>
  );
}
