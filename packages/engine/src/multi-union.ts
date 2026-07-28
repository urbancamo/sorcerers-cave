import { GS_PLAYING, GS_DEAD, type GamePhase, type PartyMember, type GameState } from "./state";
import type { GameEvent } from "./actions";
import { scoreBreakdown } from "./score";
import { revertApprenticesOnSorcererDeath } from "./effects";
import { advanceTurn, partyView, type MpGameState } from "./multi";
import type { Union, UnionProposal } from "./multi-session";

/**
 * M5 interaction layer: unions (spec I-6/I-7, rulebook §"Union of Exploring Parties"), division &
 * rear-guards (spec I-8, §"Division of a Party") and the shared Sorcerer bounty (spec I-19). Every
 * transition is pure — `(mp, …) → { state, ok/reason }` in multi-trade.ts's style; the engine never
 * reads the clock (`now` is passed in, spec §1.3).
 *
 * THE LOAN MODEL (documented simplification, spec I-6 "combined roster"): while united, each
 * subordinate's LIVING members are physically moved into the commander's party array and recorded
 * in `union.onLoan` ({fromSeat, idx}). The commander's composed view therefore IS the combined
 * force, so stranger fights, PvP, hazards and pickups all work through existing code paths with no
 * combat forks. Consequences, all deliberate:
 *  - casualties among loaned members are the OWNING seat's loss — they return dead (status 3) on
 *    leave/dissolve, and an owner whose whole roster came back dead is wiped;
 *  - treasure travels with the member (loaned out and back), so "members' own creatures and
 *    treasure never transfer" (§I-7) holds by construction;
 *  - the idx bookkeeping relies on party arrays being APPEND-ONLY during play; trading is
 *    therefore blocked for union members (multi.ts gates proposeTrade), and divideParty is
 *    blocked while united.
 *
 * Other documented simplifications / deviations (each with its rationale):
 *  - `refuseMove` is implemented as leaveUnion (the rulebook's "refuse to let his party be moved"
 *    keeps membership while staying put; modelling a half-in member whose creatures sit outside
 *    the commander's array would fork every combat path — leaving and re-proposing is equivalent
 *    at the granularity this engine models).
 *  - leaveUnion is routed OFF-turn (multi.ts): a subordinate's own turn is skipped entirely while
 *    united, so an on-turn gate could never fire; off-turn leave matches the spec's "leave at any
 *    boundary" (§3 sync matrix) and is still blocked mid-fight per the rulebook.
 *  - proposeUnion is routed off-turn like proposeTrade (the rulebook's "at the beginning of any
 *    turn of a player involved" is relaxed to any moment at rest; the reaction window bounds it).
 *  - Attacking a rear-guard detachment (I-8 "guards auto-defend") is NOT yet implemented:
 *    `declareAttack` targets a seat, and a detachment's owner is elsewhere, so the co-location
 *    check rejects it. Guards therefore deter absolutely for now — the guarded loot stays parked
 *    and the guards cannot be destroyed. TODO(M6+): a detachment-scoped PvP defence session.
 *  - Guarded-loot enforcement point: entering a chamber sweeps parked 200+tid contents into the
 *    entrant's working set (chamber.ts reload), so a pre-gate on takeTreasure alone cannot work.
 *    Instead `unionPostAction` (called by mpReduce after EVERY successful solo action) parks the
 *    acting seat's whole working treasure set back onto the tile whenever a rival detachment
 *    guards the area — over-broad (it also re-parks fresh finds and Deep-Pool reclaims there) but
 *    safe, and a detachment normally sits on an already-visited tile where no fresh draw occurs.
 *  - A commander going terminal (escape / wipe / quit) auto-dissolves the union: loans return to
 *    their owners at the commander's last position; unallocated recruits stay with the commander's
 *    party (no allocation handshake is possible without him). Rationale: never dead-stop.
 *  - Union formation silently drops invitees who wandered off / got engaged between proposal and
 *    final answer (co-location is re-checked at formation, mirroring trade's sessionGuard spirit).
 */

