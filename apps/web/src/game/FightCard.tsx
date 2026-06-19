import { CREATURES, TREASURES, type GameState } from "@sorcerers-cave/engine";
import { resolveCardVariant, resolveCard, type CardArt } from "../data/manifest";

export type CardKind = "ally" | "caster" | "foe";

/** One creature card: real art, a strength badge, any wielded artefacts tucked on the corner, and (for
 *  party members) drag + click to assign. `strength` is the value shown in the badge. */
export function FightCard({
  creatureId, kind, strength, caption, treasure = [], cards, state,
  draggable, onPick, dim, selected, testId, onRelicClick,
}: {
  creatureId: number; kind: CardKind; strength: number; caption?: string;
  treasure?: number[]; cards: CardArt[]; state: GameState;
  draggable?: boolean; onPick?: () => void; dim?: boolean; selected?: boolean; testId?: string;
  onRelicClick?: (relic: { id: number; file: string; name: string }) => void;
}) {
  const art = resolveCardVariant("creature", creatureId, creatureId, cards) ?? resolveCard("creature", creatureId, cards);
  const name = CREATURES[creatureId]?.name ?? "?";
  const relics = treasure.map((t) => ({ id: t, art: resolveCard("treasure", t, cards), name: TREASURES[t]?.name ?? "artefact" }));

  return (
    <div className={`scv-fc scv-fc-${kind}${dim ? " is-dim" : ""}${selected ? " is-sel" : ""}`}>
      <div
        className="scv-fc-frame"
        data-testid={testId}
        draggable={draggable}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onPick?.(); }}
        onClick={onPick}
        role={onPick ? "button" : undefined}
        tabIndex={onPick ? 0 : undefined}
        onKeyDown={(e) => { if (onPick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(); } }}
      >
        {art ? <img className="scv-fc-art" src={art.file} alt={name} /> : <div className="scv-fc-art scv-fc-blank">{name}</div>}
        <span className="scv-fc-badge">{strength}</span>
        {relics.length > 0 && (
          <div className="scv-fc-wield">
            {relics.map((r, i) => r.art
              ? <img key={i} className={"scv-fc-relic" + (onRelicClick ? " is-clickable" : "")} src={r.art.file} alt={r.name} title={r.name}
                     onClick={onRelicClick ? (e) => { e.stopPropagation(); onRelicClick({ id: r.id, file: r.art!.file, name: r.name }); } : undefined} />
              : null)}
          </div>
        )}
      </div>
      <div className="scv-fc-cap"><b>{name}</b>{caption ? <span>{caption}</span> : null}</div>
    </div>
  );
}
