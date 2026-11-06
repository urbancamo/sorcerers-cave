import type { ReactNode } from 'react';
import type { Card } from '../../view/ports';
import type { ViewItem, ViewPartyMember } from '../../view/cave3d';
import { cardText } from '../../data/cardText';
import type { Award } from '../awards';
import { CardHelp } from './CardHelp';
import { HelpButton } from '../../manual/HelpButton';

/** What the right-hand card panel is showing. */
export type Selected =
  | { kind: 'card'; card: Card; where: string }
  | { kind: 'area'; index: number; name: string; file: string | null; rot: number }  // a map tile; its words are built live from the game state
  | { kind: 'recruit'; id: number; name: string; file: string | null; cost: number | null; points: number } // a creature on the party-selection screen
  | { kind: 'member'; member: ViewPartyMember }
  | { kind: 'award'; award: Award; from: ViewPartyMember } // a permanent mark a member has earned
  | { kind: 'item'; item: ViewItem; from: ViewPartyMember; at?: { mi: number; idx: number } }; // `at` marks the row in the inventory

const CATEGORY_LABEL: Record<string, string> = { creature: 'Stranger', treasure: 'Treasure', artifact: 'Artifact', hazard: 'Hazard' };

function Face({ file, name }: { file: string | null; name: string }) {
  return file
    ? <img className="scv-cp-face" src={file} alt={`${name} card`} />
    : <div className="scv-cp-face scv-cp-blank">{name}</div>;
}