export interface UnionResult {
  state: MpGameState;
  ok: boolean;
  reason?: string;
}

const fail = (mp: MpGameState, reason: string): UnionResult => ({ state: mp, ok: false, reason });

const living = (m: PartyMember): boolean => m.status === 0 || m.status === 1;

const proposalOf = (mp: MpGameState): UnionProposal | null =>
  mp.session?.kind === "unionProposal" ? mp.session : null;

/** The ACTIVE (non-dissolved) union a seat belongs to, if any. */
export function activeUnionOf(mp: MpGameState, seat: number): Union | null {
  return (mp.unions ?? []).find((u) => !u.dissolved && u.members.includes(seat)) ?? null;
}

/** Union is mid-fight: the commander's composed party is fighting strangers, or a live PvP session
 *  involves any member. Leaving/dissolving is blocked then (§Union: "unless the union is involved
 *  in a fight at the time"). */
function unionMidFight(mp: MpGameState, u: Union): boolean {
  if (mp.parties[u.commander]!.phase === "fight") return true;
  const s = mp.session;
  return !!s && s.kind === "pvp" && u.members.some((m) => s.attacker.includes(m) || s.defender.includes(m));
}

// --- formation (I-6) ------------------------------------------------------------------------------

/**
 * Open a union-formation handshake (spec I-6): the proposer names a commander and the invited
 * seats; everyone must be co-located, exploring, at rest, un-united and session-free. The proposer
 * implicitly accepts; the commander (when not the proposer) must accept like any invitee. The
 * reaction window opens on the first invitee and walks the list; timeout = refuse (§1.3).
 */
export function proposeUnion(
  mp: MpGameState, proposer: number, commander: number, invited: number[], now: number, windowMs = 60000,
): UnionResult {
  if (mp.phase !== "playing") return fail(mp, "notPlaying");
  if (mp.session) return fail(mp, "sessionActive");
  const participants = [...new Set([proposer, commander, ...invited])];
  if (participants.length < 2) return fail(mp, "tooFew");
  const anchor = mp.parties[proposer];
  if (!anchor) return fail(mp, "noSeat");
  for (const seat of participants) {
    const p = mp.parties[seat];
    if (!p || p.status !== "exploring") return fail(mp, "notExploring");
    if (p.phase !== "explore") return fail(mp, "midEncounter");
    if (p.partyArea !== anchor.partyArea) return fail(mp, "notColocated");
    // Any union record blocks (a residual dissolved union still owes an allocation handshake).
    if ((mp.unions ?? []).some((u) => u.members.includes(seat))) return fail(mp, "alreadyUnited");
  }
  const invitees = participants.filter((s) => s !== proposer);
  const session: UnionProposal = {
    kind: "unionProposal", area: anchor.partyArea, commander,
    invited: invitees, accepted: [proposer],
    window: { seat: invitees[0]!, deadline: now + windowMs, kind: "unionRespond" },
  };
  return { state: { ...mp, session }, ok: true };
}

/** Form the union from a fully-answered proposal (called on a CLONED state — mutates freely).
 *  Members still co-located/at-rest with the commander join; each non-commander pays the one-turn
 *  forfeit and loans its living members into the commander's array. <2 members ⇒ no union. */
