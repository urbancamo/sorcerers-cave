import { useRef, useState } from "react";
import type { GameAction } from "@sorcerers-cave/engine";
import { HelpButton } from "../manual/HelpButton";

/** A trap faces a party guided by a Dwarf (`variants.trapRules`, the engine's `trap` phase): be guided safely
 *  past it, or fall through it on purpose. A deliberate fall is one-way, like any trap, but it gains the
 *  advantage of surprise over any strangers below (the area fallen into may hold none). Blocking, like the Sorcerer's terms: the
 *  choice must be made, and nothing else can be done until it is. */
export function TrapChoice({ traps = 1, dispatch }: { traps?: number; dispatch: (a: GameAction) => void }) {
  // A party with n Dwarves can guide past n traps, so the choice may cover several at once (ruled 11-OCT-2026).
  const many = traps > 1;
  // The card can be dragged by its heading, so the chamber beneath can be seen while deciding; double-click puts it back.
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // the Help button keeps its own click
    const start = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const rect = cardRef.current?.getBoundingClientRect();
    // Keep the whole heading on screen: the card may not be dragged out of reach.
    const clamp = (x: number, y: number) => {
      if (!rect) return { x, y };
      const dx = x - pos.x, dy = y - pos.y; // the move since the drag began, applied to where the card sat
      return {
        x: pos.x + Math.min(Math.max(rect.left + dx, 0), innerWidth - rect.width) - rect.left,
        y: pos.y + Math.min(Math.max(rect.top + dy, 0), innerHeight - 40) - rect.top,
      };
    };
    const move = (m: PointerEvent) => setPos(clamp(m.clientX - start.x, m.clientY - start.y));
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };
  return (
    <div className="scv-dice-overlay scv-tp-overlay" role="dialog" aria-label="A trap" data-testid="trap-choice">
      <div ref={cardRef}
           className="scv-dice-card scv-tp-card"
           style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <div className="scv-dice-title scv-tp-grip"
             onPointerDown={startDrag}
             onDoubleClick={() => setPos({ x: 0, y: 0 })}
             title="Drag to move this window; double-click to put it back">{many ? `${traps} traps lie in this chamber` : "A trap lies in this chamber"} <HelpButton topics={["house-standing-traps", "hazard-trap"]} label="Help with the trap" /></div>
        <p className="scv-tp-text">
          {many
            ? "Your Dwarves can guide the party safely past all of them, and the traps stay where they are."
            : "The Dwarf can guide the party safely past it, and the trap stays where it is."}
        </p>
        <p className="scv-tp-text">
          Or the party can fall through {many ? "them" : "it"} on purpose. The drop is one way — you cannot return up this way. If there
          are strangers below, they will not be expecting you, so you gain the advantage of surprise.
        </p>
        <div className="scv-tp-actions">
          <button className="scv-primary" onClick={() => dispatch({ type: "avoidTrap" })}>{many ? "Guided past the traps" : "Guided past the trap"}</button>
          <button className="scv-primary danger" data-tutorial-action="fallThroughTrap" onClick={() => dispatch({ type: "fallThroughTrap" })}>{many ? "Fall through the traps" : "Fall through the trap"}</button>
        </div>
      </div>
    </div>
  );
}
