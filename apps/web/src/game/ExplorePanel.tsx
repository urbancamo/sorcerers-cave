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

type UseArtifact = Extract<GameAction, { type: "useArtifact" }>;

/** The target/direction of one artifact use, e.g. "fly north", "revive Priest" — the dropdown option. */
function optionLabel(a: UseArtifact, state: GameState): string {
  switch (a.artifact) {
    case 6: return `revive ${memberName(state, a.target)}`;
    case 9: return `free ${memberName(state, a.target)} from stone`;
    case 4: return `fly ${DIR_NAME[a.dir ?? -1] ?? "?"}`;
    case 12: return `reveal the secret stair ${a.dir === DIR_DOWN ? "below" : "above"}`;
    default: return "use";
  }
}

/** A full, single-option label (target/direction included) for a one-click button. */
function fullLabel(a: ExploreAction, state: GameState): string {
  if (a.type === "openChest") return "Open the Treasure Chest";
  const name = TREASURES[a.artifact]?.name ?? "artifact";
  return `${name} — ${optionLabel(a, state)}`;
}

const isExploreAction = (a: GameAction): a is ExploreAction =>
  a.type === "openChest" || a.type === "useArtifact";

/** The explore-phase action menu: open the Treasure Chest and use exploration artifacts
 *  (Healing Balm, Magic Staff, Magic Carpet, Charmed Flute). Hidden when none are available.
 *  An artifact with several targets/directions (e.g. the Magic Carpet) collapses to one dropdown. */
export function ExplorePanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  if (state.phase !== "explore") return null;
  const actions = legalActions(state).filter(isExploreAction);
  if (actions.length === 0) return null;

  // Group artifact uses by artifact; openChest (and any single-option artifact) stays a plain button.
  const artByArtifact = new Map<number, UseArtifact[]>();
  const buttons: ExploreAction[] = [];
  for (const a of actions) {
    if (a.type === "useArtifact") (artByArtifact.get(a.artifact) ?? artByArtifact.set(a.artifact, []).get(a.artifact)!).push(a);
    else buttons.push(a);
  }
  const dropdowns: [number, UseArtifact[]][] = [];
  for (const [artifact, acts] of artByArtifact) {
    if (acts.length > 1) dropdowns.push([artifact, acts]);
    else buttons.push(acts[0]!); // one option → a one-click button
  }

  return (
    <div className="scv-enc" data-testid="explore-panel">
      <h3 className="scv-enc-hd">Actions</h3>

      {dropdowns.length > 0 && (
        <div className="scv-enc-assign">
          {dropdowns.map(([artifact, acts]) => {
            const name = TREASURES[artifact]?.name ?? `artifact ${artifact}`;
            return (
              <label key={`a${artifact}`} className="scv-enc-row">
                <span className="scv-enc-row-nm">{name}</span>
                <select
                  className="scv-enc-select"
                  aria-label={`Use ${name}`}
                  value=""
                  onChange={(e) => { if (e.target.value !== "") dispatch(acts[Number(e.target.value)]!); }}
                >
                  <option value="">{`${name} — choose…`}</option>
                  {acts.map((a, k) => <option key={k} value={k}>{optionLabel(a, state)}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      )}

      {buttons.length > 0 && (
        <div className="scv-enc-actions">
          {buttons.map((a, i) => (
            <button key={i} className="scv-enc-btn" onClick={() => dispatch(a)}>
              {fullLabel(a, state)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
