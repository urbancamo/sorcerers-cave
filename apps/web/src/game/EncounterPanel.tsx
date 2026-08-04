// ALL_CREATURES/ALL_TREASURES (not the base-only tables, SC-EXT-29): a kit-on game's small pack can
// draw a kit id (14-21) into `state.strangers`/`state.treasures` on ANY chamber, regardless of the
// starting party — this panel is the very first thing that renders such a draw, so the base tables
// would crash here before a kit-on game gets past its first encounter.
import { useEffect, useRef } from "react";
import { ALL_CREATURES, ALL_TREASURES, carriedWeight, legalActions, type GameState, type GameAction } from "@sorcerers-cave/engine";
import { memberLabel } from "./memberLabels";
import { uncarryableNotes } from "./uncarryableNotes";
import { ConfirmButton, ConfirmPicker } from "./ConfirmButton";
import { holyWaterTargetName } from "./holyWaterLabel";

// The `fight` phase is owned by the FightSurface (drag-card pairing); this panel keeps
// encounter + pickup + the Medusa pause (throw the Lotus Dust at her, or proceed).
const ACTIVE = new Set<GameState["phase"]>(["encounter", "pickup", "medusa"]);

const RETREAT_DIR: Record<number, string> = { 1: "north", 2: "east", 3: "south", 4: "west", 5: "up the stair", 6: "down the stair" };

// Verb shown in an artefact's "use on…" prompt, by treasure id.
const ART_VERB: Record<number, string> = { 5: "put to sleep", 6: "revive", 8: "strengthen", 9: "free from stone", 16: "use on" };

// Extension kit blocking-confirm popups (design Part 2 — Trap-fall pattern), verbatim per story.
const CHASM_CONFIRM = "Descend? You cannot return this way.";
const WELL_CONFIRM = "Draw 1 card — you cannot withdraw this turn.";
const ELIXIR_CONFIRM = "One draught. 1: death. 2–3: nothing. 4–6: +2 strength, forever.";
const SCROLL_CONFIRM = "Destroys every enemy here save the magical — and curses the party.";

/** Disambiguate identical option labels (e.g. two Men) by appending “ #2”, “ #3” to the repeats. */
function dedupeLabels(labels: string[]): string[] {
  const total = new Map<string, number>();
  labels.forEach((l) => total.set(l, (total.get(l) ?? 0) + 1));
  const seen = new Map<string, number>();
  return labels.map((l) => {
    if ((total.get(l) ?? 0) <= 1) return l;
    const n = (seen.get(l) ?? 0) + 1; seen.set(l, n);
    return `${l} #${n}`;
  });
}

/** Human label for a legal action button. */
function label(a: GameAction, state: GameState): string {
  switch (a.type) {
    case "test": return "Test reaction";
    case "attack": return "Attack";
    case "withdraw": return "Withdraw";
    case "retreat": return `Retreat ${RETREAT_DIR[a.dir] ?? ""}`.trim();
    case "leaveTreasure": return "Leave the treasure";
    case "retakeDropped": return "Retake dropped treasure (as before)";
    case "chooseCasualty": {
      const m = state.party[a.idx]!;
      const carried = m.treasure.length;
      // Name + carried-count so two same-creature members can be told apart when choosing.
      return `Let ${memberLabel(state.party, a.idx)} fall` + (carried ? ` (carrying ${carried})` : "");
    }
    case "takeTreasure": {
      const tid = state.treasures[a.ti]!;
      const tname = ALL_TREASURES[tid]?.name ?? "treasure";
      const member = memberLabel(state.party, a.mi);
      // The Lost Ruby (id 11) is guarded by a strength-8 statue that must be beaten to claim it (§16).
      return tid === 11
        ? `Seize the ${tname} — ${member} must defeat the guardian statue`
        : `Take ${tname} → ${member}`;
    }
    case "useArtifact": {
      const tname = ALL_TREASURES[a.artifact]?.name ?? `artifact ${a.artifact}`;
      // Member-targeting revives — name the member so each option is distinct.
      if (a.target !== undefined) {
        if (a.artifact === 6) return `${tname} — revive ${memberLabel(state.party, a.target)}`;
        if (a.artifact === 9) return `${tname} — free ${memberLabel(state.party, a.target)} from stone`;
      }
      // Untargeted Lotus Dust is the Medusa-pause throw (§Lotus Dust "Works on MEDUSA").
      if (a.artifact === 5 && a.target === undefined) return "Throw the Lotus Dust — put Medusa to sleep";
      // Untargeted Holy Water is the pause's pre-gaze destroy (design answer 2026-07-27, SC-EXT-24).
      if (a.artifact === 16 && a.target === undefined) return "Use the Holy Water — destroy Medusa";
      return `Use ${tname}`;
    }
    case "proceed": return "Proceed — brave her gaze";
    // Extension kit — these are pulled out into their own ConfirmButton/ConfirmPicker rows below
    // (design's blocking-confirm pattern), but a plain label here keeps `label()` total over every
    // GameAction the panel might legally see, for any caller that doesn't special-case them first.
    case "descendChasm": return "Descend the chasm";
    case "drawFromWell": return "Draw from the well";
    case "enterCrypt": return "Enter the crypt";
    case "pullBellRope": return `Pull the bell rope → ${memberLabel(state.party, a.mi)}`;
    default: return a.type;
  }
}

