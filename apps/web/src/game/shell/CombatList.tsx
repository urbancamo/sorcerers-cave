import type { DragEvent, KeyboardEvent } from 'react';
import { ALL_TREASURES } from '@sorcerers-cave/engine';

export interface CombatWidget {
  i: number;           // the member's index in state.party
  label: string;
  strength: number;    // the strength shown on the card in a match (artifacts included)
  caster: boolean;
  treasure: readonly number[];
  selected: boolean;
  dim: boolean;
  caption?: string;
  onPick?: () => void;
  draggable?: boolean;
}

const gearOf = (treasure: readonly number[]) => treasure.flatMap((t) => (ALL_TREASURES[t]?.kind === 'artifact' ? [ALL_TREASURES[t]!.name] : []));

/** The party's free creatures in a fight, one compact widget each (no card art, to save vertical room). Several can be selected and dragged or dropped as one. */
export function CombatList({ widgets, onDragStart, testId }: { widgets: CombatWidget[]; onDragStart: (i: number, e: DragEvent) => void; testId?: string }) {
  if (widgets.length === 0) return null;
  return (
    <aside className="scv-slot scv-slot-left scv-combat-list" data-testid={testId} aria-label="Your party in the fight">
      <h2 className="scv-slot-hd">Not engaged <span>{widgets.length}</span></h2>
      <ul className="scv-cw-list">
        {widgets.map((w) => {
          const gear = gearOf(w.treasure);
          const act = w.onPick;
          return (
            <li key={w.i}>
              <div className={'scv-cw' + (w.selected ? ' sel' : '') + (w.dim ? ' dim' : '')} data-testid={`rev-free-${w.i}`}
                   role={act ? 'button' : undefined} tabIndex={act ? 0 : undefined} aria-pressed={act ? w.selected : undefined}
                   draggable={w.draggable} onDragStart={(e) => onDragStart(w.i, e)}
                   onClick={act} onKeyDown={act ? (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } } : undefined}>
                <span className="scv-cw-name">{w.label}</span>
                <span className="scv-cw-fs" title="fighting strength">{w.strength}</span>
                {w.caster && <span className="scv-cw-mp" title="magic user">✦</span>}
                {gear.length > 0 && <span className="scv-cw-gear">{gear.join(', ')}</span>}
                {w.caption && <span className="scv-cw-cap">{w.caption}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
