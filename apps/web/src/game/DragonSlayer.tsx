import { resolveCard, type CardArt } from "../data/manifest";
import { DRAGON_CREATURE_ID, type DragonSlayerView } from "./dragonSlayerView";

/** The dragon-slayer celebration (rulebook §Dragon: the felled dragon's card is inverted and kept with
 *  its slayer): the dragon card swings through 180° to lie upside-down, under a gold headline. The motion
 *  is pure CSS (`.scv-slayer-flip`, see styles.css) and is skipped under prefers-reduced-motion. */
export function DragonSlayer({ view, cards, onContinue }: { view: DragonSlayerView; cards: CardArt[]; onContinue: () => void }) {
  const art = resolveCard("creature", DRAGON_CREATURE_ID, cards);
  return (
    <div className="scv-dice-overlay scv-slayer-overlay" role="dialog" aria-label="dragon-slayer" data-testid="dragon-slayer">
      <div className="scv-dice-card scv-slayer-card">
        <div className="scv-slayer-title">{view.title}</div>
        <div className="scv-slayer-stage">
          <div className="scv-slayer-glow" />
          <div className="scv-slayer-dragon scv-slayer-flip" data-testid="slayer-dragon">
            {art
              ? <img className="scv-fc-art" src={art.file} alt="Dragon" />
              : <div className="scv-fc-art scv-fc-blank">Dragon</div>}
          </div>
          {view.kills > 1 && <span className="scv-slayer-tally" data-testid="slayer-tally">×{view.kills}</span>}
        </div>
        <p className="scv-slayer-headline">{view.headline}</p>
        <p className="scv-slayer-detail">{view.detail}</p>
        <button className="scv-primary" onClick={onContinue} autoFocus>Continue</button>
      </div>
    </div>
  );
}
