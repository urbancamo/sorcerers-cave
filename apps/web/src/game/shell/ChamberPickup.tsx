import { ALL_CREATURES, ALL_TREASURES, carriedWeight, legalActions, type GameAction, type GameState } from '@sorcerers-cave/engine';
import { memberLabel } from '../memberLabels';
import { resolveCard, type CardArt } from '../../data/manifest';
import { cardText } from '../../data/cardText';
import { HelpButton } from '../../manual/HelpButton';

/** The party leader's pickup: each treasure on the chamber floor as a card, with a button for every member who can carry it. Leaving it is the encounter panel's own "Leave the treasure". */
export function ChamberPickup({ state, dispatch, cards }: { state: GameState; dispatch: (a: GameAction) => void; cards: CardArt[] }) {
  const takers = new Map<number, number[]>(); // treasure index -> members who can take it
  for (const a of legalActions(state)) {
    if (a.type === 'takeTreasure') (takers.get(a.ti) ?? takers.set(a.ti, []).get(a.ti)!).push(a.mi);
  }
  if (takers.size === 0) return null;
  // Artifacts first, then treasure by points, highest first; equal items keep their floor order (sort is stable).
  const ordered = [...takers].sort(([a], [b]) => {
    const ta = ALL_TREASURES[state.treasures[a]!], tb = ALL_TREASURES[state.treasures[b]!];
    const art = Number(tb?.kind === 'artifact') - Number(ta?.kind === 'artifact');
    return art || (tb?.points ?? 0) - (ta?.points ?? 0);
  });
  const who = (mi: number) => {
    const m = state.party[mi]!, c = ALL_CREATURES[m.creatureId]!;
    const base = memberLabel(state.party, mi);
    return c.carry > 0 ? `${base} (${carriedWeight(m)}/${c.carry}kg)` : base;
  };
  return (
    <aside className="scv-slot scv-slot-right scv-pickup" aria-label="Chamber treasure">
      <h2 className="scv-slot-hd">In the chamber <HelpButton topics={['pickup-capacity']} label="Help with picking up treasure" /></h2>
      {ordered.map(([ti, mis]) => {
        const tid = state.treasures[ti]!;
        const name = ALL_TREASURES[tid]?.name ?? 'treasure';
        const face = resolveCard('treasure', tid, cards)?.file ?? null;
        // The Lost Ruby sits in a strength-8 statue that must be beaten; once freed (SC-11-47) it is ordinary treasure.
        const guarded = tid === 11 && !state.rubyFreed;
        const text = tid === 11 && !guarded ? null : cardText(ALL_TREASURES[tid]?.kind === 'artifact' ? 'artifact' : 'treasure', name); // the Ruby's card text is about the statue
        return (
          <section key={ti} className="scv-pickup-item" aria-label={name}>
            {face && <img className="scv-cp-face" src={face} alt={`${name} card`} />}
            <div className="scv-cp-name">{name}{guarded && <span className="scv-enc-guard"> · guarded by a statue</span>}</div>
            {text && <p className="scv-cp-text">{text}</p>}
            <div className="scv-pickup-who">
              {mis.map((mi) => (
                <button key={mi} type="button" className="scv-enc-btn" onClick={() => dispatch({ type: 'takeTreasure', ti, mi })}>
                  {guarded ? `${who(mi)} wrests it from the statue` : `Give to ${who(mi)}`}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
