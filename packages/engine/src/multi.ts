import {
  GS_PLAYING, GS_ESCAPED, GS_DEAD, GS_QUIT, GATEWAY_START_COORD,
  type GameState, type PartyMember,
} from "./state";
import type { GameAction, GameEvent } from "./actions";
import { reduce } from "./reduce";
import { validatePicks } from "./setup";
import { buildLargePack, buildSmallPack } from "./decks";
import { shuffle, nextSeed } from "./rng";
import { AREA_CARDS, GATEWAY_INDEX, SPECIAL_VIPER_PIT, SPECIAL_DEEP_POOL } from "./data/areaCards";
import { decodeArea } from "./decode";
import { unpackCoord, packCoord, targetCoord, DIR_UP } from "./coords";
import type { Session, Union, Detachment } from "./multi-session";
import {
  proposeTrade, updateBasket, confirmTrade, cancelTrade, sessionGuard, showSecretDoor,
  grantSecretDoors, secretStairGated, type TradeResult,
} from "./multi-trade";
import {
  declarePvp, setDefenderLine, setAttackerEngage, setDefenderCasters, resolveRoundPvp,
  retreatPvp, proposeStop, acceptStop, PVP_WINDOW_MS, type PvpResult,
} from "./multi-fight";
import {
  proposeUnion, respondUnion, leaveUnion, refuseMove, dissolveUnion, allocateRecruit,
  divideParty, activeUnionOf, unionPostAction,
} from "./multi-union";
import { isZombieParty, zombieActionGate, zombieAfterAction, zombiePostSweep } from "./multi-zombies";

/** Chain two PvP transitions (layout completion → immediate resolve), concatenating their events. */
const mergePvp = (a: PvpResult, b: PvpResult): PvpResult => ({ state: b.state, events: [...a.events, ...b.events] });

/**
 * Multi-party (multiplayer) engine core. Strategy: do NOT fork the single-party rules. One shared
 * Cave (the map + both decks + the RNG stream) plus an array of per-seat Party states. On a seat's
 * action we COMPOSE a single-party GameState (cave ⊕ that party), run the existing `reduce`, then
 * SPLIT the result back into the shared cave and the seat's party. The engine therefore stays the
 * sole authority on rules; this module only partitions state and sequences turns.
 *
 * Beginner ruleset (per the plan): no party-vs-party interaction yet, so a seat only ever sees the
 * shared cave + its own party. Inter-party fights/unions/trading are a later phase.
 *
 * RNG SPLIT (M6, plan revision ②): cave.seed remains the ONE stream for every solo-composed action
 * — reduce reads state.seed for both deck-ordering effects and dice, and a single move can both
 * draw AND roll (hazards fire on entry), so splitting inside a composed action is impossible
 * without editing reduce (frozen, INV-2). The honest boundary is therefore the MULTI layer itself:
 * wherever THIS layer rolls dice (inter-party combat, multi-fight.ts), each side rolls from its
 * own PartyState.diceSeed substream, so a PvP round never perturbs the shared cave stream and
 * "it is always a player's privilege to roll the die for his own scores" holds where two players
 * genuinely touch. Solo-composed draws and rolls interleave exactly as they always did.
 */

export type SeatStatus = "selecting" | "exploring" | "left" | "wiped" | "quit";

/** Shared, single-instance cave fields. */
export interface CaveState {
  areas: GameState["areas"];
  largePack: number[];
  largeIdx: number;
  smallPack: number[];
  smallIdx: number;
  seed: number;
}

/** Everything in a GameState that belongs to ONE party (i.e. a GameState minus the shared cave). */
type PartyCore = Omit<GameState, "areas" | "largePack" | "largeIdx" | "smallPack" | "smallIdx" | "seed">;

