// ALL_TREASURES (not the base-only TREASURES): a kit-on game can offer a kit artefact (Holy Water,
// Scroll's cousin the Elixir) in the explore phase — the base table would show "artifact 16"
// instead of "Holy Water" (Task 15's carry-forward cosmetic-fallback list).
import {
  ALL_TREASURES, legalActions, decodeArea, SPECIAL_VIPER_PIT,
  DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN,
  type GameState, type GameAction,
} from "@sorcerers-cave/engine";
import { memberLabel } from "./memberLabels";
import { ConfirmButton, ConfirmPicker } from "./ConfirmButton";
import { holyWaterTargetName } from "./holyWaterLabel";
import { uncarryableNotes } from "./uncarryableNotes";

// Explore-phase actions that aren't movement (movement lives on the 3D exit markers / keys, and
// the Cave exit on the up-stair marker). These need a real menu — this is it.
type ExploreAction = Extract<GameAction, { type: "openChest" } | { type: "useArtifact" }>;

const DIR_NAME: Record<number, string> = {
  [DIR_N]: "north", [DIR_E]: "east", [DIR_S]: "south", [DIR_W]: "west", [DIR_UP]: "up", [DIR_DOWN]: "down",
};

const memberName = (state: GameState, target: number | undefined): string =>
  target !== undefined ? memberLabel(state.party, target) : "a companion";

type UseArtifact = Extract<GameAction, { type: "useArtifact" }>;

// Extension kit blocking-confirm popups (design Part 2 — Trap-fall pattern), verbatim per story.
const CHASM_CONFIRM = "Descend? You cannot return this way.";
const WELL_CONFIRM = "Draw 1 card — you cannot withdraw this turn.";
const CRYPT_CONFIRM = "Enter? A trap here cannot be avoided.";
const ELIXIR_CONFIRM = "One draught. 1: death. 2–3: nothing. 4–6: +2 strength, forever.";
// Precise Locations (house rule, designer-approved 2026-07-30): jumping to the island without
// leaving the tile carries the ordinary crossing's own risk — the Pit's fatal per-creature roll,
// the Pool's non-Giant heavy-treasure loss — so it gets the same blocking-confirm treatment.
const JUMP_ISLAND_CONFIRM_VIPER = "Jump for the island? Each member risks a fatal fall (a roll of 1–2).";
const JUMP_ISLAND_CONFIRM_POOL = "Swim for the island? Anyone but a Giant leaves their heavy treasure behind.";

/** The target/direction of one artifact use, e.g. "fly north", "revive Priest" — the dropdown option. */
function optionLabel(a: UseArtifact, state: GameState): string {
  switch (a.artifact) {
    case 6: return `revive ${memberName(state, a.target)}`;
    case 9: return `free ${memberName(state, a.target)} from stone`;
    case 4: return `fly ${DIR_NAME[a.dir ?? -1] ?? "?"}`;
    case 12: return `reveal the secret stair ${a.dir === DIR_DOWN ? "below" : "above"}`;
    // Extension kit (SC-EXT-24, design US-20): Holy Water's revive/wake/destroyMedusa modes are
    // offered at rest — the same four-pool offset encoding as the encounter/fight modes.
    case 16: return a.target !== undefined ? holyWaterTargetName(state, a.target, (mi) => memberLabel(state.party, mi)) : "use";
    default: return "use";
  }
}

/** A full, single-option label (target/direction included) for a one-click button. */
function fullLabel(a: ExploreAction, state: GameState): string {
  if (a.type === "openChest") return "Open the Treasure Chest";
  const name = ALL_TREASURES[a.artifact]?.name ?? "artifact";
  return `${name} — ${optionLabel(a, state)}`;
}

const isExploreAction = (a: GameAction): a is ExploreAction =>
  a.type === "openChest" || a.type === "useArtifact";

/** The explore-phase action menu: open the Treasure Chest and use exploration artifacts
 *  (Healing Balm, Magic Staff, Magic Carpet, Charmed Flute). Hidden when none are available.
 *  An artifact with several targets/directions (e.g. the Magic Carpet) collapses to one dropdown. */
