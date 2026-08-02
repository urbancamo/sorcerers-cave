import { selectionCost, startingStock } from "./data/creatures";
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

/** True if `picks` is a legal starting party: selectable ids, total cost <= 6, within stock.
 *  Routed through the variant-aware `selectionCost`/`startingStock` (SC-EXT-29, design US-01/§1.3):
 *  absent/false `variants` resolves the exact same costs and stock as before this param existed
 *  (base ids 0-7 only, Ogre 5 / Troll 4) — byte-identical (SC-EXT-1). Kit-on additionally admits
 *  Witch/Scholar/Thief/Lion/Wolf at their official costs and the Ogre 5→4 / Troll 4→3 revision. */
export function validatePicks(picks: readonly number[], variants?: { extensionKit?: boolean }): boolean {
  if (picks.length === 0) return false;
  let total = 0;
  const counts = new Map<number, number>();
  for (const id of picks) {
    const cost = selectionCost(id, variants);
    if (cost === null) return false; // not a selectable starter
    total += cost;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (total > PARTY_BUDGET) return false;
  const stock = startingStock(variants);
  for (const [id, n] of counts) {
    if (n > (stock[id] ?? 0)) return false;
  }
  return true;
}

/** Create a fresh solitaire game: validate party, shuffle both decks, place the Gateway.
 *  `variants` (§EXT, SC-EXT-1) is stored on the returned state, immutable for the life of the game;
 *  absent/false ⇒ byte-identical to calling with no third argument at all. */
export function newGame(
  seed: number,
  picks: readonly number[],
  variants?: { extensionKit?: boolean },
  testMode?: boolean,
): GameState {
  if (!validatePicks(picks, variants)) throw new Error("Invalid party selection");

  const large = buildLargePack(seed, variants);
  const small = buildSmallPack(large.seed, variants);

  // The party is drawn FROM the small pack: remove the chosen creature cards so they cannot also be
  // drawn as chamber strangers (one finite deck — rules §"choosing creatures from the small pack").
  // validatePicks has already confirmed enough copies of each, so every removal succeeds.
  const smallPack = small.pack.slice();
  for (const creatureId of picks) {
    const at = smallPack.indexOf(100 + creatureId);
    if (at >= 0) smallPack.splice(at, 1);
  }

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
    phase: "explore",
    turn: 1,
    score: 0,
    curses: 0,
    bonusScore: 0,
    sorcererKilled: false,
    areas: [gateway],
    partyArea: 0,
    level: 1,
    prev: 0,
    prev2: 0,
    party,
    largePack: large.pack,
    largeIdx: 0,
    smallPack,
    smallIdx: 0,
    strangers: [],
    treasures: [],
    hazards: [],
    seed: small.seed,
    fight: null,
    ...(variants ? { variants } : {}),
    ...(testMode ? { testMode: true as const } : {}),
  };
}
