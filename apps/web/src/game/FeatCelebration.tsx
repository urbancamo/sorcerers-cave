import type { CSSProperties } from "react";
import { resolveCard, type CardArt } from "../data/manifest";
import { FeatParticles } from "./FeatParticles";
import type { FeatView } from "./feats";

/** A celebration for a notable feat (see feats.ts): the feat's card animates under a gold headline —
 *  `flip` swings it through 180° to lie inverted (a felled foe kept as a trophy), `rise` lifts it with a
 *  glow (a prize won), and `fall` is the grand finale (the Sorcerer): the cave dims, the card shudders and
 *  drains to ash then crashes inverted in a flash, a sunburst turns behind it, the title lights letter by
 *  letter, and a canvas of arcane sparks, embers and fireworks plays around the panel. The motion is CSS
 *  (`.scv-feat-flip` / `-rise` / `-fall`, styles.css) plus the particle canvas; both are skipped under
 *  prefers-reduced-motion. Continue works at any moment. */
export function FeatCelebration({ view, cards, onContinue }: { view: FeatView; cards: CardArt[]; onContinue: () => void }) {
  const art = resolveCard(view.card.category, view.card.entityId, cards);
  const grand = view.motion === "fall";
  return (
    <div className={"scv-dice-overlay scv-feat-overlay" + (grand ? " scv-feat-overlay-grand" : "")} role="dialog" aria-label="celebration" data-testid="feat-celebration">
      <div className={"scv-dice-card scv-feat-panel" + (grand ? " scv-feat-grand" : "")}>
        {grand && <div className="scv-feat-flash" />}
        {grand ? (
          // Per-letter spans carry the staggered light-up; the label keeps the title one readable string.
          <div className="scv-feat-title" aria-label={view.title}>
            {[...view.title].map((ch, i) => (
              <span key={i} className="scv-feat-letter" aria-hidden="true" style={{ "--i": i } as CSSProperties}>{ch === " " ? " " : ch}</span>
            ))}
          </div>
        ) : (
          <div className="scv-feat-title">{view.title}</div>
        )}
        <div className="scv-feat-stage">
          {grand && <div className="scv-feat-rays" />}
          <div className="scv-feat-glow" />
          <div className={`scv-feat-card scv-feat-${view.motion}`} data-testid="feat-card">
            {art
              ? <img className="scv-fc-art" src={art.file} alt={view.card.name} />
              : <div className="scv-fc-art scv-fc-blank">{view.card.name}</div>}
          </div>
          {view.badge && <span className="scv-feat-badge" data-testid="feat-badge">{view.badge}</span>}
        </div>
        <p className="scv-feat-headline">{view.headline}</p>
        <p className="scv-feat-detail">{view.detail}</p>
        {view.aside && <p className="scv-feat-aside">{view.aside}</p>}
        <button className="scv-primary" onClick={onContinue} autoFocus>Continue</button>
      </div>
      {/* After the panel, so the sparks paint OVER the card they stream from (the canvas ignores the pointer). */}
      {grand && <FeatParticles />}
    </div>
  );
}
