import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
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

  // The Ghouls are identical and carry nothing, so when every free creature of the party can be paired and a Ghoul is left for each,
  // WHICH Ghoul it faces changes nothing: the pairing is made for the party instead of asking. (Short of Ghouls, who faces one is a real choice.)
  const autoPairs: Pair[] | null = (() => {
    if (state.phase !== "fight" || !fight?.ghouls || !rev || fight.pending?.by !== "party" || fight.pending.kind !== "engage" || fight.casualtyQueue?.length) return null;
    const fronts = rev.deployed.strangers.filter((x) => !rev.matches.some((m) => m.sf.includes(x) || m.sb.includes(x)));
    const mine = freeOf(state, "party");
    if (!mine.length || mine.length > fronts.length) return null;
    const out: Pair[] = [], used = new Set<number>();
    for (const a of mine) {
      const foe = fronts.find((x) => !used.has(x) && legalPairs(state, "party").some((q) => q.party === a && q.stranger === x));
      if (foe === undefined) return null;
      used.add(foe); out.push({ party: a, stranger: foe });
    }
    return engageViolation(state, "party", out) === null ? out : null;
  })();
  // The Ghouls are announced before anything is rolled; the pairing waits until the player has faced them. `sent` makes the pairing go out once
  // per decision — React's StrictMode runs an effect twice in development, and a second copy would be refused (its creatures already engaged).
  const [seen, setSeen] = useState(false);
  const hasGhouls = !!fight?.ghouls;
  useEffect(() => { if (!hasGhouls) setSeen(false); }, [hasGhouls]);
  const introDue = hasGhouls && fight!.round === 1 && !seen;
  const sent = useRef("");
  useEffect(() => {
    if (!autoPairs || introDue || sent.current === key) return;
    sent.current = key;
    dispatch({ type: "engage", pairs: autoPairs });
  }, [key, autoPairs !== null, introDue]);   // eslint-disable-line react-hooks/exhaustive-deps

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
  const partyCard = (i: number, extra: { onPick?: () => void; selected?: boolean; testId?: string; dim?: boolean; caption?: string; draggable?: boolean; dragId?: number } = {}) => (
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
  // Drop on the front line: only a free creature, and only once.
  const dropFront = (raw: string): void => {
    const i = Number(raw);
    if (raw === "" || Number.isNaN(i) || !free.includes(i) || usedChosen.includes(i)) return;
    setChosen([...usedChosen, i]);
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
  // Redeploy by drag-and-drop (or tap a spare creature, then a slot): the move is legal only if the engine lists it.
  const moveOk = (c: number, mi: number, back: boolean): boolean => allMoves.some((m) => m.creature === c && m.match === mi && m.back === back);
  const placeMove = (mi: number, back: boolean, dragged?: string): void => {
    const raw = dragged ?? "";
    const c = raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : picked;
    setPicked(null);
    if (c === null || !moveOk(c, mi, back)) return;
    const next = [...usedMoves.filter((x) => x.creature !== c), { creature: c, match: mi, back }];
    if (redeployViolation(state, "party", next) === null) setMoves(next);
  };
  const slotProps = (mi: number, back: boolean, tid: string) => mine?.kind !== "redeploy" ? {} : {
    "data-testid": tid, role: "button", tabIndex: 0,
    onClick: () => placeMove(mi, back),
    onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter") placeMove(mi, back); },
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: (e: DragEvent) => { e.preventDefault(); placeMove(mi, back, e.dataTransfer.getData("application/x-scv-member")); },
  };
  const addedTo = (mi: number, back: boolean) => usedMoves.filter((x) => x.match === mi && x.back === back).map((x) => x.creature);
  const takeBack = (c: number) => setMoves(usedMoves.filter((x) => x.creature !== c));

  const retreats = legalActions(state).filter((a): a is Retreat => a.type === "retreat");
  const artifacts = legalActions(state).filter((a): a is UseArtifact => a.type === "useArtifact" && a.artifact !== 19);   // the Scroll is a round step here
  const strangerNames = (ss: readonly number[]) => ss.map((s) => ALL_CREATURES[state.strangers[s]!]!.name).join(" + ");

  const bonus = view.partyDieBonus;
  const inMatch = new Set(rev.matches.flatMap((m) => [...m.pf, ...m.pb]));
  const foeInMatch = new Set(rev.matches.flatMap((m) => [...m.sf, ...m.sb]));
  const idleFoes = view.strangers.map((u) => u.index).filter((s) => !foeInMatch.has(s));

  // Rows run strongest-leader first (top), and within a row the leader stands right-most, beside the "vs": the leader is the stranger of
  // highest leaderPri, ties to the first drawn (SC-8.2-1) — the one the whole group reacts as.
  const leadRank = (ss: readonly number[]): number => Math.max(...ss.map((x) => ALL_CREATURES[state.strangers[x]!]?.leaderPri ?? 0));
  const leaderFirst = (ss: readonly number[]): number[] => [...ss].sort((a, b) =>
    (ALL_CREATURES[state.strangers[b]!]?.leaderPri ?? 0) - (ALL_CREATURES[state.strangers[a]!]?.leaderPri ?? 0) || a - b);
  const renderMatch = (m: typeof rev.matches[number], mi: number) => (

          <div key={`m${mi}`} className="scv-match">
            <div className="scv-match-foes">
              <div className="scv-match-line">
                <div className="scv-match-bg">
                  <span className="scv-match-slotlbl">✦ behind</span>
                  {m.sb.length ? m.sb.map((s) => strangerCard(s)) : <span className="scv-match-hint">magic user</span>}
                </div>
                <div className="scv-match-front">{leaderFirst(m.sf).reverse().map((s) => strangerCard(s))}</div>
              </div>
            </div>
            <div className="scv-match-vs">
              <span className="them">{view.matches[mi]?.strangerStrength}</span><span className="x">vs</span><span className="me">{view.matches[mi]?.partyStrength}</span>
            </div>
            <div className="scv-match-party">
              <div className="scv-match-line">
                <div className="scv-match-front" {...slotProps(mi, false, `rev-mfront-${mi}`)}>
                  {m.pf.map((i) => partyCard(i))}
                  {addedTo(mi, false).map((i) => partyCard(i, { caption: "joining — tap to undo", onPick: () => takeBack(i) }))}
                  {/* The front holds two positions, as in the battle plan: empty ones only fill it out, so a second fighter never widens the row. */}
                  {mine?.kind === "redeploy" && Array.from({ length: Math.max(0, 2 - m.pf.length - addedTo(mi, false).length) }, (_, k) => (
                    <span key={`e${k}`} className="scv-slot-empty">drop a creature</span>
                  ))}
                </div>
                <div className="scv-match-bg" {...slotProps(mi, true, `rev-mback-${mi}`)}>
                  <span className="scv-match-slotlbl">✦ behind</span>
                  {[...m.pb, ...addedTo(mi, true)].map((i) => partyCard(i, m.pb.includes(i) ? {} : { caption: "joining — tap to undo", onPick: () => takeBack(i) }))}
                  {m.pb.length + addedTo(mi, true).length === 0 && <span className="scv-match-hint">magic user</span>}
                </div>
              </div>
            </div>
          </div>
          );
  const renderIdle = (s: number) => {

          const front = deployedFoes.includes(s);
          const paired = usedPairs.find((p) => p.stranger === s);
          const target = mine?.kind === "engage" && front;
          const struck = strangerUnits.get(s)?.strength ?? 0;
          return (
            <div key={`i${s}`} className={`scv-match${paired ? "" : " scv-match-idle"}`} data-testid={`rev-row-${s}`}>
              <div className="scv-match-foes">
                <div className="scv-match-line">
                  <div className="scv-match-bg">
                    <span className="scv-match-slotlbl">✦ behind</span>
                    <span className="scv-match-hint">magic user</span>
                  </div>
                  <div className="scv-match-front">
                    {strangerCard(s, {
                      testId: `rev-foe-${s}`, dim: !front && !paired,
                      caption: front ? "in front" : rev.deployed.strangers.length ? "held back" : undefined,
                      onPick: target ? () => tapFoe(s) : undefined,
                    })}
                  </div>
                </div>
              </div>
              <div className="scv-match-vs">
                <span className="them">{struck}</span><span className="x">vs</span>
                <span className="me">{paired ? partyUnits.get(paired.party)?.strength ?? 0 : 0}</span>
              </div>
              <div className="scv-match-party">
                <div className="scv-match-line">
                  <div className="scv-match-front" data-testid={`rev-slot-${s}`} role={target ? "button" : undefined} tabIndex={target ? 0 : undefined}
                       onClick={target ? () => (paired && picked === null ? setPairs(usedPairs.filter((p) => p !== paired)) : tapFoe(s)) : undefined}
                       onKeyDown={target ? (e) => { if (e.key === "Enter") tapFoe(s); } : undefined}>
                    {paired
                      ? partyCard(paired.party, { caption: "tap to take back" })
                      : <span className="scv-slot-empty">{target ? "pick a creature, then tap here" : "—"}</span>}
                  </div>
                  <div className="scv-match-bg">
                    <span className="scv-match-slotlbl">✦ behind</span>
                    <span className="scv-match-hint">magic user</span>
                  </div>
                </div>
              </div>
            </div>
          );
          };
  const rows = [
    ...rev.matches.map((m, mi) => ({ lead: leadRank(m.sf), first: Math.min(...m.sf), el: renderMatch(m, mi) })),
    ...idleFoes.map((s) => ({ lead: leadRank([s]), first: s, el: renderIdle(s) })),
  ].sort((a, b) => b.lead - a.lead || a.first - b.first);

  return (
    <div className="scv-fight scv-rev" data-testid="rev-fight">
      {introDue && (
        <div className="scv-ghouls" role="dialog" aria-label="The Ghouls attack" data-testid="ghouls-intro">
          <div className="scv-ghouls-mist" aria-hidden="true" />
          <div className="scv-ghouls-card">
            <div className="scv-ghouls-skull" aria-hidden="true">☠</div>
            <h2 className="scv-ghouls-title">The Ghouls attack!</h2>
            <p className="scv-ghouls-lede">They boil out of the dark: <b>{state.strangers.length}</b> of them, one for every creature in your party.</p>
            <ul className="scv-ghouls-facts">
              <li>Each Ghoul fights at <b>strength 2</b>, and neither side has surprise.</li>
              <li>Each of your creatures will face one — <b>whoever loses a duel is slain</b>.</li>
              <li>Your <b>heavy treasure is dropped</b> for the fight; you can take it back if you win.</li>
              <li>Win or flee, the Ghouls stay here and <b>attack the next party</b> that comes in.</li>
            </ul>
            <button className="scv-fight-btn primary" autoFocus onClick={() => setSeen(true)}>Face the Ghouls ☠</button>
          </div>
        </div>
      )}
      <div className="scv-fight-top">
        <h3 className="scv-fight-hd">⚔ Fight · Round {fight.round}</h3>
        {fight.round === 1 && fight.surprise !== 0 && (
          <span className={`scv-fight-banner ${fight.surprise === 1 ? "good" : "bad"}`}>
            {fight.surprise === 1 ? "You took them by surprise — +1 this round" : "The strangers surprised you — −1 this round"}
          </span>
        )}
        <span className="scv-fight-cap">{rev.attacker === "party" ? "You attack" : "They attack"} · your dice {bonus >= 0 ? "+" : "−"}{Math.abs(bonus)}</span>
      </div>

      {/* One row per combat, as in the original battle plan: the foe(s) on the left, the strength tally, then the party's side.
          Matches already in play come first, then every stranger not yet in one (a pairing under way shows in its row). */}
      <div className="scv-fight-strangers" data-testid="rev-matches">
        {rows.map((r) => r.el)}
      </div>

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

      {mine?.kind === "deploy" && (
        <div className="scv-match-front scv-rev-frontline" data-testid="rev-frontline"
             onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dropFront(e.dataTransfer.getData("application/x-scv-member")); }}>
          <span className="scv-match-slotlbl">⚔ your front line (at least {mine.min})</span>
          {usedChosen.map((i) => partyCard(i, { testId: `rev-front-${i}`, caption: "tap to take back", onPick: () => tapFree(i) }))}
          {usedChosen.length < mine.min && <span className="scv-slot-empty">drag creatures here</span>}
        </div>
      )}

      {free.length > 0 && !(mine?.kind === "scroll") && (
        <div className="scv-fight-tray" data-testid="rev-tray">
          <span className="scv-fight-cap">
            {mine?.kind === "deploy" ? "Drag creatures into your front line (or tap them):"
              : mine?.kind === "engage" ? "Tap a fighter, then the foe to face it:"
              : mine?.kind === "redeploy" ? "Spare creatures — drag one onto a match (or tap it, then the match):"
              : "Your creatures not yet in a match:"}
          </span>
          {free.filter((i) => mine?.kind !== "deploy" || !usedChosen.includes(i)).map((i) => {
            const taken = inPairs(usedPairs).has(i);
            const redeployable = mine?.kind === "redeploy" && allMoves.some((m) => m.creature === i) && !usedMoves.some((x) => x.creature === i);
            return partyCard(i, {
              testId: `rev-free-${i}`, dim: taken || usedMoves.some((x) => x.creature === i) || (rev.deployed.party.includes(i) && mine?.kind !== "deploy"),
              selected: picked === i || usedChosen.includes(i) || undefined,
              caption: taken ? `vs ${strangerNames([usedPairs.find((p) => p.party === i)!.stranger])}` : rev.deployed.party.includes(i) ? "in front" : undefined,
              onPick: mine?.kind === "deploy" || mine?.kind === "engage" ? () => tapFree(i)
                : redeployable ? () => setPicked(picked === i ? null : i) : undefined,
              draggable: redeployable || mine?.kind === "deploy" || undefined, dragId: i,
            });
          })}
        </div>
      )}
      {free.length === 0 && inMatch.size === 0 && <span className="scv-fight-hint">no creature is free</span>}

      {mine?.kind === "redeploy" && (
        <div className="scv-rev-decision" data-testid="rev-redeploy">
          <p className="scv-fight-sub">
            {allMoves.length
              ? "Drag a spare creature onto a match to send it in — a caster can go in the \"behind\" slot. You need not move anyone."
              : "Nothing to arrange — every creature is already in a match. Fight on, or retreat."}
          </p>
        </div>
      )}

      {deciding && <p className="scv-fight-reason scv-fight-deciding" role="status">The strangers are deciding…</p>}
      {autoPairs && !introDue && <p className="scv-fight-reason scv-fight-deciding" role="status">The Ghouls close in — each of your creatures faces one…</p>}
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
            <button className="scv-fight-btn primary" disabled={engageBad !== null} onClick={() => dispatch({ type: "engage", pairs: usedPairs })}>Confirm pairings</button>
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