function formUnion(mp: MpGameState, prop: UnionProposal): MpGameState {
  mp.session = null;
  const cmdSeat = prop.commander;
  const cmd = mp.parties[cmdSeat];
  const eligible = (s: number): boolean => {
    const p = mp.parties[s];
    return !!p && p.status === "exploring" && p.phase === "explore" &&
      p.partyArea === cmd!.partyArea && !(mp.unions ?? []).some((u) => u.members.includes(s));
  };
  if (!cmd || !prop.accepted.includes(cmdSeat) || !eligible(cmdSeat)) return mp; // no commander, no union
  const members = [cmdSeat, ...prop.accepted.filter((s) => s !== cmdSeat && eligible(s))];
  if (members.length < 2) return mp;

  const onLoan: Union["onLoan"] = [];
  for (const seat of members) {
    if (seat === cmdSeat) continue;
    const p = mp.parties[seat]!;
    const keep: PartyMember[] = [];
    for (const m of p.party) {
      if (living(m)) {
        onLoan.push({ fromSeat: seat, idx: cmd.party.length });
        // Identity tag: stored indices go stale when a solo action reshapes the commander's array
        // (Mutiny splices deserters out), so positions are re-derived from tags after every
        // commander action (reindexUnion) and returns select by tag, never by index.
        m.mpTag = `loan:${seat}`;
        cmd.party.push(m);
      } else keep.push(m); // stone/dead members stay home with their owner
    }
    p.party = keep;
    p.forfeitTurnsOwed = (p.forfeitTurnsOwed ?? 0) + 1; // the joining fee (I-6), consumed by advanceTurn
  }
  const id = 1 + (mp.unions ?? []).reduce((mx, u) => Math.max(mx, u.id), 0);
  mp.unions = [...(mp.unions ?? []), { id, commander: cmdSeat, members, recruits: [], onLoan }];
  // If the seat currently to move just became a subordinate, its turn belongs to the union now.
  // Strict rotation only: in concurrent mode (M6) there is no cursor to hand off — and calling
  // advanceTurn would wrongly eat the just-charged joining fees in its skip-and-decrement loop
  // (concurrent forfeits are paid off by rival activity instead, see mpReduce).
  if (mp.phase === "playing" && mp.concurrent !== true) {
    const activeSeat = mp.order[mp.active]!;
    if (members.includes(activeSeat) && activeSeat !== cmdSeat) return advanceTurn(mp);
  }
  return mp;
}

/** An invitee answers (off-turn, windowed). Refusal by the nominated commander kills the whole
 *  proposal; otherwise the window walks to the next unanswered invitee, and when all have answered
 *  the union forms (≥2 members) or nothing happens. */
export function respondUnion(mp: MpGameState, seat: number, accept: boolean, now: number, windowMs = 60000): UnionResult {
  const s = proposalOf(mp);
  if (!s) return fail(mp, "noSession");
  if (!s.invited.includes(seat)) return fail(mp, "notInvited");
  const next = structuredClone(mp);
  const ns = proposalOf(next)!;
  ns.invited = ns.invited.filter((x) => x !== seat);
  if (accept) ns.accepted = [...ns.accepted, seat];
  else if (seat === ns.commander) {
    next.session = null; // the commander-to-be refused — there is nothing to command
    return { state: next, ok: true };
  }
  if (ns.invited.length === 0) return { state: formUnion(next, ns), ok: true };
  ns.window = { seat: ns.invited[0]!, deadline: now + windowMs, kind: "unionRespond" };
  return { state: next, ok: true };
}

/** Auto-default on timeout (spec §1.3): each overdue awaited invitee refuses; the window walks on
 *  (fresh deadline per invitee) and formation still completes if enough already accepted. */
export function expireUnionProposal(mp: MpGameState, now: number, windowMs = 60000): { state: MpGameState; fired: boolean } {
  let state = mp;
  let fired = false;
  for (;;) {
    const s = proposalOf(state);
    if (!s || !s.window || now < s.window.deadline) return { state, fired };
    state = respondUnion(state, s.window.seat, false, now, windowMs).state;
    fired = true;
  }
}

// --- operation & dissolution (I-7) ------------------------------------------------------------------

/**
 * Re-derive the union's positional bookkeeping from member tags. Solo actions the commander
 * triggers can RESHAPE the party array — Mutiny splices deserting allies out entirely — so stored
 * indices cannot be trusted across an action. Tags are identity: a loaned member carries
 * `loan:<seat>`, a union recruit `recruit:<id>`. A tag that has vanished from the array means the
 * member left the game through a solo rule (a loaned ally deserting in a mutiny reverts to a
 * stranger — the owning seat has lost it, exactly as a mutiny costs a solo party its allies).
 */