export interface PartyState extends PartyCore {
  seat: number;
  color: string;
  name: string;        // the required Party Name (identity)
  status: SeatStatus;
  kills: number;       // enemies slain this game (for the live scoreboard)
  // Secret-door knowledge (spec I-18) — AREA COORDS (packed level/x/y) of secret-stair ends this
  // seat has learnt. Strictly per seat: a mirrored (unprinted) stair is unusable until its area's
  // coord appears here. Grants: own traversal, co-located witness, showSecretDoor, Charmed Flute.
  knownDoors?: number[];
  // Turns of pursuit-escape grace left after retreating from another party (§"Retreat from Another
  // Party": "may take two turns in a row"). Consumed on a CLEAN flight turn (the seat keeps the
  // turn once); cancelled by strangers/another party/a hazard/the pit or pool/stopping for loot.
  fleeGrace?: number;
  // Turns still owed as the union joining fee (spec I-6: each non-commander "forfeits a turn").
  // advanceTurn consumes one per owed turn when the seat's slot comes round (skip-and-decrement).
  forfeitTurnsOwed?: number;
  // Sorcerer bounty sharing (spec I-19): when the Sorcerer fell to a UNION command, every member
  // seat records the OTHER sharing seats here (with sorcererKilled=true). mpScore divides the 30
  // equally among 1 + sorcererSharedWith.length seats at terminal scoring.
  sorcererSharedWith?: number[];
  // Per-party dice substream (M6, plan revision ②; spec §0 principle 2 "it is always a player's
  // privilege to roll the die for his own scores"). Consumed ONLY where the MULTI layer itself
  // rolls dice — today that is multi-fight.ts's rollFor (each PvP side rolls from its own command
  // lead's substream). Solo-composed actions keep rolling from the shared cave.seed: reduce reads
  // state.seed for BOTH deck-ordering effects and dice, so their interleaving stays byte-identical
  // to solo (INV-2) and existing replays are unaffected. Derivation: nextSeed^(seat+1) of the
  // initial cave seed — see buildMpGame. Absent on pre-M6 states: consumers fall back to cave.seed.
  diceSeed?: number;
  // Fog-of-war-lite ledger (M7, plan ⑦): indices of areas this seat has ENTERED. Recorded ALWAYS
  // (cheap, on every mpReduce result — so union follow-moves, PvP retreats and trap falls count),
  // APPLIED only when variants.fogLite is on (fogFilter masks everything not listed here). Seeded
  // with the Gateway (area 0) for every seat at buildMpGame.
  seenAreas?: number[];
  // Zombies variant (M7, spec I-15, rulebook §Zombies): true once this seat's wiped party has
  // risen as the walking dead. A zombie seat keeps status "exploring" (it moves, it can PvP) but
  // is gated hard — no loot, no stranger fights, no water, no secret doors without the Sorcerer —
  // see multi-zombies.ts. A zombie party wiped AGAIN (PvP, or the Sorcerer's death annihilating
  // all zombies) is terminal for good: it does not rise twice.
  zombie?: boolean;
}

export interface MpGameState {
  phase: "partySelect" | "playing" | "finished";
  cave: CaveState;
  parties: PartyState[]; // indexed by seat (parties[i].seat === i)
  order: number[];       // seats in PLAY order (random)
  pickOrder: number[];   // seats in PICK order (= order reversed → first pick is last to move)
  active: number;        // index into pickOrder (partySelect) or order (playing)
  turnCount: number;
  // --- Interaction layer (spec §1.2 Tier C; plan WS-2/3/4) — all optional & additive (INV-3). ---
  session?: Session | null;      // the one active interaction session (trade / pvp / union proposal)
  unions?: Union[];              // active unions (persist across turns, unlike sessions)
  detachments?: Detachment[];    // rear-guards left by division (spec I-8)
  // Concurrent exploration (M6, plan revision ①; spec §1.2 Tier A), a per-game flag. false/absent
  // = strict round-robin (all pre-M6 behaviour, byte-identical). true = free roam: any exploring
  // seat may act at any time UNLESS it is a participant in the live session, owes union forfeits,
  // or is a union subordinate; endTurn is a no-op (there are no turns to pass); turnCount still
  // advances one per completed solo action so the HUD keeps a clock. See mpReduce for the
  // contention rule (deck draws serialise on the shared cursors; a rival's live stranger-fight
  // bars entry to its area) and the fleeGrace/forfeit adaptations.
  concurrent?: boolean;
  // Game variants (M7, plan WS-6), fixed at buildMpGame for the whole game. Absent = today's
  // behaviour, byte-identical. zombies = the rulebook's §Zombies option (spec I-15): a wiped
  // party rises as a spoiler zombie party (multi-zombies.ts). fogLite = plan ⑦ fog-of-war-lite:
  // each seat's served view masks areas it has never entered (fogFilter) — vague hints, not the
  // full hidden-cards variation.
  variants?: { zombies?: boolean; fogLite?: boolean };
}

/** Multiplayer action = any engine action, plus the lobby-level "pass my turn" and the
 *  interaction-layer actions (trade session I-5, secret-door sharing I-18) which run BESIDE the
 *  turn order — session participants answer off-turn, bounded by reaction windows (§1.3). */
export type MpAction =
  | GameAction
  | { type: "endTurn" }
  | { type: "proposeTrade"; to: number }
  | { type: "updateBasket"; treasure: number[]; members: number[] }
  | { type: "confirmTrade" }
  | { type: "cancelTrade" }
  | { type: "showSecretDoor"; to: number }
  // PvP fight session (spec I-9/I-10/I-11) — staged layout + resolution run beside the turn order,
  // gated by the session's stage/window; participants answer off-turn (§1.3).
  | { type: "declareAttack"; to: number }
  | { type: "pvpLine"; line: string[] }
  | { type: "pvpEngage"; engagements: { attackers: string[]; defenders: string[] }[]; backers: { caster: string; at: number }[] }
  | { type: "pvpCasters"; backers: { caster: string; at: number }[] }
  | { type: "pvpResolve" }
  | { type: "pvpRetreat"; dir: number }
  | { type: "pvpProposeStop" }
  | { type: "pvpAcceptStop" }
  // Union lifecycle (spec I-6/I-7) — proposal/answers/leave run BESIDE the turn order (a
  // subordinate's own turn is skipped while united, so leave cannot be turn-gated); division
  // (spec I-8) is an on-turn structural action. Rejoining a detachment is automatic on return.
  | { type: "proposeUnion"; commander: number; invited: number[] }
  | { type: "respondUnion"; accept: boolean }
  | { type: "leaveUnion" }
  | { type: "refuseMove" }
  | { type: "dissolveUnion" }
  | { type: "allocateRecruit"; recruit: number; to: number }
  | { type: "divideParty"; members: number[] };

