import {
  GS_PLAYING, GS_ESCAPED, GS_DEAD, GS_QUIT, GATEWAY_START_COORD,
  type GameState, type PartyMember,
} from "./state";
import type { GameAction, GameEvent } from "./actions";
import { reduce } from "./reduce";
import { validatePicks } from "./setup";
import { buildLargePack, buildSmallPack } from "./decks";
import { shuffle } from "./rng";
import { AREA_CARDS, GATEWAY_INDEX } from "./data/areaCards";

/**
 * Multi-party (multiplayer) engine core. Strategy: do NOT fork the single-party rules. One shared
 * Cave (the map + both decks + the RNG stream) plus an array of per-seat Party states. On a seat's
 * action we COMPOSE a single-party GameState (cave ⊕ that party), run the existing `reduce`, then
 * SPLIT the result back into the shared cave and the seat's party. The engine therefore stays the
 * sole authority on rules; this module only partitions state and sequences turns.
 *
 * Beginner ruleset (per the plan): no party-vs-party interaction yet, so a seat only ever sees the
 * shared cave + its own party. Inter-party fights/unions/trading are a later phase.
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
}

export interface MpGameState {
  phase: "partySelect" | "playing" | "finished";
  cave: CaveState;
  parties: PartyState[]; // indexed by seat (parties[i].seat === i)
  order: number[];       // seats in PLAY order (random)
  pickOrder: number[];   // seats in PICK order (= order reversed → first pick is last to move)
  active: number;        // index into pickOrder (partySelect) or order (playing)
  turnCount: number;
}

/** Multiplayer action = any engine action, plus the lobby-level "pass my turn". */
export type MpAction = GameAction | { type: "endTurn" };

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
 * A turn ends (the seat passes) only when the party is back at rest, i.e. its phase has returned to
 * "explore" — or the party has left/wiped/quit. The active seat therefore keeps acting until any
 * encounter is fully resolved: a reaction test, every round of a multi-round fight, casualty choices,
 * and treasure pickup all happen within the one turn and never spill onto later turns.
 */
function turnEnds(_action: MpAction, next: GameState): boolean {
  if (next.gs !== GS_PLAYING) return true;             // party left / wiped / quit
  return next.phase === "explore";                     // at rest (encounter/fight/pickup fully resolved)
}

/** Advance to the next seat (in play order) whose party is still exploring; finish if none remain. */
function advanceTurn(mp: MpGameState): MpGameState {
  const n = mp.order.length;
  for (let step = 1; step <= n; step++) {
    const idx = (mp.active + step) % n;
    if (mp.parties[mp.order[idx]!]!.status === "exploring") {
      return { ...mp, active: idx, turnCount: mp.turnCount + 1 };
    }
  }
  return { ...mp, phase: "finished" };
}

const blocked = (mp: MpGameState): { state: MpGameState; events: GameEvent[] } => ({ state: mp, events: [{ type: "blocked" }] });

/** Build a fresh multiplayer game in the party-selection phase: one shared cave, a party per seat
 *  on the Gateway, and a random play order (pick order is its reverse). */
export function buildMpGame(seed: number, seats: { seat: number; color: string; name: string }[]): MpGameState {
  const large = buildLargePack(seed);
  const small = buildSmallPack(large.seed);
  const ord = shuffle(small.seed, seats.map((s) => s.seat));
  const order = ord.result;
  const pickOrder = [...order].reverse();
  const gateway = { card: AREA_CARDS[GATEWAY_INDEX]!, coord: GATEWAY_START_COORD, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 };
  const parties: PartyState[] = seats.map((s) => ({
    seat: s.seat, color: s.color, name: s.name, status: "selecting",
    gs: GS_PLAYING, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
    partyArea: 0, level: 1, prev: 0, prev2: 0, party: [], strangers: [], treasures: [], hazards: [], fight: null,
  }));
  return {
    phase: "partySelect",
    cave: { areas: [gateway], largePack: large.pack, largeIdx: 0, smallPack: small.pack, smallIdx: 0, seed: ord.seed },
    parties, order, pickOrder, active: 0, turnCount: 0,
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

/** Apply one seat's action in the playing phase. Turn-gated: only the active seat may act. */
export function mpReduce(mp: MpGameState, seat: number, action: MpAction): { state: MpGameState; events: GameEvent[] } {
  if (mp.phase !== "playing") return blocked(mp);
  if (mp.order[mp.active] !== seat) return blocked(mp); // not your turn
  const party = mp.parties[seat];
  if (!party || party.status !== "exploring") return blocked(mp);

  if (action.type === "endTurn") {
    if (party.phase !== "explore") return blocked(mp); // may only pass while at rest
    return { state: advanceTurn(mp), events: [] };
  }

  const { state: next, events } = reduce(compose(mp.cave, party), action);
  if (events.length === 1 && events[0]!.type === "blocked") return { state: mp, events }; // no-op, no handoff

  const { cave, rest } = splitCave(next);
  const updated: PartyState = { ...rest, seat: party.seat, color: party.color, name: party.name, status: TERMINAL[next.gs] ?? "exploring" };
  let out: MpGameState = { ...mp, cave, parties: mp.parties.map((p, i) => (i === seat ? updated : p)) };
  if (turnEnds(action, next)) out = advanceTurn(out);
  return { state: out, events };
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

/** The seat whose pick it is (null if not selecting). */
export function currentPicker(mp: MpGameState): number | null {
  return mp.phase === "partySelect" ? mp.pickOrder[mp.active]! : null;
}
