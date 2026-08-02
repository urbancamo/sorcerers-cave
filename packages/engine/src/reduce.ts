import { GS_PLAYING, GS_QUIT, GS_ESCAPED, GS_DEAD, AF_DESTROYED, AF_BELL_SPENT, AF_UNRESOLVED, type GameState, type PartyMember, type PlacedArea } from "./state";
import { tryMove } from "./map";
import { decodeArea } from "./decode";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_CHASM, SPECIAL_WHIRLPOOL, SPECIAL_WELL, SPECIAL_BELL_ROPE } from "./data/areaCards";
import { viperCrossing, deepPoolCrossing, whirlpoolCrossing } from "./special";
import { enterChamber, drawSmallCards } from "./chamber";
import { applyHazards, hasStaffWizard } from "./hazards";
import { HAZARD_MEDUSA } from "./data/hazards";
import { takeTreasure, canCarry } from "./pickup";
import { unpackCoord, packCoord, targetCoord, DIR_UP, DIR_DOWN } from "./coords";
import type { GameAction, GameEvent } from "./actions";
import { reactionRoll } from "./reaction";
import { frontStrength } from "./combat";
import { validatePlan, resolvePlannedRound } from "./combatPlan";
import {
  wardOffSpectres, annihilateWithEye, eyeActive, reconcileUnicorns, hasWoman, fluteLulls, eyeForsakenByDeath, ringInvincible, usesArtifactsAs,
  hasLivingHuman, holyWaterTargets, HW_STATUE_BASE, HW_MEDUSA, HW_STRANGER_BASE,
} from "./effects";
import { BORNEABLE, isBorne, sweepFallen, spillCarried } from "./loot";
import { rollDie } from "./rng";
import {
  getSubLocation, oppositeDir, RING_ADJACENCY_SPECIALS, ISLAND_JUMP_SPECIALS, SUB_LOCATION_SPECIALS,
  type SubAt,
} from "./subLocation";
// Extension kit (SC-EXT-17): aliases `ALL_CREATURES` — `strongestStranger`'s fight-focus pick and
// the Lost-Ruby wrestler's combat-roll name both index by an actual creatureId that may already be
// a kit id (14-20); byte-identical for ids 0-13.
import { ALL_CREATURES as CREATURES } from "./data/creatures";

const T_EYE_OF_GOD = 13; // treasure id — must stay with its bearer or the party is cursed (§Eye of God)
const C_GIANT = 12; // only a Giant can recover treasure cast into a Deep Pool (§Deep Pool)
const C_WIZARD = 8;
const C_THIEF = 19; // extension-kit creature — a living Thief ally unlocks guarded treasure in an
                     // indifference-pacified area (design US-17, SC-EXT-19)
const T_CRYPT = 21; // extension-kit treasure — the crypt's find converts to this ordinary treasure (SC-EXT-13)
const C_APPRENTICE = 14; // extension-kit creature — never leaves the cave (design US-14, SC-EXT-20)
const C_DEMON = 15; // extension-kit creature — forces immediate hostile combat on sight (design US-13, SC-EXT-21)
const C_SORCERER = 11; // Holy Water's WEAKEN mode target, alongside the Apprentice (design US-20, SC-EXT-24)

/** Can a living Giant fish at least one dropped item out of a Deep Pool right now? Recovery is a
 *  Giant-only, capacity-limited pickup (§Deep Pool): a Man/Ogre/etc. can never lift pool treasure,
 *  and a Giant already loaded to capacity can't either. Multiple Giants each count. */
function giantCanRecover(state: GameState, dropped: readonly number[]): boolean {
  return state.party.some(
    (m) => (m.status === 0 || m.status === 1) && m.creatureId === C_GIANT && dropped.some((t) => canCarry(m, t)),
  );
}

/** Precise Locations (§10.5): the `sunkTreasure` bucket key for a given sub-location, or undefined
 *  when there isn't one to sink into/reclaim from (centre, or an undetermined doorway direction). */
function sunkKey(sub: { at: SubAt; dir?: number }): "island" | 1 | 2 | 3 | 4 | undefined {
  if (sub.at === "island") return "island";
  if (sub.at === "doorway" && sub.dir !== undefined) return sub.dir as 1 | 2 | 3 | 4;
  return undefined;
}

/** Precise Locations (§10.5): pull (and remove) the sunk-treasure bucket at `key` from `area`, or
 *  undefined if there isn't one / it's empty. */
function takeSunkBucket(area: PlacedArea, key: "island" | 1 | 2 | 3 | 4 | undefined): number[] | undefined {
  if (key === undefined || !area.sunkTreasure?.length) return undefined;
  const bucket = area.sunkTreasure.find((b) => b.at === key);
  if (!bucket || bucket.items.length === 0) return undefined;
  area.sunkTreasure = area.sunkTreasure.filter((b) => b !== bucket);
  return bucket.items;
}

/** First living member who may bear+use `artifact` now (some artifacts need a specific creature).
 *  Extension kit (SC-EXT-17): each class-keyed check runs through `usesArtifactsAs` so a kit
 *  creature "using artifacts as" that class (design §1.3) joins the same eligibility — Apprentice
 *  as Wizard(8), Scholar/Witch as Priest(4), Thief as Man(5). */
function findBearer(state: GameState, artifact: number): number {
  return state.party.findIndex((m: PartyMember) => {
    if (!(m.status === 0 || m.status === 1) || !m.treasure.includes(artifact)) return false;
    if (artifact === 6) return m.creatureId === 6 || m.creatureId === 1 || usesArtifactsAs(m.creatureId, 4) || usesArtifactsAs(m.creatureId, 8); // Balm: Woman/W-Hero/Priest/Wizard
    if (artifact === 9) return usesArtifactsAs(m.creatureId, 8); // Staff reanimation: Wizard
    if (artifact === 4) return usesArtifactsAs(m.creatureId, 4) || usesArtifactsAs(m.creatureId, 8); // Magic Carpet: Priest/Wizard
    if (artifact === 12) return m.creatureId === 0 || m.creatureId === 1 || usesArtifactsAs(m.creatureId, 4) || usesArtifactsAs(m.creatureId, 5) || m.creatureId === 6 || usesArtifactsAs(m.creatureId, 8); // Charmed Flute: Hero/W-Hero/Priest/Man/Woman/Wizard
    return true;
  });
}

/** Persist the chamber working set back into the area, then return to exploring. */
function persistAndExplore(state: GameState): void {
  const area = state.areas[state.partyArea]!;
  // Heavy treasure left behind in a Deep Pool sinks back onto its `dropped` pile (recoverable only by
  // a Giant on a later visit) rather than the ordinary floor contents.
  const onDeepPool = decodeArea(area.card).special === SPECIAL_DEEP_POOL;
  if (onDeepPool && state.treasures.length > 0) {
    area.dropped = [...(area.dropped ?? []), ...state.treasures];
  }
  area.contents = [
    ...area.contents,
    ...state.strangers.map((id) => 100 + id),
    ...(onDeepPool ? [] : state.treasures.map((id) => 200 + id)),
    ...(state.sleeping ?? []).map((id) => 400 + id), // sleeping creatures stay (inert) in the chamber
    ...(state.statues ?? []).map((id) => 500 + id), // Gallery statues stay (inert) in the chamber (SC-EXT-10)
    ...(state.lulled ?? []).map((id) => 100 + id), // flute-lulled dragons park AWAKE — re-lulled on re-entry only if the flute is still held
  ];
  // Clear the live working set now that it's parked on the area — otherwise leftover cards (e.g.
  // treasure the party left behind) keep rendering on the party's current tile as they move on.
  state.strangers = [];
  state.treasures = [];
  state.hazards = [];
  state.sleeping = [];
  // Only clear `statues` if it was already defined (a Gallery visit) — an unconditional `= []` here
  // would introduce the field into EVERY chamber exit's state, kit-off included, breaking the
  // solo-golden byte-identity snapshots (SC-EXT-1; see the matching guard in `enterChamber`).
  if (state.statues) state.statues = [];
  state.lulled = [];
  state.fightDrops = []; // moving on — the drop record no longer applies
  state.phase = "explore";
  // Extension kit (SC-EXT-19): a Thief-unlocked pickup session (`settlePacifiedArea` below) is over
  // once the party leaves — `delete` rather than `= false` so a kit-off (or Thief-less) game never
  // gains this key at all (SC-EXT-1 byte-identity; deleting an absent key is a harmless no-op).
  delete state.thiefPickup;
}

/** Extension kit (SC-EXT-19, design US-17): a living Thief ally (creature 19) present. */
function hasThief(state: GameState): boolean {
  return state.party.some((m) => (m.status === 0 || m.status === 1) && m.creatureId === C_THIEF);
}

/**
 * Settle a chamber the party has already permanently pacified — either by indifference (§Reactions)
 * or by the womanless-Unicorn-guard case (§Unicorn) — called both the instant a party's 3rd
 * indifferent test locks the area in (`test` case) and on every later re-entry (`finishChamber`).
 * Base behaviour: the guards and the treasure they watch both park back onto the floor and the party
 * returns to explore, unable to loot. With a living Thief ally present, treasure actually here to
 * lift, AND the area pacified by INDIFFERENCE specifically — design US-17's literal wording, "in any
 * area pacified by indifference where treasure lies under the strangers' watch" — the Thief slips
 * past the guards instead: they still park — unengaged, no fight offered or required — but the
 * treasure stays in the live pickup working set and the phase goes straight to `pickup`,
 * `thiefPickup` marking the session so `takeTreasure` can narrate each lift ("The Thief palms the
 * [item]."). Review fix (SC-EXT-19): a Unicorn-guarded area (`state.unicornGuardAreas`) is EXCLUDED
 * from this unlock even though it shares the same `pacifiedAreas` re-entry gate — a friendly Unicorn
 * standing guard is not "indifference," and this exclusion applies identically whether the area was
 * JUST pacified this turn or is being re-entered later. Any other working-set leftovers
 * (`sleeping`/`statues`/`lulled`/`fightDrops`) are simply left live in state rather than flushed here
 * — harmless, since nothing else touches them before the eventual real `persistAndExplore`
 * (pickup's end, or `leaveTreasure`) merges them back exactly as it always does.
 */