const TERMINAL: Record<number, SeatStatus> = { [GS_ESCAPED]: "left", [GS_DEAD]: "wiped", [GS_QUIT]: "quit" };

function compose(cave: CaveState, party: PartyState): GameState {
  // party carries every non-cave field (+ seat/color/name/status, which reduce ignores); cave
  // supplies the shared fields. The result is a valid single-party GameState view for this seat.
  return { ...party, ...cave } as unknown as GameState;
}

function splitCave(g: GameState): { cave: CaveState; rest: PartyCore } {
  const { areas, largePack, largeIdx, smallPack, smallIdx, seed, ...rest } = g;
  return { cave: { areas, largePack, largeIdx, smallPack, smallIdx, seed }, rest: rest as PartyCore };
}

/**
 * A turn ends (the seat passes) when the party is back at rest ("explore"), has left/wiped/quit, OR
 * has just completed one round of a continuing fight. Per the rules a fight may last several rounds,
 * "each round ending a turn of play" (§FIGHTS) — so a multi-round battle is fought one round per turn,
 * with other parties acting in between, rather than the whole battle resolving in a single turn.
 *
 * Starting a fight (an `attack`, or a `test` that turns hostile) does not yet fight a round, and a
 * pending casualty choice means the round is not finished — so only a resolved round (`fightOn`, or the
 * `chooseCasualty` that completes it) passes the turn. A reaction test that stays in the encounter, a
 * blocked retreat (which must fight again this turn, §Retreat), and treasure pickup after a won round
 * all remain within the one turn.
 */
function turnEnds(action: MpAction, next: GameState): boolean {
  if (next.gs !== GS_PLAYING) return true;             // party left / wiped / quit
  if (next.phase === "explore") return true;           // back at rest
  if (next.phase === "fight" && !next.fight?.casualtyQueue?.length) {
    // one round fought → pass the turn (a planned resolveRound, or the choice that completes the round)
    return action.type === "resolveRound" || action.type === "chooseCasualty";
  }
  return false;                                        // encounter decision, mid-round, or looting — same turn
}

/** Advance to the next seat (in play order) whose party is still exploring; finish if none remain.
 *  Union turn logic (spec I-6/I-7): a seat still owing its union joining fee has that turn silently
 *  CONSUMED (skip-and-decrement), and a union subordinate's turn is skipped outright — the
 *  commander plays for the combined force on his own slot. Exported for multi-union's formation
 *  hand-off (forming a union during the new subordinate's own turn passes play on immediately). */
export function advanceTurn(mp: MpGameState): MpGameState {
  const n = mp.order.length;
  let parties = mp.parties;
  for (let step = 1; step <= n; step++) {
    const idx = (mp.active + step) % n;
    const seat = mp.order[idx]!;
    const p = parties[seat]!;
    if (p.status !== "exploring") continue;
    if ((p.forfeitTurnsOwed ?? 0) > 0) {
      // The forfeited turn is auto-consumed as it comes round (never a dead stop).
      const left = (p.forfeitTurnsOwed ?? 0) - 1;
      parties = parties.map((q, i) => (i === seat ? { ...q, forfeitTurnsOwed: left > 0 ? left : undefined } : q));
      continue;
    }
    if (mp.unions?.some((u) => !u.dissolved && u.commander !== seat && u.members.includes(seat))) continue;
    return { ...mp, parties, active: idx, turnCount: mp.turnCount + 1 };
  }
  return { ...mp, parties, phase: "finished" };
}

const blocked = (mp: MpGameState): { state: MpGameState; events: GameEvent[] } => ({ state: mp, events: [{ type: "blocked" }] });

/** Build a fresh multiplayer game in the party-selection phase: one shared cave, a party per seat
 *  on the Gateway, and a random play order (pick order is its reverse). `variants` (M7) opts the
 *  whole game into the zombies option and/or fog-of-war-lite; omitted = exactly the old game. */
export function buildMpGame(
  seed: number, seats: { seat: number; color: string; name: string }[],
  variants?: { zombies?: boolean; fogLite?: boolean },
): MpGameState {
  const large = buildLargePack(seed);
  const small = buildSmallPack(large.seed);
  const ord = shuffle(small.seed, seats.map((s) => s.seat));
  const order = ord.result;
  const pickOrder = [...order].reverse();
  const gateway = { card: AREA_CARDS[GATEWAY_INDEX]!, coord: GATEWAY_START_COORD, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 };
  // Per-party dice substreams (M6, spec §0 principle 2): seat k's diceSeed is the initial cave
  // seed advanced k+1 LCG steps — diceSeed(k) = nextSeed^(k+1)(ord.seed). DERIVED, never consumed:
  // cave.seed itself remains ord.seed exactly as before, so the shared stream (deck-ordering and
  // every solo-composed roll) is byte-identical to pre-M6 games. The derivation is a pure function
  // of the game seed and the seat number, hence reproducible on any rebuild or replay.
  const diceSeedFor = (seat: number): number => {
    let d = ord.seed;
    for (let i = 0; i <= seat; i++) d = nextSeed(d);
    return d;
  };
  const parties: PartyState[] = seats.map((s) => ({
    seat: s.seat, color: s.color, name: s.name, status: "selecting", kills: 0,
    gs: GS_PLAYING, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
    partyArea: 0, level: 1, prev: 0, prev2: 0, party: [], strangers: [], treasures: [], hazards: [], fight: null,
    diceSeed: diceSeedFor(s.seat),
    seenAreas: [0], // everyone starts on (and has therefore seen) the Gateway — fog-lite's seed
  }));
  return {
    phase: "partySelect",
    cave: { areas: [gateway], largePack: large.pack, largeIdx: 0, smallPack: small.pack, smallIdx: 0, seed: ord.seed },
    parties, order, pickOrder, active: 0, turnCount: 0,
    ...(variants ? { variants } : {}),
  };
}

