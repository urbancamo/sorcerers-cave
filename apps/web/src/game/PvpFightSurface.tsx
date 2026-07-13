import { useEffect, useState } from "react";
import {
  CREATURES, frontStrength, casterMP, isCaster, decodeArea,
  DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN,
  type GameState, type PartyMember, type PvpSession, type PvpView,
} from "@sorcerers-cave/engine";
import { memberLabels } from "./memberLabels";
import { PARTY_COLOR_HEX, type PartyColor } from "./partyColors";
import { loadManifest, resolveCardVariant, type CardArt } from "../data/manifest";

/**
 * Two-sided PvP fight surface (spec §I-10). Participants only — a non-participant never receives
 * the session, so there is no read-only variant here. The three layout steps run in the engine's
 * fixed order (defender line → attacker engage → defender casters); each stage waits on ONE side
 * via the session's reaction window, so exactly one of the two players sees live controls while
 * the other sees a countdown. Member addressing follows the session: "seat:idx" strings.
 */

export type { PvpView }; // re-exported for the MultiplayerPlay wiring

/** The MpActions this surface dispatches (sent through api.multiplayer.act, like the trade verbs). */
export type PvpUiAction =
  | { type: "pvpLine"; line: string[] }
  | { type: "pvpEngage"; engagements: { attackers: string[]; defenders: string[] }[]; backers: { caster: string; at: number }[] }
  | { type: "pvpCasters"; backers: { caster: string; at: number }[] }
  | { type: "pvpRetreat"; dir: number }
  | { type: "pvpProposeStop" }
  | { type: "pvpAcceptStop" };

export interface PvpPartyChip { seat: number; name: string; color: string }

const DIR_OPTIONS: [number, string][] = [
  [DIR_N, "North"], [DIR_E, "East"], [DIR_S, "South"], [DIR_W, "West"],
  [DIR_UP, "Up the stair"], [DIR_DOWN, "Down the stair"],
];

/** Live countdown to a reaction-window deadline (spec §1.3) — re-renders once a second. */
function useCountdown(deadline: number | null): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (deadline == null) { setLeft(null); return; }
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline]);
  return left;
}

const idxOf = (id: string): number => Number(id.slice(id.indexOf(":") + 1));
const alive = (m?: PartyMember): boolean => !!m && (m.status === 0 || m.status === 1);

/** An in-progress attacker pairing: one row per prospective engagement (1–2 foes vs 0–2 fighters). */
interface EngageRow { defenders: string[]; attackers: string[]; backers: string[] }

