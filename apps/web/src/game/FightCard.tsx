import { useState } from "react";
import { CREATURES, TREASURES, type GameState } from "@sorcerers-cave/engine";
import { resolveCardVariant, resolveCard, type CardArt } from "../data/manifest";
import { CardZoom } from "./CardZoom";

export type CardKind = "ally" | "caster" | "foe";

/** One creature card: real art, a strength badge, any wielded artefacts tucked on the corner, hover/tap
 *  zoom, and (for party members) drag + click to assign. `strength` is the value shown in the badge. */
export function FightCard({
  creatureId, kind, strength, caption, treasure = [], cards, state,
  draggable, onPick, dim, selected, testId,
}: {
  creatureId: number; kind: CardKind; strength: number; caption?: string;
  treasure?: number[]; cards: CardArt[]; state: GameState;
  draggable?: boolean; onPick?: () => void; dim?: boolean; selected?: boolean; testId?: string;
}) {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
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
        onMouseEnter={() => art && setZoom({ src: art.file, alt: name })}
        onMouseLeave={() => setZoom(null)}
        role={onPick ? "button" : undefined}
        tabIndex={onPick ? 0 : undefined}
        onKeyDown={(e) => { if (onPick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(); } }}
      >
        {art ? <img className="scv-fc-art" src={art.file} alt={name} /> : <div className="scv-fc-art scv-fc-blank">{name}</div>}
        <span className="scv-fc-badge">{strength}</span>
        {relics.length > 0 && (
          <div className="scv-fc-wield">
            {relics.map((r, i) => r.art
              ? <img key={i} className="scv-fc-relic" src={r.art.file} alt={r.name} title={r.name}
                     onMouseEnter={() => setZoom({ src: r.art!.file, alt: r.name })} onMouseLeave={() => setZoom(null)} />
              : null)}
          </div>
        )}
      </div>
      <div className="scv-fc-cap"><b>{name}</b>{caption ? <span>{caption}</span> : null}</div>
      <CardZoom src={zoom?.src ?? null} alt={zoom?.alt ?? ""} />
    </div>
  );
}
