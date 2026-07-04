import { canCarry } from "./pickup";
import { DIR_UP, DIR_DOWN } from "./coords";
import type { PartyMember } from "./state";
import type { MpGameState } from "./multi";
import type { TradeBasket, TradeSession } from "./multi-session";

/**
 * M3 interaction layer: the trade session (spec §I-5) and secret-door knowledge (spec §I-18).
 * Every transition here is pure — `(mp, …) → { state, ok/reason }` returning a NEW MpGameState in
 * multi.ts's immutable style. The engine never reads the clock: `now` (epoch ms) is always passed
 * in by the caller (Convex stamps it), per spec §1.3 reaction windows.
 */

export interface TradeResult {
  state: MpGameState;
  ok: boolean;
  reason?: string;
}

const fail = (mp: MpGameState, reason: string): TradeResult => ({ state: mp, ok: false, reason });

const tradeOf = (mp: MpGameState): TradeSession | null =>
  mp.session?.kind === "trade" ? mp.session : null;

const isParticipant = (s: TradeSession, seat: number): boolean => seat === s.a || seat === s.b;

/** Deep-enough member clone: the commit mutates treasure/borne arrays, never the originals. */
const cloneMember = (m: PartyMember): PartyMember => ({
  ...m,
  treasure: [...m.treasure],
  ...(m.borne ? { borne: [...m.borne] } : {}),
});

const living = (m: PartyMember): boolean => m.status === 0 || m.status === 1;

/**
 * Open a trade session between two co-located, at-rest seats (spec I-5: "Trading is blocked while
 * either party is in a fight"; one session per game, §1.2). The reaction window opens on the seat
 * being invited: no answer by `now + windowMs` and the offer expires (declined), never a dead stop.
 */
export function proposeTrade(mp: MpGameState, fromSeat: number, toSeat: number, now: number, windowMs = 60000): TradeResult {
  if (mp.phase !== "playing") return fail(mp, "notPlaying");
  if (mp.session) return fail(mp, "sessionActive");
  if (fromSeat === toSeat) return fail(mp, "self");
  const a = mp.parties[fromSeat];
  const b = mp.parties[toSeat];
  if (!a || !b || a.status !== "exploring" || b.status !== "exploring") return fail(mp, "notExploring");
  if (a.partyArea !== b.partyArea) return fail(mp, "notColocated");
  if (a.phase !== "explore" || b.phase !== "explore") return fail(mp, "midEncounter");
  const session: TradeSession = {
    kind: "trade", area: a.partyArea, a: fromSeat, b: toSeat,
    basketA: { treasure: [], members: [] }, basketB: { treasure: [], members: [] },
    confirmedA: false, confirmedB: false,
    window: { seat: toSeat, deadline: now + windowMs, kind: "tradeRespond" },
  };
  return { state: { ...mp, session }, ok: true };
}

/**
 * Replace one side's basket (offer/counter). Every offered treasure id must currently be held by
 * that seat's living/ally members (count-aware — offering two Golds needs two held) and every
 * offered member index must be a living(0)/ally(1) member. Any edit CLEARS both confirms (you
 * confirm a proposal, not a moving target) and re-arms the window on the OTHER participant.
 */
export function updateBasket(mp: MpGameState, seat: number, basket: TradeBasket, now: number, windowMs = 60000): TradeResult {
  const s = tradeOf(mp);
  if (!s) return fail(mp, "noSession");
  if (!isParticipant(s, seat)) return fail(mp, "notParticipant");
  const party = mp.parties[seat]!;

  const seen = new Set<number>();
  for (const idx of basket.members) {
    const m = party.party[idx];
    if (!m || !living(m) || seen.has(idx)) return fail(mp, "invalidMember");
    seen.add(idx);
  }
  const held = new Map<number, number>();
  for (const m of party.party) {
    if (!living(m)) continue;
    for (const tid of m.treasure) held.set(tid, (held.get(tid) ?? 0) + 1);
  }
  const want = new Map<number, number>();
  for (const tid of basket.treasure) want.set(tid, (want.get(tid) ?? 0) + 1);
  for (const [tid, n] of want) if ((held.get(tid) ?? 0) < n) return fail(mp, "notHeld");

  const mine: TradeBasket = { treasure: [...basket.treasure], members: [...basket.members] };
  const other = seat === s.a ? s.b : s.a;
  const session: TradeSession = {
    ...s,
    ...(seat === s.a ? { basketA: mine } : { basketB: mine }),
    confirmedA: false, confirmedB: false,
    window: { seat: other, deadline: now + windowMs, kind: "tradeRespond" },
  };
  return { state: { ...mp, session }, ok: true };
}