export function PvpFightSurface({
  session, pvp, youSeat, parties, yourState, dispatch,
}: {
  session: PvpSession;
  pvp: PvpView | null;
  youSeat: number;
  parties: PvpPartyChip[];
  /** Your composed party view — the source of your own members, strengths and the area's exits. */
  yourState: GameState;
  dispatch: (a: PvpUiAction) => void;
}) {
  const youSide: "attacker" | "defender" = session.attacker.includes(youSeat) ? "attacker" : "defender";
  const rivalSeats = youSide === "attacker" ? session.defender : session.attacker;

  // Layout state, reset whenever the session advances (a new stage or a fresh round).
  const [heldBack, setHeldBack] = useState<Set<string>>(new Set()); // defender: casters kept out of the line
  const [rows, setRows] = useState<EngageRow[] | null>(null);       // attacker: engagement builder
  const [sel, setSel] = useState<string | null>(null);              // tap-selected own member id
  const [casterAt, setCasterAt] = useState<Record<string, number>>({}); // defender step 3: caster → engagement
  const [retreatOpen, setRetreatOpen] = useState(false);
  useEffect(() => {
    setHeldBack(new Set()); setRows(null); setSel(null); setCasterAt({}); setRetreatOpen(false);
  }, [session.stage, session.round]);

  // Card art (progressive enhancement, like PartyPanel/ScoreDetail): chips show the actual creature
  // card when the manifest loads, and fall back to the text label when it can't (e.g. in tests).
  const [cardArt, setCardArt] = useState<CardArt[]>([]);
  useEffect(() => {
    let live = true;
    loadManifest().then(({ cards }) => { if (live) setCardArt(cards); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const left = useCountdown(session.window?.deadline ?? null);

  // Whose move the current stage is (the window's seat always sits on this side).
  const acting: "attacker" | "defender" | null =
    session.stage === "attackerEngage" ? "attacker"
    : session.stage === "defenderLine" || session.stage === "defenderCasters" ? "defender"
    : null;
  const yourMove = acting === youSide;

  const seatColor = (seat: number) => PARTY_COLOR_HEX[(parties.find((p) => p.seat === seat)?.color ?? "yellow") as PartyColor];
  const commandName = (seats: number[]) => seats.map((s) => parties.find((p) => p.seat === s)?.name ?? `Seat ${s}`).join(" + ");
  const rivalName = commandName(rivalSeats);
  const attName = pvp?.attackerName ?? commandName(session.attacker);
  const defName = pvp?.defenderName ?? commandName(session.defender);

  // Your command's living members, addressed the session's way. (Commands are single-seat until
  // unions land, so your whole command is exactly your composed party.)
  const labels = memberLabels(yourState.party);
  const myLiving = yourState.party
    .map((m, idx) => ({ m, id: `${youSeat}:${idx}`, idx }))
    .filter(({ m }) => alive(m));
  const myIds = myLiving.map((x) => x.id);
  const isMine = (id: string) => id.startsWith(`${youSeat}:`);
  const memberOf = (id: string) => yourState.party[idxOf(id)];

  // Rival identity comes from pvp.cards — the creature cards themselves are never concealed, even
  // in serious play ("players need keep on display in their parties only their creature cards",
  // rulebook §Hidden Cards). Engagement names remain the fallback for a mid-flight stale view.
  const rivalNames = new Map<string, string>();
  for (const e of pvp?.engagements ?? []) {
    e.attackers.forEach((id, i) => rivalNames.set(id, e.attackerNames[i] ?? "?"));
    e.defenders.forEach((id, i) => rivalNames.set(id, e.defenderNames[i] ?? "?"));
  }
  const cardOf = (id: string): { creatureId: number; copy: number } | null => {
    if (isMine(id)) {
      const m = memberOf(id);
      if (!m) return null;
      let copy = 0;
      for (let i = 0; i < idxOf(id); i++) if (yourState.party[i]!.creatureId === m.creatureId) copy++;
      return { creatureId: m.creatureId, copy };
    }
    return pvp?.cards?.[id] ?? null;
  };
  const artOf = (id: string): string | null => {
    const c = cardOf(id);
    return c ? (resolveCardVariant("creature", c.creatureId, c.copy, cardArt)?.file ?? null) : null;
  };
  const nameOf = (id: string): string => {
    if (isMine(id)) return labels[idxOf(id)] ?? CREATURES[memberOf(id)?.creatureId ?? -1]?.name ?? "?";
    const c = pvp?.cards?.[id];
    if (c) return (CREATURES[c.creatureId]?.name ?? "?") + (c.copy > 0 ? ` #${c.copy + 1}` : "");
    return rivalNames.get(id) ?? `Fighter ${idxOf(id) + 1}`;
  };
  // The rival roster this side can see right now: the laid-out line plus anyone named in an engagement.
  const rivalKnown = [...new Set([
    ...(youSide === "attacker" ? session.defenderLine : []),
    ...session.engagements.flatMap((e) => (youSide === "attacker" ? e.defenders : e.attackers)),
    ...(youSide === "attacker" ? session.defenderBackers : session.attackerBackers).map((b) => b.caster),
  ])];

  // --- shared chip renderers ----------------------------------------------------------------------

  // `tid` keys the data-testid by context (roster/tray/zone) so the same member never yields two
  // identical test handles when it appears both in the roster and in an interactive slot.
  const myChip = (id: string, opts: { onPick?: () => void; picked?: boolean; disabled?: boolean; title?: string; note?: string; tid?: string } = {}) => {
    const m = memberOf(id)!;
    const caster = isCaster(m);
    return (
      <button key={id} type="button" data-testid={`pvp-${opts.tid ?? "mem"}-${id}`}
        className={"scv-pvp-chip mine" + (caster ? " caster" : "") + (opts.picked ? " picked" : "")}
        style={{ borderColor: seatColor(youSeat) }}
        disabled={opts.disabled} title={opts.title}
        onClick={opts.onPick}>
        {artOf(id) && <span className="scv-pvp-thumb"><img src={artOf(id)!} alt="" /></span>}
        {caster ? "✦ " : ""}{nameOf(id)}
        <b>{caster ? casterMP(m, yourState) || frontStrength(m, yourState) : frontStrength(m, yourState)}</b>
        {opts.note && <i>{opts.note}</i>}
      </button>
    );
  };

  const rivalChip = (id: string, opts: { onPick?: () => void; picked?: boolean; disabled?: boolean; tid?: string } = {}) => (
    <button key={id} type="button" data-testid={`pvp-${opts.tid ?? "foe"}-${id}`}
      className={"scv-pvp-chip foe" + (opts.picked ? " picked" : "")}
      style={{ borderColor: seatColor(Number(id.slice(0, id.indexOf(":")))) }}
      disabled={opts.disabled || !opts.onPick}
      onClick={opts.onPick}>
      {artOf(id) && <span className="scv-pvp-thumb"><img src={artOf(id)!} alt="" /></span>}
      {nameOf(id)}
    </button>
  );

  // --- stage: defender lays the line (step 1) -------------------------------------------------------

  const line = myIds.filter((id) => !heldBack.has(id));
  const toggleHeld = (id: string) => {
    setHeldBack((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const renderLineStage = () => (
    <div className="scv-pvp-stage" data-testid="pvp-line-stage">
      <p className="scv-fight-sub">Lay out your line of battle — every fighter must stand in it. Tap a ✦ caster to hold it back.</p>
      <div className="scv-fight-tray">
        {myLiving.map(({ m, id }) =>
          myChip(id, {
            tid: "line",
            onPick: isCaster(m) ? () => toggleHeld(id) : undefined,
            disabled: !isCaster(m),
            title: isCaster(m) ? undefined : "Every fighting creature must stand in the line of battle",
            picked: !heldBack.has(id),
            note: heldBack.has(id) ? "held back" : undefined,
          }))}
      </div>
      {heldBack.size > 0 && (
        <p className="scv-fight-reason">
          A Priest or Wizard may wait in the background only while your command outnumbers the
          attackers — the Cave will refuse this line otherwise, and you will lay it out again.
        </p>
      )}
      <button className="scv-fight-btn primary" data-testid="pvp-submit" disabled={line.length === 0}
        onClick={() => dispatch({ type: "pvpLine", line })}>
        Form the line ⚔
      </button>
    </div>
  );

  // --- stage: attacker engages the line (step 2) -----------------------------------------------------

  // One builder row per line member; ganging (1 fighter vs 2 foes) merges a row into the one above.
  const rowsNow: EngageRow[] = rows ?? session.defenderLine.map((id) => ({ defenders: [id], attackers: [], backers: [] }));
  const placedIds = new Set(rowsNow.flatMap((r) => [...r.attackers, ...r.backers]));
  const tray = myIds.filter((id) => !placedIds.has(id));
  // Numerical advantage, as well as this side can know it: the defender's hidden casters exist only
  // when the DEFENDER outnumbers, so against an honest line the line length is the whole command.
  const advantage = myIds.length > session.defenderLine.length;
  const canFront = (r: EngageRow) => r.attackers.length < 2 && !(r.defenders.length === 2 && r.attackers.length === 1);
  const pull = (rs: EngageRow[], id: string): EngageRow[] =>
    rs.map((r) => ({ ...r, attackers: r.attackers.filter((x) => x !== id), backers: r.backers.filter((x) => x !== id) }));
  const placeFront = (ri: number) => {
    if (sel === null || !canFront(rowsNow[ri]!)) return;
    const rs = pull(rowsNow, sel);
    setRows(rs.map((r, i) => (i === ri ? { ...r, attackers: [...r.attackers, sel] } : r)));
    setSel(null);
  };
  const placeBack = (ri: number) => {
    if (sel === null || !advantage || !isCaster(memberOf(sel)!)) return;
    const rs = pull(rowsNow, sel);
    setRows(rs.map((r, i) => (i === ri ? { ...r, backers: [...r.backers, sel] } : r)));
    setSel(null);
  };
  const unplace = (id: string) => { setRows(pull(rowsNow, id)); setSel(null); };
  const canGangUp = (ri: number) =>
    ri > 0 && rowsNow[ri]!.attackers.length === 0 && rowsNow[ri]!.backers.length === 0 && rowsNow[ri]!.defenders.length === 1
    && rowsNow[ri - 1]!.defenders.length === 1 && rowsNow[ri - 1]!.attackers.length <= 1;
  const gangUp = (ri: number) => {
    if (!canGangUp(ri)) return;
    setRows(rowsNow.flatMap((r, i) =>
      i === ri - 1 ? [{ ...r, defenders: [...r.defenders, ...rowsNow[ri]!.defenders] }] : i === ri ? [] : [r]));
  };
  const split = (ri: number) => {
    const r = rowsNow[ri]!;
    if (r.defenders.length !== 2) return;
    setRows(rowsNow.flatMap((x, i) =>
      i === ri ? [{ ...x, defenders: [x.defenders[0]!] }, { defenders: [x.defenders[1]!], attackers: [], backers: [] }] : [x]));
  };

  const engagedRows = rowsNow.filter((r) => r.attackers.length > 0);
  const strayBacker = rowsNow.some((r) => r.attackers.length === 0 && r.backers.length > 0);
  const freeFighters = tray.length > 0;
  const unengagedLine = rowsNow.some((r) => r.attackers.length === 0);
  // Mirror of the engine's mustEngageAll: a line member may go unengaged only when every fighter is committed.
  const engageReason =
    engagedRows.length === 0 ? "Send at least one fighter against the line."
    : strayBacker ? "A caster can only back a foe your fighters are engaging."
    : unengagedLine && freeFighters ? "Engage every line member you can — commit your remaining fighters (or gang two foes on one)."
    : null;
  const submitEngage = () => {
    const engagements = engagedRows.map((r) => ({ attackers: r.attackers, defenders: r.defenders }));
    const backers = engagedRows.flatMap((r, at) => r.backers.map((caster) => ({ caster, at })));
    dispatch({ type: "pvpEngage", engagements, backers });
  };

  const renderEngageStage = () => (
    <div className="scv-pvp-stage" data-testid="pvp-engage-stage">
      <p className="scv-fight-sub">
        {defName} has formed a line. Tap a fighter, then a foe, to engage — one or two against one,
        one against two, never two against two.
      </p>
      <div className="scv-pvp-rows">
        {rowsNow.map((r, ri) => (
          <div key={r.defenders.join("+")} className={"scv-match scv-pvp-row" + (r.attackers.length === 0 ? " scv-match-idle" : "")}>
            <div className="scv-match-foes">
              {r.defenders.map((id) => rivalChip(id, { tid: "def" }))}
              {r.defenders.length === 2 && (
                <button type="button" className="scv-pvp-mini" onClick={() => split(ri)}>split</button>
              )}
              {canGangUp(ri) && (
                <button type="button" className="scv-pvp-mini" title="Send the fighter above against this foe too (one against two)"
                  onClick={() => gangUp(ri)}>gang ↑</button>
              )}
            </div>
            <div className="scv-match-vs"><span className="x">vs</span></div>
            <div className="scv-pvp-zone front" data-testid={`pvp-front-${ri}`} role="button" tabIndex={0}
              aria-disabled={sel !== null && !canFront(r)}
              onClick={() => placeFront(ri)}
              onKeyDown={(e) => { if (e.key === "Enter") placeFront(ri); }}>
              {r.attackers.length
                ? r.attackers.map((id) => myChip(id, { tid: "set", onPick: () => unplace(id) }))
                : <span className="scv-slot-empty">{sel !== null && !canFront(r) ? "not two against two" : "tap to engage"}</span>}
            </div>
            {advantage && (
              <div className="scv-pvp-zone back" data-testid={`pvp-back-${ri}`} role="button" tabIndex={0}
                onClick={() => placeBack(ri)}
                onKeyDown={(e) => { if (e.key === "Enter") placeBack(ri); }}>
                <span className="scv-match-slotlbl">✦ behind</span>
                {r.backers.length
                  ? r.backers.map((id) => myChip(id, { tid: "set", onPick: () => unplace(id) }))
                  : <span className="scv-match-hint">caster</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="scv-fight-tray" data-testid="pvp-tray">
        <span className="scv-fight-cap">Your command — tap a fighter, then a foe:</span>
        {tray.length
          ? tray.map((id) => myChip(id, { tid: "tray", onPick: () => setSel(sel === id ? null : id), picked: sel === id }))
          : <span className="scv-fight-hint">everyone is committed</span>}
      </div>
      {!advantage && <p className="scv-fight-sub">Casters may back an engagement only when you outnumber the defenders — everyone fights.</p>}
      {engageReason && <p className="scv-fight-reason">{engageReason}</p>}
      <button className="scv-fight-btn primary" data-testid="pvp-submit" disabled={engageReason !== null} onClick={submitEngage}>
        Send them in ⚔
      </button>
    </div>
  );

  // --- stage: defender assigns background casters (step 3) --------------------------------------------

  const myBackground = myIds.filter((id) => !session.defenderLine.includes(id) && isCaster(memberOf(id)!));
  const assignCaster = (ei: number) => {
    if (sel === null) return;
    setCasterAt((c) => ({ ...c, [sel]: ei }));
    setSel(null);
  };
  const renderCastersStage = () => (
    <div className="scv-pvp-stage" data-testid="pvp-casters-stage">
      {myBackground.length ? (
        <p className="scv-fight-sub">Assign your background casters' magical power — tap a ✦ caster, then an engagement. This fights the round.</p>
      ) : (
        <p className="scv-fight-sub">No casters wait in your background — let the round be fought.</p>
      )}
      {renderEngagements(assignCaster)}
      {myBackground.length > 0 && (
        <div className="scv-fight-tray">
          {myBackground.map((id) =>
            myChip(id, {
              tid: "cast",
              onPick: () => setSel(sel === id ? null : id),
              picked: sel === id,
              note: casterAt[id] !== undefined ? `→ clash ${casterAt[id]! + 1}` : undefined,
            }))}
          {Object.keys(casterAt).length > 0 && (
            <button type="button" className="scv-fight-btn ghost" onClick={() => setCasterAt({})}>Reset</button>
          )}
        </div>
      )}
      <button className="scv-fight-btn primary" data-testid="pvp-submit"
        onClick={() => dispatch({ type: "pvpCasters", backers: Object.entries(casterAt).map(([caster, at]) => ({ caster, at })) })}>
        {myBackground.length ? "Loose the magic — fight the round ⚔" : "Fight the round ⚔"}
      </button>
    </div>
  );

  // --- laid-out engagements (read-only rows with the strength preview once pvp carries it) -------------

  const renderEngagements = (onRow?: (ei: number) => void) => (
    <div className="scv-pvp-rows">
      {session.engagements.map((e, ei) => {
        const v = pvp?.engagements[ei];
        const yoursAtt = youSide === "attacker";
        const attBackers = session.attackerBackers.filter((b) => b.at === ei).map((b) => b.caster);
        const defBackers = session.defenderBackers.filter((b) => b.at === ei).map((b) => b.caster);
        const pending = Object.entries(casterAt).filter(([, at]) => at === ei).map(([c]) => c);
        return (
          <div key={ei} className={"scv-match scv-pvp-row" + (onRow ? " scv-pvp-row-target" : "")}
            data-testid={`pvp-eng-${ei}`}
            role={onRow ? "button" : undefined} tabIndex={onRow ? 0 : undefined}
            onClick={onRow ? () => onRow(ei) : undefined}
            onKeyDown={onRow ? (e) => { if (e.key === "Enter") onRow(ei); } : undefined}>
            <div className="scv-match-foes">
              {(yoursAtt ? e.defenders : e.attackers).map((id) => rivalChip(id, { tid: "efoe" }))}
              {(yoursAtt ? defBackers : attBackers).map((id) => rivalChip(id, { tid: "efoe" }))}
            </div>
            <div className="scv-match-vs">
              <span className="them">{v ? (yoursAtt ? v.defenderStr : v.attackerStr) : "?"}</span>
              <span className="x">vs</span>
              <span className="me">{v ? (yoursAtt ? v.attackerStr : v.defenderStr) : "?"}</span>
            </div>
            <div className="scv-pvp-zone front">
              {(yoursAtt ? e.attackers : e.defenders).map((id) => (isMine(id) ? myChip(id, { tid: "eng" }) : rivalChip(id, { tid: "eng" })))}
              {(yoursAtt ? attBackers : defBackers).map((id) => (isMine(id) ? myChip(id, { tid: "eng", note: "✦ backs" }) : rivalChip(id, { tid: "eng" })))}
              {pending.map((id) => myChip(id, { tid: "eng", note: "✦ backs", onPick: () => setCasterAt((c) => { const n = { ...c }; delete n[id]; return n; }) }))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // --- waiting on the other side -----------------------------------------------------------------------

  const renderWaiting = () => (
    <div className="scv-pvp-stage scv-pvp-wait" data-testid="pvp-wait">
      <p className="scv-pvp-waittext">
        {session.stage === "resolved"
          ? "The round is being fought…"
          : <>«{rivalName}» is deploying…{left !== null && <b> {left}s</b>}</>}
      </p>
      {session.engagements.length > 0 && renderEngagements()}
      {session.stage === "attackerEngage" && youSide === "defender" && session.defenderLine.length > 0 && (
        <div className="scv-fight-tray">
          <span className="scv-fight-cap">Your line of battle:</span>
          {session.defenderLine.map((id) => (isMine(id) ? myChip(id, { tid: "wl" }) : rivalChip(id, { tid: "wl" })))}
        </div>
      )}
    </div>
  );

  // --- round-boundary actions (retreat / truce, spec I-10/I-11) ------------------------------------------

  const boundary = session.stage === "defenderLine" && session.round > 1;
  const area = yourState.areas[yourState.partyArea];
  const dec = area ? decodeArea(area.card) : null;
  const exits = dec
    ? DIR_OPTIONS.filter(([d]) =>
        d === DIR_N ? dec.n : d === DIR_E ? dec.e : d === DIR_S ? dec.s : d === DIR_W ? dec.w
        : d === DIR_UP ? dec.stairUp : dec.stairDown)
    : [];
  const stopBy = session.stopProposedBy;
  const stopByYourSide = stopBy !== null &&
    (youSide === "attacker" ? session.attacker.includes(stopBy) : session.defender.includes(stopBy));
  const boundaryActions = (boundary || (stopBy !== null && !stopByYourSide)) && (
    <div className="scv-fight-actions scv-pvp-boundary">
      {boundary && exits.length > 0 && (
        <div className="scv-retreat">
          <button className="scv-fight-btn" data-testid="pvp-retreat" onClick={() => setRetreatOpen((o) => !o)}>Retreat ▾</button>
          {retreatOpen && (
            <div className="scv-retreat-menu" data-testid="pvp-retreat-menu">
              {exits.map(([d, name]) => (
                <button key={d} className="scv-fight-btn" onClick={() => dispatch({ type: "pvpRetreat", dir: d })}>{name}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {stopBy !== null && !stopByYourSide ? (
        <button className="scv-fight-btn" data-testid="pvp-truce" onClick={() => dispatch({ type: "pvpAcceptStop" })}>
          Accept truce — end the fight
        </button>
      ) : boundary && stopBy === null ? (
        <button className="scv-fight-btn" data-testid="pvp-truce" onClick={() => dispatch({ type: "pvpProposeStop" })}>
          Propose truce
        </button>
      ) : boundary && stopByYourSide ? (
        <span className="scv-fight-hint">Truce offered — awaiting {rivalName}…</span>
      ) : null}
    </div>
  );

  return (
    <div className="scv-fight scv-pvp" data-testid="pvp-surface">
      <div className="scv-fight-top">
        <h3 className="scv-fight-hd">⚔ {attName} attacks {defName}</h3>
        <span className="scv-pvp-round">Round {session.round} · you are the {youSide}</span>
        {session.round === 1 && session.surprise !== 0 && (
          <span className={`scv-fight-banner ${youSide === "attacker" ? "good" : "bad"}`}>
            {youSide === "attacker" ? "You took them by surprise — +1 this round" : `${attName} surprised you — they get +1 this round`}
          </span>
        )}
      </div>

      <div className="scv-pvp-rosters">
        <div className="scv-pvp-roster">
          <h4 style={{ color: seatColor(youSeat) }}><i style={{ background: seatColor(youSeat) }} />Your command</h4>
          <div className="scv-pvp-chips">{myLiving.map(({ id }) => myChip(id))}</div>
        </div>
        <div className="scv-pvp-roster">
          <h4 style={{ color: seatColor(rivalSeats[0]!) }}><i style={{ background: seatColor(rivalSeats[0]!) }} />{rivalName}</h4>
          <div className="scv-pvp-chips">
            {rivalKnown.length
              ? rivalKnown.map((id) => rivalChip(id))
              : <span className="scv-fight-hint">their deployment is hidden until it is laid</span>}
          </div>
        </div>
      </div>

      {yourMove && session.stage === "defenderLine" && renderLineStage()}
      {yourMove && session.stage === "attackerEngage" && renderEngageStage()}
      {yourMove && session.stage === "defenderCasters" && renderCastersStage()}
      {!yourMove && renderWaiting()}

      {boundaryActions}
    </div>
  );
}
