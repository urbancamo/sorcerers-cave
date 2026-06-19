import { useEffect, useRef, useState } from "react";
import {
  CREATURES, legalActions, validatePlan, previewPlan, frontStrength, casterMP,
  type GameState, type GameAction,
} from "@sorcerers-cave/engine";
import type { CardArt } from "../data/manifest";
import { FightCard, type CardKind } from "./FightCard";
import { emptyDraft, place, unplace, toMatches, freeMembers, type PlanDraft } from "./fightPlan";

const DIR_NAME: Record<number, string> = { 1: "North", 2: "East", 3: "South", 4: "West", 5: "Up the stair", 6: "Down the stair" };
const REASON: Record<string, string> = {
  twoVsTwo: "Two against two isn't allowed — send two against one, or one against two.",
  backerNotCaster: "Only a Priest or Wizard may fight from the background.",
  spectreNeedsMagic: "A Spectre can only be fought with magic or the Magic Sword.",
  mustEngageAll: "Engage every stranger you can before rolling.",
  emptyPlan: "Set at least one fighter against a foe.",
};

const C_SPECTRE = 9;
const living = (s: GameState) => s.party.map((_, i) => i).filter((i) => { const m = s.party[i]!; return m.status === 0 || m.status === 1; });
const isCaster = (s: GameState, i: number) => casterMP(s.party[i]!, s) > 0;
const kindOf = (s: GameState, i: number): CardKind => (isCaster(s, i) ? "caster" : "ally");

