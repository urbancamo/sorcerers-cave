import { legalActions, decodeArea, SPECIAL_VIPER_PIT, type GameState, type GameAction } from "@sorcerers-cave/engine";
import { memberLabel } from "./memberLabels";
import { ConfirmButton, ConfirmPicker } from "./ConfirmButton";
import { chamberName } from "../data/areaText";

// Extension kit blocking-confirm popups (design Part 2 — Trap-fall pattern), verbatim per story.
const CHASM_CONFIRM = "Descend? You cannot return this way.";
const WELL_CONFIRM = "Draw 1 card — the Well can be used only once, and you cannot withdraw this turn.";
const CRYPT_CONFIRM = "Enter? A trap here cannot be avoided.";
// Precise Locations (house rule, designer-approved 2026-07-30): jumping to the island without
// leaving the tile carries the ordinary crossing's own risk — the Pit's fatal per-creature roll,
// the Pool's non-Giant heavy-treasure loss — so it gets the same blocking-confirm treatment.
const JUMP_ISLAND_CONFIRM_VIPER = "Jump for the island? Each member risks a fatal fall (a roll of 1–2).";
const JUMP_ISLAND_CONFIRM_POOL = "Swim for the island? Anyone but a Giant leaves their heavy treasure behind.";

/** The explore-phase action menu: the tile's own actions (the extension kit's escape-hatches, guardians, the Sibyl, the Apprentice).
 *  Using an artifact (and opening the Chest) is not here: it lives on that item's card, so nothing suggests when to use one. */
export function ExplorePanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  // An open pickup keeps the tile's own actions on offer (an uncarryable treasure reopens it on every visit); taking one leaves the floor treasure behind.
  if (state.phase !== "explore" && state.phase !== "pickup") return null;
  const all = legalActions(state);
  // A permanently-indifferent chamber is traversed in explore, but the party may still attack its guards.
  const attack = all.find((a) => a.type === "attack") ?? null;
  // Extension kit: the Chasm/Well/Crypt/Bell Rope escape-hatches get their own
  // ConfirmButton/ConfirmPicker rows below (design's blocking-confirm pattern) — pulled out of the
  // generic `legalActions` sweep so they don't also land in the plain-button/dropdown buckets.
  const descendChasm = all.find((a): a is Extract<GameAction, { type: "descendChasm" }> => a.type === "descendChasm") ?? null;
  const drawFromWell = all.find((a): a is Extract<GameAction, { type: "drawFromWell" }> => a.type === "drawFromWell") ?? null;
  const enterCrypt = all.find((a): a is Extract<GameAction, { type: "enterCrypt" }> => a.type === "enterCrypt") ?? null;
  const pullBellRope = all.filter((a): a is Extract<GameAction, { type: "pullBellRope" }> => a.type === "pullBellRope");
  // Precise Locations (kit-independent house rule): pulled out alongside the kit escape-hatches
  // above for the same reason — it needs its own blocking confirm, not a plain button.
  const jumpToIsland = all.find((a): a is Extract<GameAction, { type: "jumpToIsland" }> => a.type === "jumpToIsland") ?? null;
  // Deep Pool/Viper Pit stationary reclaim (bug fix 2026-08-02): a live pickup for treasure already
  // sitting at the party's current sub-location — no risk, so a plain button like `attack` rather
  // than a `jumpToIsland`-style blocking confirm.
  const reclaimTreasure = all.find((a): a is Extract<GameAction, { type: "reclaimTreasure" }> => a.type === "reclaimTreasure") ?? null;
  // (The Sibyl's free look is on her own card, not here.)
  // The turncoat Apprentice (revised combat, Peter's Special Fights 6): the Sorcerer is dead and she is still an ally. Leaving parts company
  // with her; staying turns her, and every stranger here, on the party.
  const stay = all.find((a) => a.type === "stay") ?? null;
  const hasKitActions = !!descendChasm || !!drawFromWell || !!enterCrypt || pullBellRope.length > 0 || !!jumpToIsland;
  // (Why parked treasure cannot be carried is told on that treasure's own card, so a note alone never opens this bar.)
  if (!attack && !hasKitActions && !reclaimTreasure && !stay) return null;

  return (
    <div className="scv-enc" data-testid="explore-panel">
      <h3 className="scv-enc-hd">{chamberName(state, state.partyArea) ?? "Actions"}</h3>

      {attack && (
        <div className="scv-enc-actions">
          <button className="scv-enc-btn" onClick={() => dispatch(attack)}>Attack the guardians</button>
        </div>
      )}

      {stay && (
        <div className="scv-enc-actions" data-testid="apprentice-watch">
          <p className="scv-enc-line">The Sorcerer is dead, and the Apprentice is watching you. Leave this area and she is left behind — stay, and she turns on you.</p>
          <ConfirmButton label="Stay here" confirmText="The Apprentice turns, and she and every stranger here attack the party with surprise." onConfirm={() => dispatch(stay)} />
        </div>
      )}

      {reclaimTreasure && (
        <div className="scv-enc-actions">
          <button className="scv-enc-btn" onClick={() => dispatch(reclaimTreasure)}>Reclaim the sunk treasure</button>
        </div>
      )}

      {/* Extension kit: the Bell Rope's member picker + confirm (design US-03). */}
      {pullBellRope.length > 0 && (
        <div className="scv-enc-assign">
          <ConfirmPicker
            rowLabel="Bell Rope"
            placeholder="Pull the bell rope…"
            options={pullBellRope.map((a) => ({ label: memberLabel(state.party, a.mi), value: a }))}
            confirmText={(a) => `Pull the bell rope with ${memberLabel(state.party, a.mi)}?`}
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

    </div>
  );
}