export function EncounterPanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const activePhase = ACTIVE.has(state.phase);
  const actions = activePhase ? legalActions(state) : [];
  // Auto-skip (design 2026-07-28): a pickup where "Leave the treasure" is the only legal action —
  // nothing takeable, nothing usable — is pure interruption; leave automatically and render
  // nothing. The standing explanation (too heavy / Giant-only pool) lives in the explore panel's
  // chamber note. Ref-guarded per state object so a re-render (or StrictMode's double effect)
  // can't dispatch twice; MP's async dispatch gets one call per subscribed state for the same reason.
  const autoSkip = state.phase === "pickup" && actions.length > 0 && actions.every((a) => a.type === "leaveTreasure");
  const skippedFor = useRef<GameState | null>(null);
  useEffect(() => {
    if (autoSkip && skippedFor.current !== state) {
      skippedFor.current = state;
      dispatch({ type: "leaveTreasure" });
    }
  }, [autoSkip, state, dispatch]);
  if (!activePhase || autoSkip) return null;
  const strangers = state.strangers.map((id) => ALL_CREATURES[id]!.name);
  const treasures = state.treasures.map((id) => ALL_TREASURES[id]!.name);

  // Collapse the action explosion into one control per treasure / per artefact:
  //  - each treasure is listed once, with a dropdown of the members who can carry it;
  //  - each artefact is listed once, with a dropdown of the targets it can be used on.
  // Everything else (test, attack, withdraw, leave, retake) stays a plain button. The extension
  // kit's own confirm-gated actions (Chasm/Well/Bell Rope/Elixir/Scroll) are pulled out into
  // their own ConfirmButton/ConfirmPicker rows (design's blocking-confirm pattern) rather than
  // falling into the generic buckets below. (enterCrypt is explore-only per selectors.ts — never
  // legal here — so this panel doesn't handle it at all; see ExplorePanel.tsx.)
  const takeByTi = new Map<number, number[]>();        // treasure index -> member indices that can carry it
  const artByArtifact = new Map<number, GameAction[]>(); // artefact id -> its target actions
  const simple: GameAction[] = [];
  // "Retake dropped treasure (as before)" is the one-tap shortcut after a won fight — surface it FIRST,
  // ahead of the per-item assignment dropdowns.
  let retake: GameAction | null = null;
  let descendChasm: Extract<GameAction, { type: "descendChasm" }> | null = null;
  let drawFromWell: Extract<GameAction, { type: "drawFromWell" }> | null = null;
  const pullBellRope: Extract<GameAction, { type: "pullBellRope" }>[] = [];
  const useElixir: Extract<GameAction, { type: "useArtifact" }>[] = [];
  let readScroll: Extract<GameAction, { type: "useArtifact" }> | null = null;
  // The Medusa pause offers exactly two choices (throw the dust / proceed) — both plain buttons,
  // not a target dropdown: the target (Medusa) is implicit.
  const medusaPause = state.phase === "medusa";
  for (const a of actions) {
    if (a.type === "takeTreasure") (takeByTi.get(a.ti) ?? takeByTi.set(a.ti, []).get(a.ti)!).push(a.mi);
    else if (a.type === "descendChasm") descendChasm = a;
    else if (a.type === "drawFromWell") drawFromWell = a;
    else if (a.type === "pullBellRope") pullBellRope.push(a);
    else if (a.type === "useArtifact" && a.artifact === 15 && !medusaPause) useElixir.push(a);
    else if (a.type === "useArtifact" && a.artifact === 19 && !medusaPause) readScroll = a;
    else if (a.type === "useArtifact" && !medusaPause) (artByArtifact.get(a.artifact) ?? artByArtifact.set(a.artifact, []).get(a.artifact)!).push(a);
    else if (a.type === "retakeDropped") retake = a;
    // Leaving an indifferent encounter by any doorway (SC-4-18a) is movement, same as explore's own
    // moves — driven by the 3D exit markers/keys (engineAdapter.ts's openMoves), never a panel button.
    else if (a.type === "move") continue;
    else simple.push(a);
  }

  // Treasure nobody can take (design 2026-07-28): the engine already withholds `takeTreasure` when
  // no active member qualifies, so a row-less listing would be silent — explain it beside the rows
  // for what CAN be taken. (The everything-uncarryable case never reaches here: it auto-skips above.)
  const uncarryable = state.phase === "pickup"
    ? uncarryableNotes(state, state.treasures.filter((_, ti) => !takeByTi.has(ti)))
    : [];

  const memberName = (mi: number) => {
    const m = state.party[mi]!, c = ALL_CREATURES[m.creatureId]!;
    const base = memberLabel(state.party, mi); // party-wide "#N" for duplicate classes
    return c.carry > 0 ? `${base} (${carriedWeight(m)}/${c.carry}kg)` : base;
  };
  // An artefact action's target, named: Lotus Dust (5) targets a stranger; Holy Water (16) spans its
  // own four-pool offset encoding (SC-EXT-24 — see holyWaterLabel.ts); everything else a party member.
  // The Sorcerer under Lotus Dust is the one target the dropdown's "put to sleep" verb would lie
  // about — he is only weakened (−2 magic, SC-11-12) — so his option says what actually happens.
  const artTargetName = (a: Extract<GameAction, { type: "useArtifact" }>) =>
    a.target === undefined ? "the party"
      : a.artifact === 5 ? (state.strangers[a.target] === 11
        ? "Sorcerer — weakens him by 2, he cannot be slept"
        : ALL_CREATURES[state.strangers[a.target]!]!.name)
      : a.artifact === 16 ? holyWaterTargetName(state, a.target, (mi) => memberLabel(state.party, mi))
      : memberLabel(state.party, a.target);

  return (
    <div className="scv-enc" data-testid="encounter-panel">
      <h3 className="scv-enc-hd">{state.phase}</h3>
      {strangers.length > 0 && (
        <p className="scv-enc-line scv-enc-strangers"><span className="k">Strangers: </span>{strangers.join(", ")}</p>
      )}
      {treasures.length > 0 && (
        <p className="scv-enc-line scv-enc-treasure"><span className="k">Treasure: </span>{treasures.join(", ")}</p>
      )}
      {medusaPause && (
        <p className="scv-enc-line scv-enc-strangers">
          Medusa looms — act before her gaze lands, or proceed and brave it.
        </p>
      )}
      {state.fight && <p className="scv-enc-round">Round {state.fight.round}</p>}
      {state.fight?.casualtyQueue?.length ? (
        <p className="scv-enc-line scv-enc-strangers">Two fell together — choose who is lost.</p>
      ) : null}

      {/* One-tap shortcut first: give every fighter back the heavy treasure it dropped to fight. */}
      {retake && (
        <div className="scv-enc-actions">
          <button className="scv-enc-btn" onClick={() => dispatch(retake!)}>{label(retake, state)}</button>
        </div>
      )}

      {/* Treasure: one row per item; pick a member to give it to, or leave it. */}
      {takeByTi.size > 0 && (
        <div className="scv-enc-assign">
          {[...takeByTi].map(([ti, mis]) => {
            const labels = dedupeLabels(mis.map(memberName));
            const tname = ALL_TREASURES[state.treasures[ti]!]!.name;
            // The Lost Ruby (id 11) is set in a strength-8 statue that must be beaten — taking it is a
            // fight, not a free pickup, so word the options as wresting it from the guardian (§16).
            const guarded = state.treasures[ti] === 11;
            const optText = (lbl: string) => (guarded ? `${lbl} wrests it from the statue` : `Give to ${lbl}`);
            return (
              <label key={`t${ti}`} className="scv-enc-row">
                <span className="scv-enc-row-nm">{tname}{guarded && <span className="scv-enc-guard"> · guarded by a statue</span>}</span>
                <select
                  className="scv-enc-select"
                  aria-label={`${guarded ? "Wrest" : "Assign"} ${tname}`}
                  value=""
                  onChange={(e) => { if (e.target.value !== "") dispatch({ type: "takeTreasure", ti, mi: mis[Number(e.target.value)]! }); }}
                >
                  <option value="">Leave in chamber</option>
                  {labels.map((lbl, k) => <option key={mis[k]} value={k}>{optText(lbl)}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      )}

      {/* Treasure nobody can take: an info line in place of the assignment row it can't have. */}
      {uncarryable.map((msg) => (
        <p key={msg} className="scv-enc-line scv-muted">{msg}</p>
      ))}

      {/* Artefacts: one row per artefact; pick the target to use it on. */}
      {artByArtifact.size > 0 && (
        <div className="scv-enc-assign">
          {[...artByArtifact].map(([artifact, acts]) => {
            const aname = ALL_TREASURES[artifact]?.name ?? `artifact ${artifact}`;
            const labels = dedupeLabels(acts.map((a) => artTargetName(a as Extract<GameAction, { type: "useArtifact" }>)));
            return (
              <label key={`a${artifact}`} className="scv-enc-row">
                <span className="scv-enc-row-nm">{aname}</span>
                <select
                  className="scv-enc-select"
                  aria-label={`Use ${aname}`}
                  value=""
                  onChange={(e) => { if (e.target.value !== "") dispatch(acts[Number(e.target.value)]!); }}
                >
                  <option value="">{`${aname} — ${ART_VERB[artifact] ?? "use"}…`}</option>
                  {labels.map((lbl, k) => <option key={k} value={k}>{lbl}</option>)}
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
            options={dedupeLabels(pullBellRope.map((a) => memberLabel(state.party, a.mi))).map((lbl, k) => ({ label: lbl, value: pullBellRope[k]! }))}
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
            options={dedupeLabels(useElixir.map((a) => memberLabel(state.party, a.target!))).map((lbl, k) => ({ label: lbl, value: useElixir[k]! }))}
            confirmText={() => ELIXIR_CONFIRM}
            onConfirm={(a) => dispatch(a)}
          />
        </div>
      )}

      {/* Extension kit: single-confirm actions (design's blocking-confirm/Trap-fall pattern). */}
      {(descendChasm || drawFromWell || readScroll) && (
        <div className="scv-enc-actions">
          {descendChasm && <ConfirmButton label="Descend the chasm" confirmText={CHASM_CONFIRM} onConfirm={() => dispatch(descendChasm!)} />}
          {drawFromWell && <ConfirmButton label="Draw from the well" confirmText={WELL_CONFIRM} onConfirm={() => dispatch(drawFromWell!)} />}
          {readScroll && <ConfirmButton label="Read the Scroll" confirmText={SCROLL_CONFIRM} onConfirm={() => dispatch(readScroll!)} />}
        </div>
      )}

      {simple.length > 0 && (
        <div className="scv-enc-actions">
          {simple.map((a, i) => (
            <button key={i} className="scv-enc-btn" onClick={() => dispatch(a)}>
              {label(a, state)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
