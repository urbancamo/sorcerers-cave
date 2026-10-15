import { useEffect, useRef, useState } from "react";
// ALL_CREATURES/ALL_TREASURES (SC-EXT-29): a kit id or a Ghoul can stand in any fight.
import {
  ALL_CREATURES, ALL_TREASURES, legalActions, fightView, freeOf, legalMoves, legalPairs, deployViolation, engageViolation, redeployViolation,
  type GameState, type GameAction, type UnitView,
} from "@sorcerers-cave/engine";
import type { CardArt } from "../data/manifest";
import { FightCard } from "./FightCard";
import { ConfirmButton } from "./ConfirmButton";
import { memberLabels } from "./memberLabels";
import { holyWaterTargetName } from "./holyWaterLabel";

// Peter's revised fighting rules (variants.combatRevision, engine spec SC-9.7-*): a fight is a series of rounds, each a few decisions —
// the Scroll (attacker), the defender's front line, the attacker's pairings, then either side's extra creatures — and the matches are
// fought at the end. This surface asks the party for whichever of them the engine is waiting on.

const SCROLL_CONFIRM = "Destroys every enemy here save the magical — and curses the party.";
const DIR_NAME: Record<number, string> = { 1: "North", 2: "East", 3: "South", 4: "West", 5: "Up the stair", 6: "Down the stair" };

type Move = { creature: number; match: number; back: boolean };
type Pair = { party: number; stranger: number };
type Retreat = Extract<GameAction, { type: "retreat" }>;
type UseArtifact = Extract<GameAction, { type: "useArtifact" }>;