/** Turn-based party selection from the ONE shared small pack (drafted in pick order). When the last
 *  seat has chosen, the game transitions to "playing" with the first mover (order[0]) active. */
export function choosePartyFor(mp: MpGameState, seat: number, picks: number[]): { state: MpGameState; ok: boolean; reason?: string } {
  if (mp.phase !== "partySelect") return { state: mp, ok: false, reason: "not_selecting" };
  if (mp.pickOrder[mp.active] !== seat) return { state: mp, ok: false, reason: "not_your_pick" };
  const party = mp.parties[seat];
  if (!party || party.party.length > 0) return { state: mp, ok: false, reason: "already_picked" };
  if (!validatePicks(picks)) return { state: mp, ok: false, reason: "invalid" };

  // Availability against the live shared pack — another seat may already have taken a card.
  const pack = mp.cave.smallPack.slice();
  for (const id of picks) {
    const at = pack.indexOf(100 + id);
    if (at < 0) return { state: mp, ok: false, reason: "unavailable" };
    pack.splice(at, 1);
  }
  const members: PartyMember[] = picks.map((creatureId) => ({ creatureId, status: 0, dragonKills: 0, treasure: [] }));
  const parties = mp.parties.map((p, i) => (i === seat ? { ...p, party: members } : p));
  let out: MpGameState = { ...mp, cave: { ...mp.cave, smallPack: pack }, parties, active: mp.active + 1 };
  if (out.active >= out.pickOrder.length) {
    out = { ...out, phase: "playing", active: 0, parties: out.parties.map((p) => ({ ...p, status: "exploring" as SeatStatus })) };
  }
  return { state: out, ok: true };
}

/** Lift a multi-trade transition into mpReduce's `{ state, events }` shape. */
const lift = (mp: MpGameState, r: TradeResult): { state: MpGameState; events: GameEvent[] } =>
  r.ok ? { state: r.state, events: [] } : blocked(mp);

/** Apply one seat's action in the playing phase, then the always-on cross-cutting passes:
 *  fog-of-war seen-area recording (M7 plan ⑦ — recorded regardless of the fogLite flag, it's
 *  cheap) and the zombies-variant game sweep (rise-on-wipe, Sorcerer-death annihilation, treasure
 *  stripping — multi-zombies.ts). The sweep runs on the WRAPPER so every route that can wipe a
 *  party — solo hazards/fights, PvP resolution, union loan returns — is covered by one hook. */
export function mpReduce(mp: MpGameState, seat: number, action: MpAction, now = 0, windowMs = 60000): { state: MpGameState; events: GameEvent[] } {
  const r = mpReduceInner(mp, seat, action, now, windowMs);
  if (r.state === mp) return r; // blocked / no-op: nothing moved, nothing to record or sweep
  let state = recordSeenAreas(r.state);
  if (state.variants?.zombies === true) state = zombiePostSweep(state).state;
  state = repairTurnFlow(state);
  return state === r.state ? r : { state, events: r.events };
}

/**
 * Repair the turn flow after any transition that bypasses the solo tail's advanceTurn — PvP
 * terminals (session actions return from the interaction layer) and window auto-resolves applied
 * directly by the server. A wipe could otherwise park the strict-mode cursor on a non-exploring
 * seat forever, and an all-terminal state could sit at phase "playing" with nobody able to act.
 */
export function repairTurnFlow(state: MpGameState): MpGameState {
  if (state.phase === "playing" && state.concurrent !== true &&
      state.parties[state.order[state.active]!]?.status !== "exploring") {
    state = advanceTurn(state);
  }
  if (state.phase === "playing" && !state.parties.some((p) => p.status === "exploring")) {
    state = { ...state, phase: "finished" };
  }
  return state;
}

/** Apply one seat's action in the playing phase. Solo actions are turn-gated (only the active seat
 *  may act); interaction-layer actions run beside the turn order — session participants answer
 *  off-turn (spec §1.2 Tier C). `now`/`windowMs` feed the reaction windows (§1.3); the engine never
 *  reads the clock, so both are plain parameters (existing callers unaffected). */