/** The universal card inspector: the card, its mini-cards when it carries any, and the manual's wording for it. */
export function CardPanel({ selected, onItem, onMember, onAward, onClose, actions, areaText, floor, onFloor }: {
  selected: Selected;
  areaText?: string; // the words for an `area` selection
  actions?: ReactNode; // a card's own actions: an item's (use, wield, give, drop), or who carries a treasure on the floor
  onItem: (item: ViewItem, from: ViewPartyMember) => void;
  onMember: (member: ViewPartyMember) => void;
  onAward?: (award: Award, from: ViewPartyMember) => void;
  onClose?: () => void; // shown on a recruit card, which has no title-bar icon to dismiss it
  floor?: Card[]; // every card lying in the chamber the party stands in; a strip of them is shown when the selected card is one
  onFloor?: (card: Card) => void;
}) {
  if (selected.kind === 'area') {
    return (
      <aside className="scv-slot scv-slot-right scv-cardpanel" aria-label="Card panel">
        <h2 className="scv-slot-hd">Area</h2>
        {selected.file
          ? <img className="scv-cp-area-img" src={selected.file} alt={`${selected.name} card`} style={{ transform: `rotate(${selected.rot}deg)` }} />
          : <div className="scv-cp-area" aria-hidden="true">{selected.name}</div>}
        <div className="scv-cp-name">{selected.name}</div>
        <p className="scv-cp-text" data-testid="area-text">{areaText}</p>
        <CardHelp category="area" name={selected.name} general />
      </aside>
    );
  }
  if (selected.kind === 'recruit') {
    const text = cardText('creature', selected.name);
    return (
      <aside className="scv-slot scv-slot-right scv-cardpanel scv-cp-inline" aria-label="Card panel">
        <h2 className="scv-slot-hd">Recruit
          {onClose && <button type="button" className="scv-cp-back" onClick={onClose}>Close</button>}
        </h2>
        <Face file={selected.file} name={selected.name} />
        <div className="scv-cp-name">{selected.name}</div>
        <div className="scv-cp-meta">{selected.cost !== null ? `Cost ${selected.cost} · ` : ''}worth {selected.points} pts if it survives</div>
        {text && <p className="scv-cp-text">{text}</p>}
        <CardHelp category="creature" name={selected.name} />
      </aside>
    );
  }
  if (selected.kind === 'award') {
    const { award, from } = selected;
    const slayer = award.kind === 'dragon-slayer';
    return (
      <aside className="scv-slot scv-slot-right scv-cardpanel" aria-label="Card panel">
        <h2 className="scv-slot-hd">Award
          <button type="button" className="scv-cp-back" onClick={() => onMember(from)}>← {from.label}</button>
        </h2>
        {slayer && from.dragonCard
          ? <img className="scv-cp-face scv-cp-slain" src={from.dragonCard} alt="Dragon slain" />
          : <div className="scv-cp-face scv-cp-blank">{slayer ? 'Dragon slain' : `+${award.kind === 'elixir' ? award.bonus : 0}`}</div>}
        <div className="scv-cp-name">{slayer ? 'Dragon-slayer' : 'Elixir'}</div>
        <div className="scv-cp-meta">{slayer ? `${award.count} slain by ${from.label}` : `drunk by ${from.label}`}</div>
        <p className="scv-cp-text">
          {slayer
            ? 'Slain single-handed. Each Dragon adds +1 to this hero\'s fighting strength, and the hero is worth 10 more points at scoring for each dragon, for ever.'
            : award.title}
        </p>
      </aside>
    );
  }
  if (selected.kind === 'member') {
    const m = selected.member;
    const text = m.sibyl ? 'Travels with the party. She cannot fight, carry or be harmed.' : cardText('creature', m.name);
    return (
      <aside className="scv-slot scv-slot-right scv-cardpanel" aria-label="Card panel">
        <h2 className="scv-slot-hd">Party member</h2>
        <Face file={m.card} name={m.label} />
        <div className="scv-cp-name">{m.label}</div>
        {!m.sibyl && <div className="scv-cp-meta">Strength {m.fs}{m.mp > 0 ? ` · magic ${m.mp}` : ''} · load {m.load}/{m.carry} kg</div>}
        {(m.items.length > 0 || m.awards.length > 0) && (
          <div className="scv-cp-minis" aria-label="Carrying">
            {m.items.map((it, i) => (
              <button key={i} type="button" className="scv-cp-mini" title={it.name} onClick={() => onItem(it, m)}>
                {it.file ? <img src={it.file} alt={it.name} /> : <span>{it.name}</span>}
              </button>
            ))}
            {m.awards.map((a, i) => (
              <button key={`award-${i}`} type="button" className={'scv-cp-mini' + (a.kind === 'dragon-slayer' ? ' scv-cp-slain' : '')} title={a.title} onClick={() => onAward?.(a, m)}>
                {a.kind === 'dragon-slayer' && m.dragonCard ? <img src={m.dragonCard} alt="Dragon slain" /> : <span>{a.kind === 'elixir' ? `+${a.bonus}` : '🐉'}</span>}
              </button>
            ))}
          </div>
        )}
        {text && <p className="scv-cp-text">{text}</p>}
        {actions}
        <CardHelp category="creature" name={m.name} />
      </aside>
    );
  }
  if (selected.kind === 'item') {
    const { item, from } = selected;
    const text = cardText(item.artifact ? 'artifact' : 'treasure', item.name);
    return (
      <aside className="scv-slot scv-slot-right scv-cardpanel" aria-label="Card panel">
        <h2 className="scv-slot-hd">{item.artifact ? 'Artifact' : 'Treasure'}{actions && <HelpButton topics={['item-actions', 'wielding']} label="Help with this item" />}
          <button type="button" className="scv-cp-back" onClick={() => onMember(from)}>← {from.label}</button>
        </h2>
        <Face file={item.file} name={item.name} />
        <div className="scv-cp-name">{item.name}</div>
        <div className="scv-cp-meta">{item.weight > 0 ? `${item.weight} kg` : '0 kg'} · carried by {from.label}</div>
        {text && <p className="scv-cp-text">{text}</p>}
        {actions}
        <CardHelp category={item.artifact ? 'artifact' : 'treasure'} name={item.name} />
      </aside>
    );
  }
  const { card, where } = selected;
  const text = cardText(card.category, card.name);
  // The whole group in the chamber, so no card needs hunting for in the cave: one enlarged, the rest a click away (like a member's items).
  const strip = floor && floor.length > 1 && floor.some((c) => c.id === card.id) ? floor : null;
  return (
    <aside className="scv-slot scv-slot-right scv-cardpanel" aria-label="Card panel">
      <h2 className="scv-slot-hd">{CATEGORY_LABEL[card.category] ?? 'Card'}</h2>
      <Face file={card.file} name={card.name} />
      {strip && (
        <div className="scv-cp-minis" aria-label="In this chamber">
          {strip.map((c) => (
            <button key={c.id} type="button" className={'scv-cp-mini' + (c.id === card.id ? ' is-sel' : '')} title={c.name} aria-pressed={c.id === card.id}
                    aria-label={c.name} onClick={() => onFloor?.(c)}>
              {c.file ? <img src={c.file} alt="" /> : <span>{c.name}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="scv-cp-name">{card.name}</div>
      <div className="scv-cp-meta">{where}{card.asleep ? ' · asleep' : ''}{card.stone ? ' · stone' : ''}</div>
      {text && <p className="scv-cp-text">{text}</p>}
      {actions}
      <CardHelp category={card.category} name={card.name} general />
    </aside>
  );
}