export function RevisedFightSurface({ state, dispatch, cards }: { state: GameState; dispatch: (a: GameAction) => void; cards: CardArt[] }) {
  const fight = state.fight, rev = fight?.rev;
  const [picked, setPicked] = useState<number | null>(null);   // a party creature tapped, waiting for its foe
  const [chosen, setChosen] = useState<number[]>([]);          // deploy: the creatures to stand in front
  const [pairs, setPairs] = useState<Pair[]>([]);              // engage: the pairings so far
  const [moves, setMoves] = useState<Move[]>([]);              // redeploy: the placements so far
  const [retreatOpen, setRetreatOpen] = useState(false);

  // A new decision (or a changed line-up) starts from a clean slate, so no choice made for the last one lingers.
  const key = fight ? `${fight.round}|${fight.pending?.kind ?? ""}|${fight.pending?.by ?? ""}|${state.party.map((m) => m.status).join("")}|${state.strangers.join(",")}` : "";
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) { setPicked(null); setChosen([]); setPairs([]); setMoves([]); setRetreatOpen(false); lastKey.current = key; }
  }, [key]);
  const stale = lastKey.current !== key;   // render this pass from a clean slate, before the effect has run

  if (state.phase !== "fight" || !fight || !rev) return null;

  const labels = memberLabels(state.party);
  const view = fightView(state);
  const partyUnits = new Map<number, UnitView>(view.party.map((u) => [u.index, u]));
  const strangerUnits = new Map<number, UnitView>(view.strangers.map((u) => [u.index, u]));
  const copyIdx = (ids: readonly number[]): Map<number, number> => {
    const out = new Map<number, number>(), tally = new Map<number, number>();
    ids.forEach((id, i) => { const k = tally.get(id) ?? 0; out.set(i, k); tally.set(id, k + 1); });
    return out;
  };
  const partyCopy = copyIdx(state.party.map((m) => m.creatureId)), strangerCopy = copyIdx(state.strangers);
  const partyCard = (i: number, extra: { onPick?: () => void; selected?: boolean; testId?: string; dim?: boolean; caption?: string } = {}) => (
    <FightCard key={`p${i}`} creatureId={state.party[i]!.creatureId} label={labels[i]} kind={partyUnits.get(i)?.caster ? "caster" : "ally"}
               strength={partyUnits.get(i)?.strength ?? 0} treasure={state.party[i]!.treasure} cards={cards} state={state} variantIdx={partyCopy.get(i)} {...extra} />
  );
  const strangerCard = (s: number, extra: { onPick?: () => void; selected?: boolean; testId?: string; dim?: boolean; caption?: string } = {}) => (
    <FightCard key={`s${s}`} creatureId={state.strangers[s]!} kind="foe" strength={strangerUnits.get(s)?.strength ?? 0}
               treasure={[...(fight.gear?.[s] ?? [])]} cards={cards} state={state} variantIdx={strangerCopy.get(s)} {...extra} />
  );

  // Casualty choice takes over the surface until resolved (same rule as the battle plan: a die decides, 4-6 grants the choice).
  const pair = fight.casualtyQueue?.[0];
  if (pair) {
    return (
      <div className="scv-fight" data-testid="rev-fight">
        <h3 className="scv-fight-hd">Who is lost?</h3>
        <p className="scv-fight-sub">Your front line was overcome. Choose which creature falls — a die decides (4–6 grants your choice).</p>
        <div className="scv-fight-row">
          {pair.map((idx) => (
            <button key={idx} className="scv-fight-btn" onClick={() => dispatch({ type: "chooseCasualty", idx })}>
              Let {labels[idx] ?? ALL_CREATURES[state.party[idx]!.creatureId]!.name} fall
            </button>
          ))}
        </div>
      </div>
    );
  }

  const pending = fight.pending;
  const mine = pending?.by === "party" ? pending : null;
  const deciding = pending?.by === "strangers";
  const free = freeOf(state, "party");
  const deployedFoes = rev.deployed.strangers.filter((s) => !rev.matches.some((m) => m.sf.includes(s)));
  const inPairs = (list: Pair[]) => new Set(list.map((p) => p.party));
  const usedPairs = stale ? [] : pairs, usedChosen = stale ? [] : chosen, usedMoves = stale ? [] : moves;

  // --- the decisions ------------------------------------------------------------------------------------------------------------
  const tapFree = (i: number): void => {
    if (mine?.kind === "deploy") setChosen((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
    else if (mine?.kind === "engage" && !inPairs(usedPairs).has(i)) setPicked(picked === i ? null : i);
  };
  const tapFoe = (s: number): void => {
    if (mine?.kind !== "engage" || picked === null || !legalPairs(state, "party").some((p) => p.party === picked && p.stranger === s)) return;
    setPairs([...usedPairs.filter((p) => p.stranger !== s), { party: picked, stranger: s }]);
    setPicked(null);
  };
  const engageBad = mine?.kind === "engage" ? engageViolation(state, "party", usedPairs) : "";
  const deployBad = mine?.kind === "deploy" ? deployViolation(state, "party", usedChosen) : "";
  const allMoves = mine?.kind === "redeploy" ? legalMoves(state, "party") : [];
  const redeployBad = mine?.kind === "redeploy" ? redeployViolation(state, "party", usedMoves) : "";
  const toggleMove = (m: Move): void => {
    const same = (x: Move) => x.creature === m.creature && x.match === m.match && x.back === m.back;
    if (usedMoves.some(same)) { setMoves(usedMoves.filter((x) => !same(x))); return; }
    const next = [...usedMoves.filter((x) => x.creature !== m.creature), m];   // one placement per creature
    if (redeployViolation(state, "party", next) === null) setMoves(next);
  };

  const retreats = legalActions(state).filter((a): a is Retreat => a.type === "retreat");
  const artifacts = legalActions(state).filter((a): a is UseArtifact => a.type === "useArtifact" && a.artifact !== 19);   // the Scroll is a round step here
  const strangerNames = (ss: readonly number[]) => ss.map((s) => ALL_CREATURES[state.strangers[s]!]!.name).join(" + ");

  const bonus = view.partyDieBonus;
  const inMatch = new Set(rev.matches.flatMap((m) => [...m.pf, ...m.pb]));
  const foeInMatch = new Set(rev.matches.flatMap((m) => [...m.sf, ...m.sb]));
  const idleFoes = view.strangers.map((u) => u.index).filter((s) => !foeInMatch.has(s));

  return (
    <div className="scv-fight scv-rev" data-testid="rev-fight">
      <div className="scv-fight-top">
        <h3 className="scv-fight-hd">⚔ Fight · Round {fight.round}</h3>
        {fight.round === 1 && fight.surprise !== 0 && (
          <span className={`scv-fight-banner ${fight.surprise === 1 ? "good" : "bad"}`}>
            {fight.surprise === 1 ? "You took them by surprise — +1 this round" : "The strangers surprised you — −1 this round"}
          </span>
        )}
        <span className="scv-fight-cap">{rev.attacker === "party" ? "You attack" : "They attack"} · your dice {bonus >= 0 ? "+" : "−"}{Math.abs(bonus)}</span>
      </div>

      {rev.matches.length > 0 && (
        <div className="scv-rev-matches" data-testid="rev-matches">
          {rev.matches.map((m, mi) => (
            <div key={mi} className="scv-rev-match">
              <div className="scv-rev-side">{[...m.pf, ...m.pb].map((i) => partyCard(i, { caption: m.pb.includes(i) ? "behind" : undefined }))}</div>
              <div className="scv-match-vs">
                <span className="them">{view.matches[mi]?.strangerStrength}</span><span className="x">vs</span><span className="me">{view.matches[mi]?.partyStrength}</span>
              </div>
              <div className="scv-rev-side">{[...m.sf, ...m.sb].map((s) => strangerCard(s, { caption: m.sb.includes(s) ? "behind" : undefined }))}</div>
            </div>
          ))}
        </div>
      )}

      {idleFoes.length > 0 && (
        <div className="scv-fight-tray" data-testid="rev-foes">
          <span className="scv-fight-cap">The strangers{rev.deployed.strangers.length ? " — those in front are marked" : ""}:</span>
          {idleFoes.map((s) => {
            const front = rev.deployed.strangers.includes(s) && deployedFoes.includes(s);
            const paired = usedPairs.find((p) => p.stranger === s);
            return strangerCard(s, {
              testId: `rev-foe-${s}`, dim: !front, selected: !!paired || undefined,
              caption: paired ? `vs ${labels[paired.party]}` : front ? "in front" : undefined,
              onPick: mine?.kind === "engage" && front ? () => tapFoe(s) : undefined,
            });
          })}
        </div>
      )}

      {mine?.kind === "scroll" && (
        <div className="scv-rev-decision" data-testid="rev-scroll">
          <p className="scv-fight-sub">Read the Scroll before the round? Either use curses the party, and it cannot be read again in this area.</p>
          <div className="scv-fight-actions">
            <ConfirmButton className="scv-fight-btn primary" label="Destroy the unmagical" confirmText={SCROLL_CONFIRM} onConfirm={() => dispatch({ type: "scroll", use: "destroy" })} />
            {mine.surprise && <button className="scv-fight-btn" onClick={() => dispatch({ type: "scroll", use: "surprise" })}>Take the surprise bonus (+1)</button>}
            <button className="scv-fight-btn ghost" onClick={() => dispatch({ type: "scroll", use: "decline" })}>Don't read it</button>
          </div>
        </div>
      )}

      {free.length > 0 && !(mine?.kind === "scroll") && (
        <div className="scv-fight-tray" data-testid="rev-tray">
          <span className="scv-fight-cap">
            {mine?.kind === "deploy" ? `Tap the creatures to put in your front line (at least ${mine.min}):`
              : mine?.kind === "engage" ? "Tap a fighter, then the foe to face it:"
              : "Your creatures not yet in a match:"}
          </span>
          {free.map((i) => {
            const taken = inPairs(usedPairs).has(i);
            return partyCard(i, {
              testId: `rev-free-${i}`, dim: taken || (rev.deployed.party.includes(i) && mine?.kind !== "deploy"),
              selected: picked === i || usedChosen.includes(i) || undefined,
              caption: taken ? `vs ${strangerNames([usedPairs.find((p) => p.party === i)!.stranger])}` : rev.deployed.party.includes(i) ? "in front" : undefined,
              onPick: mine?.kind === "deploy" || mine?.kind === "engage" ? () => tapFree(i) : undefined,
            });
          })}
        </div>
      )}
      {free.length === 0 && inMatch.size === 0 && <span className="scv-fight-hint">no creature is free</span>}

      {mine?.kind === "redeploy" && (
        <div className="scv-rev-decision" data-testid="rev-redeploy">
          <p className="scv-fight-sub">Send spare creatures into a match, or a caster behind one. You need not move anyone.</p>
          <div className="scv-rev-moves">
            {allMoves.map((m) => {
              const on = usedMoves.some((x) => x.creature === m.creature && x.match === m.match && x.back === m.back);
              return (
                <button key={`${m.creature}-${m.match}-${m.back}`} data-testid={`rev-place-${m.creature}-${m.match}-${m.back ? "b" : "f"}`}
                        className={`scv-fight-btn${on ? " primary" : ""}`} aria-pressed={on} onClick={() => toggleMove(m)}>
                  {m.back ? "Put" : "Move"} {labels[m.creature]} {m.back ? "behind" : "into"} the match against {strangerNames(rev.matches[m.match]?.sf ?? [])}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {deciding && <p className="scv-fight-reason scv-fight-deciding" role="status">The strangers are deciding…</p>}
      {rev.standoff && (
        <p className="scv-fight-reason" data-testid="rev-standoff">
          A stalemate: no match can be decided any more. Retreat{retreats.length ? "" : " — if a way is open"}.
        </p>
      )}
      {mine?.kind === "engage" && engageBad && usedPairs.length > 0 && <p className="scv-fight-reason">{engageBad}</p>}
      {mine?.kind === "deploy" && usedChosen.length > 0 && deployBad && <p className="scv-fight-reason">{deployBad}</p>}

      <div className="scv-fight-actions">
        {mine?.kind === "deploy" && (
          <button className="scv-fight-btn primary" disabled={deployBad !== null} onClick={() => dispatch({ type: "deploy", creatures: usedChosen })}>
            Stand in the front line
          </button>
        )}
        {mine?.kind === "engage" && (
          <>
            <button className="scv-fight-btn primary" disabled={engageBad !== null} onClick={() => dispatch({ type: "engage", pairs: usedPairs })}>Fight ⚔</button>
            <button className="scv-fight-btn ghost" onClick={() => { setPairs([]); setPicked(null); }}>Undo pairings</button>
          </>
        )}
        {mine?.kind === "redeploy" && (
          <button className="scv-fight-btn primary" disabled={redeployBad !== null} onClick={() => dispatch({ type: "redeploy", moves: usedMoves })}>
            {usedMoves.length ? "Make these moves — roll the round ⚔" : "No changes — roll the round ⚔"}
          </button>
        )}
        {!deciding && retreats.length > 0 && (
          <div className="scv-retreat">
            <button className="scv-fight-btn" onClick={() => setRetreatOpen((o) => !o)}>Retreat ▾</button>
            {retreatOpen && (
              <div className="scv-retreat-menu" data-testid="retreat-menu">
                {retreats.map((a) => <button key={a.dir} className="scv-fight-btn" onClick={() => dispatch(a)}>{DIR_NAME[a.dir]}</button>)}
              </div>
            )}
          </div>
        )}
        {!deciding && artifacts.map((a, i) => {
          const nm = ALL_TREASURES[a.artifact]?.name ?? "artefact";
          const tgt = a.target === undefined ? null
            : a.artifact === 5 ? ALL_CREATURES[state.strangers[a.target]!]?.name ?? "a stranger"
            : a.artifact === 16 ? holyWaterTargetName(state, a.target, (mi) => labels[mi] ?? ALL_CREATURES[state.party[mi]?.creatureId ?? -1]?.name ?? "?")
            : (labels[a.target] ?? ALL_CREATURES[state.party[a.target]?.creatureId ?? -1]?.name ?? "?");
          return <button key={i} className="scv-fight-btn" onClick={() => dispatch(a)}>{tgt ? `${nm} → ${tgt}` : `Use ${nm}`}</button>;
        })}
      </div>
    </div>
  );
}