export function reindexUnion(mp: MpGameState, u: Union): void {
  const cmd = mp.parties[u.commander]!;
  const onLoan: Union["onLoan"] = [];
  const recruits: Union["recruits"] = [];
  cmd.party.forEach((m, idx) => {
    if (!m.mpTag) return;
    if (m.mpTag.startsWith("loan:")) onLoan.push({ fromSeat: Number(m.mpTag.slice(5)), idx });
    else if (m.mpTag === `recruit:${u.id}`) recruits.push({ seat: u.commander, partyIdx: idx });
  });
  u.onLoan = onLoan;
  u.recruits = recruits;
}

/** Return each listed seat's loaned members (dead or alive, treasure aboard) from the commander's
 *  array to their owner, co-locating the owner at the commander's position. Mutates a CLONED state;
 *  selection is BY TAG (never by stored index — see reindexUnion) and wipes an owner whose roster
 *  came back dead. */
function returnLoans(mp: MpGameState, u: Union, seats: number[]): void {
  const cmd = mp.parties[u.commander]!;
  for (const fromSeat of seats) {
    const tag = `loan:${fromSeat}`;
    const back = cmd.party.filter((m) => m.mpTag === tag);
    if (back.length === 0) { u.onLoan = u.onLoan.filter((l) => l.fromSeat !== fromSeat); continue; }
    cmd.party = cmd.party.filter((m) => m.mpTag !== tag);
    const owner = mp.parties[fromSeat]!;
    back.forEach((m) => { delete m.mpTag; });
    owner.party.push(...back);
    reindexUnion(mp, u); // refresh remaining loans + recruit positions from tags
    owner.partyArea = cmd.partyArea; owner.level = cmd.level; owner.prev = cmd.prev; owner.prev2 = cmd.prev2;
    // All returned dead and nothing else living: the owner's expedition is over (the union fight
    // was its loss — spec I-6 "casualties are the owning seat's loss").
    if (owner.gs === GS_PLAYING && owner.party.length > 0 && !owner.party.some(living)) {
      owner.gs = GS_DEAD; owner.status = "wiped"; owner.phase = "gameOver"; owner.fight = null;
    }
  }
}

/** Finish a dissolution on a CLONED state: return every remaining loan; recruits (if any) leave a
 *  residual record behind for the allocation handshake, else the union record vanishes. */
function finishDissolve(mp: MpGameState, u: Union): MpGameState {
  returnLoans(mp, u, u.members.filter((m) => m !== u.commander));
  if (u.recruits.length > 0) {
    u.dissolved = true;
    u.area = mp.parties[u.commander]!.partyArea;
    u.alloc = null;
  } else {
    mp.unions = mp.unions!.filter((x) => x.id !== u.id);
  }
  return mp;
}

/**
 * Leave the union (spec I-7; off-turn, any boundary) — blocked mid-fight. The leaver's loaned
 * members (and their treasure) come home; the leaver stands where the union stands. If fewer than
 * two members remain the union dissolves entirely. The commander "leaving" IS a dissolution.
 */
export function leaveUnion(mp: MpGameState, seat: number, now: number): UnionResult {
  const u = activeUnionOf(mp, seat);
  if (!u) return fail(mp, "notInUnion");
  if (unionMidFight(mp, u)) return fail(mp, "midFight");
  if (seat === u.commander) return dissolveUnion(mp, seat, now);
  const next = structuredClone(mp);
  const nu = next.unions!.find((x) => x.id === u.id)!;
  returnLoans(next, nu, [seat]);
  nu.members = nu.members.filter((m) => m !== seat);
  if (nu.members.length < 2) return { state: finishDissolve(next, nu), ok: true };
  return { state: next, ok: true };
}

/** DOCUMENTED SIMPLIFICATION (see module doc): refusing to move is modelled as leaving the union —
 *  the member stays put with its own creatures while the commander moves on without them. */
export function refuseMove(mp: MpGameState, seat: number, now: number): UnionResult {
  return leaveUnion(mp, seat, now);
}

/** Dissolve the union (commander only; blocked mid-fight). Loans return; recruits await the
 *  allocation handshake via `allocateRecruit` (a residual record pins them and the area). */
