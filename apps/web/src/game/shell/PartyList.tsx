import type { DragEvent, KeyboardEvent } from 'react';
import type { ViewPartyMember } from '../../view/cave3d';
import { carryRowHtml } from '../../view/rosterCarry';

/** What a fight adds to a member's row: whether it is selected or already placed, its strength in a match, and how a tap or drag moves it. */
export interface PartyRowFight {
  strength: number;    // the strength shown on the card in a match (artifacts included)
  caster: boolean;
  selected: boolean;
  dim: boolean;
  caption?: string;
  onPick?: () => void;
  draggable?: boolean;
}

/** The party panel. The same list serves browsing the party and choosing creatures in a fight, where `fight` rows (keyed by
 *  index in the engine's party) turn on selecting, dragging and a status caption. */
export function PartyList({ members, onSelect, fight, onDragStart, expanded, onToggleExpand, testId }: {
  members: ViewPartyMember[];
  onSelect?: (m: ViewPartyMember) => void;
  fight?: ReadonlyMap<number, PartyRowFight>;
  onDragStart?: (i: number, e: DragEvent) => void;
  expanded?: boolean;            // the same panel, widened to show each member's strength, magic and charisma
  onToggleExpand?: () => void;   // not offered in a fight, where this list is the working tray
  testId?: string;
}) {
  // Printed numbers only (artefact and surprise bonuses show in the fight itself). A stone member and the Sibyl add nothing to a fight.
  const fighters = members.filter((m) => !m.petrified && !m.sibyl);
  const totalFs = fighters.reduce((n, m) => n + m.fs, 0);
  const totalMp = fighters.reduce((n, m) => n + m.mp, 0);
  return (
    <aside className={'scv-slot scv-slot-left scv-partylist' + (expanded ? ' expanded' : '')} data-testid={testId} aria-label="Party">
      <h2 className="scv-slot-hd">
        Party
        {onToggleExpand && (
          <button type="button" className="scv-pl-expand" aria-label={expanded ? 'Collapse the party view' : 'Expand the party view'}
                  title={expanded ? 'Back to the short list' : "Expand — every member's strength, magic and load"} onClick={onToggleExpand}>{expanded ? '⤡' : '⤢'}</button>
        )}
      </h2>
      {expanded && (
        <p className="scv-pl-total" data-testid="pl-total">
          {fighters.length} able to fight · strength <b>{totalFs}</b>{totalMp > 0 && <> · magic <b>{totalMp}</b></>}
        </p>
      )}
      <div className="roster-body">
        {members.map((m, k) => {
          const f = m.partyIndex === undefined ? undefined : fight?.get(m.partyIndex);
          // A tap always shows the member on the card panel; in a fight it also picks them for the move being made.
          const act = f?.onPick || onSelect ? () => { f?.onPick?.(); onSelect?.(m); } : undefined;
          const carry = m.carry || 0;
          const pct = carry > 0 ? Math.min(100, Math.round((m.load / carry) * 100)) : 0;
          const badge = m.petrified ? ['stone', 'stone'] : m.sibyl ? ['ally', 'guide'] : m.ally ? ['ally', 'ally'] : null;
          return (
            <div key={`${m.label}-${k}`} data-testid={f ? `rev-free-${m.partyIndex}` : undefined}
                 className={'mbr' + (m.lead ? ' lead' : '') + (m.petrified ? ' petrified' : '') + (act ? ' pick' : '') + (f?.selected ? ' sel' : '') + (f?.dim ? ' dim' : '')}
                 role={act ? 'button' : undefined} tabIndex={act ? 0 : undefined} aria-pressed={f?.onPick ? f.selected : undefined}
                 draggable={f?.draggable} onDragStart={f && onDragStart ? (e) => onDragStart(m.partyIndex!, e) : undefined}
                 onClick={act} onKeyDown={act ? (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } } : undefined}>
              {expanded && m.card ? <img className="scv-pl-card" src={m.card} alt="" /> : <div className="sig">{m.sig}</div>}
              <div className="who">
                <div className="nm-line">
                  <span className="nm">{m.label}</span>
                  {badge && <span className={`badge ${badge[0]}`}>{badge[1]}</span>}
                  {f && <span className="scv-pl-fs" title="fighting strength">{f.strength}{f.caster ? ' ✦' : ''}</span>}
                </div>
                {expanded && !m.sibyl && (
                  <div className="scv-pl-stats">Strength {m.fs}{m.mp > 0 && ` · Magic ${m.mp}`}{m.charisma && ' · Charisma'}</div>
                )}
                {f?.caption && <div className="scv-pl-cap">{f.caption}</div>}
                {/* In a fight what a member carries is not what is being chosen, so the load and the thumbnails are left out. */}
                {!fight && (m.sibyl ? <div className="cap"><span className="cap-tx none">cannot fight or be harmed</span></div>
                  : carry > 0
                    ? <div className="cap"><div className="cap-bar"><i style={{ width: `${pct}%` }} /></div><span className="cap-tx">{m.load}/{carry} kg · {Math.max(0, carry - m.load)} free</span></div>
                    : <div className="cap"><span className="cap-tx none">no carry capacity</span></div>)}
                {!fight && <div dangerouslySetInnerHTML={{ __html: carryRowHtml(m) }} />}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
