import { useEffect, useState } from "react";
import { ALL_CREATURES, ALL_TREASURES, type TradeSession, type GameState } from "@sorcerers-cave/engine";

/** Live countdown to a reaction-window deadline (spec §1.3) — re-renders once a second.
 *  Shared with UnionPanel (the union proposal runs on the same reaction-window plumbing). */
export function useCountdown(deadline: number | null): number | null {
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

export interface TradeDispatch {
  updateBasket: (treasure: number[], members: number[]) => void;
  confirm: () => void;
  cancel: () => void;
}

/**
 * Two-sided trade modal (spec I-5): your cards | their offer, click-to-toggle into your basket,
 * both-confirm to commit atomically. Any basket edit clears both confirms (the engine enforces it;
 * the UI mirrors that so the button state never lies). Only the two participants ever see this.
 */
export function TradeModal({
  session, youSeat, yourState, otherName,
  dispatch,
}: {
  session: TradeSession;
  youSeat: number;
  /** Your composed party view — the source of what you CAN offer. */
  yourState: GameState;
  otherName: string;
  dispatch: TradeDispatch;
}) {
  const youAreA = session.a === youSeat;
  const mine = youAreA ? session.basketA : session.basketB;
  const theirs = youAreA ? session.basketB : session.basketA;
  const myConfirmed = youAreA ? session.confirmedA : session.confirmedB;
  const otherConfirmed = youAreA ? session.confirmedB : session.confirmedA;
  const left = useCountdown(session.window?.deadline ?? null);

  // Everything your party holds, flattened to offerable rows.
  const holdings = yourState.party.flatMap((m, mi) =>
    m.status === 0 || m.status === 1
      ? m.treasure.map((tid, ti) => ({ key: `${mi}:${ti}`, tid, owner: ALL_CREATURES[m.creatureId]?.name ?? "?" }))
      : [],
  );
  const offerableMembers = yourState.party
    .map((m, mi) => ({ m, mi }))
    .filter(({ m }) => m.status === 0 || m.status === 1);

  const toggleTreasure = (tid: number) => {
    const has = mine.treasure.includes(tid);
    dispatch.updateBasket(has ? mine.treasure.filter((t) => t !== tid) : [...mine.treasure, tid], mine.members);
  };
  const toggleMember = (mi: number) => {
    const has = mine.members.includes(mi);
    dispatch.updateBasket(mine.treasure, has ? mine.members.filter((i) => i !== mi) : [...mine.members, mi]);
  };

  const name = (tid: number) => ALL_TREASURES[tid]?.name ?? `#${tid}`;

  return (
    <div className="scv-mp-modal" role="dialog" aria-label="trade" data-testid="trade-modal">
      <div className="scv-mp-modal-card scv-trade">
        <h3 className="scv-hd">Trade with {otherName}</h3>
        {left !== null && <p className="scv-trade-clock">offer expires in {left}s</p>}
        <div className="scv-trade-cols">
          <div className="scv-trade-col" data-testid="trade-yours">
            <h4>You give</h4>
            {holdings.map(({ key, tid, owner }) => (
              <button key={key} type="button"
                className={"scv-trade-item" + (mine.treasure.includes(tid) ? " offered" : "")}
                onClick={() => toggleTreasure(tid)}>
                {name(tid)} <span className="scv-trade-owner">({owner})</span>
              </button>
            ))}
            {offerableMembers.map(({ m, mi }) => (
              <button key={`m${mi}`} type="button"
                className={"scv-trade-item member" + (mine.members.includes(mi) ? " offered" : "")}
                onClick={() => toggleMember(mi)}>
                {ALL_CREATURES[m.creatureId]?.name ?? "?"} <span className="scv-trade-owner">(creature)</span>
              </button>
            ))}
            {holdings.length === 0 && offerableMembers.length === 0 && <p className="scv-muted">nothing to offer</p>}
          </div>
          <div className="scv-trade-col" data-testid="trade-theirs">
            <h4>{otherName} gives</h4>
            {theirs.treasure.map((tid, i) => <div key={i} className="scv-trade-item incoming">{name(tid)}</div>)}
            {theirs.members.map((mi, i) => <div key={`m${i}`} className="scv-trade-item member incoming">creature #{mi}</div>)}
            {theirs.treasure.length === 0 && theirs.members.length === 0 && <p className="scv-muted">nothing yet</p>}
          </div>
        </div>
        <div className="scv-mp-modal-actions">
          <button className="scv-primary" disabled={myConfirmed} onClick={dispatch.confirm} data-testid="trade-confirm">
            {myConfirmed ? "Waiting for the other side…" : otherConfirmed ? "Confirm — they have agreed" : "Confirm trade"}
          </button>
          <button className="scv-primary ghost" onClick={dispatch.cancel}>Call it off</button>
        </div>
        {otherConfirmed && !myConfirmed && <p className="scv-trade-note">{otherName} has confirmed this exchange.</p>}
      </div>
    </div>
  );
}
