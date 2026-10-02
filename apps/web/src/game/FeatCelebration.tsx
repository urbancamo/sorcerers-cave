import { resolveCard, type CardArt } from "../data/manifest";
import type { FeatView } from "./feats";

/** A celebration for a notable feat (see feats.ts): the feat's card animates under a gold headline —
 *  `flip` swings it through 180° to lie inverted (a felled foe kept as a trophy), `rise` lifts it with a
 *  glow (a prize won). The motion is pure CSS (`.scv-feat-flip` / `.scv-feat-rise`, styles.css) and is
 *  skipped under prefers-reduced-motion. */
export function FeatCelebration({ view, cards, onContinue }: { view: FeatView; cards: CardArt[]; onContinue: () => void }) {
  const art = resolveCard(view.card.category, view.card.entityId, cards);
  return (
    <div className="scv-dice-overlay scv-feat-overlay" role="dialog" aria-label="celebration" data-testid="feat-celebration">
      <div className="scv-dice-card scv-feat-panel">
        <div className="scv-feat-title">{view.title}</div>
        <div className="scv-feat-stage">
          <div className="scv-feat-glow" />
          <div className={`scv-feat-card scv-feat-${view.motion}`} data-testid="feat-card">
            {art
              ? <img className="scv-fc-art" src={art.file} alt={view.card.name} />
              : <div className="scv-fc-art scv-fc-blank">{view.card.name}</div>}
          </div>
          {view.tally !== undefined && <span className="scv-feat-tally" data-testid="feat-tally">×{view.tally}</span>}
        </div>
        <p className="scv-feat-headline">{view.headline}</p>
        <p className="scv-feat-detail">{view.detail}</p>
        <button className="scv-primary" onClick={onContinue} autoFocus>Continue</button>
      </div>
    </div>
  );
}