/** Remove each offered treasure id (one instance) from the giving roster's holders + borne lists. */
function stripTreasure(roster: PartyMember[], ids: number[]): boolean {
  for (const tid of ids) {
    const holder = roster.find((m) => living(m) && m.treasure.includes(tid));
    if (!holder) return false;
    holder.treasure.splice(holder.treasure.indexOf(tid), 1);
    if (holder.borne) {
      const bi = holder.borne.indexOf(tid);
      if (bi >= 0) holder.borne.splice(bi, 1);
    }
  }
  return true;
}

/** Splice the offered members out (by DESCENDING index so earlier splices can't shift later ones),
 *  returning them in their original roster order. They keep creatureId/status/dragonKills/treasure/borne. */
function extractMembers(roster: PartyMember[], idxs: number[]): PartyMember[] | null {
  const sorted = [...idxs].sort((x, y) => x - y);
  const taken: PartyMember[] = [];
  for (const i of sorted) {
    const m = roster[i];
    if (!m || !living(m)) return null;
    taken.push(m);
  }
  for (let i = sorted.length - 1; i >= 0; i--) roster.splice(sorted[i]!, 1);
  return taken;
}

/** Place each incoming treasure id on the first living/ally member with canCarry capacity. */
function placeTreasure(roster: PartyMember[], ids: number[]): boolean {
  for (const tid of ids) {
    const target = roster.find((m) => living(m) && canCarry(m, tid));
    if (!target) return false;
    target.treasure.push(tid);
  }
  return true;
}

/**
 * Set the caller's confirm; when BOTH stand confirmed, commit the swap atomically inside this
 * transition. Commit order: strip offered treasure from the giving side FIRST (so an id carried by
 * a member that is itself being traded moves once, as basket treasure, not twice), then move the
 * offered members, then place the treasure on the receiving side. If ANY item cannot be placed the
 * WHOLE commit fails ("overCapacity"): both confirms clear and nothing moves. The Eye of God (13)
 * changing hands here brings NO curse — a completed trade is not a forsaking (spec I-5).
 */
export function confirmTrade(mp: MpGameState, seat: number, now: number, windowMs = 60000): TradeResult {
  const s = tradeOf(mp);
  if (!s) return fail(mp, "noSession");
  if (!isParticipant(s, seat)) return fail(mp, "notParticipant");
  const confirmedA = seat === s.a ? true : s.confirmedA;
  const confirmedB = seat === s.b ? true : s.confirmedB;
  if (!confirmedA || !confirmedB) {
    // Half-confirmed: now waiting on the other side to confirm (or counter) within the window.
    const other = seat === s.a ? s.b : s.a;
    const session: TradeSession = { ...s, confirmedA, confirmedB, window: { seat: other, deadline: now + windowMs, kind: "tradeRespond" } };
    return { state: { ...mp, session }, ok: true };
  }

  const pa = mp.parties[s.a]!;
  const pb = mp.parties[s.b]!;
  const rosterA = pa.party.map(cloneMember);
  const rosterB = pb.party.map(cloneMember);
  const abort = (reason: string): TradeResult => ({
    state: { ...mp, session: { ...s, confirmedA: false, confirmedB: false } }, ok: false, reason,
  });

  if (!stripTreasure(rosterA, s.basketA.treasure) || !stripTreasure(rosterB, s.basketB.treasure)) return abort("notHeld");
  const giveA = extractMembers(rosterA, s.basketA.members);
  const giveB = extractMembers(rosterB, s.basketB.members);
  if (!giveA || !giveB) return abort("invalidMember");
  rosterB.push(...giveA);
  rosterA.push(...giveB);
  if (!placeTreasure(rosterB, s.basketA.treasure) || !placeTreasure(rosterA, s.basketB.treasure)) return abort("overCapacity");

  const parties = mp.parties.map((p, i) => (i === s.a ? { ...p, party: rosterA } : i === s.b ? { ...p, party: rosterB } : p));
  return { state: { ...mp, parties, session: null }, ok: true };
}

