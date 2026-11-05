import { ALL_HAZARD_NAMES } from "@sorcerers-cave/engine";
import { resolveCard, type CardArt } from "../data/manifest";

/** The set-piece centrepiece for a once-only hazard (Mutiny, Desertion, Quarrel, Spell, Harpies): the drawn card, shown above its dice or
 *  aftermath. Once the player continues the pop-up closes and the card is gone — nothing is left lying on the tile. */
export function HazardCardPiece({ hazard, cards }: { hazard: number; cards: CardArt[] }) {
  const name = ALL_HAZARD_NAMES[hazard] ?? "Hazard";
  const art = resolveCard("hazard", hazard, cards);
  return (
    <div className="scv-hazard-piece" data-testid="hazard-piece">
      {art ? <img className="scv-hazard-piece-art" src={art.file} alt={`${name} card`} /> : <div className="scv-hazard-piece-art scv-hazard-piece-blank">{name}</div>}
    </div>
  );
}
