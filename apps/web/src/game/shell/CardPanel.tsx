import type { ReactNode } from 'react';
import type { Card } from '../../view/ports';
import type { ViewItem, ViewPartyMember } from '../../view/cave3d';
import { cardText } from '../../data/cardText';

/** What the right-hand card panel is showing. */
export type Selected =
  | { kind: 'card'; card: Card; where: string }
  | { kind: 'area'; index: number; name: string }  // a map tile; its words are built live from the game state
  | { kind: 'member'; member: ViewPartyMember }
  | { kind: 'item'; item: ViewItem; from: ViewPartyMember; at?: { mi: number; idx: number } }; // `at` marks the row in the inventory

const CATEGORY_LABEL: Record<string, string> = { creature: 'Stranger', treasure: 'Treasure', artifact: 'Artifact', hazard: 'Hazard' };

function Face({ file, name }: { file: string | null; name: string }) {
  return file
    ? <img className="scv-cp-face" src={file} alt={`${name} card`} />
    : <div className="scv-cp-face scv-cp-blank">{name}</div>;
}

/** The universal card inspector: the card, its mini-cards when it carries any, and the manual's wording for it. */
export function CardPanel({ selected, onItem, onMember, actions, areaText }: {
  selected: Selected;
  areaText?: string; // the words for an `area` selection
  actions?: ReactNode; // an item card's own actions (use, wield, give, drop)
  onItem: (item: ViewItem, from: ViewPartyMember) => void;
  onMember: (member: ViewPartyMember) => void;
}) {
  if (selected.kind === 'area') {
    return (
      <aside className="scv-slot scv-slot-right scv-cardpanel" aria-label="Card panel">
        <h2 className="scv-slot-hd">Area</h2>
        <div className="scv-cp-area" aria-hidden="true">{selected.name}</div>
        <div className="scv-cp-name">{selected.name}</div>
        <p className="scv-cp-text" data-testid="area-text">{areaText}</p>
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
        {m.items.length > 0 && (
          <div className="scv-cp-minis" aria-label="Carrying">
            {m.items.map((it, i) => (
              <button key={i} type="button" className="scv-cp-mini" title={it.name} onClick={() => onItem(it, m)}>
                {it.file ? <img src={it.file} alt={it.name} /> : <span>{it.name}</span>}
              </button>
            ))}
          </div>
        )}
        {text && <p className="scv-cp-text">{text}</p>}
      </aside>
    );
  }
  if (selected.kind === 'item') {
    const { item, from } = selected;
    const text = cardText(item.artifact ? 'artifact' : 'treasure', item.name);
    return (
      <aside className="scv-slot scv-slot-right scv-cardpanel" aria-label="Card panel">
        <h2 className="scv-slot-hd">{item.artifact ? 'Artifact' : 'Treasure'}
          <button type="button" className="scv-cp-back" onClick={() => onMember(from)}>← {from.label}</button>
        </h2>
        <Face file={item.file} name={item.name} />
        <div className="scv-cp-name">{item.name}</div>
        <div className="scv-cp-meta">{item.weight > 0 ? `${item.weight} kg` : '0 kg'} · carried by {from.label}</div>
        {text && <p className="scv-cp-text">{text}</p>}
        {actions}
      </aside>
    );
  }
  const { card, where } = selected;
  const text = cardText(card.category, card.name);
  return (
    <aside className="scv-slot scv-slot-right scv-cardpanel" aria-label="Card panel">
      <h2 className="scv-slot-hd">{CATEGORY_LABEL[card.category] ?? 'Card'}</h2>
      <Face file={card.file} name={card.name} />
      <div className="scv-cp-name">{card.name}</div>
      <div className="scv-cp-meta">{where}{card.asleep ? ' · asleep' : ''}{card.stone ? ' · stone' : ''}</div>
      {text && <p className="scv-cp-text">{text}</p>}
    </aside>
  );
}