export function dissolveUnion(mp: MpGameState, byCommander: number, _now: number): UnionResult {
  const u = activeUnionOf(mp, byCommander);
  if (!u) return fail(mp, "notInUnion");
  if (u.commander !== byCommander) return fail(mp, "notCommander");
  if (unionMidFight(mp, u)) return fail(mp, "midFight");
  const next = structuredClone(mp);
  const nu = next.unions!.find((x) => x.id === u.id)!;
  return { state: finishDissolve(next, nu), ok: true };
}

/**
 * The recruited-ally allocation handshake (spec I-7): any former member proposes "recruit R to
 * seat T"; every member must confirm the SAME (R, T) for the ally to transfer. A conflicting
 * target for the same recruit is a DISAGREEMENT: per the rulebook the ally "remains neutral" —
 * parked on the dissolution area as a stranger (100+cid; its carried treasure as 200+tid).
 * DOCUMENTED SIMPLIFICATION: the full rule keeps a neutral ally waiting for the ensuing fight's
 * victor; without a linked fight we park it as an ordinary stranger for anyone to win over.
 */
export function allocateRecruit(mp: MpGameState, seat: number, recruit: number, to: number): UnionResult {
  const u = (mp.unions ?? []).find((x) => x.dissolved && x.members.includes(seat));
  if (!u) return fail(mp, "noAllocation");
  if (!Number.isInteger(recruit) || recruit < 0 || recruit >= u.recruits.length) return fail(mp, "badRecruit");
  if (!u.members.includes(to)) return fail(mp, "badTarget");

  const next = structuredClone(mp);
  const nu = next.unions!.find((x) => x.id === u.id)!;
  const settle = (): void => {
    nu.alloc = null;
    if (nu.recruits.length === 0) next.unions = next.unions!.filter((x) => x.id !== nu.id);
  };
  const removeRecruit = (): PartyMember | null => {
    // Select BY TAG, not by the recorded index — the host keeps playing solo actions while the
    // allocation pends, and e.g. a Mutiny reshapes (and can even desert members from) its array.
    const r = nu.recruits[recruit]!;
    const host = next.parties[r.seat]!;
    const tagged = host.party.filter((m) => m.mpTag === `recruit:${nu.id}`);
    // Recruits are recorded in array order; the recruit-th union recruit hosted by this seat:
    const ordinal = nu.recruits.slice(0, recruit).filter((x) => x.seat === r.seat).length;
    const m = tagged[ordinal] ?? null;
    nu.recruits = nu.recruits.filter((_, i) => i !== recruit);
    if (!m) return null; // the recruit deserted (mutiny) since dissolution — nothing to allocate
    host.party = host.party.filter((x) => x !== m);
    delete m.mpTag;
    return m;
  };

  if (!nu.alloc) {
    nu.alloc = { recruit, to, approved: [seat] };
    return { state: next, ok: true };
  }
  if (nu.alloc.recruit !== recruit) return fail(mp, "allocPending");
  if (nu.alloc.to !== to) {
    // Disagreement → the ally goes neutral on the dissolution tile.
    const m = removeRecruit();
    if (m) {
      const tile = next.cave.areas[nu.area!]!;
      tile.contents = [...tile.contents, 100 + m.creatureId, ...m.treasure.map((t) => 200 + t)];
    }
    settle();
    return { state: next, ok: true };
  }
  if (!nu.alloc.approved.includes(seat)) nu.alloc.approved.push(seat);
  if (nu.members.every((m) => nu.alloc!.approved.includes(m))) {
    const m = removeRecruit();
    if (m) next.parties[to]!.party.push(m); // agreed: the ally (treasure aboard) joins its new party
    settle();
  }
  return { state: next, ok: true };
}

// --- division & rear-guards (I-8) ---------------------------------------------------------------------

/**
 * Divide the party (spec I-8, §"Division of a Party"): the chosen living members step out into a
 * Detachment pinned at the current area (guard stance — they defend the parked loot and rejoin
 * when the main body returns). On-turn, at rest, not while united (the loan-index invariant), and
 * at least one living member must keep the torch. Dividing does not end the turn.
 */