function mpReduceInner(mp: MpGameState, seat: number, action: MpAction, now = 0, windowMs = 60000): { state: MpGameState; events: GameEvent[] } {
  if (mp.phase !== "playing") return blocked(mp);

  // Interaction layer BEFORE the turn gate: trades (I-5) and door-sharing (I-18) are not turns.
  switch (action.type) {
    case "proposeTrade":
      // Trading is barred while either side is united (I-6/I-7): a union member's creatures live
      // in the commander's array (the loan model), and party arrays must stay append-only there.
      if (activeUnionOf(mp, seat) || activeUnionOf(mp, action.to)) return blocked(mp);
      // …and with the risen (M7, §Zombies "cannot carry or use treasure" — nothing to trade).
      if (isZombieParty(mp, seat) || isZombieParty(mp, action.to)) return blocked(mp);
      return lift(mp, proposeTrade(mp, seat, action.to, now, windowMs));
    case "updateBasket": return lift(mp, updateBasket(mp, seat, { treasure: action.treasure, members: action.members }, now, windowMs));
    case "confirmTrade": return lift(mp, confirmTrade(mp, seat, now, windowMs));
    case "cancelTrade": return lift(mp, cancelTrade(mp, seat));
    case "showSecretDoor": return lift(mp, showSecretDoor(mp, seat, action.to));
    // PvP session actions (I-9/I-10/I-11): stage/seat gating lives in multi-fight.ts.
    case "declareAttack": return declarePvp(mp, seat, action.to, now, PVP_WINDOW_MS);
    case "pvpLine": return setDefenderLine(mp, seat, action.line, now, PVP_WINDOW_MS);
    case "pvpEngage": return setAttackerEngage(mp, seat, action.engagements, action.backers, now, PVP_WINDOW_MS);
    case "pvpCasters": {
      const r = setDefenderCasters(mp, seat, action.backers, now, PVP_WINDOW_MS);
      // The layout is complete — resolve the round immediately (defender assigned last, §steps 1-3).
      const done = r.state.session?.kind === "pvp" && r.state.session.stage === "resolved";
      return done ? mergePvp(r, resolveRoundPvp(r.state, now, PVP_WINDOW_MS)) : r;
    }
    case "pvpResolve": return resolveRoundPvp(mp, now, PVP_WINDOW_MS);
    case "pvpRetreat": {
      const r = retreatPvp(mp, seat, action.dir, now);
      // The two-turns-in-a-row flee grace (§"Retreat from Another Party") parks on the party and is
      // consumed/cancelled by the turn logic below on its next turn.
      if (r.fleeGrace) {
        const parties = r.state.parties.map((p, i) => (i === r.fleeGrace!.seat ? { ...p, fleeGrace: r.fleeGrace!.turns } : p));
        return { state: { ...r.state, parties }, events: r.events };
      }
      return { state: r.state, events: r.events };
    }
    case "pvpProposeStop": return proposeStop(mp, seat, now);
    case "pvpAcceptStop": return acceptStop(mp, seat, now);
    // Union lifecycle (I-6/I-7): proposal + answers are a windowed session (off-turn, §1.3);
    // leave/refuse/dissolve/allocate run at boundaries beside the turn order (a subordinate's own
    // turn is skipped while united, so none of these can be turn-gated — see multi-union.ts).
    case "proposeUnion": {
      // Zombies may union only with other zombies (M7, §Zombies) — mixed proposals never open.
      const involved = [seat, action.commander, ...action.invited];
      if (mp.variants?.zombies === true &&
          involved.some((s) => isZombieParty(mp, s)) && involved.some((s) => !isZombieParty(mp, s))) {
        return blocked(mp);
      }
      return lift(mp, proposeUnion(mp, seat, action.commander, action.invited, now, windowMs));
    }
    case "respondUnion": return lift(mp, respondUnion(mp, seat, action.accept, now, windowMs));
    case "leaveUnion": return lift(mp, leaveUnion(mp, seat, now));
    case "refuseMove": return lift(mp, refuseMove(mp, seat, now));
    case "dissolveUnion": return lift(mp, dissolveUnion(mp, seat, now));
    case "allocateRecruit": return lift(mp, allocateRecruit(mp, seat, action.recruit, action.to));
  }

  const concurrent = mp.concurrent === true;
  if (!concurrent && mp.order[mp.active] !== seat) return blocked(mp); // strict mode: not your turn
  const party = mp.parties[seat];
  if (!party || party.status !== "exploring") return blocked(mp);
  // A union subordinate never plays a solo turn — the commander moves the combined force (I-6/I-7).
  // (advanceTurn skips such seats; this guards the window between formation and the next hand-off.)
  const inUnion = activeUnionOf(mp, seat);
  if (inUnion && inUnion.commander !== seat) return blocked(mp);
  // Session locks. Strict mode: only a PvP combatant is locked into its fight (retreat goes
  // through pvpRetreat), while a trade participant may wander off (sessionGuard abandons the
  // trade). Concurrent mode (M6): with no turn boundary to police the walk-away, the ONE live
  // session locks EVERY participant (spec §1.2 Tier C — "only the session's participants are
  // gated"); leaving is an explicit cancelTrade / respondUnion / pvpRetreat, never a silent stroll.
  if (mp.session) {
    const s = mp.session;
    const participants =
      s.kind === "pvp" ? [...s.attacker, ...s.defender] :
      s.kind === "trade" ? [s.a, s.b] :
      [s.commander, ...s.invited, ...s.accepted];
    if ((concurrent || s.kind === "pvp") && participants.includes(seat)) return blocked(mp);
  }
  // Concurrent forfeit lockout (M6 mapping of the union joining fee, I-6): with no turn rotation
  // to skip, a seat owing forfeits may not INITIATE actions; one owed forfeit is paid off each
  // time any OTHER seat completes a solo action (see the tail below). If no rival explorer is
  // left there is nobody to yield to, so the gate stands down rather than dead-stop the last
  // seat (spec §1.3: auto-defaults never dead-stop).
  if (concurrent && (party.forfeitTurnsOwed ?? 0) > 0 &&
      mp.parties.some((p) => p.seat !== seat && p.status === "exploring")) {
    return blocked(mp);
  }
  // Zombie-party gates (M7, spec I-15, rulebook §Zombies): no loot, no chest, no attacking or
  // testing strangers, no stepping into or across water, and no secret stairs unless the Sorcerer
  // walks with the dead — each denial names its rule for the UI (see multi-zombies.ts).
  if (isZombieParty(mp, seat)) {
    const denial = zombieActionGate(mp, seat, action);
    if (denial) return { state: mp, events: denial };
  }

  // Division (spec I-8) is an on-turn structural rearrangement: the guards step out here and now,
  // the turn continues (the mobile part keeps the seat's turn and may still move this turn).
  if (action.type === "divideParty") return lift(mp, divideParty(mp, seat, action.members));

  if (action.type === "endTurn") {
    if (concurrent) return { state: mp, events: [] }; // no turns to pass — a harmless no-op (M6)
    if (party.phase !== "explore") return blocked(mp); // may only pass while at rest
    return { state: advanceTurn(mp), events: [] };
  }

  // Secret-door gate (I-18): a stair that exists only as a mirrored link is invisible to a seat
  // that hasn't learnt it — the vertical move is blocked as if the stair were not there. Zombie
  // parties bypass this per-seat knowledge gate entirely: their all-or-nothing rule (Sorcerer
  // aboard = every secret door, otherwise none) already ran in zombieActionGate above.
  if (action.type === "move" && !isZombieParty(mp, seat) && secretStairGated(mp, seat, action.dir)) return blocked(mp);

  // Concurrent contention rule (M6, spec §1.2): free-roam seats act freely — the only
  // serialisation points are (i) deck draws, which simply consume the shared largeIdx/smallIdx
  // cursors in action-arrival order (transactional at the Convex layer); (ii) same-area
  // interactions, which are sessions (locked above); and (iii) a rival's LIVE stranger-fight,
  // which bars entry: a seat may not move INTO an area where another seat is mid-fight — blocked
  // with the I-13 mask's reason (the mask already bars loot/PvP/attack there for co-located seats).
  if (concurrent && action.type === "move") {
    const cur = mp.cave.areas[party.partyArea];
    if (cur) {
      const { level, x, y } = unpackCoord(cur.coord);
      const destCoord = targetCoord(action.dir, level, x, y);
      const destIdx = mp.cave.areas.findIndex((a) => a.coord === destCoord);
      if (destIdx >= 0) {
        const mask = areaInteractionMask(mp, destIdx);
        if (mask.fightInProgress !== null && mask.fightInProgress !== seat) {
          return { state: mp, events: [{ type: "planRejected", reason: mask.reason ?? "a fight with strangers is under way" }] };
        }
      }
    }
  }

  const { state: next, events } = reduce(compose(mp.cave, party), action);
  if (events.length === 1 && events[0]!.type === "blocked") return { state: mp, events }; // no-op, no handoff

  // The action really dispatched: a participant wandering off abandons any trade it was in (I-5).
  const base = sessionGuard(mp, seat);

  const { cave, rest } = splitCave(next);
  const slain = events.filter((e) => e.type === "strangerKilled" || e.type === "annihilated").length;
  const updated: PartyState = {
    ...rest, seat: party.seat, color: party.color, name: party.name,
    status: TERMINAL[next.gs] ?? "exploring", kills: (party.kills ?? 0) + slain,
  };
  let out: MpGameState = { ...base, cave, parties: base.parties.map((p, i) => (i === seat ? updated : p)) };

  // Secret-door knowledge grants (I-18). (a) A vertical move across a secret-stair end (either end
  // mirrored) teaches the mover BOTH end coords — and every other exploring seat standing in the
  // origin area (co-located witnesses see the door used). (b) A Charmed-Flute reveal
  // (secretDoorRevealed) teaches the acting seat both end coords.
  const originIdx = party.partyArea;
  if (rest.partyArea !== originIdx) {
    const origin = cave.areas[originIdx];
    const dest = cave.areas[rest.partyArea];
    if (origin && dest &&
        unpackCoord(origin.coord).level !== unpackCoord(dest.coord).level &&
        ((origin.mirroredStairs ?? 0) !== 0 || (dest.mirroredStairs ?? 0) !== 0)) {
      const witnesses = mp.parties
        .filter((p) => p.seat !== seat && p.status === "exploring" && p.partyArea === originIdx)
        .map((p) => p.seat);
      out = grantSecretDoors(out, [seat, ...witnesses], [origin.coord, dest.coord]);
    }
  }
  for (const e of events) {
    if (e.type === "secretDoorRevealed") {
      const here = cave.areas[rest.partyArea]!;
      const { level, x, y } = unpackCoord(here.coord);
      out = grantSecretDoors(out, [seat], [here.coord, packCoord(e.dir === DIR_UP ? level - 1 : level + 1, x, y)]);
    }
  }

  // Union / division post-action hook (spec I-6/I-7/I-8/I-19): auto-dissolve on a terminal
  // commander, detachment auto-merge, guarded-loot re-park, recruit recording, Sorcerer bounty
  // sharing, and the union travelling as one behind the commander (see multi-union.ts).
  const hooked = unionPostAction(out, seat, events);
  out = hooked.state;

  // Zombie post-action enforcement (M7, §Zombies; see multi-zombies.ts): hazard-immunity REPAIR
  // (Medusa/vipers/Ghouls fire inside the composed reduce, so their effects on the risen are
  // reverted after the fact and their events filtered), strangers parked back untested (they are
  // indifferent to the dead and the dead will not attack), and any swept-up treasure returned to
  // the floor. Settling an encounter/pickup back to explore ends the turn like any settled entry.
  let actEvents = events;
  let zombieSettled = false;
  if (isZombieParty(out, seat)) {
    const zr = zombieAfterAction(out, seat, party, events);
    out = zr.state;
    actEvents = zr.events;
    zombieSettled = zr.settled;
  }
  const allEvents = [...actEvents, ...hooked.events];

  if (turnEnds(action, next) || zombieSettled) {
    // Pursuit-escape grace (§"Retreat from Another Party"): a party that fled a rival "may take two
    // turns in a row … provided that in its first turn of retreat it does not encounter strangers,
    // another party, a hazard, the viper pit, or the deep pool, and does not stop to pick up any
    // unguarded treasure". A clean flight turn keeps the seat active once; anything on the proviso
    // list forfeits the grace. Concurrent mode (M6) has no consecutive turns to grant, so the grace
    // degrades gracefully: while it lasts it shields the fleeing seat from declareAttack instead
    // (multi-fight.ts's pursuit lockout), consumed/cancelled here on the SAME clean/dirty rules at
    // the same turn-unit boundaries.
    const grace = out.parties[seat]!.fleeGrace ?? 0;
    let cleanFlight = false;
    if (grace > 0) {
      const dirty =
        events.some((e) =>
          (e.type === "drewChamber" && (e.strangers.length > 0 || e.hazards.length > 0)) ||
          e.type === "hazardFired" || e.type === "enteredSpecial" || e.type === "crossedSpecial" ||
          e.type === "reaction" || e.type === "fightStarted") ||
        action.type === "takeTreasure" || action.type === "retakeDropped" || action.type === "openChest" ||
        occupants(out, out.parties[seat]!.partyArea).some((s) => s !== seat); // ran into another party
      const remaining = dirty ? 0 : grace - 1;
      out = { ...out, parties: out.parties.map((p, i) => (i === seat ? { ...p, fleeGrace: remaining > 0 ? remaining : undefined } : p)) };
      cleanFlight = !dirty && remaining > 0 && next.gs === GS_PLAYING;
    }
    if (!concurrent) {
      if (cleanFlight) return { state: out, events: allEvents }; // second turn in a row
      out = advanceTurn(out);
    }
  }
  if (concurrent) {
    // No rotation drives the clock in free roam: turnCount advances one per completed solo action
    // (the HUD's pulse), and each such action pays one owed forfeit off every OTHER seat — the
    // time-boxed reading of the union joining fee (see the lockout gate above): the owing seat
    // stays parked until every debt has been overtaken by rival activity.
    out = {
      ...out,
      turnCount: out.turnCount + 1,
      parties: out.parties.map((p, i) =>
        i !== seat && (p.forfeitTurnsOwed ?? 0) > 0
          ? { ...p, forfeitTurnsOwed: p.forfeitTurnsOwed! > 1 ? p.forfeitTurnsOwed! - 1 : undefined }
          : p),
    };
    // advanceTurn never runs here, so detect the all-terminal finish directly.
    if (!out.parties.some((p) => p.status === "exploring")) out = { ...out, phase: "finished" };
  }
  return { state: out, events: allEvents };
}

