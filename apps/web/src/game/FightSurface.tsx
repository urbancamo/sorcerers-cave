import { useEffect, useState } from "react";
import {
  CREATURES, legalActions, validatePlan, frontStrength, casterMP,
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
  // Re-pair from scratch each round (§Between rounds): clear the draft whenever a new round begins, so
  // last round's pairing — and any member slain in it — never lingers on the surface.
  const round = state.fight?.round;
  useEffect(() => { setDraft(emptyDraft()); setSel(null); setRetreatOpen(false); }, [round]);
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
  const tray = freeMembers(draft, livingIdx);
  const matches = toMatches(draft);
  const valid = validatePlan(state, { matches });
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
        {state.strangers.map((sid, si) => {
          const spectre = sid === C_SPECTRE;
          const g = draft.byStranger[si] ?? { front: [], backers: [] };
          const partyStr = g.front.reduce((s, i) => s + memberStrength(i, spectre), 0) + g.backers.reduce((s, i) => s + casterMP(state.party[i]!, state), 0);
          const enemyStr = CREATURES[sid]!.fs + CREATURES[sid]!.mp;
          return (
            <div key={si} className="scv-match">
              <FightCard creatureId={sid} kind="foe" strength={enemyStr} caption={spectre ? "magic only" : undefined} cards={cards} state={state} />
              <div className="scv-match-vs"><span className="me">{partyStr}</span> vs <span className="them">{enemyStr}</span></div>
              <div className="scv-match-front" data-testid={`front-${si}`} role="button" tabIndex={0}
                   onClick={() => placeOn(si, "front")} onKeyDown={(e) => { if (e.key === "Enter") placeOn(si, "front"); }}
                   onDragOver={(e) => e.preventDefault()} onDrop={() => placeOn(si, "front")}>
                {g.front.length ? g.front.map((i) => (
                  <FightCard key={i} creatureId={state.party[i]!.creatureId} kind={kindOf(state, i)} strength={memberStrength(i, spectre)}
                             treasure={state.party[i]!.treasure} cards={cards} state={state} onPick={() => setDraft((d) => unplace(d, i))} />
                )) : <span className="scv-match-hint">drop a fighter</span>}
              </div>
              <div className="scv-match-bg" data-testid={`bg-${si}`} role="button" tabIndex={0}
                   onClick={() => placeOn(si, "backer")} onKeyDown={(e) => { if (e.key === "Enter") placeOn(si, "backer"); }}
                   onDragOver={(e) => e.preventDefault()} onDrop={() => placeOn(si, "backer")}>
                ✦ {g.backers.length ? g.backers.map((i) => CREATURES[state.party[i]!.creatureId]!.name).join(", ") + ` (+${g.backers.reduce((s, i) => s + casterMP(state.party[i]!, state), 0)})` : "background magic"}
              </div>
            </div>
          );
        })}
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