export function divideParty(mp: MpGameState, seat: number, memberIdxs: number[]): UnionResult {
  if (mp.phase !== "playing") return fail(mp, "notPlaying");
  const party = mp.parties[seat];
  if (!party || party.status !== "exploring") return fail(mp, "notExploring");
  if (party.phase !== "explore") return fail(mp, "midEncounter");
  if (activeUnionOf(mp, seat)) return fail(mp, "inUnion");
  if (memberIdxs.length === 0) return fail(mp, "emptyGuard");
  const uniq = new Set(memberIdxs);
  if (uniq.size !== memberIdxs.length) return fail(mp, "memberReused");
  for (const i of memberIdxs) {
    const m = party.party[i];
    if (!m || !living(m)) return fail(mp, "invalidMember");
  }
  if (!party.party.some((m, i) => living(m) && !uniq.has(i))) return fail(mp, "mustKeepOne");

  const next = structuredClone(mp);
  const p = next.parties[seat]!;
  const sorted = [...memberIdxs].sort((a, b) => a - b);
  const members = sorted.map((i) => p.party[i]!);
  for (let i = sorted.length - 1; i >= 0; i--) p.party.splice(sorted[i]!, 1);
  const list = next.detachments ?? (next.detachments = []);
  const existing = list.find((d) => d.ownerSeat === seat && d.area === p.partyArea);
  if (existing) existing.members.push(...members);
  else list.push({ ownerSeat: seat, area: p.partyArea, members });
  return { state: next, ok: true };
}

/** Is the seat standing in an area guarded by a RIVAL's detachment? (Guarded loot, spec I-8/I-4.) */
export function hostileDetachmentAt(mp: MpGameState, seat: number): boolean {
  const p = mp.parties[seat];
  if (!p) return false;
  return (mp.detachments ?? []).some((d) => d.area === p.partyArea && d.ownerSeat !== seat);
}

// --- the post-action hook (wired into mpReduce) --------------------------------------------------------

/**
 * The phases in which a seat's chamber working set (`strangers`/`treasures`) is LIVE — an open
 * session the solo lifecycle will eventually persist back onto its tile (`persistAndExplore`,
 * reduce.ts). In every other phase — "explore" (at rest) above all — the working set is empty by
 * invariant, nothing ever parks it, and the next `enterChamber` RESETS it (chamber.ts): anything
 * left there is silently destroyed. Used by step 3b below to decide where a cave-global consequence
 * may land on a seat that is not the one acting (SC-EXT-31).
 */
const LIVE_WORKING_SET: ReadonlySet<GamePhase> = new Set<GamePhase>(["encounter", "fight", "medusa", "pickup"]);

/**
 * Runs after EVERY successful solo action in mpReduce. In order:
 *  1. a terminal commander auto-dissolves his union (loans home, recruits stay with him — doc'd);
 *  2. the acting seat's own detachment at its current area auto-merges back (I-8 "rejoin");
 *  3. guarded loot: a rival detachment re-parks the actor's whole working treasure set (doc'd);
 *  3b. cave-global Apprentice revert (SC-EXT-31, design US-14): ANY seat's Sorcerer kill — union
 *      or not — reverts every Apprentice ally, cave-wide (into the working set of a seat with an
 *      open session, onto the shared tile for a bystander at rest);
 *  4. recruits: strangersJoined during a commander's action are recorded on the union (I-7);
 *  5. Sorcerer bounty (I-19): a union kill stamps sorcererKilled + sorcererSharedWith on EVERY member;
 *  6. the union travels together: subordinates relocate to the commander's position after his action.
 */
