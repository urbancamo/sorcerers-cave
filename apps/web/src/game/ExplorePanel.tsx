import {
  CREATURES, TREASURES, legalActions,
  DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN,
  type GameState, type GameAction,
} from "@sorcerers-cave/engine";

// Explore-phase actions that aren't movement (movement lives on the 3D exit markers / keys, and
// the Cave exit on the up-stair marker). These need a real menu — this is it.
type ExploreAction = Extract<GameAction, { type: "openChest" } | { type: "useArtifact" }>;

const DIR_NAME: Record<number, string> = {
  [DIR_N]: "north", [DIR_E]: "east", [DIR_S]: "south", [DIR_W]: "west", [DIR_UP]: "up", [DIR_DOWN]: "down",
};

const memberName = (state: GameState, target: number | undefined): string => {
  const m = target !== undefined ? state.party[target] : undefined;
  return m ? CREATURES[m.creatureId]!.name : "a companion";
};

/** A specific, disambiguated label per action (gap analysis #5: name the target/direction). */
function label(a: ExploreAction, state: GameState): string {
  if (a.type === "openChest") return "Open the Treasure Chest";
  const name = TREASURES[a.artifact]?.name ?? "artifact";
  switch (a.artifact) {
    case 6: return `${name} — revive ${memberName(state, a.target)}`;
    case 9: return `${name} — free ${memberName(state, a.target)} from stone`;
    case 4: return `${name} — fly ${DIR_NAME[a.dir ?? -1] ?? "?"}`;
    case 12: return `${name} — reveal the secret stair ${a.dir === DIR_DOWN ? "below" : "above"}`;
    default: return `Use ${name}`;
  }
}

const isExploreAction = (a: GameAction): a is ExploreAction =>
  a.type === "openChest" || a.type === "useArtifact";

/** The explore-phase action menu: open the Treasure Chest and use exploration artifacts
 *  (Healing Balm, Magic Staff, Magic Carpet, Charmed Flute). Hidden when none are available. */
export function ExplorePanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  if (state.phase !== "explore") return null;
  const actions = legalActions(state).filter(isExploreAction);
  if (actions.length === 0) return null;

  return (
    <div className="scv-enc" data-testid="explore-panel">
      <h3 className="scv-enc-hd">Actions</h3>
      <div className="scv-enc-actions">
        {actions.map((a, i) => (
          <button key={i} className="scv-enc-btn" onClick={() => dispatch(a)}>
            {label(a, state)}
          </button>
        ))}
      </div>
    </div>
  );
}