export function ExplorePanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  if (state.phase !== "explore") return null;
  const all = legalActions(state);
  // A permanently-indifferent chamber is traversed in explore, but the party may still attack its guards.
  const attack = all.find((a) => a.type === "attack") ?? null;
  // Extension kit: the Chasm/Well/Crypt/Bell Rope escape-hatches and the Elixir get their own
  // ConfirmButton/ConfirmPicker rows below (design's blocking-confirm pattern) — pulled out of the
  // generic `legalActions` sweep so they don't also land in the plain-button/dropdown buckets.
  const descendChasm = all.find((a): a is Extract<GameAction, { type: "descendChasm" }> => a.type === "descendChasm") ?? null;
  const drawFromWell = all.find((a): a is Extract<GameAction, { type: "drawFromWell" }> => a.type === "drawFromWell") ?? null;
  const enterCrypt = all.find((a): a is Extract<GameAction, { type: "enterCrypt" }> => a.type === "enterCrypt") ?? null;
  const pullBellRope = all.filter((a): a is Extract<GameAction, { type: "pullBellRope" }> => a.type === "pullBellRope");
  const useElixir = all.filter((a): a is UseArtifact => a.type === "useArtifact" && a.artifact === 15);
  // Precise Locations (kit-independent house rule): pulled out alongside the kit escape-hatches
  // above for the same reason — it needs its own blocking confirm, not a plain button.
  const jumpToIsland = all.find((a): a is Extract<GameAction, { type: "jumpToIsland" }> => a.type === "jumpToIsland") ?? null;
  // Deep Pool/Viper Pit stationary reclaim (bug fix 2026-08-02): a live pickup for treasure already
  // sitting at the party's current sub-location — no risk, so a plain button like `attack` rather
  // than a `jumpToIsland`-style blocking confirm.
  const reclaimTreasure = all.find((a): a is Extract<GameAction, { type: "reclaimTreasure" }> => a.type === "reclaimTreasure") ?? null;
  const actions = all.filter(isExploreAction).filter((a) => !(a.type === "useArtifact" && a.artifact === 15));
  const hasKitActions = !!descendChasm || !!drawFromWell || !!enterCrypt || pullBellRope.length > 0 || useElixir.length > 0 || !!jumpToIsland;
  // Uncarryable treasure parked on this tile (design 2026-07-28): pickup auto-skips when nothing
  // can be taken, so the standing explanation lives here while the party remains in the chamber.
  // Parked contents encode treasure as 200+tid.
  const notes = uncarryableNotes(
    state,
    state.areas[state.partyArea]!.contents.filter((c) => c >= 200 && c < 300).map((c) => c - 200),
  );
  if (actions.length === 0 && !attack && !hasKitActions && !reclaimTreasure && notes.length === 0) return null;

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

      {notes.map((msg) => (
        <p key={msg} className="scv-enc-line scv-muted">{msg}</p>
      ))}

      {attack && (
        <div className="scv-enc-actions">
          <button className="scv-enc-btn" onClick={() => dispatch(attack)}>Attack the guardians</button>
        </div>
      )}

      {reclaimTreasure && (
        <div className="scv-enc-actions">
          <button className="scv-enc-btn" onClick={() => dispatch(reclaimTreasure)}>Reclaim the sunk treasure</button>
        </div>
      )}

      {dropdowns.length > 0 && (
        <div className="scv-enc-assign">
          {dropdowns.map(([artifact, acts]) => {
            const name = ALL_TREASURES[artifact]?.name ?? `artifact ${artifact}`;
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

      {/* Extension kit: the Bell Rope's member picker + confirm (design US-03). */}
      {pullBellRope.length > 0 && (
        <div className="scv-enc-assign">
          <ConfirmPicker
            rowLabel="Bell Rope"
            placeholder="Pull the bell rope…"
            options={pullBellRope.map((a) => ({ label: memberLabel(state.party, a.mi), value: a }))}
            confirmText={(a) => `Pull the bell rope with ${memberLabel(state.party, a.mi)}? Declining is always allowed.`}
            onConfirm={(a) => dispatch(a)}
          />
        </div>
      )}

      {/* Extension kit: the Elixir's drinker picker + verbatim confirm (design US-19). */}
      {useElixir.length > 0 && (
        <div className="scv-enc-assign">
          <ConfirmPicker
            rowLabel="Elixir"
            placeholder="Elixir — choose a drinker…"
            options={useElixir.map((a) => ({ label: memberLabel(state.party, a.target!), value: a }))}
            confirmText={() => ELIXIR_CONFIRM}
            onConfirm={(a) => dispatch(a)}
          />
        </div>
      )}

      {/* Extension kit: single-confirm escape-hatches (design's blocking-confirm/Trap-fall pattern). */}
      {(descendChasm || drawFromWell || enterCrypt) && (
        <div className="scv-enc-actions">
          {descendChasm && <ConfirmButton label="Descend the chasm" confirmText={CHASM_CONFIRM} onConfirm={() => dispatch(descendChasm)} />}
          {drawFromWell && <ConfirmButton label="Draw from the well" confirmText={WELL_CONFIRM} onConfirm={() => dispatch(drawFromWell)} />}
          {enterCrypt && <ConfirmButton label="Enter the crypt" confirmText={CRYPT_CONFIRM} onConfirm={() => dispatch(enterCrypt)} />}
        </div>
      )}

      {/* Precise Locations (house rule): jump to the island without leaving the tile. */}
      {jumpToIsland && (
        <div className="scv-enc-actions">
          <ConfirmButton
            label="Jump to the island"
            confirmText={
              decodeArea(state.areas[state.partyArea]!.card).special === SPECIAL_VIPER_PIT
                ? JUMP_ISLAND_CONFIRM_VIPER
                : JUMP_ISLAND_CONFIRM_POOL
            }
            onConfirm={() => dispatch(jumpToIsland)}
          />
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
