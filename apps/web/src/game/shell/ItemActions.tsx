import { BORNEABLE, canArm, canCarry, canUseArtifact, isBorne, legalActions, type GameAction, type GameState } from '@sorcerers-cave/engine';
import { memberLabel } from '../memberLabels';
import { ConfirmButton, ConfirmPicker } from '../ConfirmButton';
import { useOptions, ELIXIR_CONFIRM, SCROLL_CONFIRM } from '../artifactUse';
import { useVerbs, wieldRefusal } from '../wielding';
import { ACTIVE } from '../inventory';

const T_CHEST = 14;
const T_ELIXIR = 15;
const T_SCROLL = 19;

// Why an item its carrier could use is greyed out (the Scroll has its own fight window, so it is left out). The Balm and the Staff say what they need;
// everything else says only that it is not usable now, as the inventory row does.
const NOT_USABLE_REASON: Record<number, string> = { 6: 'Nobody has fallen here this turn.', 9: 'Nobody is turned to stone here.' };

/** The actions an item's own card offers: use (with its picker), wield or stow, open the Chest, pass to another member, drop. Nothing here suggests when to use an item; it only shows what can be done. */
export function ItemActions({ state, dispatch, mi, idx }: { state: GameState; dispatch: (a: GameAction) => void; mi: number; idx: number }) {
  const m = state.party[mi];
  const tid = m?.treasure[idx];
  if (!m || tid === undefined) return null;
  const alive = m.status === 0 || m.status === 1;
  const manage = alive && state.phase !== 'fight' && state.phase !== 'gameOver';
  const uses = useOptions(state, tid);
  const pending = state.fight?.pending;
  const scrollWindow = pending?.by === 'party' && pending.kind === 'scroll' ? pending : null;
  const openChest = tid === T_CHEST ? legalActions(state).find((a) => a.type === 'openChest') : undefined;
  const heirs = state.party.flatMap((o, oi) => (oi !== mi && (o.status === 0 || o.status === 1) && canCarry(o, tid) ? [oi] : []));

  return (
    <div className="scv-ia">
      {tid === T_ELIXIR && uses.length > 0 && (
        <ConfirmPicker rowLabel="Elixir" placeholder="Choose a drinker…" options={uses.map((u) => ({ label: u.label, value: u.action }))}
                       confirmText={() => ELIXIR_CONFIRM} onConfirm={(a) => dispatch(a)} />
      )}
      {/* Revised combat: the attacker's window to read the Scroll is the start of the fight (the dialog just waits). */}
      {tid === T_SCROLL && scrollWindow && (
        <>
          <ConfirmButton label="Read: destroy the unmagical" confirmText={SCROLL_CONFIRM} onConfirm={() => dispatch({ type: 'scroll', use: 'destroy' })} />
          {scrollWindow.surprise && <button type="button" className="scv-enc-btn" onClick={() => dispatch({ type: 'scroll', use: 'surprise' })}>Read: take the surprise bonus (+1)</button>}
        </>
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
      {/* An item the carrier could use but cannot just now: show the control greyed out with the reason, so a card that talks about reviving is not left
          with only a "pass it on" list that looks like the way to use it. */}
      {manage && ACTIVE.has(tid) && tid !== T_SCROLL && uses.length === 0 && canUseArtifact(m.creatureId, tid) && (
        <>
          <button type="button" className="scv-enc-btn ghost" disabled title={NOT_USABLE_REASON[tid] ?? 'Not usable now.'}>Use…</button>
          <p className="scv-enc-note" data-testid="ia-not-usable">{NOT_USABLE_REASON[tid] ?? 'Not usable now.'}</p>
        </>
      )}
      {openChest && <button type="button" className="scv-enc-btn" onClick={() => dispatch(openChest)}>Open the Treasure Chest</button>}
      {/* Say which it is: the card's own words are "held by", so the state needs stating (Peter, ZYBP: "is she wielding it or not?"). */}
      {alive && BORNEABLE.includes(tid) && (
        <p className="scv-ia-state" data-testid="ia-state">{isBorne(m, tid) ? (useVerbs(tid).state === 'worn' ? 'Worn' : 'Wielded') : `Carried, not ${useVerbs(tid).state}`}</p>
      )}
      {/* Wield or wear: an item's effect applies only while it is in use. Nothing is put in use for you. */}
      {alive && canArm(state, mi) && BORNEABLE.includes(tid) && (() => {
        const inUse = isBorne(m, tid), v = useVerbs(tid), refusal = inUse ? null : wieldRefusal(m, tid);
        return (
          <>
            <button type="button" className="scv-enc-btn" disabled={refusal !== null} title={refusal ?? undefined}
                    onClick={() => dispatch({ type: 'setBorne', mi, idx, borne: !inUse })}>
              {inUse ? `${v.off} (carry)` : v.on}
            </button>
            {refusal && <p className="scv-enc-note">{refusal}</p>}
          </>
        );
      })()}
      {manage && heirs.length > 0 && (
        <label className="scv-enc-row">
          <span className="scv-enc-row-nm">Pass to</span>
          <select className="scv-enc-select" aria-label="Pass to" value="" onChange={(e) => { if (e.target.value !== '') dispatch({ type: 'moveTreasure', from: mi, to: Number(e.target.value), idx }); }}>
            <option value="">Choose who carries it…</option>
            {heirs.map((oi) => <option key={oi} value={oi}>{memberLabel(state.party, oi)}</option>)}
          </select>
        </label>
      )}
      {/* Nobody can take it: show the control disabled, so the player can see why giving is not on offer rather than wonder where it went. */}
      {manage && heirs.length === 0 && state.party.length > 1 && (
        <button type="button" className="scv-enc-btn ghost" disabled title="Move item to a party member that can carry it.">Pass to…</button>
      )}
      {/* "Drop here" is right wherever the party stands: a tunnel, a Precise-Locations special, a chamber. */}
      {manage && <button type="button" className="scv-enc-btn ghost" onClick={() => dispatch({ type: 'dropTreasure', mi, idx })}>Drop here</button>}
    </div>
  );
}