/** The single-party GameState view for one seat (shared cave ⊕ that seat's party) — what the
 *  renderer consumes. Includes the cave decks (the client's optimistic move-reduce needs them). */
export function partyView(mp: MpGameState, seat: number): GameState {
  return compose(mp.cave, mp.parties[seat]!);
}

/** The seat whose turn it is (null if not in the playing phase). */
export function currentSeat(mp: MpGameState): number | null {
  return mp.phase === "playing" ? mp.order[mp.active]! : null;
}

// --- Fog-of-war-lite (M7, plan ⑦ — Peter's "face-down rectangles … no detail until you actually
// go there"; vague hints, NOT the full hidden-cards variation) -----------------------------------

/** Append each exploring party's current area to its own seenAreas ledger. Runs on every mpReduce
 *  result (the wrapper), so union follow-moves, PvP retreats and trap falls are recorded exactly
 *  like plain moves. Recorded ALWAYS — it is cheap — and applied only when variants.fogLite is on. */
function recordSeenAreas(mp: MpGameState): MpGameState {
  let parties: PartyState[] | null = null;
  mp.parties.forEach((p, i) => {
    if (p.status !== "exploring") return;
    if ((p.seenAreas ?? []).includes(p.partyArea)) return;
    if (!parties) parties = [...mp.parties];
    parties[i] = { ...p, seenAreas: [...(p.seenAreas ?? []), p.partyArea] };
  });
  return parties ? { ...mp, parties } : mp;
}