export function FightSurface({ state, dispatch, cards }: { state: GameState; dispatch: (a: GameAction) => void; cards: CardArt[] }) {
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft());
  const [sel, setSel] = useState<number | null>(null); // tap-selected tray member
  const [retreatOpen, setRetreatOpen] = useState(false);
  const [zoom, setZoom] = useState<{ key: string; file: string; name: string } | null>(null); // per-matchup artefact zoom
  // Clear the pairing only when the line-up actually changed — a member fell or a foe was slain — so a
  // dead member never lingers and the player re-pairs after a casualty. A drawn round (nobody slain on
  // either side) leaves the composition untouched, so the fighters stay exactly where they were placed.
  const composition = state.party.map((m) => m.status).join(",") + "|" + state.strangers.join(",");
  const prevComposition = useRef(composition);
  // When the line-up changes (a foe slain / a member fell), last round's draft references indices that
  // no longer exist — so render from a fresh draft THIS pass (avoids a stale-index crash) and reset the
  // stored draft for subsequent renders. A drawn round leaves the composition (and the pairing) intact.
  const stale = prevComposition.current !== composition;
  useEffect(() => {
    if (prevComposition.current !== composition) { setDraft(emptyDraft()); setSel(null); setRetreatOpen(false); setZoom(null); }
    prevComposition.current = composition;
  }, [composition]);
  const draftNow = stale ? emptyDraft() : draft;
  if (state.phase !== "fight" || !state.fight) return null;

  // Casualty choice takes over the surface until resolved.
  const pair = state.fight.casualtyQueue?.[0];
  if (pair) {
    return (
      <div className="scv-fight" data-testid="fight-surface">
        <h3 className="scv-fight-hd">Round {state.fight.round - 1} — who is lost?</h3>
        <p className="scv-fight-sub">Your front line was overcome. Choose which creature falls — a die decides (4–6 grants your choice).</p>
        <div className="scv-fight-row">
          {pair.map((idx) => (
            <button key={idx} className="scv-fight-btn" onClick={() => dispatch({ type: "chooseCasualty", idx })}>
              Let {CREATURES[state.party[idx]!.creatureId]!.name} fall
            </button>
          ))}
        </div>
      </div>
    );
  }

  const livingIdx = living(state);
  const tray = freeMembers(draftNow, livingIdx);
  const matches = toMatches(draftNow);
  const valid = validatePlan(state, { matches });
  // How the round will actually be fought: the engine's strongest-combination for an out-numbered party
  // (so two foes ganging one fighter, and folded enemy magic, are shown before rolling).
  const preview = previewPlan(state, { matches });
  const enemyStrOf = (si: number) => CREATURES[state.strangers[si]!]!.fs + CREATURES[state.strangers[si]!]!.mp;
  const reason = valid.ok ? null : (REASON[valid.reason] ?? "That pairing isn't legal yet.");
  const retreats = legalActions(state).filter((a): a is Extract<GameAction, { type: "retreat" }> => a.type === "retreat");
  const artifacts = legalActions(state).filter((a): a is Extract<GameAction, { type: "useArtifact" }> => a.type === "useArtifact");

  const placeOn = (strangerIdx: number, role: "front" | "backer") => {
    if (sel === null) return;
    setDraft((d) => place(d, sel, strangerIdx, role));
    setSel(null);
  };
  const memberStrength = (i: number, spectre: boolean) => (spectre && isCaster(state, i) ? casterMP(state.party[i]!, state) : frontStrength(state.party[i]!, state));

  return (
    <div className="scv-fight" data-testid="fight-surface">
      <div className="scv-fight-top">
        <h3 className="scv-fight-hd">⚔ Fight · Round {state.fight.round}</h3>
        {state.fight.round === 1 && state.fight.surprise !== 0 && (
          <span className={`scv-fight-banner ${state.fight.surprise === 1 ? "good" : "bad"}`}>
            {state.fight.surprise === 1 ? "You took them by surprise — +1 this round" : "The strangers surprised you — −1 this round"}
          </span>
        )}
      </div>

      <div className="scv-fight-strangers">
        {/* Each battle reads left-to-right: the foe(s), the strength tally, the front line facing them,
            then a slot BEHIND the front line for a magic user (caster) to support from. Foes the engine
            ganged on (§395) appear in the same row when the party is out-numbered. */}
        {preview.matches.map((pm) => {
          const primary = pm.strangers[0]!;
          const spectre = pm.strangers.some((si) => state.strangers[si] === C_SPECTRE);
          const key = `m${primary}`;
          const showRelic = (r: { id: number; file: string; name: string }) => setZoom({ key, file: r.file, name: r.name });
          return (
            <div key={key} className="scv-match">
              <div className="scv-match-foes">
                {pm.strangers.map((si) => (
                  <FightCard key={si} creatureId={state.strangers[si]!} kind="foe" strength={enemyStrOf(si)}
                             caption={state.strangers[si] === C_SPECTRE ? "magic only" : pm.attached.includes(si) ? "gangs up" : undefined}
                             dim={pm.attached.includes(si)} cards={cards} state={state} />
                ))}
              </div>
              <div className="scv-match-vs"><span className="them">{pm.enemyStr}</span><span className="x">vs</span><span className="me">{pm.partyStr}</span></div>
              <div className="scv-match-party">
                <div className="scv-match-line">
                  <div className="scv-match-front" data-testid={`front-${primary}`} role="button" tabIndex={0}
                       onClick={() => placeOn(primary, "front")} onKeyDown={(e) => { if (e.key === "Enter") placeOn(primary, "front"); }}
                       onDragOver={(e) => e.preventDefault()} onDrop={() => placeOn(primary, "front")}>
                    {[0, 1].map((slot) => {
                      const i = pm.front[slot];
                      return i !== undefined ? (
                        <FightCard key={slot} creatureId={state.party[i]!.creatureId} kind={kindOf(state, i)} strength={memberStrength(i, spectre)}
                                   treasure={state.party[i]!.treasure} cards={cards} state={state} onRelicClick={showRelic} onPick={() => setDraft((d) => unplace(d, i))} />
                      ) : <span key={slot} className="scv-slot-empty">drop a fighter</span>;
                    })}
                  </div>
                  <div className="scv-match-bg" data-testid={`bg-${primary}`} role="button" tabIndex={0}
                       onClick={() => placeOn(primary, "backer")} onKeyDown={(e) => { if (e.key === "Enter") placeOn(primary, "backer"); }}
                       onDragOver={(e) => e.preventDefault()} onDrop={() => placeOn(primary, "backer")}>
                    <span className="scv-match-slotlbl">✦ behind</span>
                    {pm.backers.length ? pm.backers.map((i) => (
                      <FightCard key={i} creatureId={state.party[i]!.creatureId} kind="caster" strength={casterMP(state.party[i]!, state)}
                                 treasure={state.party[i]!.treasure} cards={cards} state={state} onRelicClick={showRelic} onPick={() => setDraft((d) => unplace(d, i))} />
                    )) : <span className="scv-match-hint">magic user</span>}
                  </div>
                </div>
                {pm.modifiers.length > 0 && (
                  <div className="scv-match-mods" data-testid={`mods-${primary}`}>
                    {pm.modifiers.map((mod, k) => (
                      <span key={k} className={`scv-mod scv-mod-${mod.side}${mod.roll ? " is-roll" : ""}`} title={mod.roll ? "applied to the die roll" : "included in the strength"}>
                        {mod.label}{mod.value !== 0 ? ` ${mod.value > 0 ? "+" : "−"}${Math.abs(mod.value)}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {zoom?.key === key && (
                <div className="scv-match-zoom" role="button" tabIndex={0} title={zoom.name}
                     onClick={() => setZoom(null)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setZoom(null); }}>
                  <img src={zoom.file} alt={zoom.name} />
                  <span className="scv-match-zoom-cap">{zoom.name} — tap to close</span>
                </div>
              )}
            </div>
          );
        })}
        {/* Foes not yet engaged — drop a fighter on one to take it on. */}
        {preview.idle.map((si) => (
          <div key={`i${si}`} className="scv-match scv-match-idle">
            <div className="scv-match-foes">
              <FightCard creatureId={state.strangers[si]!} kind="foe" strength={enemyStrOf(si)}
                         caption={state.strangers[si] === C_SPECTRE ? "magic only" : "unengaged"} dim cards={cards} state={state} />
            </div>
            <div className="scv-match-vs"><span className="them">{enemyStrOf(si)}</span><span className="x">vs</span><span className="me">0</span></div>
            <div className="scv-match-party">
              <div className="scv-match-line">
                <div className="scv-match-front" data-testid={`front-${si}`} role="button" tabIndex={0}
                     onClick={() => placeOn(si, "front")} onKeyDown={(e) => { if (e.key === "Enter") placeOn(si, "front"); }}
                     onDragOver={(e) => e.preventDefault()} onDrop={() => placeOn(si, "front")}>
                  {[0, 1].map((slot) => <span key={slot} className="scv-slot-empty">drop a fighter</span>)}
                </div>
                <div className="scv-match-bg" data-testid={`bg-${si}`} role="button" tabIndex={0}
                     onClick={() => placeOn(si, "backer")} onKeyDown={(e) => { if (e.key === "Enter") placeOn(si, "backer"); }}
                     onDragOver={(e) => e.preventDefault()} onDrop={() => placeOn(si, "backer")}>
                  <span className="scv-match-slotlbl">✦ behind</span>
                  <span className="scv-match-hint">magic user</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="scv-fight-tray" data-testid="fight-tray">
        <span className="scv-fight-cap">Your party — tap a fighter then a foe (or drag):</span>
        {tray.length ? tray.map((i) => (
          <FightCard key={i} testId={`tray-${i}`} creatureId={state.party[i]!.creatureId} kind={kindOf(state, i)} strength={frontStrength(state.party[i]!, state)}
                     treasure={state.party[i]!.treasure} cards={cards} state={state} draggable selected={sel === i}
                     onPick={() => setSel(sel === i ? null : i)} />
        )) : <span className="scv-fight-hint">all fighters assigned</span>}
      </div>

      {reason && <p className="scv-fight-reason">{reason}</p>}

      <div className="scv-fight-actions">
        <button className="scv-fight-btn primary" disabled={!valid.ok} onClick={() => dispatch({ type: "resolveRound", matches })}>
          Roll the round ⚔
        </button>
        {retreats.length > 0 && (
          <div className="scv-retreat">
            <button className="scv-fight-btn" onClick={() => setRetreatOpen((o) => !o)}>Retreat ▾</button>
            {retreatOpen && (
              <div className="scv-retreat-menu" data-testid="retreat-menu">
                {retreats.map((a) => (
                  <button key={a.dir} className="scv-fight-btn" onClick={() => dispatch(a)}>{DIR_NAME[a.dir]}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <button className="scv-fight-btn ghost" onClick={() => { setDraft(emptyDraft()); setSel(null); }}>Reset</button>
        {artifacts.map((a, i) => (
          <button key={i} className="scv-fight-btn" onClick={() => dispatch(a)}>Use artefact</button>
        ))}
      </div>
    </div>
  );
}
