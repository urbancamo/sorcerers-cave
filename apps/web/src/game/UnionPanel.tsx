import type { UnionProposal } from "@sorcerers-cave/engine";
import { useCountdown } from "./TradeModal";
import { DEFAULT_PARTY_COLOR, PARTY_COLOR_HEX, type PartyColor } from "./partyColors";

const hex = (c: string | undefined | null): string =>
  PARTY_COLOR_HEX[(c as PartyColor) ?? DEFAULT_PARTY_COLOR] ?? PARTY_COLOR_HEX[DEFAULT_PARTY_COLOR];

/** playView's `yourUnion` projection (spec I-6/I-7): names/colours resolved server-side. */
export interface UnionView {
  id: number;
  commander: number;
  commanderName: string;
  youAreCommander: boolean;
  members: { seat: number; name: string; color: string }[];
  /** Jointly-won allies awaiting the allocation handshake; the index IS the recruit id. */
  recruits: { name: string }[];
  dissolved: boolean;
  alloc: { recruit: number; to: number; approved: number[] } | null;
}

export interface UnionDispatch {
  respondUnion: (accept: boolean) => void;
  leaveUnion: () => void;
  dissolveUnion: () => void;
  allocateRecruit: (recruit: number, to: number) => void;
}

/**
 * The union surfaces (spec I-6/I-7): (a) the invitee's accept/decline prompt with the reaction
 * countdown (§1.3 — silence is refusal); (b) a compact HUD chip while united, with Leave (member)
 * or Dissolve (commander); (c) the ally-allocation modal after a dissolution with recruits —
 * every former member must confirm the SAME recruit→party pairing, a split vote goes neutral.
 * Rendered only from playView projections, so non-participants never see any of it.
 */
export function UnionPanel({
  proposal, union, youSeat, parties, dispatch,
}: {
  proposal: UnionProposal | null;
  union: UnionView | null;
  youSeat: number;
  parties: { seat: number; name: string; color: string }[];
  dispatch: UnionDispatch;
}) {
  const nameOf = (seat: number | undefined) =>
    parties.find((p) => p.seat === seat)?.name ?? "…";
  const left = useCountdown(proposal?.window?.deadline ?? null);

  // (a) You are invited and still to answer: the accept/decline prompt (spec I-6).
  if (proposal && proposal.invited.includes(youSeat)) {
    const proposer = proposal.accepted[0]; // the proposer implicitly accepted first
    return (
      <div className="scv-mp-modal" role="dialog" aria-label="union proposal" data-testid="union-proposal">
        <div className="scv-mp-modal-card">
          <h3 className="scv-hd">A union is proposed</h3>
          <p className="scv-muted">
            <b>{nameOf(proposer)}</b> proposes a union under <b>{nameOf(proposal.commander)}</b>&rsquo;s
            command. Joining forfeits your next turn; the commander then moves the combined force.
            You may leave again at any turn boundary.
          </p>
          {left !== null && <p className="scv-union-clock">answer within {left}s — silence is refusal</p>}
          <div className="scv-mp-modal-actions">
            <button className="scv-primary" data-testid="union-accept" onClick={() => dispatch.respondUnion(true)}>
              Accept — join the union
            </button>
            <button className="scv-primary ghost" data-testid="union-decline" onClick={() => dispatch.respondUnion(false)}>
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Proposer / already-answered participants: who the table is still waiting on. */}
      {proposal && !proposal.invited.includes(youSeat) && (
        <div className="scv-union-chip" data-testid="union-waiting">
          <span className="scv-union-cap">Union</span>
          <span>proposed — waiting on {nameOf(proposal.window?.seat)}…{left !== null ? ` ${left}s` : ""}</span>
        </div>
      )}
      {/* (b) The in-play union chip (spec I-7): commander, member colours, your role. */}
      {union && !union.dissolved && (
        <div className="scv-union-chip" data-testid="union-chip">
          <span className="scv-union-cap">Union</span>
          <span>· {union.commanderName} commanding</span>
          {union.members.map((m) => (
            <i key={m.seat} className="scv-union-dot" title={m.name} style={{ background: hex(m.color) }} />
          ))}
          <span className="scv-union-role">{union.youAreCommander ? "you command" : "under command"}</span>
          {union.youAreCommander ? (
            <button className="scv-mp-here-act" data-testid="union-dissolve" onClick={dispatch.dissolveUnion}>
              Dissolve
            </button>
          ) : (
            <button className="scv-mp-here-act" data-testid="union-leave" onClick={dispatch.leaveUnion}>
              Leave union
            </button>
          )}
        </div>
      )}
      {/* (c) The ally-allocation handshake after dissolution (spec I-7). */}
      {union && union.dissolved && union.recruits.length > 0 && (
        <div className="scv-mp-modal" role="dialog" aria-label="ally allocation" data-testid="union-alloc">
          <div className="scv-mp-modal-card">
            <h3 className="scv-hd">Divide the allies won together</h3>
            <p className="scv-muted">
              Every former member must agree the same home for each ally — a split vote turns the
              ally neutral, left behind where the union dissolved.
            </p>
            {union.recruits.map((r, ri) => {
              const pending = union.alloc?.recruit === ri ? union.alloc : null;
              return (
                <div key={ri} className="scv-union-recruit">
                  <span className="scv-union-recruit-name">{r.name}</span>
                  {union.members.map((m) => {
                    const isPending = pending?.to === m.seat;
                    const youAgreed = !!isPending && pending!.approved.includes(youSeat);
                    return (
                      <button
                        key={m.seat}
                        type="button"
                        className={"scv-union-seat" + (isPending ? " pending" : "")}
                        // One allocation settles at a time (the engine holds other recruits back).
                        disabled={youAgreed || (!!union.alloc && union.alloc.recruit !== ri)}
                        title={isPending
                          ? `Agree: ${r.name} joins ${m.name}`
                          : `Propose ${r.name} joins ${m.name}`}
                        data-testid={`alloc-${ri}-${m.seat}`}
                        onClick={() => dispatch.allocateRecruit(ri, m.seat)}
                      >
                        → {m.name}{isPending ? ` (${pending!.approved.length}/${union.members.length})` : ""}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
