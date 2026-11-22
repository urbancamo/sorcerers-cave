import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CHEST_KG, SHARE_UNIT, type GameAction, type GameState } from '@sorcerers-cave/engine';
import { memberLabel } from './memberLabels';
import { HelpButton } from '../manual/HelpButton';
import { ConfirmButton } from './ConfirmButton';
import { assigned, chestAction, chestRows, initialShares, type ChestSource } from './chestShares';

/**
 * Who bears how much of the Treasure Chest. The chest is four 25 kg quarters; each member who can carry takes some, in 25 kg steps, up to what they can
 * carry apart from it. It is confirmed only when all 100 kg are assigned. One bearer with all 100 kg is simply an ordinary chest.
 */
export function ChestPicker({ state, source, onConfirm, onCancel, onDrop }: { state: GameState; source: ChestSource; onConfirm: (a: GameAction) => void; onCancel: () => void; onDrop?: () => void }) {
  const rows = chestRows(state, source);
  const [amounts, setAmounts] = useState<Record<number, number>>(() => initialShares(state, source, rows));
  const total = assigned(amounts);
  const set = (mi: number, kg: number) => setAmounts((a) => ({ ...a, [mi]: kg }));
  const bearers = Object.entries(amounts).filter(([, kg]) => kg > 0);
  const ready = total === CHEST_KG && bearers.length > 0;
  const quarters = Array.from({ length: CHEST_KG / SHARE_UNIT }, (_, q) => q < total / SHARE_UNIT);
  // In a portal: the card panel that opens it clips or re-anchors a fixed overlay (it sits behind a filter), so it is drawn on the page itself.
  return createPortal(
    <div className="scv-pp-overlay scv-chest-overlay" role="dialog" aria-label="Share the Treasure Chest" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="scv-pp scv-chest-picker">
        <div className="scv-pp-hd">
          <h2>Share the Treasure Chest</h2>
          <HelpButton topics={['shared-chest']} label="Help with sharing the Treasure Chest" />
          <button type="button" className="scv-pp-close" onClick={onCancel} aria-label="close">×</button>
        </div>
        <div className="scv-chest-body">
        <p className="scv-muted">Two or more members can carry the chest between them, in {SHARE_UNIT} kg shares that add up to {CHEST_KG} kg.</p>
        <div className="scv-chest-quarters" aria-hidden="true">{quarters.map((on, q) => <i key={q} className={on ? 'on' : ''} />)}</div>
        <ul className="scv-chest-rows">
          {rows.map((r) => {
            const kg = amounts[r.mi] ?? 0;
            const room = r.max - kg >= SHARE_UNIT && total + SHARE_UNIT <= CHEST_KG;
            return (
              <li key={r.mi} className={'scv-chest-row' + (r.why ? ' off' : '')} title={r.why ?? undefined}>
                <span className="scv-chest-id">
                  <span className="scv-chest-who">{memberLabel(state.party, r.mi)}</span>
                  <span className="scv-chest-cap">carrying {r.base} of {r.cap} kg{r.why ? ` · ${r.why}` : ''}</span>
                </span>
                <button type="button" className="scv-chest-step" aria-label={`Less for ${memberLabel(state.party, r.mi)}`} disabled={kg <= 0} onClick={() => set(r.mi, kg - SHARE_UNIT)}>−</button>
                <output className="scv-chest-kg" aria-label={`${memberLabel(state.party, r.mi)} bears`}>{kg} kg</output>
                <button type="button" className="scv-chest-step" aria-label={`More for ${memberLabel(state.party, r.mi)}`} disabled={!room} onClick={() => set(r.mi, kg + SHARE_UNIT)}>+</button>
              </li>
            );
          })}
        </ul>
        <p className="scv-chest-total" data-testid="chest-total" aria-live="polite">{total} of {CHEST_KG} kg assigned</p>
        </div>
        <div className="scv-pp-bar">
          <button type="button" className="scv-pp-act" disabled={!ready} onClick={() => onConfirm(chestAction(source, amounts))}>
            {bearers.length === 1 ? 'Give it to one carrier' : 'Share the chest'}
          </button>
          {onDrop && <ConfirmButton label="Drop the whole chest" confirmText="Put the whole Treasure Chest down here? It must be picked up again." onConfirm={onDrop} />}
          <button type="button" className="scv-pp-act ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