function settlePacifiedArea(state: GameState): void {
  const unicornGuarded = state.unicornGuardAreas?.includes(state.partyArea) ?? false;
  if (hasThief(state) && state.treasures.length > 0 && !unicornGuarded) {
    const area = state.areas[state.partyArea]!;
    area.contents = [...area.contents, ...state.strangers.map((id) => 100 + id)];
    state.strangers = [];
    state.thiefPickup = true;
    state.phase = "pickup";
    return;
  }
  persistAndExplore(state);
}

/** Index of the strongest current stranger (default focus target). */
function strongestStranger(state: GameState): number {
  let best = 0;
  for (let i = 1; i < state.strangers.length; i++) {
    const a = CREATURES[state.strangers[i]!]!;
    const b = CREATURES[state.strangers[best]!]!;
    if (a.fs + a.mp > b.fs + b.mp) best = i;
  }
  return best;
}

/** Begin a fight with the given surprise (+1 party, -1 strangers). */
function startFight(state: GameState, surprise: number): GameEvent[] {
  state.fight = { surprise, round: 1, focus: strongestStranger(state) };
  state.phase = "fight";
  state.surpriseReady = false; // the surprise (if any) is now baked into the fight
  state.fightDrops = []; // fresh fight — forget any earlier drop record
  return [{ type: "fightStarted", surprise }];
}

/** Extension kit (SC-EXT-21, design US-13): a Demon present in `state.strangers` forces an
 *  immediate hostile fight — no reaction test, "like always-hostile" (unlike `hostileAreas`,
 *  which applies only once THIS party has already retreated from THIS area before). Fires
 *  identically whether the party just stepped onto its area (a fresh move/carpet/relocateDown
 *  entry, or a later revisit) or fled back INTO it (`withdraw`). Returns true when it fired —
 *  callers skip their own ordinary phase resolution for this entry. */
function ambushIfDemon(state: GameState, events: GameEvent[]): boolean {
  if (!state.strangers.includes(C_DEMON)) return false;
  events.push({ type: "demonUnfolds" });
  events.push(...startFight(state, -1));
  return true;
}

/** Extension kit (SC-EXT-21, fix round): pull a Demon marker parked on `area`'s own persisted
 *  `contents` (by an earlier draw made elsewhere, design US-13) into the LIVE `state.strangers`
 *  working set, for every entry path that never runs `enterChamber`'s own reload cycle — a plain
 *  tunnel/Gateway, or a Deep Pool/Viper Pit special (both return from `resolveAreaLoop` before
 *  ever reaching the generic tunnel branch, so each needs this same pull-in at its own entry
 *  point). Mutates `area.contents` and `state.strangers`; returns true when one was found, so the
 *  caller can immediately follow with `ambushIfDemon` (entry-ambush fires BEFORE any of the
 *  special's own crossing/pool logic — that logic only ever runs when the party later LEAVES,
 *  which can't happen until they've survived arriving). */
function pullParkedDemon(state: GameState, area: PlacedArea): boolean {
  const demonIdx = area.contents.indexOf(100 + C_DEMON);
  if (demonIdx < 0) return false;
  area.contents.splice(demonIdx, 1);
  state.strangers = [C_DEMON];
  return true;
}

/** Settle the outcome once a round (and any casualty choices) is fully resolved: a Unicorn may
 *  depart, the party may be wiped, or the foes cleared (→ pickup / explore). */
function finalizeRound(state: GameState): GameEvent[] {
  const events = reconcileUnicorns(state); // a Unicorn departs if the last Woman fell (§ Unicorn)
  const partyAlive = state.party.some((m) => m.status === 0 || m.status === 1);
  if (!partyAlive) {
    state.gs = GS_DEAD;
    state.phase = "gameOver";
    state.fight = null;
    // A wiped party's fallen spill their CARRIED items onto the tile for whoever comes next; borne
    // items are lost with the bodies (plan ④a / I-12 — matters most in multiplayer, harmless in solo).
    events.push(...sweepFallen(state, "contents"));
    state.party.forEach((m) => { m.potionActive = false; });
    events.push({ type: "gameOver", gs: GS_DEAD });
  } else if (state.strangers.length === 0) {
    // The party won: reclaim treasure dropped onto the floor to fight so it joins the pickup (§387).
    const area = state.areas[state.partyArea]!;
    const reclaimed = area.contents.filter((c) => c >= 200 && c < 300).map((c) => c - 200);
    if (reclaimed.length) {
      state.treasures.push(...reclaimed);
      area.contents = area.contents.filter((c) => c < 200 || c >= 300);
    }
    // The survivors recover their fallen comrades' CARRIED items — they join the post-win pickup
    // ("anything they were carrying can be taken from them at the end of the turn", §Medusa; §489's
    // Eye-on-a-corpse becomes recoverable here). Borne items stay lost with the body (plan ④a).
    events.push(...sweepFallen(state, "working"));
    state.fight = null;
    state.party.forEach((m) => { m.potionActive = false; });
    events.push({ type: "fightWon" });
    if (state.treasures.length > 0) state.phase = "pickup";
    else persistAndExplore(state);
  }
  // else: still fighting; resolveRound already advanced the round
  return events;
}

/** Free any party members left as stone in the party's CURRENT area, if a living Wizard (or the
 *  Apprentice, who "uses artifacts as a Wizard" — design US-14, SC-EXT-17) bearing the Magic Staff
 *  is present (§Medusa). They rejoin the party and leave the chamber's stone display. */
function reviveStoned(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const wizardWithStaff = state.party.some(
    (m) => (m.status === 0 || m.status === 1) && usesArtifactsAs(m.creatureId, C_WIZARD) && m.treasure.includes(9),
  );
  if (!wizardWithStaff) return events;
  for (const m of state.party) {
    if (m.status === 2 && m.stoneArea === state.partyArea) {
      m.status = 0;
      m.stoneArea = undefined;
      events.push({ type: "memberRevived", creatureId: m.creatureId });
    }
  }
  return events;
}

/** Extension kit (SC-EXT-11): a living Wizard bearing the Magic Staff cracks every Gallery statue
 *  awake the instant the party enters (design US-06 / Resolved-14) — mirrors `reviveStoned`'s own
 *  bearer condition (`hasStaffWizard`) exactly. Waking converts them to ordinary strangers, so the
 *  standard chamber interaction (one group reaction test, fight/recruit) follows in the normal tail
 *  (`finishChamber`). Unlike `reviveStoned` (which runs BEFORE the chamber draw, since it frees
 *  PARTY members left stone on an earlier visit), this must run AFTER `enterChamber` has populated
 *  `state.statues` for the area just entered.
 *  Task 10 (SC-EXT-17): the Apprentice (id 14) "uses artifacts as Wizard" per the design — she now
 *  counts here too, via `hasStaffWizard`'s own `usesArtifactsAs` check (closes the Task 7 seam). */
function wakeGalleryStatues(state: GameState): GameEvent[] {
  if (!state.statues?.length || !hasStaffWizard(state)) return [];
  const creatureIds = [...state.statues];
  state.strangers.push(...creatureIds);
  state.statues = [];
  return [{ type: "staffWake", creatureIds }];
}

/** A Medusa is about to gaze, nothing already neutralises her (staff-Wizard, or her Lotus sleep),
 *  and a living member holds Lotus Dust — the throw-or-proceed decision is the player's
 *  (§Lotus Dust "Works on MEDUSA"). */
