import type { PartyMember } from "./state";

/**
 * Interaction sessions (spec §1.2 Tier C, §4; plan WS-2/3/4). A session is a short-lived,
 * synchronised sub-game scoped to its PARTICIPANT seats only — every other seat keeps playing.
 * Exactly one session may be active per game (`MpGameState.session`); an area cannot host two
 * simultaneous interactions any more than a table could.
 *
 * Reaction windows (spec §1.3): every state that waits on a specific seat carries a window with a
 * server-set epoch-ms deadline. The engine never reads the clock — Convex stamps `deadline` when it
 * opens the window and a scheduled job (or the lazy overdue check on any later mutation) fires the
 * auto-default when it passes. Auto-defaults NEVER dead-stop: a trade offer expires (declined), a
 * PvP layout auto-deploys strongest-fights-strongest and rolls from the owner's own dice substream.
 */
export interface ReactionWindow {
  seat: number;      // who we are waiting on
  deadline: number;  // epoch ms, stamped by the server when the window opened
  kind: "tradeRespond" | "unionRespond" | "pvpLayout" | "pvpCasters" | "allocRespond";
}

/** One side's basket in a trade: treasure ids + party member indices (creature cards are tradeable
 *  too — "players … may trade any cards that they hold", §Trading Cards). */
export interface TradeBasket {
  treasure: number[]; // treasure ids offered (must be held by the offering party)
  members: number[];  // party indices offered (living or ally; traded creatures keep status/kills)
}

/** A two-seat trade session (spec I-5). Lifecycle: proposed → (respond/counter)* → both-confirm →
 *  atomic commit | expire. The Eye of God traded here brings NO curse on the giver (§Trading Cards). */
export interface TradeSession {
  kind: "trade";
  area: number;              // both parties must stand here throughout
  a: number; b: number;      // participant seats (a proposed)
  basketA: TradeBasket;      // what a gives to b
  basketB: TradeBasket;      // what b gives to a
  confirmedA: boolean;       // both must be true at commit; any basket edit clears both
  confirmedB: boolean;
  window: ReactionWindow | null; // waiting on the other side to respond/confirm
}

/**
 * A PvP fight session (spec I-9/I-10; built in M4). A command is one party or a union (M5); the
 * fight is always exactly two commands. Rounds alternate ownership; each layout step waits on one
 * side via a reaction window. Filled in by multi-fight.ts — kept here so the session union is total.
 */
export interface PvpSession {
  kind: "pvp";
  area: number;
  attacker: number[];        // seats in the attacking command (length 1, or a union's members)
  defender: number[];        // seats in the defending command
  round: number;             // 1-based; round 1 belongs to the attacker (§"first round … attacker's turn")
  activeSide: "attacker" | "defender"; // whose round is being fought
  surprise: number;          // +1 attacker in round 1 only, when not following (pvpSurprise)
  stage: "defenderLine" | "attackerEngage" | "defenderCasters" | "resolved";
  // Layout for the round in progress (member indices are per-seat: [seat, partyIdx] pairs flattened
  // to stable ids "seat:idx" strings for cross-party addressing).
  defenderLine: string[];    // defender's front line, in display order
  engagements: { attackers: string[]; defenders: string[] }[]; // attacker's pairings
  attackerBackers: { caster: string; at: number }[];  // caster → engagement index (direction SPECIFIED)
  defenderBackers: { caster: string; at: number }[];  // assigned after the attacker (direction chosen last)
  window: ReactionWindow | null;
  stopProposedBy: number | null; // a side may propose ending the fight at a round boundary (§I-10)
}

/** A union-formation handshake or ally-allocation negotiation (spec I-6/I-7; built in M5). */
export interface UnionProposal {
  kind: "unionProposal";
  area: number;
  commander: number;         // proposed commander seat
  invited: number[];         // seats still to answer
  accepted: number[];        // seats that said yes
  window: ReactionWindow | null;
}

export type Session = TradeSession | PvpSession | UnionProposal;

/** An active union (spec I-6/I-7): the commander moves the combined force on their own turn; each
 *  other member forfeited one turn to join. Lives beside (not inside) `session` — a union persists
 *  across many turns, a session does not. */
export interface Union {
  id: number;
  commander: number;
  members: number[];         // includes the commander
  // Allies recruited WHILE united (per §I-7 these are divided by agreement on dissolution; members'
  // original creatures never transfer). Each entry: which seat's party array currently hosts it.
  recruits: { seat: number; partyIdx: number }[];
  // M5 loan bookkeeping: while united, each subordinate's LIVING members are moved into the
  // commander's party array (the "loan"), so every existing code path — stranger fights, PvP,
  // pickups — sees the combined force through the commander's composed view. Each entry records
  // the owning seat and the member's index in the commander's array; the invariant that makes the
  // indices stable is that solo play only ever APPENDS to a party array (allies joining) and never
  // splices it (trading is blocked while united for exactly this reason). Loans are spliced back
  // out (dead or alive — casualties are the owner's loss) on leave/dissolve.
  onLoan: { fromSeat: number; idx: number }[];
  // Dissolution residue (I-7): when a union with recruits dissolves, the record stays behind
  // (dissolved=true, loans already returned) so the allocation handshake can settle who gets each
  // jointly-won ally. `area` pins where the dissolution happened (neutral recruits park there);
  // `alloc` is the pending commander-or-anyone proposal awaiting every member's matching confirm.
  dissolved?: boolean;
  area?: number;
  alloc?: { recruit: number; to: number; approved: number[] } | null;
}

/** A guard detachment left behind by division (spec I-8): pinned to an area, defends, may only
 *  retreat; rejoins its owner's party when the main body returns. */
export interface Detachment {
  ownerSeat: number;
  area: number;
  members: PartyMember[];    // removed from the owner's party array while detached
}