/**
 * The fog-of-war-lite render view for one seat (plan ⑦): partyView with every area the seat has
 * never ENTERED reduced to a face-down stub — its existence and coordinate kept (the cave keeps
 * its shape and every party's pawn stays visible: you see WHERE, not WHAT), all detail stripped.
 * Contents, dropped Deep-Pool treasure, display markers, the secret-door letter and the
 * mirrored-stair link are gone; faceUp/visited read false, so the tile renders as a card back —
 * the same presentation as a solo dead-end tile (whose card id equally rides in the payload).
 * RENDER-ONLY: the authoritative rules run on the full state in mpReduce, so a client cannot
 * grant itself anything by fiddling with its filtered copy.
 */
export function fogFilter(mp: MpGameState, seat: number): GameState {
  const p = mp.parties[seat]!;
  const seen = new Set(p.seenAreas ?? []);
  seen.add(p.partyArea); // wherever the party stands, it has self-evidently arrived
  const view = compose(mp.cave, p);
  return {
    ...view,
    areas: view.areas.map((a, i) => seen.has(i) ? a : {
      card: a.card, coord: a.coord, faceUp: false, visited: false,
      contents: [], flags: a.flags, indiffCount: 0,
    }),
  };
}

/** The no-detail fight hint (plan ⑦ item 4; spec I-9 "⚔ a fight has broken out nearby"): how many
 *  OTHER seats are currently fighting — strangers (their phase is "fight") or a PvP session the
 *  viewer is no part of. No location, no fortunes; with fog off it remains as flavour. */