/** Either participant may walk away at any time — decline/cancel is one click and frees both. */
export function cancelTrade(mp: MpGameState, seat: number): TradeResult {
  const s = tradeOf(mp);
  if (!s) return fail(mp, "noSession");
  if (!isParticipant(s, seat)) return fail(mp, "notParticipant");
  return { state: { ...mp, session: null }, ok: true };
}

/** Auto-default on timeout (spec §1.3): a trade offer past its deadline simply expires (declined). */
export function expireTrade(mp: MpGameState, now: number): { state: MpGameState; fired: boolean } {
  const s = tradeOf(mp);
  if (!s || !s.window || now < s.window.deadline) return { state: mp, fired: false };
  return { state: { ...mp, session: null }, fired: true };
}

/** A participant dispatching a solo action abandons the trade — you can't wander off mid-trade. */
export function sessionGuard(mp: MpGameState, seat: number): MpGameState {
  const s = tradeOf(mp);
  if (!s || !isParticipant(s, seat)) return mp;
  return { ...mp, session: null };
}

// --- Secret-door knowledge (spec I-18: strictly per seat, granted never inferred) ----------------

/** Add area coords to each listed seat's `knownDoors` set (a one-way, non-blocking grant). */
export function grantSecretDoors(mp: MpGameState, seats: number[], coords: number[]): MpGameState {
  const parties = mp.parties.map((p) => {
    if (!seats.includes(p.seat)) return p;
    const known = p.knownDoors ?? [];
    const add = coords.filter((c) => !known.includes(c));
    return add.length === 0 ? p : { ...p, knownDoors: [...known, ...add] };
  });
  return { ...mp, parties };
}

/**
 * The per-seat gate (spec I-18): a stair that exists ONLY as a mirrored link (bit 32 up / 64 down
 * in `mirroredStairs` — never printed on the card) is invisible to a seat that hasn't learnt the
 * area's coord, so its vertical move is blocked as if the stair were not there.
 */
export function secretStairGated(mp: MpGameState, seat: number, dir: number): boolean {
  if (dir !== DIR_UP && dir !== DIR_DOWN) return false;
  const party = mp.parties[seat];
  if (!party) return false;
  const area = mp.cave.areas[party.partyArea];
  if (!area) return false;
  const bit = dir === DIR_UP ? 32 : 64;
  if (((area.mirroredStairs ?? 0) & bit) === 0) return false; // printed stair (or no stair): not gated
  return !(party.knownDoors ?? []).includes(area.coord);
}

/** Show a co-located party a secret door you know at the current area (spec I-18: a gift — no
 *  consent handshake, no turn gate; harmless to the giver). */
export function showSecretDoor(mp: MpGameState, fromSeat: number, toSeat: number): TradeResult {
  if (mp.phase !== "playing") return fail(mp, "notPlaying");
  if (fromSeat === toSeat) return fail(mp, "self");
  const g = mp.parties[fromSeat];
  const r = mp.parties[toSeat];
  if (!g || !r || g.status !== "exploring" || r.status !== "exploring") return fail(mp, "notExploring");
  if (g.partyArea !== r.partyArea) return fail(mp, "notColocated");
  const area = mp.cave.areas[g.partyArea];
  if (!area) return fail(mp, "noArea");
  if (!(g.knownDoors ?? []).includes(area.coord)) return fail(mp, "unknownDoor");
  return { state: grantSecretDoors(mp, [toSeat], [area.coord]), ok: true };
}
