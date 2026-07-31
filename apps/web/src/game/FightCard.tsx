// ALL_CREATURES/ALL_TREASURES (not the base-only tables, SC-EXT-29): every fight-surface card —
// party member or foe — can be a kit id (14-21) in a kit-on game.
import { ALL_CREATURES, ALL_TREASURES, type GameState } from "@sorcerers-cave/engine";
import { resolveCardVariant, resolveCard, type CardArt } from "../data/manifest";

export type CardKind = "ally" | "caster" | "foe";

/** One creature card: real art, a strength badge, any wielded artefacts tucked on the corner, and (for
 *  party members) drag + click to assign. `strength` is the value shown in the badge. */
export function FightCard({
  creatureId, kind, strength, caption, treasure = [], cards, state,
  draggable, onPick, dim, selected, testId, onRelicClick, artifactsOnly, dragId, label, variantIdx,
}: {
  creatureId: number; kind: CardKind; strength: number; caption?: string;
  label?: string; // party members: the party-wide "#N" display name (foes keep the creature name)
  treasure?: number[]; cards: CardArt[]; state: GameState;
  draggable?: boolean; onPick?: () => void; dim?: boolean; selected?: boolean; testId?: string;
  onRelicClick?: (relic: { id: number; file: string; name: string }) => void;
  artifactsOnly?: boolean; // in a matchup, heavy treasure is dropped to fight — show only kept artefacts
  dragId?: number; // the party-member index this card carries when dragged (read by the drop targets)
  // Which physical copy of this creature to illustrate — the nth same-creatureId member/stranger by
  // stable array order (party index, or position among state.strangers), matching how PartyPanel's
  // own `copyIdx` and the chamber floor's `laneCards` pick a variant. Without this, every card of the
  // same creature type showed the SAME fixed image (derived from creatureId, not from which physical
  // copy it is) — inconsistent with whatever the chamber/party panel had already shown for that member.
  variantIdx?: number;
}) {
  const art = resolveCardVariant("creature", creatureId, variantIdx ?? 0, cards) ?? resolveCard("creature", creatureId, cards);
  const name = ALL_CREATURES[creatureId]?.name ?? "?";
  const relics = treasure
    .filter((t) => !artifactsOnly || ALL_TREASURES[t]?.kind === "artifact")
    .map((t) => ({ id: t, art: resolveCard("treasure", t, cards), name: ALL_TREASURES[t]?.name ?? "artefact" }));

  return (
    <div className={`scv-fc scv-fc-${kind}${dim ? " is-dim" : ""}${selected ? " is-sel" : ""}`}>
      <div
        className="scv-fc-frame"
        data-testid={testId}
        draggable={draggable}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; if (dragId !== undefined) e.dataTransfer.setData("application/x-scv-member", String(dragId)); }}
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
      <div className="scv-fc-cap"><b>{label ?? name}</b>{caption ? <span>{caption}</span> : null}</div>
    </div>
  );
}