function medusaLooms(state: GameState): boolean {
  if (!state.hazards.includes(HAZARD_MEDUSA) || hasStaffWizard(state)) return false;
  const until = state.areas[state.partyArea]!.medusaAsleepUntil;
  if (until !== undefined && state.turn <= until) return false; // asleep — nothing to decide
  return state.party.some((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(5));
}

/** Fire the chamber's hazards and settle the entry's outcome (wipe / encounter / pickup / explore).
 *  Returns true when a trap dropped the party a level: the caller must resolve the area fallen into.
 *  `freshEntry` alone governs `surpriseReady` (SC-4-16: earned only on a genuinely fresh, non-trap
 *  chamber entry). `announceLull` (defaults to `freshEntry`) governs only the `dragonsLulled` notice —
 *  split out because an extra draw into an already-entered chamber (Well/Bell, SC-EXT-7/8) is never a
 *  fresh entry, yet a dragon it just drew is still genuinely new information the player hasn't seen
 *  (`resolveExtraDraw` passes `true` explicitly for that case). */
function finishChamber(state: GameState, freshEntry: boolean, events: GameEvent[], announceLull = freshEntry): boolean {
  const { events: hzEvents, fell } = applyHazards(state);
  events.push(...hzEvents);
  // A hazard may incapacitate the whole party (Medusa petrifies everyone, or Ghouls slay them) —
  // with no one left able to act, the expedition ends.
  if (!state.party.some((m) => m.status === 0 || m.status === 1)) {
    state.gs = GS_DEAD;
    state.phase = "gameOver";
    if (state.party.every((m) => m.status === 2)) events.push({ type: "petrifiedOut" }); // all turned to stone
    events.push({ type: "gameOver", gs: GS_DEAD });
    return false;
  }
  if (fell) {
    // The party falls away from this chamber — its strangers and treasure stay behind here (parked
    // to its contents). Clearing the working set first stops them leaking onto the tile fallen into.
    persistAndExplore(state);
    relocateDown(state);
    events.push({ type: "trapSprung", level: state.level });
    events.push({ type: "moved", area: state.partyArea, level: state.level });
    return true;
  }
  // The Charmed Flute lulls every Dragon for as long as the party holds it: they sleep in the
  // chamber, no longer leading or blocking, so a friendlier creature reacts and the area plays
  // out as if empty (§ Charmed Flute). Re-evaluated each entry, so they wake if the flute is gone.
  if (fluteLulls(state) && state.strangers.includes(10)) {
    const dragons = state.strangers.filter((id) => id === 10);
    state.lulled = [...(state.lulled ?? []), ...dragons];
    state.strangers = state.strangers.filter((id) => id !== 10);
    if (announceLull) events.push({ type: "dragonsLulled", count: dragons.length });
  }
  // Extension kit (SC-EXT-21): a Demon is always hostile — including one parked into an area the
  // party had already permanently pacified (by an earlier draw made elsewhere while they were away,
  // same as the `withdraw` case below, reduce.ts:642). This check must run BEFORE the pacifiedAreas
  // branch: otherwise `settlePacifiedArea` would silently re-park the Demon right back onto the tile
  // (or, with a Thief, slip it into a live pickup) every single re-entry, forever suppressing it.
  if (ambushIfDemon(state, events)) {
    return false;
  }
  // Permanently indifferent to this party (§Reactions): the party may walk freely through (any exit)
  // — so park the guards to the tile and go to explore for full traversal — but it may also still
  // CHOOSE to attack them (selectors offers an Attack action; the guarded treasure stays out of reach
  // unless they're beaten). Other parties are unaffected. Extension kit (SC-EXT-19): a living Thief
  // ally instead slips the guarded treasure straight into a live pickup — `settlePacifiedArea` covers
  // both that and the ordinary re-park.
  if (state.pacifiedAreas?.includes(state.partyArea)) {
    settlePacifiedArea(state);
    return false;
  }
  if (state.strangers.length > 0) {
    if (state.hostileAreas?.includes(state.partyArea)) {
      // The party retreated from these strangers before — they attack on sight (with surprise). §Retreat
      events.push(...startFight(state, -1));
    } else {
      state.phase = "encounter";
      // Surprise if attacking immediately on a fresh entry — never after a trap fall (§Surprise).
      state.surpriseReady = freshEntry && !state.fellThroughTrap;
    }
  } else if (state.treasures.length > 0) {
    state.phase = "pickup";
  } else {
    persistAndExplore(state);
  }
  return false;
}

/** Resume the entry held at the Medusa pause — the dust thrown or the gaze braved — firing the
 *  held hazards and playing the chamber out (looping on if a trap drops the party further).
 *  A pause opened by a Well/Bell extra draw (`medusaPause.extraDraw` set) resumes through the SAME
 *  surprise-preservation / forced-lull-announcement contract as the non-paused extra-draw path
 *  (SC-4-16 fix, `finishExtraDraw`) — otherwise this is byte-identical to the pre-fix behaviour. */
function resumeFromMedusaPause(state: GameState): GameEvent[] {
  const freshEntry = state.medusaPause?.freshEntry ?? false;
  const extraDraw = state.medusaPause?.extraDraw;
  delete state.medusaPause;
  const events: GameEvent[] = [];
  if (extraDraw) {
    finishExtraDraw(state, events, extraDraw.hadSurprise);
  } else if (finishChamber(state, freshEntry, events)) {
    events.push(...resolveAreaLoop(state));
  }
  return events;
}

/** Resolve the area just entered: special markers, then chamber draw + hazards + phase (spec §4/§7). */
function resolveArea(state: GameState): GameEvent[] {
  const events: GameEvent[] = [{ type: "moved", area: state.partyArea, level: state.level }];
  // Reveal a Spell-remapped area (design US-22, SC-EXT-28) the moment it's genuinely re-entered —
  // every landing path here funnels through `resolveArea` except `withdraw` (known gap, task report).
  const landed = state.areas[state.partyArea]!;
  if ((landed.flags & AF_UNRESOLVED) !== 0) landed.flags &= ~AF_UNRESOLVED;
  // Returning to a chamber with our petrified members + a Wizard's Magic Staff frees them on arrival.
  events.push(...reviveStoned(state));
  events.push(...resolveAreaLoop(state));
  return events;
}

/** The special/tunnel/chamber resolution cycle — loops when a trap drops the party a level. */
function resolveAreaLoop(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (;;) {
    const dec = decodeArea(state.areas[state.partyArea]!.card);
    if (dec.special === SPECIAL_DEEP_POOL) {
      const area = state.areas[state.partyArea]!;
      // Extension kit (SC-EXT-21, fix round): a Demon may be lurking here even though Deep Pool
      // is a non-chamber special that returns before the generic tunnel branch below — pull a
      // parked marker in and ambush FIRST, ahead of the pool's own treasure-reclaim/telegraph
      // logic (that logic only matters once the party has survived arriving; the pool's own
      // CROSSING effects, elsewhere, only fire when the party later LEAVES by a fresh doorway).
      if (pullParkedDemon(state, area)) { ambushIfDemon(state, events); return events; }
      // Treasure cast into a Deep Pool is recoverable only by a Giant (§Deep Pool). Reclaim it into a
      // Giant-only pickup only when a living Giant has the spare capacity to lift some of it; otherwise
      // it stays sunk in the pool for a future visit.
      if (area.dropped && area.dropped.length > 0 && giantCanRecover(state, area.dropped)) {
        state.treasures = area.dropped;
        area.dropped = [];
        events.push({ type: "treasureReclaimed", count: state.treasures.length });
        state.phase = "pickup"; // Giant-only, weight-limited (see legalActions / takeTreasure)
        return events;
      }
      // Precise Locations (§10.5): a deliberate `dropTreasure` cast into THIS sub-location, same
      // Giant-only gate as the automatic pile above — checked separately (only one bucket reclaims
      // per visit; a rare double-stash waits for a later trip, a named simplification).
      {
        const key = sunkKey(getSubLocation(state));
        const sunk = takeSunkBucket(area, key);
        if (sunk && giantCanRecover(state, sunk)) {
          state.treasures = sunk;
          events.push({ type: "treasureReclaimed", count: sunk.length });
          state.phase = "pickup";
          return events;
        }
        if (sunk) area.sunkTreasure = [...(area.sunkTreasure ?? []), { at: key!, items: sunk }]; // no Giant yet — put it back
      }
      events.push({ type: "enteredSpecial", special: dec.special });
      state.phase = "explore";
      return events;
    }
    if (dec.special === SPECIAL_VIPER_PIT) {
      // Extension kit (SC-EXT-21, fix round): same Demon pull-in as Deep Pool above — the Viper
      // Pit is likewise a non-chamber special that returns before the generic tunnel branch.
      if (pullParkedDemon(state, state.areas[state.partyArea]!)) { ambushIfDemon(state, events); return events; }
      // Precise Locations (§10.5): treasure cast into the Viper Pit is recoverable only by a party
      // with the Charmed Flute (Peter's notes; mirrors Deep Pool's Giant-only gate, §10.2). Once
      // eligible, ordinary capacity-gated pickup rules decide who actually carries it out.
      {
        const area = state.areas[state.partyArea]!;
        const key = sunkKey(getSubLocation(state));
        const sunk = takeSunkBucket(area, key);
        if (sunk && fluteLulls(state)) {
          state.treasures = sunk;
          events.push({ type: "treasureReclaimed", count: sunk.length });
          state.phase = "pickup";
          return events;
        }
        if (sunk) area.sunkTreasure = [...(area.sunkTreasure ?? []), { at: key!, items: sunk }]; // no Flute yet — put it back
      }
      events.push({ type: "enteredSpecial", special: dec.special });
      state.phase = "explore";
      return events;
    }
    if (dec.special === SPECIAL_WHIRLPOOL) {
      // Unlike Deep Pool / Viper Pit, the Whirlpool IS a chamber (design US-05): it draws on entry
      // like any other, so this only adds the entry telegraph and falls through to the chamber path
      // below rather than returning early.
      events.push({ type: "enteredSpecial", special: dec.special });
    }
    if (!dec.chamber) {
      // A passage tile (tunnel / the Gateway) hosts no encounter, but the party may have LEFT treasure
      // on its floor — dropTreasure and leaveTreasure park it as 200+tid on `area.contents` (§7.3-5/6).
      // Reload any such floor treasure into a pickup so it can be reclaimed on return; without this,
      // anything dropped in a tunnel would be stranded, since a passage tile never runs enterChamber.
      const area = state.areas[state.partyArea]!;
      // Extension kit (SC-EXT-21): a Demon may be lurking here (parked by an earlier draw
      // elsewhere, design US-13) even though this tile is an ordinary tunnel/Gateway, which never
      // runs `enterChamber`'s reload cycle — pull it into the live working set here so the ambush
      // still fires (a tunnel can never otherwise hold a "stranger").
      if (pullParkedDemon(state, area)) { ambushIfDemon(state, events); return events; }
      const floor = area.contents.filter((c) => c >= 200 && c < 300);
      if (floor.length > 0) {
        state.treasures = floor.map((c) => c - 200);
        area.contents = area.contents.filter((c) => c < 200 || c >= 300);
        state.phase = "pickup";
        return events;
      }
      state.phase = "explore";
      return events;
    }
    const freshEntry = !state.areas[state.partyArea]!.visited; // first visit by this (unused) doorway → eligible for surprise
    events.push(...enterChamber(state));
    events.push(...wakeGalleryStatues(state)); // Staff-Wizard cracks every Gallery statue awake (SC-EXT-11)
    events.push(...annihilateWithEye(state)); // the Eye destroys Spectres on sight (§ Eye of God)
    events.push(...wardOffSpectres(state)); // the Talisman drives off Spectres on level >= 4 (§ Talisman)
    if (medusaLooms(state)) {
      // Hold every hazard while the player decides: throw the Lotus Dust at Medusa, or proceed.
      state.phase = "medusa";
      state.medusaPause = { freshEntry };
      events.push({ type: "medusaLooms" });
      return events;
    }
    if (!finishChamber(state, freshEntry, events)) return events;
  }
}

/**
 * Finish an "extra draw" into an ALREADY-entered chamber — the Well's 1-card and the Bell Rope's
 * 2-card draw (SC-EXT-7/SC-EXT-8) — whether reached directly or via a resumed Medusa pause opened
 * mid-draw (SC-4-16 fix, both callers below). Never a fresh entry for SURPRISE purposes (the draw
 * itself earns none, but must not clobber surprise already earned and unconsumed from this
 * chamber's ORIGINAL fresh entry — restored from `hadSurprise` whenever still in `encounter`
 * afterward); always announces a freshly-drawn Dragon's lull, since that's new information to the
 * player regardless of chamber freshness. Loops via `resolveAreaLoop` if a drawn Trap drops the
 * party a level — the fresh landing area then computes its OWN surprise correctly and must not be
 * overwritten.
 */
function finishExtraDraw(state: GameState, events: GameEvent[], hadSurprise: boolean | undefined): void {
  if (finishChamber(state, false, events, true)) {
    events.push(...resolveAreaLoop(state));
  } else if (state.phase === "encounter") {
    state.surpriseReady = hadSurprise;
  }
}

/**
 * Resolve cards freshly drawn INTO the current (already-entered) chamber (design US-07/US-03).
 * Mirrors the tail of the per-chamber body in `resolveAreaLoop` (Eye/Talisman on a fresh Spectre,
 * the Medusa pause, then `finishExtraDraw`'s hazards + phase contract).
 */
function resolveExtraDraw(state: GameState, events: GameEvent[]): void {
  // Preserve any surprise already earned by this chamber's ORIGINAL fresh entry and not yet spent —
  // finishChamber(freshEntry=false) would otherwise force it to false unconditionally (SC-4-16 fix).
  const hadSurprise = state.surpriseReady;
  events.push(...annihilateWithEye(state));
  events.push(...wardOffSpectres(state));
  if (medusaLooms(state)) {
    // The pause must carry `hadSurprise` through to its resume (`resumeFromMedusaPause`) — a plain
    // `{ freshEntry: false }` (like a genuine fresh-entry pause) would lose it, reproducing the same
    // clobber this function's own resume path guards against (SC-4-16 fix, round 2).
    state.phase = "medusa";
    state.medusaPause = { freshEntry: false, extraDraw: { hadSurprise } };
    events.push({ type: "medusaLooms" });
    return;
  }
  finishExtraDraw(state, events, hadSurprise);
}

/** Move the whole party to the area directly below (same x,y), creating it if needed. */
// Pre-relocation presentation snapshot (SC-4-43): every relocation that interrupts an area's
// presentation (Trap during a chamber draw, Whirlpool drag, Chasm descent, Crypt fall) funnels
// through relocateDown. The snapshot lets the UI hold the room the events actually happened in
// as the backdrop until their dice/notices are dismissed (docs/bugs/ZTNU-log.json). Per-reduce
// scratch: the engine is synchronous, `reduce` drains it before returning.
let pendingMidState: GameState | null = null;

function relocateDown(state: GameState): void {
  pendingMidState = structuredClone(state);
  const { x, y, level } = unpackCoord(state.areas[state.partyArea]!.coord);
  const target = packCoord(level + 1, x, y);
  let idx = state.areas.findIndex((a) => a.coord === target);
  if (idx < 0) {
    // A trap is a one-way drop — no stair-up is added (the party cannot climb back). The card is
    // drawn in its printed form, so it renders in its native orientation like any other tile.
    const card = state.largeIdx < state.largePack.length ? state.largePack[state.largeIdx++]! : 31;
    state.areas.push({ card, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 });
    idx = state.areas.length - 1;
  }
  state.prev2 = state.prev;
  state.prev = state.partyArea;
  state.partyArea = idx;
  state.level = level + 1;
  state.fellThroughTrap = true; // one-way: prev is the (unreachable) level above — no withdraw/retreat
  delete state.subLocation; // Precise Locations (§10.5): a real position change invalidates any jump override
}

/** Teleport the party one step in `dir`, ignoring doors; place a new face-up card if the target is unexplored. */
function carpetMove(state: GameState, dir: number): void {
  const current = state.areas[state.partyArea]!;
  const { level, x, y } = unpackCoord(current.coord);
  const target = targetCoord(dir, level, x, y);
  const targetLevel = unpackCoord(target).level;
  let idx = state.areas.findIndex((a) => a.coord === target);
  if (idx < 0) {
    let drawn = state.largeIdx < state.largePack.length ? state.largePack[state.largeIdx++]! : 31;
    const mirroredStairs = (dir === DIR_DOWN ? 32 : 0) | (dir === DIR_UP ? 64 : 0); // climb/descend-back link, not printed art
    if (dir === DIR_DOWN) drawn |= 32; // mirror a stair-up so the party can climb back
    if (dir === DIR_UP) drawn |= 64; // mirror a stair-down so the party can descend back
    // A printed stair-up on a level-1 card is a cave exit and is kept (§ level-1 exits) — see tryMove.
    state.areas.push({ card: drawn, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0, mirroredStairs });
    idx = state.areas.length - 1;
  } else {
    state.areas[idx]!.faceUp = true;
  }
  state.prev2 = state.prev;
  state.prev = state.partyArea;
  state.partyArea = idx;
  state.level = targetLevel;
  state.fellThroughTrap = false; // carpet links both ways
  delete state.subLocation; // Precise Locations (§10.5): a real position change invalidates any jump override
}

export function reduce(
  state: GameState,
  action: GameAction,
): { state: GameState; events: GameEvent[]; midState?: GameState } {
  pendingMidState = null;
  const result = reduceCore(state, action);
  if (pendingMidState !== null) {
    const midState: GameState = pendingMidState;
    pendingMidState = null;
    return { ...result, midState };
  }
  return result;
}

function reduceCore(state: GameState, action: GameAction): { state: GameState; events: GameEvent[] } {
  if (state.gs !== GS_PLAYING) return { state, events: [] };

  switch (action.type) {
    case "quit":
      return { state: { ...state, gs: GS_QUIT, phase: "gameOver" }, events: [{ type: "gameOver", gs: GS_QUIT }] };

    case "exitCave": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const dec = decodeArea(state.areas[state.partyArea]!.card);
      if (state.level === 1 && dec.stairUp) {
        const next = structuredClone(state);
        const events: GameEvent[] = [];
        // Extension kit (SC-EXT-20, design US-14): the Apprentice "will not leave the cave" — any
        // Apprentice ally is dropped from the scored roster the instant the party actually
        // escapes (she is worth 0 points regardless, but the design calls out her removal and
        // its own notice explicitly, not just a silent 0-point pass-through).
        const staying = next.party.filter((m) => m.status === 1 && m.creatureId === C_APPRENTICE);
        if (staying.length > 0) {
          next.party = next.party.filter((m) => !staying.includes(m));
          events.push({ type: "apprenticeStaysBehind", count: staying.length });
        }
        next.gs = GS_ESCAPED;
        next.phase = "gameOver";
        events.push({ type: "gameOver", gs: GS_ESCAPED });
        return { state: next, events };
      }
      return { state, events: [{ type: "blocked" }] };
    }

    case "move": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const fromSpecial = decodeArea(state.areas[state.partyArea]!.card).special;
      // Precise Locations (§10.5, §8.1): a Viper-Pit/Whirlpool ledge only reaches its two ADJACENT
      // doorways — block the one directly opposite the party's current doorway (retrace and an
      // island-sourced crossing are unaffected). Mirrors the same gate in selectors.ts's
      // legalActions (defense in depth: the reducer must not trust the client to only ever send a
      // legal dir).
      if (RING_ADJACENCY_SPECIALS.has(fromSpecial)) {
        const sub = getSubLocation(state);
        if (sub.at === "doorway" && sub.dir !== undefined && action.dir === oppositeDir(sub.dir)) {
          return { state, events: [{ type: "blocked" }] };
        }
      }
      const fromIdx = state.partyArea;
      const oldPrev = state.prev;
      const areasBefore = state.areas.length; // snapshot: did tryMove place a brand-new target tile?
      const largeIdxBefore = state.largeIdx; // snapshot: did tryMove burn a large-pack card for it?
      const res = tryMove(state, action.dir);
      if (!res.moved) {
        return { state: res.state, events: [res.deadEnd ? { type: "deadEnd", dir: action.dir } : { type: "blocked" }] };
      }
      const next = { ...res.state, turn: res.state.turn + 1 };
      next.fellThroughTrap = false; // a normal move reaches a reachable area (resolveArea re-sets it if a trap fires)
      delete next.subLocation; // Precise Locations (§10.5): a real move invalidates any jump override
      const events: GameEvent[] = [];
      const crossing = next.partyArea !== oldPrev; // not simply going back the way we came

      if (crossing && fromSpecial === SPECIAL_VIPER_PIT) {
        events.push({ type: "crossedSpecial", special: SPECIAL_VIPER_PIT });
        events.push(...viperCrossing(next));
        if (!next.party.some((m) => m.status === 0 || m.status === 1)) {
          next.gs = GS_DEAD;
          next.phase = "gameOver";
          events.push({ type: "gameOver", gs: GS_DEAD });
          return { state: next, events };
        }
      } else if (crossing && fromSpecial === SPECIAL_DEEP_POOL) {
        events.push({ type: "crossedSpecial", special: SPECIAL_DEEP_POOL });
        events.push(...deepPoolCrossing(next, fromIdx));
      } else if (crossing && fromSpecial === SPECIAL_WHIRLPOOL) {
        const { events: wpEvents, dragged } = whirlpoolCrossing(next);
        events.push(...wpEvents);
        if (dragged) {
          // The lateral move is cancelled — the party is dragged down FROM the Whirlpool tile
          // instead (one-way, no return stair; `fellThroughTrap` blocks withdraw at the landing —
          // design US-05 / Resolved-12). Undo the lateral arrival tryMove already applied: if it
          // drew and placed a brand-new tile for the (now-cancelled) target, remove it and give its
          // large-pack card back first — otherwise a phantom explored tile would linger on the map
          // and relocateDown would burn an extra card beyond its own draw. tryMove pushes at most
          // one area (always the last element), and only for a fresh target; an already-explored
          // target (no push, no draw) makes this a no-op, as it must be.
          if (next.areas.length > areasBefore) {
            next.areas.pop();
            next.largeIdx = largeIdxBefore;
          }
          next.partyArea = fromIdx;
          next.prev = oldPrev;
          relocateDown(next);
          events.push(...resolveArea(next));
          return { state: next, events };
        }
      }

      events.push(...resolveArea(next));
      return { state: next, events };
    }

    // Precise Locations (§10.5, §8.2): jump from a doorway onto the island without leaving the
    // tile — Peter's house rule, Viper Pit/Deep Pool only. Never changes partyArea/prev; only the
    // explicit `subLocation` override moves. Reuses the ordinary crossing risk verbatim (viperPit's
    // per-creature fatal d6 / deepPoolCrossing's auto-drop), so the mechanical events are identical
    // to an ordinary crossing — `islandJump` alone distinguishes "stayed here" from "left."
    case "jumpToIsland": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const dec = decodeArea(state.areas[state.partyArea]!.card);
      if (!ISLAND_JUMP_SPECIALS.has(dec.special)) return { state, events: [{ type: "blocked" }] };
      if (getSubLocation(state).at !== "doorway") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.subLocation = { area: next.partyArea, at: "island" };
      const events: GameEvent[] = [{ type: "islandJump", special: dec.special }];
      if (dec.special === SPECIAL_VIPER_PIT) {
        events.push(...viperCrossing(next));
        if (!next.party.some((m) => m.status === 0 || m.status === 1)) {
          next.gs = GS_DEAD;
          next.phase = "gameOver";
          events.push({ type: "gameOver", gs: GS_DEAD });
        }
      } else {
        events.push(...deepPoolCrossing(next, next.partyArea));
      }
      return { state: next, events };
    }

    case "withdraw": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      if (state.fellThroughTrap) return { state, events: [{ type: "blocked" }] }; // no way back up a trap
      if (state.noWithdrawTurn === state.turn) return { state, events: [{ type: "blocked" }] }; // Well/Bell fired this turn (SC-EXT-9)
      if (((state.areas[state.prev]?.flags ?? 0) & AF_DESTROYED) !== 0) return { state, events: [{ type: "blocked" }] }; // the way back collapsed (earthquake)
      const next = structuredClone(state);
      next.areas[next.partyArea]!.contents = [
        ...next.areas[next.partyArea]!.contents,
        ...next.strangers.map((id) => 100 + id),
        ...next.treasures.map((id) => 200 + id),
        ...(next.sleeping ?? []).map((id) => 400 + id),
        ...(next.statues ?? []).map((id) => 500 + id), // Gallery statues stay put (SC-EXT-10)
        ...(next.lulled ?? []).map((id) => 100 + id), // flute-lulled dragons park awake (re-lulled on re-entry if held)
      ];
      next.strangers = []; next.treasures = []; next.hazards = []; next.sleeping = [];
      if (next.statues) next.statues = []; // guarded — see persistAndExplore's comment (SC-EXT-1)
      next.lulled = [];
      next.partyArea = next.prev;
      next.level = unpackCoord(next.areas[next.partyArea]!.coord).level;
      const events: GameEvent[] = [{ type: "moved", area: next.partyArea, level: next.level }];
      // Extension kit (SC-EXT-21): a Demon may be lurking in the area withdrawn INTO — parked by a
      // draw made elsewhere while the party was away (design US-13's "or withdrawing into") — pull
      // it in and force the ambush instead of a quiet return to `explore`.
      pullParkedDemon(next, next.areas[next.partyArea]!);
      if (!ambushIfDemon(next, events)) next.phase = "explore";
      return { state: next, events };
    }

    case "takeTreasure": {
      if (state.phase !== "pickup") return { state, events: [{ type: "blocked" }] };
      // Deep Pool recovery is Giant-only: no other creature may lift treasure out of the water.
      if (decodeArea(state.areas[state.partyArea]!.card).special === SPECIAL_DEEP_POOL) {
        const taker = state.party[action.mi];
        if (!taker || taker.creatureId !== C_GIANT) return { state, events: [{ type: "blocked" }] };
      }
      const next = structuredClone(state);
      if (next.treasures[action.ti] === 11) { // Lost Ruby — guarded by a strength-8 statue (§16)
        const fighter = next.party[action.mi];
        if (!fighter || !(fighter.status === 0 || fighter.status === 1)) return { state, events: [{ type: "blocked" }] };
        const events: GameEvent[] = [];
        if (eyeActive(next)) { // the Eye stills the statue: take the Ruby with no fight
          fighter.treasure.push(11);
          next.treasures.splice(action.ti, 1);
          events.push({ type: "rubyTaken" }, { type: "statuePowerless" });
          if (next.treasures.length === 0) persistAndExplore(next);
          return { state: next, events };
        }
        const pr = rollDie(next.seed); next.seed = pr.seed;
        const sr = rollDie(next.seed); next.seed = sr.seed;
        const fighterTotal = frontStrength(fighter) + pr.value;
        const won = fighterTotal >= 8 + sr.value; // the statue guards with strength 8 (§16)
        // Surface the roll so the UI can show the fight (the statue is a foe you must beat).
        events.push({
          type: "combatRoll",
          party: CREATURES[fighter.creatureId]!.name,
          enemy: "Statue",
          partyRoll: pr.value,
          enemyRoll: sr.value,
          partyTotal: fighterTotal,
          enemyTotal: 8 + sr.value,
          result: won ? "partyWon" : "enemyWon",
        });
        if (won) {
          fighter.treasure.push(11);
          next.treasures.splice(action.ti, 1);
          events.push({ type: "rubyTaken" });
        } else if (ringInvincible(fighter, next)) {
          // The Ring shrugs off the statue's killing blow at level >= 4 (§Ring). The wrestle was still
          // lost, so the Ruby stays in place (not spliced) and can be attempted again later.
          events.push({ type: "deathPrevented", creatureId: fighter.creatureId });
          events.push({ type: "statueAroused" });
        } else {
          // The wrestler is slain, but the statue does NOT stay aroused: it only ever strikes the
          // member who explicitly tries to take the Ruby — never the party on a passive re-entry.
          // The Ruby is left in place (not spliced) so it can be attempted again later. statueAroused
          // here just labels this wrestle's dice overlay (§16).
          fighter.status = 3;
          events.push({ type: "memberDied", creatureId: fighter.creatureId });
          events.push({ type: "statueAroused" });
          // The slain wrestler's CARRIED items spill onto the floor with the rest of the pickup;
          // a borne Sword/Staff/Ring is lost with the body (plan ④a / I-12).
          events.push(...sweepFallen(next, "working"));
          if (!next.party.some((m) => m.status === 0 || m.status === 1)) {
            next.gs = GS_DEAD;
            next.phase = "gameOver";
            events.push({ type: "gameOver", gs: GS_DEAD });
            return { state: next, events };
          }
        }
        if (next.treasures.length === 0) persistAndExplore(next);
        return { state: next, events };
      }
      // Extension kit (SC-EXT-19): a Thief-unlocked pickup (`settlePacifiedArea`) narrates each lift
      // ("The Thief palms the [item].") — captured before `takeTreasure` splices `next.treasures`.
      const liftedTid = next.treasures[action.ti];
      const lifted = takeTreasure(next, action.ti, action.mi);
      const events: GameEvent[] = lifted && next.thiefPickup && liftedTid !== undefined
        ? [{ type: "thiefPalmed", tid: liftedTid }]
        : [];
      if (next.treasures.length === 0) persistAndExplore(next);
      return { state: next, events };
    }

    case "leaveTreasure": {
      if (state.phase !== "pickup") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      persistAndExplore(next);
      return { state: next, events: [] };
    }

    case "retakeDropped": {
      // After a won fight: give each fighter back the heavy treasure it set down to fight (§387), in the
      // distribution it had before — skipping any whose dropper fell or who can no longer carry it.
      if (state.phase !== "pickup") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const remaining: { mi: number; tid: number }[] = [];
      let count = 0;
      for (const drop of next.fightDrops ?? []) {
        const m = next.party[drop.mi];
        const ti = next.treasures.indexOf(drop.tid);
        if (m && (m.status === 0 || m.status === 1) && ti >= 0 && canCarry(m, drop.tid)) {
          m.treasure.push(drop.tid);
          next.treasures.splice(ti, 1);
          count += 1;
        } else {
          remaining.push(drop);
        }
      }
      if (count === 0) return { state, events: [{ type: "blocked" }] };
      next.fightDrops = remaining;
      const events: GameEvent[] = [{ type: "droppedRetaken", count }];
      if (next.treasures.length === 0) persistAndExplore(next);
      return { state: next, events };
    }

    case "moveTreasure": {
      // Redistribute carried treasure between members — but not mid-fight (spec §Mutiny/holdings).
      if (state.phase === "fight" || state.phase === "gameOver") return { state, events: [{ type: "blocked" }] };
      if (action.from === action.to) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const from = next.party[action.from];
      const to = next.party[action.to];
      if (!from || !to) return { state, events: [{ type: "blocked" }] };
      if (!(to.status === 0 || to.status === 1)) return { state, events: [{ type: "blocked" }] }; // recipient must be living
      const tid = from.treasure[action.idx];
      if (tid === undefined || !canCarry(to, tid)) return { state, events: [{ type: "blocked" }] }; // honour carry capacity
      // A stone member's goods are beyond reach (its carried items already spilled at petrification;
      // what remains is petrified with it) and a corpse's BORNE item is lost with the body (plan ④a).
      if (from.status === 2) return { state, events: [{ type: "blocked" }] };
      if (from.status === 3 && isBorne(from, tid)) return { state, events: [{ type: "blocked" }] };
      from.treasure.splice(action.idx, 1);
      if (isBorne(from, tid)) from.borne = from.borne!.filter((t) => t !== tid); // handing it over un-bears it
      to.treasure.push(tid);
      // The Eye of God must stay with its bearer — moving it off them brings a curse (§Eye of God).
      if (tid === T_EYE_OF_GOD) { next.curses += 1; return { state: next, events: [{ type: "eyeForsaken" }] }; }
      return { state: next, events: [] };
    }

    case "dropTreasure": {
      if (state.phase === "fight" || state.phase === "gameOver") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const m = next.party[action.mi];
      if (!m) return { state, events: [{ type: "blocked" }] };
      const tid = m.treasure[action.idx];
      if (tid === undefined) return { state, events: [{ type: "blocked" }] };
      // Stone members' goods are beyond reach; a corpse's borne item is lost with the body (plan ④a).
      if (m.status === 2) return { state, events: [{ type: "blocked" }] };
      if (m.status === 3 && isBorne(m, tid)) return { state, events: [{ type: "blocked" }] };
      m.treasure.splice(action.idx, 1);
      if (isBorne(m, tid)) m.borne = m.borne!.filter((t) => t !== tid); // dropping it un-bears it
      // During an active pickup the chamber floor IS the live working set, so a member dropping
      // treasure to free capacity (e.g. a Giant clearing room for the 100kg Chest) lands it back on
      // the floor where it can be re-taken this same visit. Otherwise (at rest) it parks on contents —
      // UNLESS this is one of the four special areas (§10.5, §8.3 fix): a deliberate drop there sinks
      // into the sub-location it was cast from (a doorway or the island), protected/precise rather
      // than ordinary open contents anyone can find.
      if (next.phase === "pickup") {
        next.treasures.push(tid);
      } else {
        const area = next.areas[next.partyArea]!;
        const special = decodeArea(area.card).special;
        const key = SUB_LOCATION_SPECIALS.has(special) ? sunkKey(getSubLocation(next)) : undefined;
        if (key !== undefined) {
          area.sunkTreasure = area.sunkTreasure ?? [];
          let bucket = area.sunkTreasure.find((b) => b.at === key);
          if (!bucket) { bucket = { at: key, items: [] }; area.sunkTreasure.push(bucket); }
          bucket.items.push(tid);
        } else {
          area.contents.push(200 + tid); // left on the chamber floor
        }
      }
      // Forsaking the Eye of God curses the party (§Eye of God).
      if (tid === T_EYE_OF_GOD) { next.curses += 1; return { state: next, events: [{ type: "eyeForsaken" }] }; }
      return { state: next, events: [] };
    }

    case "setBorne": {
      // Bear (wield/wear) or stow an item (plan ④a). Only the Sword/Staff/Ring have a borne mode;
      // borne items go down with the body on death/petrification, carried items spill to the floor.
      // Party-panel action like moveTreasure — not offered via legalActions, not usable mid-fight.
      if (state.phase === "fight" || state.phase === "gameOver") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const m = next.party[action.mi];
      if (!m || !(m.status === 0 || m.status === 1)) return { state, events: [{ type: "blocked" }] };
      const tid = m.treasure[action.idx];
      if (tid === undefined) return { state, events: [{ type: "blocked" }] };
      if (action.borne) {
        if (!BORNEABLE.includes(tid) || isBorne(m, tid)) return { state, events: [{ type: "blocked" }] };
        m.borne = [...(m.borne ?? []), tid];
      } else {
        if (!isBorne(m, tid)) return { state, events: [{ type: "blocked" }] };
        m.borne = m.borne!.filter((t) => t !== tid);
      }
      return { state: next, events: [] };
    }

    case "test": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      if ((state.indiffStreak ?? 0) >= 3) return { state, events: [{ type: "blocked" }] }; // permanently indifferent
      const next = structuredClone(state);
      next.surpriseReady = false; // approaching to test forfeits the chance of a surprise attack (§Surprise)
      const roll = reactionRoll(next);
      next.seed = roll.seed;
      const events: GameEvent[] = [{ type: "reaction", outcome: roll.outcome, roll: roll.roll }];
      if (roll.outcome === "friendly") {
        const womanPresent = hasWoman(next);
        // A friendly group is added to the party in full — the original rules impose no party-size
        // limit (§8, "the player immediately adds them to his party as allies"). The only stranger
        // that won't join is a Womanless Unicorn (id 13), which stays behind guarding the area.
        const joinPool = next.strangers.filter((id) => !(id === 13 && !womanPresent));
        const guardPool = next.strangers.filter((id) => id === 13 && !womanPresent);
        for (const id of joinPool) next.party.push({ creatureId: id, status: 1, dragonKills: 0, treasure: [] });
        events.push({ type: "strangersJoined", count: joinPool.length });
        if (guardPool.length > 0) {
          next.strangers = guardPool;
          for (const id of guardPool) events.push({ type: "unicornGuards", creatureId: id });
          // The womanless Unicorn guards the area for THIS party (per-party): pass through, no loot.
          if (!next.pacifiedAreas?.includes(next.partyArea)) {
            next.pacifiedAreas = [...(next.pacifiedAreas ?? []), next.partyArea];
          }
          // Review fix (SC-EXT-19): mark this specifically as a Unicorn-guard pacification, NOT
          // indifference — the Thief's pickup-unlock (`settlePacifiedArea`) must never fire here,
          // on this turn or any later re-entry, per design US-17's literal "pacified by indifference".
          if (!next.unicornGuardAreas?.includes(next.partyArea)) {
            next.unicornGuardAreas = [...(next.unicornGuardAreas ?? []), next.partyArea];
          }
          persistAndExplore(next); // the party moves on, leaving the Unicorn (and guarded treasure) behind
        } else {
          next.strangers = [];
          if (next.treasures.length > 0) next.phase = "pickup";
          else persistAndExplore(next);
        }
      } else if (roll.outcome === "indifferent") {
        next.indiffStreak = (next.indiffStreak ?? 0) + 1;
        if (next.indiffStreak >= 3) {
          // Permanently indifferent to this party: treasure stays guarded (no pickup) UNLESS a
          // living Thief ally is present (design US-17, SC-EXT-19) — but the party may now leave by
          // any valid exit either way. Record the area so re-entry skips the encounter.
          if (!next.pacifiedAreas?.includes(next.partyArea)) {
            next.pacifiedAreas = [...(next.pacifiedAreas ?? []), next.partyArea];
          }
          events.push({ type: "pacified" }); // tell the player they may now move on
          settlePacifiedArea(next); // Thief present + treasure here -> live pickup; else the ordinary re-park
        }
        // else stays in the encounter phase
      } else {
        events.push(...startFight(next, -1)); // strangers gain surprise
      }
      return { state: next, events };
    }

    case "attack": {
      // Attacking the guards of a permanently-indifferent chamber: the party is traversing it (explore
      // phase) with the guards parked on the tile — un-park them (and the treasure they guard) into the
      // working set, then fight. No surprise: the chamber was already visited (§Surprise).
      if (state.phase === "explore" && state.pacifiedAreas?.includes(state.partyArea) &&
          state.areas[state.partyArea]!.contents.some((c) => c >= 100 && c < 200)) {
        const next = structuredClone(state);
        const area = next.areas[next.partyArea]!;
        next.strangers = area.contents.filter((c) => c >= 100 && c < 200).map((c) => c - 100);
        next.treasures = area.contents.filter((c) => c >= 200 && c < 300).map((c) => c - 200);
        area.contents = area.contents.filter((c) => c < 100 || c >= 300); // keep display markers / sleeping
        return { state: next, events: startFight(next, 0) };
      }
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      // Surprise only on an immediate attack from a fresh, non-trap entry (§Surprise).
      return { state: next, events: startFight(next, next.surpriseReady ? 1 : 0) };
    }

    case "resolveRound": {
      if (state.phase !== "fight") return { state, events: [{ type: "blocked" }] };
      if (state.fight?.casualtyQueue?.length) return { state, events: [{ type: "blocked" }] }; // finish the choice first
      const check = validatePlan(state, { matches: action.matches });
      if (!check.ok) return { state, events: [{ type: "planRejected", reason: check.reason }] };
      const next = structuredClone(state);
      const events = resolvePlannedRound(next, { matches: action.matches });
      if (next.fight) next.fight.retreatBlocked = false; // a round was fought — retreat opens again
      if (next.fight?.casualtyQueue?.length) return { state: next, events }; // pause for chooseCasualty
      events.push(...finalizeRound(next));
      return { state: next, events };
    }

    case "chooseCasualty": {
      const pair = state.fight?.casualtyQueue?.[0];
      if (state.phase !== "fight" || !pair) return { state, events: [{ type: "blocked" }] };
      if (!pair.includes(action.idx)) return { state, events: [{ type: "blocked" }] }; // must pick one of the pair
      const next = structuredClone(state);
      const queue = next.fight!.casualtyQueue!;
      const preferred = action.idx;
      const other = pair.find((i) => i !== preferred)!;
      const r = rollDie(next.seed); next.seed = r.seed;
      const victim = r.value >= 4 ? preferred : other; // 4-6 grants the player's preference (§"A Round of Fighting")
      next.party[victim]!.status = 3;
      const events: GameEvent[] = [
        { type: "casualtyChosen", creatureId: next.party[victim]!.creatureId, roll: r.value, gotPreference: victim === preferred },
        { type: "memberDied", creatureId: next.party[victim]!.creatureId },
        ...eyeForsakenByDeath(next, next.party[victim]!),
      ];
      queue.shift();
      if (queue.length === 0) {
        next.fight!.casualtyQueue = undefined;
        events.push(...finalizeRound(next));
      }
      return { state: next, events };
    }

    case "retreat": {
      if (state.phase !== "fight") return { state, events: [{ type: "blocked" }] };
      if (state.fellThroughTrap) return { state, events: [{ type: "blocked" }] }; // no way back up a trap
      // A party may retreat only after at least one round has been fought (§Retreat).
      if (!state.fight || state.fight.round <= 1) return { state, events: [{ type: "blocked" }] };
      // A party may retreat by ANY doorway or stairway — even an unexplored one (§Retreat). Attempt
      // the move; if the way is a dead end (or blocked), the party must fight another round this turn.
      const fromIdx = state.partyArea;
      const res = tryMove(state, action.dir);
      if (!res.moved) {
        // The retreat failed — a dead-end tile, or no tile left to draw (pack exhausted). Either way the
        // party can't escape this round and must fight on (§Retreat): lock out further retreats AND tell
        // the player (always a deadEnd event, so the bounce-back to the fight is never silent).
        // tryMove clones the state for a dead end but returns the original for a no-tile way, so clone
        // before flagging the latter to avoid mutating the input state.
        const next = res.deadEnd ? res.state : structuredClone(state);
        if (next.fight) next.fight = { ...next.fight, retreatBlocked: true };
        return { state: next, events: [{ type: "deadEnd", dir: action.dir, retreat: true }] };
      }
      // Retreat succeeds: the strangers and any dropped treasure are LEFT BEHIND in the chamber we fled.
      const fled = res.state.areas[fromIdx]!;
      fled.contents = [
        ...fled.contents,
        ...res.state.strangers.map((id) => 100 + id),
        ...res.state.treasures.map((id) => 200 + id),
        ...(res.state.sleeping ?? []).map((id) => 400 + id),
        ...(res.state.statues ?? []).map((id) => 500 + id), // Gallery statues stay put (SC-EXT-10)
        ...(res.state.lulled ?? []).map((id) => 100 + id), // flute-lulled dragons park awake (re-lulled on re-entry if held)
      ];
      // §426: artefacts carried by creatures who have perished are left behind in the area; the living
      // retreat with theirs. (Heavy treasure dropped to fight is already on the floor — it stays too.)
      res.state.party.forEach((m) => {
        if (m.status === 3 && m.treasure.length) {
          fled.contents.push(...m.treasure.map((t) => 200 + t));
          m.treasure = [];
        }
      });
      res.state.strangers = []; res.state.treasures = []; res.state.hazards = []; res.state.sleeping = [];
      if (res.state.statues) res.state.statues = []; // guarded — see persistAndExplore's comment (SC-EXT-1)
      res.state.lulled = [];
      res.state.fight = null;
      res.state.party.forEach((m) => { m.potionActive = false; });
      // The strangers we fled stay hostile to this party for the rest of the game (§Retreat).
      if (!res.state.hostileAreas?.includes(fromIdx)) {
        res.state.hostileAreas = [...(res.state.hostileAreas ?? []), fromIdx];
      }
      const events = resolveArea(res.state); // resolve the area we retreated into (fresh tunnel/chamber)
      return { state: res.state, events };
    }

    case "proceed": {
      // Decline the Medusa-pause throw: the held hazards (her gaze included) now fire as normal.
      if (state.phase !== "medusa") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      return { state: next, events: resumeFromMedusaPause(next) };
    }

    case "useArtifact": {
      const bearerIdx = findBearer(state, action.artifact);
      if (bearerIdx < 0) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const bearer = next.party[bearerIdx]!;
      const consume = () => {
        const i = bearer.treasure.indexOf(action.artifact);
        if (i >= 0) bearer.treasure.splice(i, 1);
      };
      const ok: { state: GameState; events: GameEvent[] } = { state: next, events: [{ type: "artifactUsed", artifact: action.artifact }] };

      switch (action.artifact) {
        case 8: { // Strength Potion — fight only, target a living Man/Woman/Hero
          if (next.phase !== "fight" || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          const tm = next.party[action.target];
          const boostable = tm && (tm.status === 0 || tm.status === 1) && [0, 1, 5, 6].includes(tm.creatureId);
          if (!boostable) return { state, events: [{ type: "blocked" }] };
          tm.potionActive = true;
          consume();
          return ok;
        }
        case 6: { // Healing Balm — at rest or while looting, target a dead member
          if ((next.phase !== "explore" && next.phase !== "pickup") || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          const dm = next.party[action.target];
          if (!dm || dm.status !== 3) return { state, events: [{ type: "blocked" }] };
          dm.status = 0;
          consume();
          return ok;
        }
        case 9: { // Magic Staff reanimation — at rest or while looting, free a stoned member IN THIS area; NOT consumed
          if ((next.phase !== "explore" && next.phase !== "pickup") || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          const sm = next.party[action.target];
          if (!sm || sm.status !== 2 || sm.stoneArea !== next.partyArea) return { state, events: [{ type: "blocked" }] };
          sm.status = 0;
          sm.stoneArea = undefined;
          return ok;
        }
        case 5: { // Lotus Dust — thrown at Medusa in the pause, or at a stranger in encounter/fight
          if (next.phase === "medusa") {
            // "Works on MEDUSA" (card): she sleeps for 2 of this player's turns — entries meanwhile
            // draw no gaze — then wakes. The held entry resolves on with her asleep.
            const until = next.turn + 2;
            next.areas[next.partyArea]!.medusaAsleepUntil = until;
            consume();
            const events: GameEvent[] = [{ type: "artifactUsed", artifact: 5 }, { type: "medusaSlept", until }];
            events.push(...resumeFromMedusaPause(next));
            return { state: next, events };
          }
          if ((next.phase !== "encounter" && next.phase !== "fight") || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          if (action.target < 0 || action.target >= next.strangers.length) return { state, events: [{ type: "blocked" }] };
          const sid = next.strangers[action.target]!;
          if (sid === 9) return { state, events: [{ type: "blocked" }] }; // Lotus Dust has no effect on Spectres (card)
          if (sid === 11) { // the Sorcerer is too powerful to be slept — Lotus Dust only weakens him (−2 Strength)
            next.lotusOnSorcerer = true;
            consume();
            return ok;
          }
          (next.sleeping ??= []).push(sid); // the creature sleeps — inert, but stays in the chamber
          next.strangers.splice(action.target, 1);
          consume();
          if (next.strangers.length === 0) { // no one left awake to face — the party may proceed past the sleepers
            next.fight = null;
            next.party.forEach((m) => { m.potionActive = false; });
            if (next.treasures.length > 0) next.phase = "pickup";
            else persistAndExplore(next);
          }
          return ok;
        }
        case 4: { // Magic Carpet — explore only; teleport ignoring doors, then resolve the new area
          // Deferred: "if the party encounters strangers it may not withdraw" after a carpet landing
          // is NOT enforced (would need a transient no-withdraw flag); the player may still withdraw.
          if (next.phase !== "explore" || action.dir === undefined) return { state, events: [{ type: "blocked" }] };
          const d = action.dir;
          const valid = d === 1 || d === 2 || d === 3 || d === 4 || d === DIR_DOWN || (d === DIR_UP && next.level > 1);
          if (!valid) return { state, events: [{ type: "blocked" }] }; // won't take you out of the cave
          consume();
          const events: GameEvent[] = [{ type: "artifactUsed", artifact: 4 }, { type: "carpetUsed", dir: d }];
          carpetMove(next, d);
          events.push(...resolveArea(next));
          return { state: next, events };
        }
        case 12: { // Charmed Flute — secret door (explore, with dir) or lull Dragons (encounter/fight)
          if (action.dir !== undefined) { // reveal a concealed stairway (not while fighting)
            if (next.phase !== "explore" || (action.dir !== DIR_UP && action.dir !== DIR_DOWN)) return { state, events: [{ type: "blocked" }] };
            const cur = next.areas[next.partyArea]!;
            const { level, x, y } = unpackCoord(cur.coord);
            const dec = decodeArea(cur.card);
            if (action.dir === DIR_DOWN) {
              if (dec.stairDown) return { state, events: [{ type: "blocked" }] }; // already a visible stair
              const below = next.areas.find((a) => a.coord === packCoord(level + 1, x, y));
              if (!below || !decodeArea(below.card).stairUp) return { state, events: [{ type: "blocked" }] };
              cur.card |= 64; // reveal stair DOWN
            } else {
              if (dec.stairUp) return { state, events: [{ type: "blocked" }] };
              const above = next.areas.find((a) => a.coord === packCoord(level - 1, x, y));
              if (!above || !decodeArea(above.card).stairDown) return { state, events: [{ type: "blocked" }] };
              cur.card |= 32; // reveal stair UP
            }
            return { state: next, events: [{ type: "artifactUsed", artifact: 12 }, { type: "secretDoorRevealed", dir: action.dir }] };
          }
          // Lulling Dragons is passive: the Flute lulls them automatically on chamber entry for as
          // long as the party holds it (see resolveArea) — and lulls Vipers on the pit crossing (see
          // special.ts). So there is no explicit "lull" action; without a `dir`, the Flute does nothing.
          return { state, events: [{ type: "blocked" }] };
        }
        case 15: { // Elixir — usable ANY time the party is not mid-fight; ANY living member may drink (design US-19, SC-EXT-22)
          if (next.phase === "fight" || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          const drinker = next.party[action.target];
          if (!drinker || (drinker.status !== 0 && drinker.status !== 1)) return { state, events: [{ type: "blocked" }] };
          consume(); // consumed on use, whatever the outcome
          const r = rollDie(next.seed);
          next.seed = r.seed;
          const events: GameEvent[] = [{ type: "artifactUsed", artifact: 15 }];
          if (r.value === 1) {
            // Poison — a normal "killing die-roll" death: the Ring's usual invincibility still
            // applies (§Ring), and when it doesn't, the curse check runs BEFORE the spill (Task 9
            // lesson — spillCarried would otherwise strip the Eye of God out of `treasure` first
            // and mask eyeForsakenByDeath's own check), matching every other death site.
            if (ringInvincible(drinker, next)) {
              events.push({ type: "deathPrevented", creatureId: drinker.creatureId });
            } else {
              drinker.status = 3;
              events.push(...eyeForsakenByDeath(next, drinker));
              const items = spillCarried(drinker);
              if (items.length) { next.treasures.push(...items); events.push({ type: "itemsSpilled", creatureId: drinker.creatureId, items }); }
            }
          } else if (r.value >= 4) {
            drinker.fsBonus = (drinker.fsBonus ?? 0) + 2; // permanent, stacks if drunk again
          }
          events.push({
            type: "elixirDrunk", creatureId: drinker.creatureId, roll: r.value,
            outcome: r.value === 1 ? "death" : r.value <= 3 ? "nothing" : "strength",
          });
          return { state: next, events };
        }
        case 16: { // Holy Water — one use, target enumeration (design US-20, SC-EXT-24)
          if (next.phase === "medusa") {
            // Pre-gaze destroy (design answer 2026-07-27): the water sears her into mist before
            // her gaze lands. Removing the pending hazard pre-fire means she never lurks — gone
            // for good — and the pause resumes through the same contract as the Lotus throw
            // (finishExtraDraw surprise preservation included, SC-4-16).
            consume();
            next.hazards = next.hazards.filter((h) => h !== HAZARD_MEDUSA);
            const events: GameEvent[] = [{ type: "artifactUsed", artifact: 16 }, { type: "holyWaterMedusaDestroyed" }];
            events.push(...resumeFromMedusaPause(next));
            return { state: next, events };
          }
          if (action.target === undefined) return { state, events: [{ type: "blocked" }] };
          const found = holyWaterTargets(next).find((t) => t.target === action.target);
          if (!found) return { state, events: [{ type: "blocked" }] };
          consume();
          const events: GameEvent[] = [{ type: "artifactUsed", artifact: 16 }];
          switch (found.mode) {
            case "revive": { // stone party member -> alive (mirrors reviveStoned's revival; no bearer gate)
              const sm = next.party[found.target]!;
              sm.status = 0;
              sm.stoneArea = undefined;
              events.push({ type: "holyWaterRevived", creatureId: sm.creatureId });
              return { state: next, events };
            }
            case "wake": { // Gallery statue -> wakes into strangers for an immediate, normal reaction test
              const idx = found.target - HW_STATUE_BASE;
              next.statues!.splice(idx, 1);
              next.strangers.push(found.creatureId!);
              next.phase = "encounter";
              next.surpriseReady = false; // this is well after any fresh entry — never a surprise attack
              next.indiffStreak = 0; // a fresh mini-encounter re-tests from scratch (enterChamber's own rule)
              events.push({ type: "holyWaterStatueWoke", creatureId: found.creatureId! });
              return { state: next, events };
            }
            case "destroyMedusa": { // the area's lurking Medusa marker — removed outright, no dice
              const area = next.areas[next.partyArea]!;
              area.contents = area.contents.filter((c) => c !== 300 + HAZARD_MEDUSA);
              events.push({ type: "holyWaterMedusaDestroyed" });
              return { state: next, events };
            }
            case "destroy": { // Spectre/Demon stranger or lurker — removed outright, no fight, no score
              const idx = found.target - HW_STRANGER_BASE;
              next.strangers.splice(idx, 1);
              events.push({ type: "holyWaterFoeDestroyed", creatureId: found.creatureId! });
              if (next.strangers.length === 0) { // mirrors Lotus Dust's own empty-strangers cleanup above
                next.fight = null;
                next.party.forEach((m) => { m.potionActive = false; });
                if (next.treasures.length > 0) next.phase = "pickup";
                else persistAndExplore(next);
              }
              return { state: next, events };
            }
            case "weaken": { // Sorcerer/Apprentice — -2 mp for the rest of the game (combatPlan.ts's enemyMP)
              if (found.creatureId === C_SORCERER) next.holyWaterOnSorcerer = true;
              else next.holyWaterOnApprentice = true;
              events.push({ type: "holyWaterWeakened", creatureId: found.creatureId! });
              return { state: next, events };
            }
            default:
              return { state, events: [{ type: "blocked" }] };
          }
        }
        case 19: { // Scroll — destroys every mp===0 stranger in the area; curses the party (US-21, SC-EXT-25)
          if (next.phase !== "encounter" && next.phase !== "fight") return { state, events: [{ type: "blocked" }] };
          if (!hasLivingHuman(next) || next.strangers.length === 0) return { state, events: [{ type: "blocked" }] };
          consume();
          const destroyed: number[] = [];
          const survivors: number[] = [];
          for (const sid of next.strangers) (CREATURES[sid]!.mp === 0 ? destroyed : survivors).push(sid);
          next.strangers = survivors;
          next.curses += 1; // the standing curse, no different from any other source (§Curse)
          const events: GameEvent[] = [
            { type: "artifactUsed", artifact: 19 },
            { type: "scrollRead", destroyed, survivors },
          ];
          if (next.strangers.length === 0) { // no one left — same cleanup as Holy Water's destroy/Lotus Dust
            next.fight = null;
            next.party.forEach((m) => { m.potionActive = false; });
            if (next.treasures.length > 0) next.phase = "pickup";
            else persistAndExplore(next);
          }
          return { state: next, events };
        }
        default:
          return { state, events: [{ type: "blocked" }] };
      }
    }

    case "openChest": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const bearerIdx = state.party.findIndex((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(14));
      if (bearerIdx < 0) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const bearer = next.party[bearerIdx]!;
      bearer.treasure.splice(bearer.treasure.indexOf(14), 1); // the chest is opened (consumed)
      const r = rollDie(next.seed);
      next.seed = r.seed;
      const events: GameEvent[] = [{ type: "chestOpened", result: r.value }];
      switch (r.value) {
        case 1: next.curses += 1; break; // a Curse
        case 2: // a Spectre appears and attacks (one round)
          next.strangers.push(9);
          next.fight = { surprise: -1, round: 1, focus: next.strangers.length - 1 };
          next.phase = "fight";
          events.push({ type: "fightStarted", surprise: -1 });
          break;
        case 3: break; // Sand
        case 4: next.bonusScore += 20; break; // Silver
        case 5: next.bonusScore += 40; break; // Gold
        case 6: next.bonusScore += 80; break; // Gems
      }
      return { state: next, events };
    }

    case "descendChasm": {
      // Legal on a Chasm tile in explore OR encounter phase (design US-02) — the party may dive
      // down to escape an encounter, not just at rest. No dice; the Chasm is reusable terrain.
      if (state.phase !== "explore" && state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      if (decodeArea(state.areas[state.partyArea]!.card).special !== SPECIAL_CHASM) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      // Park any pending encounter strangers/treasure back onto the chasm tile before leaving it —
      // otherwise they'd leak into the landing area's working set.
      persistAndExplore(next);
      const events: GameEvent[] = [{ type: "chasmDescend" }];
      relocateDown(next); // one-way, no mirrored stair-up — `fellThroughTrap` blocks withdraw below (SC-EXT-5)
      events.push(...resolveArea(next));
      return { state: next, events };
    }

    case "drawFromWell": {
      // Legal on a Well tile in explore OR encounter phase (design US-07, same "no test/fight
      // required" latitude as the Chasm's escape hatch) — repeatable every turn, no spent flag
      // (Resolved interpretation 4); gated only on the small pack having a card left.
      if (state.phase !== "explore" && state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      if (decodeArea(state.areas[state.partyArea]!.card).special !== SPECIAL_WELL) return { state, events: [{ type: "blocked" }] };
      if (state.smallIdx >= state.smallPack.length) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const events: GameEvent[] = [{ type: "wellDraw" }];
      const hadCrypt = next.cryptCoord !== undefined; // SC-EXT-13: tell a freshly-parked Crypt apart
      drawSmallCards(next, 1, events); // exactly one code, appended onto whatever's already in the working set
      if (!hadCrypt && next.cryptCoord === next.areas[next.partyArea]!.coord) events.push({ type: "cryptParked" });
      next.noWithdrawTurn = next.turn; // blocks withdraw this turn only (SC-EXT-9)
      resolveExtraDraw(next, events); // strangers/hazards resolve normally, same as any chamber draw
      return { state: next, events };
    }

    case "pullBellRope": {
      // Legal on a Bell Rope tile in explore OR encounter phase, for a living member, ONCE per tile
      // ever (design US-03; AF_BELL_SPENT persists the spend on the placed area).
      if (state.phase !== "explore" && state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      if (decodeArea(state.areas[state.partyArea]!.card).special !== SPECIAL_BELL_ROPE) return { state, events: [{ type: "blocked" }] };
      if ((state.areas[state.partyArea]!.flags & AF_BELL_SPENT) !== 0) return { state, events: [{ type: "blocked" }] };
      const puller = state.party[action.mi];
      if (!puller || !(puller.status === 0 || puller.status === 1)) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.areas[next.partyArea]!.flags |= AF_BELL_SPENT; // spent forever, whatever the roll (design US-03)
      const creatureId = next.party[action.mi]!.creatureId;
      const r = rollDie(next.seed);
      next.seed = r.seed;
      const events: GameEvent[] = [];
      if (r.value === 1) {
        // Desertion semantics (design Resolved-3): removed from the game with everything carried —
        // not dead (no memberDied), not revivable. Splice out entirely, like Mutiny's deserters.
        next.party.splice(action.mi, 1);
        events.push({ type: "bellRoll", roll: r.value, outcome: "vanish", creatureId });
        if (!next.party.some((m) => m.status === 0 || m.status === 1)) {
          next.gs = GS_DEAD;
          next.phase = "gameOver";
          events.push({ type: "gameOver", gs: GS_DEAD });
        }
        return { state: next, events };
      }
      if (r.value <= 3) {
        // Foreboding narration only — no mechanical effect (design US-03, Resolved-2).
        events.push({ type: "bellRoll", roll: r.value, outcome: "toll", creatureId });
        return { state: next, events };
      }
      events.push({ type: "bellRoll", roll: r.value, outcome: "stir", creatureId });
      const hadCrypt = next.cryptCoord !== undefined; // SC-EXT-13: tell a freshly-parked Crypt apart
      drawSmallCards(next, 2, events); // two codes, appended onto whatever's already in the working set
      if (!hadCrypt && next.cryptCoord === next.areas[next.partyArea]!.coord) events.push({ type: "cryptParked" });
      next.noWithdrawTurn = next.turn; // blocks withdraw this turn only (SC-EXT-9)
      resolveExtraDraw(next, events); // strangers/hazards resolve normally, same as any chamber draw
      return { state: next, events };
    }

    case "enterCrypt": {
      // Extension kit (SC-EXT-13): legal only at rest ("the start of any turn", design US-08 — unlike
      // the Chasm/Well/Bell Rope's escape-hatch latitude, the design gives the Crypt no "legal
      // mid-encounter too" note, so this is gated tighter, to `explore` only) while standing on the
      // area `cryptCoord` names.
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      if (state.cryptCoord === undefined || state.areas[state.partyArea]!.coord !== state.cryptCoord) {
        return { state, events: [{ type: "blocked" }] };
      }
      const next = structuredClone(state);
      next.cryptCoord = undefined; // spent either way — no second entry (design US-08)
      const r = rollDie(next.seed);
      next.seed = r.seed;
      const events: GameEvent[] = [];
      if (r.value <= 2) {
        // Unavoidable trap: the WHOLE party falls, whatever a Dwarf's GUIDES_PAST_TRAP would normally
        // do (this bypasses `applyHazards`' HAZARD_TRAP case entirely — there is no Dwarf check here
        // to bypass, by construction). `relocateDown` sets `fellThroughTrap`, blocking withdraw at the
        // landing exactly like any other trap fall.
        events.push({ type: "cryptRoll", roll: r.value, outcome: "trap" });
        relocateDown(next);
        events.push(...resolveArea(next));
        return { state: next, events };
      }
      // A find: the crypt card itself becomes the gems — ordinary treasure 21 (25 kg), dropped for a
      // normal, carry-capacity-gated pickup (design Resolved-13).
      events.push({ type: "cryptRoll", roll: r.value, outcome: "find" });
      next.treasures.push(T_CRYPT);
      next.phase = "pickup";
      return { state: next, events };
    }

    case "testPlaceArea": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      if (action.special < SPECIAL_DEEP_POOL || action.special > SPECIAL_WELL) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.testNextArea = { dir: action.dir, special: action.special };
      return { state: next, events: [{ type: "testAreaQueued", dir: action.dir, special: action.special }] };
    }

    case "testSetChamber": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.testNextChamber = { strangers: [...action.strangers], treasures: [...action.treasures], hazards: [...action.hazards] };
      return { state: next, events: [{ type: "testChamberQueued", strangers: [...action.strangers], treasures: [...action.treasures], hazards: [...action.hazards] }] };
    }

    case "testForceReaction": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.testNextReaction = action.outcome;
      return { state: next, events: [{ type: "testReactionQueued", outcome: action.outcome }] };
    }

    case "testClearOverrides": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      delete next.testNextArea;
      delete next.testNextChamber;
      delete next.testNextReaction;
      return { state: next, events: [{ type: "testOverridesCleared" }] };
    }
  }
}