export function unionPostAction(mp: MpGameState, seat: number, events: GameEvent[]): { state: MpGameState; events: GameEvent[] } {
  let out = mp;
  let cloned = false;
  const ensure = (): void => { if (!cloned) { out = structuredClone(mp); cloned = true; } };
  const extra: GameEvent[] = [];

  // 1. Commander went terminal → the union disbands where he fell/left.
  const commanded = (out.unions ?? []).find((u) => !u.dissolved && u.commander === seat);
  if (commanded && out.parties[seat]!.status !== "exploring") {
    ensure();
    const nu = out.unions!.find((u) => u.id === commanded.id)!;
    returnLoans(out, nu, nu.members.filter((m) => m !== seat));
    // Recruits remain in the commander's party; the union record dies with him, so strip the
    // now-meaningless recruit tags (a dangling tag would ride along into later trades).
    out.parties[seat]!.party.forEach((m) => { if (m.mpTag === `recruit:${nu.id}`) delete m.mpTag; });
    out.unions = out.unions!.filter((u) => u.id !== nu.id);
    return { state: out, events: extra };
  }

  // 2. The main body returned to its rear-guard: auto-merge (I-8).
  const here = out.parties[seat]!.partyArea;
  const dIdx = (out.detachments ?? []).findIndex((d) => d.ownerSeat === seat && d.area === here);
  if (dIdx >= 0) {
    ensure();
    const d = out.detachments![dIdx]!;
    out.parties[seat]!.party.push(...d.members);
    out.detachments = out.detachments!.filter((_, i) => i !== dIdx);
  }

  // 3. Guarded loot (I-8): whatever the actor just swept up in a rival-guarded area goes back down.
  if (hostileDetachmentAt(out, seat) && out.parties[seat]!.treasures.length > 0) {
    ensure();
    const p = out.parties[seat]!;
    const tile = out.cave.areas[p.partyArea]!;
    tile.contents = [...tile.contents, ...p.treasures.map((t) => 200 + t)];
    p.treasures = [];
    if (p.phase === "pickup") p.phase = "explore";
    extra.push({ type: "planRejected", reason: "treasureGuarded" });
  }

  // 3b. The Sorcerer is cave-global (SC-EXT-31, design US-14): there is only ONE Sorcerer, so the
  //     instant ANY seat kills him — union command or a lone party via ordinary chamber combat —
  //     EVERY Apprentice ally's loyalty breaks everywhere in the cave, not just within a killing
  //     union. UNION-AGNOSTIC by design, mirroring the existing precedent for "one Sorcerer,
  //     cave-wide consequence" (multi-zombies.ts's zombiePostSweep: annihilation fires off ANY
  //     seat's `sorcererKilled`, never gated on who's in a union). Reuse the solo revert
  //     (effects.ts) across EVERY seat's party — cast `PartyState` to `GameState` the same way
  //     `compose()` does; the function only touches `party`/`strangers`/`treasures`, all present on
  //     `PartyState` verbatim. The killing seat's own party was already reverted inside the solo
  //     reduce this hook runs after, so the call there is a safe no-op; a LOANED ally who reverts
  //     vanishes from her commander's array along with her tag, so every active union (not just one
  //     the killer commands) is re-indexed afterward to end the loan cleanly (mirrors the
  //     mutiny-desertion path in reindexUnion's own doc comment).
  //     WHERE the ex-ally lands is per-seat, though. The solo revert puts her (and her spilled
  //     items) into the seat's LIVE working set, which is coherent only while that seat has an open
  //     session — the ACTING seat mid-fight, or a bystander already in an encounter/fight/medusa/
  //     pickup, all of which end in `persistAndExplore` parking the set back onto their tile. A
  //     bystander AT REST has no such session: its working set is empty by invariant, nothing parks
  //     it, and its next `enterChamber` resets it — the promised hostile stranger would never
  //     materialize and her carried items would be deleted from the game (item conservation). For
  //     those seats the revert is written straight to the SHARED tile as `100+cid` / `200+tid`, the
  //     same channel every other cave-shared consequence uses (a neutral recruit at dissolution,
  //     guarded loot in step 3, the zombies variant's working-set park) — so she waits there for
  //     whoever enters next, her seat's own working set untouched.
  if (events.some((e) => e.type === "sorcererSlain")) {
    ensure();
    for (let i = 0; i < out.parties.length; i++) {
      const p = out.parties[i]!;
      const sBefore = p.strangers.length;
      const tBefore = p.treasures.length;
      const evs = revertApprenticesOnSorcererDeath(p as unknown as GameState);
      if (evs.length === 0) continue; // nothing reverted here (every kit-off seat, always)
      extra.push(...evs);
      if (i === seat || LIVE_WORKING_SET.has(p.phase)) continue; // an open session: solo semantics stand
      const tile = out.cave.areas[p.partyArea]!;
      tile.contents = [
        ...tile.contents,
        ...p.strangers.splice(sBefore).map((id) => 100 + id),
        ...p.treasures.splice(tBefore).map((t) => 200 + t),
      ];
    }
    for (const other of out.unions ?? []) if (!other.dissolved) reindexUnion(out, other);
  }

  const u = (out.unions ?? []).find((x) => !x.dissolved && x.commander === seat);
  if (u) {
    // 4. New allies recruited under the union flag are negotiable at dissolution — record them
    //    (tagged: positions are re-derived from tags, indices are never trusted across actions).
    const joined = events.reduce((n, e) => n + (e.type === "strangersJoined" ? e.count : 0), 0);
    if (joined > 0) {
      ensure();
      const nu = out.unions!.find((x) => x.id === u.id)!;
      const party = out.parties[seat]!.party;
      for (let i = party.length - joined; i < party.length; i++) {
        party[i]!.mpTag = `recruit:${nu.id}`;
        nu.recruits.push({ seat, partyIdx: i });
      }
    }
    // 4b. Re-derive loan/recruit positions from tags: the commander's solo action may have
    //     RESHAPED the party array (Mutiny splices deserters out — a spliced loaned ally has
    //     deserted to the chamber as a stranger, and every later index shifted). Also picks up any
    //     loan ended a moment ago by step 3b's cave-global Apprentice revert.
    {
      ensure();
      const nu = out.unions!.find((x) => x.id === u.id)!;
      reindexUnion(out, nu);
    }
    // 5. The Sorcerer fell to the combined force: every member shares the bounty (I-19) — this
    //    stamp stays scoped to a genuine union kill (>=2 members); the Apprentice revert above is
    //    the separate, union-agnostic concern.
    if (u.members.length >= 2 && events.some((e) => e.type === "sorcererSlain")) {
      ensure();
      const nu = out.unions!.find((x) => x.id === u.id)!;
      for (const m of nu.members) {
        const p = out.parties[m]!;
        p.sorcererKilled = true;
        p.sorcererSharedWith = nu.members.filter((x) => x !== m);
      }
    }
    // 6. The union travels as one: subordinates follow the commander's position.
    ensure();
    const cmd = out.parties[seat]!;
    for (const m of u.members) {
      if (m === seat) continue;
      const p = out.parties[m]!;
      p.partyArea = cmd.partyArea; p.level = cmd.level; p.prev = cmd.prev; p.prev2 = cmd.prev2;
    }
  }
  return { state: out, events: extra };
}

// --- Sorcerer bounty split (I-19) -----------------------------------------------------------------------

/**
 * Terminal score for one seat, with the shared Sorcerer bounty applied (spec I-19: the 30-point
 * bounty "is split equally among parties that combined to defeat him"). Solo kill or no kill:
 * exactly `scoreGame`. Shared kill: the flat 30 in the breakdown is replaced by ⌊30 / n⌋ where n
 * is the number of sharing seats (2 → 15 each, 3 → 10 each). Wipe-zero and the ≥0 clamp are
 * re-applied on the adjusted raw total so the arithmetic matches score.ts exactly.
 */
export function mpScore(mp: MpGameState, seat: number): number {
  const view = partyView(mp, seat);
  const b = scoreBreakdown(view);
  const p = mp.parties[seat]!;
  const others = p.sorcererSharedWith ?? [];
  if (!p.sorcererKilled || others.length === 0) return b.total;
  const share = Math.floor(30 / (1 + others.length));
  const raw = b.members.reduce((sum, m) => sum + m.subtotal, 0) + share + b.bonusScore - b.cursePenalty;
  return view.gs === GS_DEAD ? 0 : Math.max(0, raw);
}
