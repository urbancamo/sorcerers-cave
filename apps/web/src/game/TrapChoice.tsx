import type { GameAction } from "@sorcerers-cave/engine";

/** A trap faces a party guided by a Dwarf (`variants.trapRules`, the engine's `trap` phase): be guided safely
 *  past it, or fall through it on purpose. A deliberate fall is one-way, like any trap, but it gains the
 *  advantage of surprise over any strangers below (the area fallen into may hold none). Blocking, like the Sorcerer's terms: the
 *  choice must be made, and nothing else can be done until it is. */
export function TrapChoice({ traps = 1, dispatch }: { traps?: number; dispatch: (a: GameAction) => void }) {
  // A party with n Dwarves can guide past n traps, so the choice may cover several at once (ruled 11-OCT-2026).
  const many = traps > 1;
  return (
    <div className="scv-dice-overlay" role="dialog" aria-label="A trap" data-testid="trap-choice">
      <div className="scv-dice-card scv-tp-card">
        <div className="scv-dice-title">{many ? `${traps} traps lie in this chamber` : "A trap lies in this chamber"}</div>
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
          <button className="scv-primary danger" onClick={() => dispatch({ type: "fallThroughTrap" })}>{many ? "Fall through the traps" : "Fall through the trap"}</button>
        </div>
      </div>
    </div>
  );
}