export function distantFights(mp: MpGameState, seat: number): number {
  const fighting = new Set<number>();
  for (const p of mp.parties) {
    if (p.seat !== seat && p.status === "exploring" && p.phase === "fight") fighting.add(p.seat);
  }
  const s = mp.session;
  if (s?.kind === "pvp" && !s.attacker.includes(seat) && !s.defender.includes(seat)) {
    for (const x of [...s.attacker, ...s.defender]) fighting.add(x);
  }
  return fighting.size;
}

// --- Awareness & interaction masks (spec I-1/I-3/I-9/I-13/I-14; plan WS-1) ---------------------

/** Seats whose parties are standing in `areaIdx` and still exploring (Tier-B shared occupancy). */
export function occupants(mp: MpGameState, areaIdx: number): number[] {
  return mp.parties.filter((p) => p.status === "exploring" && p.partyArea === areaIdx).map((p) => p.seat);
}

/** What inter-party interaction is legal in this area right now (evaluated fresh on every read). */
export interface AreaInteractionMask {
  /** A PvP attack may be declared here (§I-9): not the pit/pool, no strangers parked or live, no
   *  co-located party mid-fight. `reason` names the first failing rule for the disabled-button UI. */
  pvpLegal: boolean;
  reason: string | null;
  /** Seat currently fighting strangers in this area — blocks rival loot/pass/attack (§I-13). */
  fightInProgress: number | null;
}

/** Compute the interaction mask for one area. Pure; derived from the shared cave + all seats. */
export function areaInteractionMask(mp: MpGameState, areaIdx: number): AreaInteractionMask {
  const area = mp.cave.areas[areaIdx];
  if (!area) return { pvpLegal: false, reason: "no such area", fightInProgress: null };
  const here = mp.parties.filter((p) => p.status === "exploring" && p.partyArea === areaIdx);
  const fighter = here.find((p) => p.phase === "fight");
  if (fighter) return { pvpLegal: false, reason: "a fight with strangers is under way", fightInProgress: fighter.seat };

  const dec = decodeArea(area.card);
  if (dec.special === SPECIAL_VIPER_PIT || dec.special === SPECIAL_DEEP_POOL) {
    return { pvpLegal: false, reason: "no fighting across the pit or pool", fightInProgress: null };
  }
  // Strangers "in the chamber": parked on the tile (100+cid) or live in a co-located working set.
  const parkedStrangers = area.contents.some((c) => c >= 100 && c < 200);
  const liveStrangers = here.some((p) => p.strangers.length > 0 || (p.sleeping ?? []).length > 0);
  if (parkedStrangers || liveStrangers) {
    return { pvpLegal: false, reason: "clear the strangers first", fightInProgress: null };
  }
  return { pvpLegal: true, reason: null, fightInProgress: null };
}

/**
 * Surprise for a PvP attack (§I-9): +1 only when the attacker arrived by another way than the
 * defender entered — "you cannot gain the advantage over a party which you are following". Each
 * party's `prev` records the area it last entered from, which is exactly that doorway proxy.
 */
export function pvpSurprise(attacker: PartyState, defender: PartyState): number {
  return attacker.prev !== defender.prev ? 1 : 0;
}

/** The seat whose pick it is (null if not selecting). */
export function currentPicker(mp: MpGameState): number | null {
  return mp.phase === "partySelect" ? mp.pickOrder[mp.active]! : null;
}
