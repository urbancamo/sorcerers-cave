import { CREATURES, STARTING_STOCK } from "./data/creatures";
import { AREA_CARDS, GATEWAY_INDEX } from "./data/areaCards";
import { buildLargePack, buildSmallPack } from "./decks";
import {
  GS_PLAYING,
  GATEWAY_START_COORD,
  PARTY_BUDGET,
  type GameState,
  type PartyMember,
  type PlacedArea,
} from "./state";

/** True if `picks` is a legal starting party: selectable ids, total cost <= 6, within stock. */
export function validatePicks(picks: readonly number[]): boolean {
  if (picks.length === 0) return false;
  let total = 0;
  const counts = new Map<number, number>();
  for (const id of picks) {
    const c = CREATURES[id];
    if (!c || c.cost === null) return false; // not a selectable starter
    total += c.cost;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (total > PARTY_BUDGET) return false;
  for (const [id, n] of counts) {
    if (n > (STARTING_STOCK[id] ?? 0)) return false;
  }
  return true;
}

/** Create a fresh solitaire game: validate party, shuffle both decks, place the Gateway. */
export function newGame(seed: number, picks: readonly number[]): GameState {
  if (!validatePicks(picks)) throw new Error("Invalid party selection");

  const large = buildLargePack(seed);
  const small = buildSmallPack(large.seed);

  const gateway: PlacedArea = {
    card: AREA_CARDS[GATEWAY_INDEX]!, // 175
    coord: GATEWAY_START_COORD,
    faceUp: true,
    visited: false,
    contents: [],
    flags: 0,
    indiffCount: 0,
  };

  const party: PartyMember[] = picks.map((creatureId) => ({
    creatureId,
    status: 0,
    dragonKills: 0,
    treasure: [],
  }));

  return {
    gs: GS_PLAYING,
    turn: 1,
    score: 0,
    curses: 0,
    sorcererKilled: false,
    areas: [gateway],
    partyArea: 0,
    level: 1,
    prev: 0,
    prev2: 0,
    party,
    largePack: large.pack,
    largeIdx: 0,
    smallPack: small.pack,
    smallIdx: 0,
    strangers: [],
    treasures: [],
    hazards: [],
    seed: small.seed,
  };
}
