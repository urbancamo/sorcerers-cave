import { GS_PLAYING, GS_QUIT, GS_ESCAPED, GS_DEAD, AF_DESTROYED, AF_BELL_SPENT, AF_UNRESOLVED, type GameState, type PartyMember, type PlacedArea } from "./state";
import { tryMove, hasExit } from "./map";
import { moveWithRedraw } from "./redraw";
import { decodeArea, decodeOpen } from "./decode";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_CHASM, SPECIAL_WHIRLPOOL, SPECIAL_WELL, SPECIAL_BELL_ROPE, SPECIAL_GREAT_HALL, TILE_MIN, TILE_MAX, TILE_TUNNEL_ES } from "./data/areaCards";
import { viperCrossing, deepPoolCrossing, whirlpoolCrossing, giantCanRecover, sunkKey, tryReclaimSunk } from "./special";
import { enterChamber, drawSmallCards } from "./chamber";
import { applyHazards, hasStaffWizard, livingDwarfCount } from "./hazards";
import { HAZARD_MEDUSA, HAZARD_TRAP, HAZARD_NAMES } from "./data/hazards";
import { takeTreasure, canCarry } from "./pickup";
import { unpackCoord, packCoord, targetCoord, DIR_UP, DIR_DOWN } from "./coords";
import type { GameAction, GameEvent } from "./actions";
import { reactionRoll, forcedReactionRoll, findLeader } from "./reaction";
import { C_SIBYL, SIBYL_CODE, examinableAreas, isGuardCode, sibylHere, sibylWaiting } from "./sibyl";
import { frontStrength } from "./combat";
import { validatePlan, resolvePlannedRound } from "./combatPlan";
import {
  wardOffSpectres, annihilateWithEye, eyeActive, reconcileUnicorns, hasWoman, fluteLulls, eyeForsakenByDeath, markDied, healingBalmEligible, ringInvincible, usesArtifactsAs,
  hasLivingHuman, holyWaterTargets, HW_STATUE_BASE, HW_MEDUSA, HW_STRANGER_BASE, HW_PARKED_STATUE_BASE, isHumanOrPriestClass,
  eyePresent, slaySorcerer, revertApprenticesOnSorcererDeath,
} from "./effects";
import { canTeleportTo } from "./sorcerer";
import { BORNEABLE, isBorne, sweepFallen, spillCarried } from "./loot";
import { rollDieForState } from "./rng";
import {
  getSubLocation, chasmMoveAllowed, oppositeDir, RING_ADJACENCY_SPECIALS, ISLAND_JUMP_SPECIALS, SUB_LOCATION_SPECIALS,
  type SubAt,
} from "./subLocation";
// Extension kit (SC-EXT-17): aliases `ALL_CREATURES` — `strongestStranger`'s fight-focus pick and
// the Lost-Ruby wrestler's combat-roll name both index by an actual creatureId that may already be
// a kit id (14-20); byte-identical for ids 0-13.
import { ALL_CREATURES as CREATURES, CREATURES as BASE_CREATURES, C_GHOUL } from "./data/creatures";
import { TREASURES as BASE_TREASURES } from "./data/treasures";
import { applyAllocations, equipStrangers, loadoutViolation } from "./strangerEquip";
import { removeStranger, addStranger, dropAllGear } from "./strangerGear";
import {
  advance as advanceRevised, applyScroll, applyDeploy, applyEngage, applyNominate, applyRedeploy, deployViolation, dropPartyMember, resumeAfterStandoff, engageMovesViolation, engageViolation, initRevised,
  nominateViolation, redeployViolation, removeStrangerFromFight, resumeAfterCasualties,
} from "./revisedRound";

const T_EYE_OF_GOD = 13; // treasure id — must stay with its bearer or the party is cursed (§Eye of God)
const C_GIANT = 12; // only a Giant can recover treasure cast into a Deep Pool (§Deep Pool)
const C_WIZARD = 8;
const C_THIEF = 19; // extension-kit creature — a living Thief ally unlocks guarded treasure in an
                     // indifference-pacified area (design US-17, SC-EXT-19)
const T_CRYPT = 21; // extension-kit treasure — the crypt's find converts to this ordinary treasure (SC-EXT-13)
const C_APPRENTICE = 14; // extension-kit creature — never leaves the cave (design US-14, SC-EXT-20)
const C_DEMON = 15; // extension-kit creature — forces immediate hostile combat on sight (design US-13, SC-EXT-21)
const C_SORCERER = 11; // Holy Water's WEAKEN mode target, alongside the Apprentice (design US-20, SC-EXT-24)
const C_UNICORN = 13; // hostileMax 0 / indiffMax 0 — always friendly regardless of the roll (§ Unicorn, bug fix 2026-08-02)

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
    // Bug fix 2026-08-18 (inhuman-artifacts): Holy Water and Lotus Dust are Human/Priest only —
    // neither names a bearer in its own card text, but both are blank in the Inhuman/Dwarf Ally
    // columns of the ARTEFACTS – WHO CAN USE? table, and a Dwarf holder was able to destroy/sleep
    // Medusa with either in playtesting.
    if (artifact === 5 || artifact === 16) return isHumanOrPriestClass(m.creatureId);
    return true;
  });
}

/** Persist the chamber working set back into the area, then return to exploring. */
function persistAndExplore(state: GameState): void {
  const area = state.areas[state.partyArea]!;
  // Heavy treasure left behind in a Deep Pool sinks back onto its `dropped` pile (recoverable only by
  // a Giant on a later visit) rather than the ordinary floor contents.
  const onDeepPool = decodeOpen(area).special === SPECIAL_DEEP_POOL;
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
  // Stranger Fight Preparations: the strangers pick up any fight artefacts guarded in the chamber.
  const events: GameEvent[] = [{ type: "fightStarted", surprise }, ...equipStrangers(state)];
  return [...events, ...beginRevised(state)];
}

/** With `variants.combatRevision` the fight is played by the revised round engine (revisedRound.ts): set it up and run it to the first decision. */
function beginRevised(state: GameState): GameEvent[] {
  if (!state.variants?.combatRevision || !state.fight) return [];
  initRevised(state);
  return state.fight.pending ? [] : advanceRevised(state);   // a pending loadout decision starts the rounds when it is answered
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
    const sorcererEvents = settleFelledSorcerer(state); // (reads the fight, so before it is cleared)
    state.gs = GS_DEAD;
    state.phase = "gameOver";
    state.fight = null;
    // A wiped party's fallen spill their CARRIED items onto the tile for whoever comes next; borne
    // items are lost with the bodies (plan ④a / I-12 — matters most in multiplayer, harmless in solo).
    events.push(...sweepFallen(state, "contents"));
    state.party.forEach((m) => { m.potionActive = false; });
    events.push(...sorcererEvents, { type: "gameOver", gs: GS_DEAD });
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
    const felled = state.fight?.sorcererFelled === true;
    const ghouls = state.fight?.ghouls;
    state.fight = null;
    state.party.forEach((m) => { m.potionActive = false; });
    events.push({ type: "fightWon" });
    if (ghouls) {   // the Ghouls are beaten (they lurk on, for the next party): the chamber's own strangers are met now
      state.strangers = ghouls.aside;
      const trap = ghouls.trap;
      if (trap?.fell) {   // the Trap, dealt with last, now springs
        persistAndExplore(state);
        relocateDown(state);
        if (trap.knownTrap) state.deliberateFall = true;
        events.push(trap.knownTrap ? { type: "trapSprung", level: state.level, deliberate: true } : { type: "trapSprung", level: state.level });
        events.push({ type: "moved", area: state.partyArea, level: state.level });
        events.push(...resolveAreaLoop(state));
      } else if (trap?.choice) {   // trapRules: the Dwarf's choice, held until the Ghouls are beaten
        state.phase = "trap";
        state.trapPause = { freshEntry: ghouls.freshEntry, announceLull: ghouls.announceLull };
        events.push({ type: "trapLooms" });
      } else settleChamber(state, ghouls.freshEntry, events, ghouls.announceLull);
    } else if (felled && !eyePresent(state)) state.phase = "sorcerer"; // the player decides his fate before anything else
    else {
      if (felled) events.push(...slaySorcerer(state)); // the Eye forbids sparing him
      afterFight(state, events);
    }
  }
  // else: still fighting; resolveRound already advanced the round
  return events;
}

/** Roll one reaction for the strongest stranger — or for `leaderId` when given (the Sibyl, SC-SIB-3) —
 *  honouring Test Mode's scripted outcome and forced die. Mutates `next` (advances `seed` on a real
 *  roll; consumes the one-shot Test Mode overrides).
 * Test Mode (§Test Mode): an armed testNextReaction replaces the die roll outright — the RNG
 * (state.seed) is never touched, so this doesn't perturb any later, non-overridden roll.
 * Checks `testMode` explicitly rather than trusting testNextReaction's mere presence —
 * defense in depth against a hand-crafted state (same reasoning as map.ts's testNextArea
 * check and chamber.ts's testNextChamber check).
 * Next Roll Selector (2026-09-11, SC-Test-10): `testNextDie`/`testAllDiceRoll` take over
 * NEXT, ahead of a genuine roll, when no `testNextReaction` is armed — the forced raw value
 * still bands through `reactionRoll`'s normal leader-threshold logic (charisma/curse/
 * natural-1 included), so it may not land on a specific outcome for every leader; a tester
 * wanting a GUARANTEED outcome regardless of leader still wants `testNextReaction` instead.
 */
function rollReaction(next: GameState, leaderId?: number): { outcome: ReturnType<typeof reactionRoll>["outcome"]; roll: number } {
  if (next.testMode && next.testNextReaction) {
    const outcome = next.testNextReaction;
    const roll = forcedReactionRoll(next, outcome, leaderId);
    delete next.testNextReaction;
    return { outcome, roll };
  }
  if (next.testMode && (next.testNextDie !== undefined || next.testAllDiceRoll !== undefined)) {
    const forced = next.testNextDie ?? next.testAllDiceRoll!;
    delete next.testNextDie; // one-shot; testAllDiceRoll stays armed for the rest of the turn
    const r = reactionRoll(next, forced, leaderId);
    return { outcome: r.outcome, roll: r.roll };
  }
  const r = reactionRoll(next, undefined, leaderId);
  next.seed = r.seed;
  return { outcome: r.outcome, roll: r.roll };
}

/** The Sibyl's one test (SC-SIB-4/5): the real strangers are dealt with and she is the only one left.
 *  She is never hostile (her row), never counts toward the indifference streak or pacifies the area,
 *  and is never retested — `sibylMet` is set whatever the outcome. Friendly: she travels with the party
 *  (`hasSibyl`). Indifferent: she stays in the chamber (parked by the normal exit path). */
function meetSibyl(state: GameState): { state: GameState; events: GameEvent[] } {
  const next = structuredClone(state);
  next.surpriseReady = false;
  delete next.indiffLeaveOpen;
  const { outcome, roll } = rollReaction(next, C_SIBYL);
  const events: GameEvent[] = [{ type: "reaction", outcome, roll }];
  next.sibylMet = true;
  if (outcome === "friendly") {
    next.lulled = (next.lulled ?? []).filter((id) => id !== C_SIBYL);
    next.hasSibyl = true;
    events.push({ type: "sibylJoins" });
  } else {
    events.push({ type: "sibylDeclines" });
  }
  if (next.treasures.length > 0) next.phase = "pickup"; // nothing guards it — she guards nothing
  else persistAndExplore(next);
  return { state: next, events };
}

/** The revised combat: the party leaves the area where the Sorcerer was slain, so each Apprentice ally parts company with it — left
 *  behind in the chamber, with what she carried on the floor, and no attack (Peter, 14-OCT-2026). Ends the watch. */
function partCompany(state: GameState): GameEvent[] {
  const at = state.apprenticeWatch!;
  delete state.apprenticeWatch;
  const gone = state.party.filter((m) => m.status === 1 && m.creatureId === C_APPRENTICE);
  if (gone.length === 0) return [];
  const area = state.areas[at]!;
  for (const a of gone) area.contents.push(100 + a.creatureId, ...a.treasure.map((t) => 200 + t));
  state.party = state.party.filter((m) => !gone.includes(m));
  return [{ type: "apprenticeParts", count: gone.length }];
}

/** The party has won: loot if there is any, else on its way. A turncoat Apprentice (the Sorcerer's death breaks
 *  her loyalty) is a stranger again, and the party must deal with her. */
function afterFight(state: GameState, events: GameEvent[]): void {
  if (state.strangers.length > 0) events.push(...startFight(state, 0));
  else if (sibylWaiting(state)) { state.phase = "encounter"; state.surpriseReady = false; } // she waits, standing aside (SC-SIB-4)
  else if (state.treasures.length > 0) state.phase = "pickup";
  else persistAndExplore(state);
}

/** A fight ends with the Sorcerer defeated but not yet slain (wipe-out, retreat): he dies after all, with no chance
 *  to spare him. Empty unless `variants.sorcererTeleport` marked him felled. */
function settleFelledSorcerer(state: GameState): GameEvent[] {
  if (!state.fight?.sorcererFelled) return [];
  delete state.fight.sorcererFelled;
  return slaySorcerer(state);
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
 *  and a living, ELIGIBLE (Human/Priest-class, bug fix 2026-08-18) member holds Lotus Dust — the
 *  throw-or-proceed decision is the player's (§Lotus Dust "Works on MEDUSA"). A Dwarf-only holder
 *  can't throw it, so the gaze simply proceeds — same as holding no Lotus Dust at all. */
function medusaLooms(state: GameState): boolean {
  if (!state.hazards.includes(HAZARD_MEDUSA) || hasStaffWizard(state)) return false;
  const until = state.areas[state.partyArea]!.medusaAsleepUntil;
  if (until !== undefined && state.turn <= until) return false; // asleep — nothing to decide
  return state.party.some((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(5) && isHumanOrPriestClass(m.creatureId));
}

/** Fire the chamber's hazards and settle the entry's outcome (wipe / encounter / pickup / explore).
 *  Returns true when a trap dropped the party a level: the caller must resolve the area fallen into.
 *  `freshEntry` alone governs `surpriseReady` (SC-4-16: earned only on a genuinely fresh, non-trap
 *  chamber entry). `announceLull` (defaults to `freshEntry`) governs only the `dragonsLulled` notice —
 *  split out because an extra draw into an already-entered chamber (Well/Bell, SC-EXT-7/8) is never a
 *  fresh entry, yet a dragon it just drew is still genuinely new information the player hasn't seen
 *  (`resolveExtraDraw` passes `true` explicitly for that case). */
function finishChamber(state: GameState, freshEntry: boolean, events: GameEvent[], announceLull = freshEntry): boolean {
  const { events: hzEvents, fell, trapChoice, knownTrap, ghouls } = applyHazards(state);
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
  // The Trap is dealt with last (Rules, "Hazard cards"): with the revised Ghouls in the chamber they are fought first, and the fall
  // (or the Dwarf's choice) waits for the party to beat them. A retreat leaves the trap unsprung.
  if (ghouls && (fell || trapChoice)) {
    state.ghoulsPending = true;
    state.ghoulsTrap = { fell: !!fell, knownTrap: !!knownTrap, choice: !!trapChoice };
    settleChamber(state, freshEntry, events, announceLull);
    return false;
  }
  if (fell) {
    // The party falls away from this chamber — its strangers and treasure stay behind here (parked
    // to its contents). Clearing the working set first stops them leaking onto the tile fallen into.
    persistAndExplore(state);
    relocateDown(state);
    if (knownTrap) state.deliberateFall = true; // `trapRules`: walking into a known trap is a deliberate fall
    events.push(knownTrap ? { type: "trapSprung", level: state.level, deliberate: true } : { type: "trapSprung", level: state.level });
    events.push({ type: "moved", area: state.partyArea, level: state.level });
    return true;
  }
  if (ghouls) state.ghoulsPending = true;   // fought as the entry's last hazard, once the trap (if any) is settled (see settleChamber)
  if (trapChoice) {
    // `trapRules`: a Dwarf-guided party meets a single trap. The earlier hazards have fired and the party
    // survived them — hold the entry here for the Dwarf's choice (`avoidTrap` / `fallThroughTrap`).
    state.phase = "trap";
    state.trapPause = { freshEntry, announceLull };
    events.push({ type: "trapLooms" });
    return false;
  }
  settleChamber(state, freshEntry, events, announceLull);
  return false;
}

/** `settlePacifiedArea`, then — if an unmet Sibyl is here — step her out of the parked guards and open her
 *  encounter (SC-SIB-4). Pacified guards park themselves AND everything in the parked-awake slot, which
 *  would strand her with them: she is no guard, and a group that has been dealt with should not hide her.
 *  Skipped when a Thief's live pickup took over the phase — she is met on the next entry instead. */
function settlePacifiedWithSibyl(state: GameState): void {
  const sibylPending = sibylHere(state) && state.sibylMet !== true;
  settlePacifiedArea(state);
  if (!sibylPending || state.phase !== "explore") return;
  const area = state.areas[state.partyArea]!;
  const at = area.contents.indexOf(SIBYL_CODE);
  if (at < 0) return;
  area.contents.splice(at, 1);
  state.lulled = [...(state.lulled ?? []), C_SIBYL];
  state.phase = "encounter";
  state.surpriseReady = false;
}

/** The tail of a chamber entry once its hazards are done and the party is still here: Flute lull, Demon
 *  ambush, a pacified area, then the phase the chamber's contents call for. Shared by the uninterrupted path
 *  (`finishChamber`) and the resume from the Dwarf's trap choice. */
function settleChamber(state: GameState, freshEntry: boolean, events: GameEvent[], announceLull: boolean): void {
  // The revised combat's Ghouls (Peter, 14-OCT-2026): a party of strength-2 creatures, one per creature of the party, fought by the round
  // engine before anyone else in the chamber is met. The chamber's real strangers wait; the entry resumes when the Ghouls are beaten.
  if (state.ghoulsPending) {
    delete state.ghoulsPending;
    const trap = state.ghoulsTrap;
    delete state.ghoulsTrap;
    const count = state.party.filter((m) => m.status === 0 || m.status === 1).length;
    const aside = state.strangers;
    state.strangers = Array<number>(count).fill(C_GHOUL);
    state.fight = { surprise: 0, round: 1, focus: 0, ghouls: { aside, freshEntry, announceLull, ...(trap ? { trap } : {}) } };
    state.phase = "fight";
    state.surpriseReady = false;
    state.fightDrops = [];
    events.push({ type: "ghoulsAttack", count }, { type: "fightStarted", surprise: 0 }, ...beginRevised(state));
    return;
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
    return;
  }
  // Permanently indifferent to this party (§Reactions): the party may walk freely through (any exit)
  // — so park the guards to the tile and go to explore for full traversal — but it may also still
  // CHOOSE to attack them (selectors offers an Attack action; the guarded treasure stays out of reach
  // unless they're beaten). Other parties are unaffected. Extension kit (SC-EXT-19): a living Thief
  // ally instead slips the guarded treasure straight into a live pickup — `settlePacifiedArea` covers
  // both that and the ordinary re-park.
  if (state.pacifiedAreas?.includes(state.partyArea)) {
    settlePacifiedWithSibyl(state);
    return;
  }
  if (state.strangers.length > 0) {
    if (state.hostileAreas?.includes(state.partyArea)) {
      // The party retreated from these strangers before — they attack on sight (with surprise). §Retreat
      // Unless the party came back by a trap on purpose (`trapRules`): then it is the party that has surprise.
      events.push(...startFight(state, state.deliberateFall === true ? 1 : -1));
    } else {
      state.phase = "encounter";
      // Surprise if attacking immediately on a fresh entry — never after a trap fall (§Surprise).
      state.surpriseReady = freshEntry && (!state.fellThroughTrap || state.deliberateFall === true);
    }
  } else if (sibylWaiting(state)) {
    state.phase = "encounter";
    state.surpriseReady = false; // she is no threat — there is nothing to surprise
  } else if (state.treasures.length > 0) {
    state.phase = "pickup";
  } else {
    persistAndExplore(state);
  }
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

/** Resume the entry held at the Dwarf's trap pause (`variants.trapRules`). `fall` false: the Dwarf guides the
 *  party past the trap and the chamber settles as it would have. `fall` true: the whole party drops one level,
 *  one-way, exactly as an unguided trap fall does (`finishChamber`), and the landing area is resolved. */
function resumeFromTrapPause(state: GameState, fall: boolean): GameEvent[] {
  const pause = state.trapPause!;
  delete state.trapPause;
  const events: GameEvent[] = [];
  if (fall) {
    persistAndExplore(state);
    relocateDown(state);
    state.deliberateFall = true; // the player chose to fall: the arrival earns surprise
    events.push({ type: "trapSprung", level: state.level, deliberate: true });
    events.push({ type: "moved", area: state.partyArea, level: state.level });
    events.push(...resolveAreaLoop(state));
    return events;
  }
  events.push({ type: "trapAvoided" });
  settleChamber(state, pause.freshEntry, events, pause.announceLull);
  if (pause.extraDraw && state.phase === "encounter") state.surpriseReady = pause.extraDraw.hadSurprise;
  return events;
}

/** Guide lost (`variants.trapRules`): "If a party guided by a dwarf becomes involved in a fight in a chamber where
 *  there is a trap, and the dwarf is killed, the party falls down the trap as soon as it tries to leave the chamber."
 *  True when the party stands in a chamber that holds standing traps, has fewer living Dwarves than traps (each Dwarf
 *  guides one), and is trying to leave
 *  by `dir` — a doorway or stairway that exists. (A party without a Dwarf cannot otherwise be standing in such a
 *  chamber, since entering it would already have dropped it.) `move`, `withdraw` and `retreat` ask this. */
function guideLostHere(state: GameState, dir: number | undefined): boolean {
  if (state.variants?.trapRules !== true) return false;
  const here = state.areas[state.partyArea]!;
  // One Dwarf guides one trap (ruled 11-OCT-2026): the guide is lost once there are fewer living Dwarves than traps here.
  const traps = here.contents.filter((c) => c === 300 + HAZARD_TRAP).length;
  if (traps === 0 || livingDwarfCount(state) >= traps) return false;
  return dir === undefined || hasExit(decodeOpen(here), dir);
}

/** The trap takes a party that has lost its guide, in place of the departure it attempted. The chamber is parked
 *  (its trap stays standing), the whole party drops one level, one-way, and the landing is resolved. The fall is
 *  accidental: `relocateDown` leaves `deliberateFall` unset, so the landing earns no surprise. */
function springUnguidedTrap(state: GameState): GameEvent[] {
  persistAndExplore(state);
  relocateDown(state);
  return [
    { type: "trapSprung", level: state.level, guideLost: true },
    { type: "moved", area: state.partyArea, level: state.level },
    ...resolveAreaLoop(state),
  ];
}

/** What the Dead End rule's Entry Dry Run runs on a laid card: the same steps a real move takes after `tryMove`. */
function enterForDryRun(state: GameState): void {
  state.fellThroughTrap = false;
  delete state.deliberateFall;
  delete state.subLocation;
  resolveArea(state);
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
    // Special-areas revision (2026-08-08, SC-10.5-16): deliver any treasure dropped into a
    // Chasm/Whirlpool above, the moment THIS specific area is genuinely entered — runs before any
    // other resolution, on every landing (chamber, tunnel, or another special), mirroring the
    // Harpies/Lair holding pen but keyed by coordinate rather than a single well-known destination.
    const here = state.areas[state.partyArea]!;
    const pending = state.pendingDrops?.[here.coord];
    if (pending?.length) {
      here.contents.push(...pending.map((tid) => 200 + tid));
      events.push({ type: "pendingDropDelivered", treasureIds: pending });
      delete state.pendingDrops![here.coord];
    }
    const dec = decodeOpen(state.areas[state.partyArea]!);
    if (dec.special === SPECIAL_DEEP_POOL) {
      const area = state.areas[state.partyArea]!;
      // Extension kit (SC-EXT-21, fix round): a Demon may be lurking here even though Deep Pool
      // is a non-chamber special that returns before the generic tunnel branch below — pull a
      // parked marker in and ambush FIRST, ahead of the pool's own treasure-reclaim/telegraph
      // logic (that logic only matters once the party has survived arriving; the pool's own
      // CROSSING effects, elsewhere, only fire when the party later LEAVES by a fresh doorway).
      if (pullParkedDemon(state, area)) { ambushIfDemon(state, events); return events; }
      // Treasure cast into a Deep Pool is recoverable only by a Giant (§Deep Pool) — the auto-
      // dropped pile first, else a deliberate `dropTreasure` cast into THIS sub-location (§10.5).
      // Shared with the stationary `reclaimTreasure` action (bug fix 2026-08-02) so the two paths
      // can never diverge.
      if (tryReclaimSunk(state, area, (items) => giantCanRecover(state, items), events)) return events;
      events.push({ type: "enteredSpecial", special: dec.special });
      state.phase = "explore";
      return events;
    }
    if (dec.special === SPECIAL_VIPER_PIT) {
      // Extension kit (SC-EXT-21, fix round): same Demon pull-in as Deep Pool above — the Viper
      // Pit is likewise a non-chamber special that returns before the generic tunnel branch.
      const area = state.areas[state.partyArea]!;
      if (pullParkedDemon(state, area)) { ambushIfDemon(state, events); return events; }
      // Precise Locations (§10.5): treasure cast into the Viper Pit is recoverable only by a party
      // with the Charmed Flute (Peter's notes; mirrors Deep Pool's Giant-only gate, §10.2). Once
      // eligible, ordinary capacity-gated pickup rules decide who actually carries it out.
      if (tryReclaimSunk(state, area, () => fluteLulls(state), events)) return events;
      events.push({ type: "enteredSpecial", special: dec.special });
      state.phase = "explore";
      return events;
    }
    if (dec.special === SPECIAL_WHIRLPOOL || dec.special === SPECIAL_CHASM) {
      // Unlike Deep Pool / Viper Pit, the Whirlpool and the Chasm ARE chambers (design US-05, §10.5):
      // they draw on entry like any other, so this only adds the entry telegraph and falls through
      // to the chamber path below rather than returning early. Special-areas revision (2026-08-08):
      // the Chasm previously never got this telegraph at all — an oversight relative to its three
      // siblings, now fixed for consistency ("you move your token onto it, but not across").
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
    // First visit by this (unused) doorway → eligible for surprise. A deliberate trap arrival (`trapRules`) is a
    // new route in its own right, so it qualifies even into a chamber the party has already visited.
    const freshEntry = !state.areas[state.partyArea]!.visited || state.deliberateFall === true;
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
  } else if (state.phase === "trap") {
    // A drawn trap opened the Dwarf's pause: carry the earned surprise through to its resume, as the
    // Medusa pause does (`medusaPause.extraDraw`), so choosing to be guided past cannot clobber it.
    state.trapPause!.extraDraw = { hadSurprise };
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
  let { x, y, level } = unpackCoord(state.areas[state.partyArea]!.coord);
  let idx: number;
  for (;;) {
    const target = packCoord(level + 1, x, y);
    idx = state.areas.findIndex((a) => a.coord === target);
    if (idx < 0) {
      // A trap is a one-way drop — no stair-up is added (the party cannot climb back). The card is
      // drawn in its printed form, so it renders in its native orientation like any other tile.
      const card = state.largeIdx < state.largePack.length ? state.largePack[state.largeIdx++]! : 31;
      state.areas.push({ card, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 });
      idx = state.areas.length - 1;
    }
    level += 1;
    // Whirlpool revision (2026-08-08): "a trap to this area sends you down another level" —
    // generalized to every relocateDown caller (trap fall, descendChasm, the Whirlpool's own drag),
    // since they all share the same underlying invariant as the stairway block in map.ts: no
    // vertical arrival may ever land on a Whirlpool. Keep falling until it doesn't.
    if (decodeOpen(state.areas[idx]!).special !== SPECIAL_WHIRLPOOL) break;
  }
  state.prev2 = state.prev;
  state.prev = state.partyArea;
  state.partyArea = idx;
  state.level = level;
  state.fellThroughTrap = true; // one-way: prev is the (unreachable) level above — no withdraw/retreat
  delete state.deliberateFall; // every relocation starts accidental; the trap callers mark a deliberate one after
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
    const drawn = state.largeIdx < state.largePack.length ? state.largePack[state.largeIdx++]! : 31;
    // Bug fix 2026-08-09: the carpet must not invent a return path — "you may not withdraw, and the
    // carpet remains behind" (rulebook §Magic carpet). This used to OR a phantom stair bit onto the
    // drawn card so the party could later climb/descend back by ordinary movement — exactly the
    // secret door the rules never grant. The card is placed exactly as drawn/printed, unmirrored.
    state.areas.push({ card: drawn, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 });
    idx = state.areas.length - 1;
  } else {
    state.areas[idx]!.faceUp = true;
  }
  state.prev2 = state.prev;
  state.prev = state.partyArea;
  state.partyArea = idx;
  state.level = targetLevel;
  state.fellThroughTrap = false; // carpet links both ways
  delete state.deliberateFall;
  delete state.subLocation; // Precise Locations (§10.5): a real position change invalidates any jump override
}

export function reduce(
  state: GameState,
  action: GameAction,
): { state: GameState; events: GameEvent[]; midState?: GameState } {
  pendingMidState = null;
  let result = reduceCore(state, action);
  // The revised combat's turncoat Apprentice (Peter, 14-OCT-2026): an action that takes the party out of the area where the Sorcerer was
  // slain parts company with her first, so she is never in the party for whatever it meets next. The action is replayed from the party
  // without her (same dice), and her leaving is reported ahead of its events.
  if (state.apprenticeWatch !== undefined && result.state.partyArea !== state.apprenticeWatch) {
    const pre = structuredClone(state);
    const parted = partCompany(pre);
    const redo = reduceCore(pre, action);
    result = { state: redo.state, events: [...parted, ...redo.events] };
  }
  if (pendingMidState !== null) {
    const midState: GameState = pendingMidState;
    pendingMidState = null;
    return { ...result, midState };
  }
  return result;
}

function reduceCore(state: GameState, action: GameAction): { state: GameState; events: GameEvent[] } {
  if (state.gs !== GS_PLAYING) return { state, events: [] };

  // A fight waiting on the strangers' decision (`variants.strangerLevel`, or the revised round engine) accepts only that decision (or
  // quitting); and the decision is accepted only then (pluggable stranger strategy spec §5.5), whatever the caller claims.
  const pending = state.fight?.pending;
  const waiting = pending?.by === "strangers";
  const strangersTurn = (kind: string): boolean => pending?.by === "strangers" && pending.kind === kind;
  const revBlocked = { state, events: [{ type: "blocked" }] as GameEvent[] };
  if (action.type === "strangersAssignArtefacts") {
    if (!strangersTurn("loadout") || loadoutViolation(state, action.allocations) !== null) return revBlocked;
    const next = structuredClone(state);
    const events: GameEvent[] = action.fallback ? [{ type: "strategyFallback", from: action.fallback.from, reason: action.fallback.reason }] : [];
    events.push(...applyAllocations(next, action.allocations));
    delete next.fight!.pending;
    if (next.fight!.rev) events.push(...advanceRevised(next));   // the loadout is the last thing before round 1
    return { state: next, events };
  }
  if (action.type === "strangersDeploy" || action.type === "strangersEngage" || action.type === "strangersRedeploy" || action.type === "strangersNominate") {
    const kind = action.type === "strangersDeploy" ? "deploy" : action.type === "strangersEngage" ? "engage" : action.type === "strangersRedeploy" ? "redeploy" : "casualty";
    if (!strangersTurn(kind) || !state.fight?.rev) return revBlocked;
    const bad = action.type === "strangersDeploy" ? deployViolation(state, "strangers", action.creatures)
      : action.type === "strangersEngage" ? engageViolation(state, "strangers", action.pairs)
      : action.type === "strangersRedeploy" ? redeployViolation(state, "strangers", action.moves.map((m) => ({ ...m })))
      : nominateViolation(state, action.nominated);
    if (bad !== null) return revBlocked;
    const next = structuredClone(state);
    const events: GameEvent[] = action.fallback ? [{ type: "strategyFallback", from: action.fallback.from, reason: action.fallback.reason }] : [];
    events.push(...(action.type === "strangersDeploy" ? applyDeploy(next, "strangers", action.creatures)
      : action.type === "strangersEngage" ? applyEngage(next, "strangers", action.pairs)
      : action.type === "strangersRedeploy" ? applyRedeploy(next, "strangers", action.moves)
      : applyNominate(next, action.nominated)));
    events.push(...finalizeRound(next));
    return { state: next, events };
  }
  if (action.type === "deploy" || action.type === "engage" || action.type === "redeploy") {
    if (state.phase !== "fight" || !state.fight?.rev || pending?.by !== "party" || pending.kind !== (action.type === "redeploy" ? "redeploy" : action.type)) return revBlocked;
    const bad = action.type === "deploy" ? deployViolation(state, "party", action.creatures)
      : action.type === "engage" ? (action.moves ? engageMovesViolation(state, action.pairs, action.moves) : engageViolation(state, "party", action.pairs))
      : redeployViolation(state, "party", action.moves.map((m) => ({ ...m })));
    if (bad !== null) return { state, events: [{ type: "planRejected", reason: bad }] };
    const next = structuredClone(state);
    const events = action.type === "deploy" ? applyDeploy(next, "party", action.creatures)
      : action.type === "engage" ? applyEngage(next, "party", action.pairs, action.moves)
      : applyRedeploy(next, "party", action.moves);
    events.push(...finalizeRound(next));
    return { state: next, events };
  }
  if (action.type === "scroll") {
    if (state.phase !== "fight" || !state.fight?.rev || pending?.by !== "party" || pending.kind !== "scroll" || (action.use === "surprise" && !pending.surprise)) return revBlocked;
    const next = structuredClone(state);
    const events = applyScroll(next, action.use);
    events.push(...finalizeRound(next));
    return { state: next, events };
  }
  if (waiting && action.type !== "quit") return revBlocked;

  switch (action.type) {
    case "quit":
      return { state: { ...state, gs: GS_QUIT, phase: "gameOver" }, events: [{ type: "gameOver", gs: GS_QUIT }] };

    case "exitCave": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const dec = decodeOpen(state.areas[state.partyArea]!);
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

    case "examineArea": {
      // The Sibyl's free look (SC-SIB-8): a pure read. It changes no state and returns the SAME state
      // object, so it cannot disturb the cave, the packs or the dice.
      if (state.phase !== "explore" || state.hasSibyl !== true) return { state, events: [{ type: "blocked" }] };
      const lookable = action.area === undefined
        ? state.largeIdx < state.largePack.length
        : examinableAreas(state).includes(action.area);
      if (!lookable) return { state, events: [{ type: "blocked" }] };
      return { state, events: [{ type: "sibylExamined" }] };
    }

    case "move": {
      // Rules §Encountering Strangers (SC-4-18a): the party may leave the chamber by any doorway,
      // forfeiting the treasure, but only during the one-shot `indiffLeaveOpen` window opened by an
      // indifferent test (bug fix 2026-08-04, Gap C) — NOT for as long as `indiffStreak >= 1`, which
      // would wrongly let the party keep trying doorways after a dead end without re-testing.
      // Mirrors selectors.ts's own `lateralMoves` gate; checked again here in defense in depth (the
      // reducer must not trust the client).
      const leavingIndifferentEncounter = state.phase === "encounter" && state.indiffLeaveOpen === true;
      if (state.phase !== "explore" && !leavingIndifferentEncounter) return { state, events: [{ type: "blocked" }] };
      const fromSpecial = decodeOpen(state.areas[state.partyArea]!).special;
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
      // The Chasm has no lateral crossing — only descend or retrace the way in (bug fix 2026-10-12).
      if (!chasmMoveAllowed(state, action.dir)) return { state, events: [{ type: "blocked" }] };
      if (guideLostHere(state, action.dir)) {
        // The Dwarf is gone: the trap takes the party as it tries to leave. No tile is placed and there is no
        // dead end to find — the attempt costs the turn, exactly as a successful move would.
        const fallen = structuredClone(state);
        delete fallen.indiffLeaveOpen;
        fallen.turn += 1;
        delete fallen.testAllDiceRoll; // Next Roll Selector (SC-Test-10): "until end of turn" ends here
        return { state: fallen, events: springUnguidedTrap(fallen) };
      }
      const fromIdx = state.partyArea;
      const oldPrev = state.prev;
      // Leaving an indifferent (not yet pacified) encounter parks its strangers/treasure onto the
      // CURRENT tile and switches to explore BEFORE trying the move — `resolveArea` on whatever's
      // drawn next must start from an empty working set, same as any ordinary explore-phase move
      // already assumes (a tunnel destination never runs `enterChamber`'s own reset). A dead end
      // (moved:false, deadEnd:true — a face-down frontier tile IS placed even so, §Exploring the
      // Cave) leaves `partyArea` unchanged, so the park is undone below and the party is pulled
      // straight back into the SAME live encounter — "delayed by a dead end… must in the same turn
      // either test the strangers again or attack them" (§Encountering Strangers).
      const base = leavingIndifferentEncounter ? structuredClone(state) : state;
      const savedContents = leavingIndifferentEncounter ? state.areas[fromIdx]!.contents : undefined;
      if (leavingIndifferentEncounter) persistAndExplore(base);
      const areasBefore = base.areas.length; // snapshot: did tryMove place a brand-new target tile?
      const largeIdxBefore = base.largeIdx; // snapshot: did tryMove burn a large-pack card for it?
      // Dead End rule (§6.3.2, "forced redraw"): only `move` ever offers the rescue — `retreat`
      // (its own call site below) has its own deliberately harsher dead-end rule and never passes it.
      // The Dead End rehearsal enters a candidate card the way the real move below does (turn aside, `resolveArea`).
      const res = base.variants?.forcedRedraw === true
        ? moveWithRedraw(base, action.dir, enterForDryRun)
        : { ...tryMove(base, action.dir), swap: undefined, noViableExits: false };
      const swapEvents: GameEvent[] = res.swap ? [{ type: "deadEndCardSwapped", ...res.swap }] : [];
      if (!res.moved) {
        if (leavingIndifferentEncounter) {
          res.state.phase = "encounter";
          res.state.strangers = state.strangers;
          res.state.treasures = state.treasures;
          res.state.hazards = state.hazards;
          res.state.sleeping = state.sleeping;
          if (state.statues) res.state.statues = state.statues;
          res.state.lulled = state.lulled;
          res.state.areas[fromIdx]!.contents = savedContents!;
          // Bug fix 2026-08-04 (Gap C, SC-4-18a): a dead-end leave attempt forfeits the window —
          // "finds itself delayed by a dead end ... must in the same turn either test the strangers
          // again or attack them." The party is back in the SAME live encounter with no free move.
          // `delete`, not `= false` — keeps every "closed" state hashing identically regardless of
          // which path closed it (SC-EXT-1 byte-identity).
          delete res.state.indiffLeaveOpen;
        }
        // Whirlpool wading (bug fix 2026-10-12): a dead-end attempt from a ledge still wades the party
        // through the shallows to THAT doorway's ledge — one segment per move, so W>S then S>E are two
        // separate moves. Same d6 as any crossing: 1-2 drags the party down (the attempt is undone),
        // 3-6 leaves the party on the new ledge with the dead end revealed.
        const standing = getSubLocation(state);
        if (res.deadEnd && !leavingIndifferentEncounter && fromSpecial === SPECIAL_WHIRLPOOL
            && standing.at === "doorway" && standing.dir !== undefined && standing.dir !== action.dir) {
          const wade = res.state;
          wade.turn += 1;
          delete wade.testAllDiceRoll; // Next Roll Selector (SC-Test-10): "until end of turn" ends here
          const { events: wpEvents, dragged } = whirlpoolCrossing(wade);
          const evs: GameEvent[] = [...swapEvents, { type: "deadEnd", dir: action.dir }, ...wpEvents];
          if (dragged) {
            // Undo the attempt exactly like a cancelled lateral move: give back a freshly placed tile's
            // card and reopen the doorway, then drop the whole party a level from the Whirlpool's tile.
            if (wade.areas.length > areasBefore) {
              wade.areas.pop();
              wade.largeIdx = largeIdxBefore;
            }
            const from = wade.areas[fromIdx]!;
            const origDead = state.areas[fromIdx]!.deadDoors;
            if (origDead === undefined) delete from.deadDoors; else from.deadDoors = origDead;
            delete wade.subLocation;
            relocateDown(wade);
            return { state: wade, events: [...evs.filter((e) => e.type !== "deadEndCardSwapped" && e.type !== "deadEnd"), ...resolveArea(wade)] };
          }
          wade.subLocation = { area: fromIdx, at: "doorway", dir: action.dir };
          if (res.noViableExits) evs.push({ type: "deadEndNoViableExits" });
          return { state: wade, events: evs };
        }
        return { state: res.state, events: [...swapEvents, res.deadEnd ? { type: "deadEnd", dir: action.dir } : { type: "blocked" }, ...(res.noViableExits ? [{ type: "deadEndNoViableExits" } as GameEvent] : [])] };
      }
      const next = { ...res.state, turn: res.state.turn + 1 };
      next.fellThroughTrap = false; // a normal move reaches a reachable area (resolveArea re-sets it if a trap fires)
      delete next.deliberateFall;
      delete next.subLocation; // Precise Locations (§10.5): a real move invalidates any jump override
      delete next.testAllDiceRoll; // Next Roll Selector (SC-Test-10): "until end of turn" ends here
      const events: GameEvent[] = [...swapEvents];
      // Not simply going back the way we came — except after a Whirlpool wade, where the ledge the party
      // stands on (not `prev`) decides which doorway is the "way we came".
      const wadedTo = state.subLocation?.at === "doorway" && state.subLocation.area === fromIdx ? state.subLocation.dir : undefined;
      const crossing = wadedTo !== undefined ? action.dir !== wadedTo : next.partyArea !== oldPrev;

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
          // The cancelled move takes its Dead End swap with it (the pack stays a valid permutation: the swap
          // was made in place), so the log must not narrate a swap that no longer shows on the map.
          const kept: GameEvent[] = events.filter((e) => e.type !== "deadEndCardSwapped");
          kept.push(...resolveArea(next));
          return { state: next, events: kept };
        }
      }

      events.push(...resolveArea(next));
      if (res.noViableExits) events.push({ type: "deadEndNoViableExits" });
      return { state: next, events };
    }

    // Precise Locations (§10.5, §8.2): jump from a doorway onto the island without leaving the
    // tile — Peter's house rule, Viper Pit/Deep Pool only. Never changes partyArea/prev; only the
    // explicit `subLocation` override moves. Reuses the ordinary crossing risk verbatim (viperPit's
    // per-creature fatal d6 / deepPoolCrossing's auto-drop), so the mechanical events are identical
    // to an ordinary crossing — `islandJump` alone distinguishes "stayed here" from "left."
    case "jumpToIsland": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const dec = decodeOpen(state.areas[state.partyArea]!);
      if (!ISLAND_JUMP_SPECIALS.has(dec.special)) return { state, events: [{ type: "blocked" }] };
      if (getSubLocation(state).at !== "doorway") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.subLocation = { area: next.partyArea, at: "island" };
      // Bug fix 2026-08-08: consume a turn, matching "at exactly the ordinary crossing's own risk"
      // (SC-10.5-6) — an ordinary lateral crossing always costs one via the `move` case; jumping
      // was the one exception, free to attempt over and over within the same turn.
      next.turn += 1;
      delete next.testAllDiceRoll; // Next Roll Selector (SC-Test-10): "until end of turn" ends here
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

    case "reclaimTreasure": {
      // Deep Pool/Viper Pit stationary reclaim (bug fix 2026-08-02): reuses the SAME
      // `tryReclaimSunk` the (re-)entry path in `resolveAreaLoop` already runs, so a party parked
      // on the tile has a legal way to pick up treasure dropped/left there without first leaving
      // by a doorway and walking back in.
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const dec = decodeOpen(state.areas[state.partyArea]!);
      if (dec.special !== SPECIAL_DEEP_POOL && dec.special !== SPECIAL_VIPER_PIT) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const area = next.areas[next.partyArea]!;
      const events: GameEvent[] = [];
      const eligible = dec.special === SPECIAL_DEEP_POOL
        ? (items: readonly number[]) => giantCanRecover(next, items)
        : () => fluteLulls(next);
      if (!tryReclaimSunk(next, area, eligible, events)) return { state, events: [{ type: "blocked" }] };
      return { state: next, events };
    }

    case "withdraw": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      if (state.fellThroughTrap) return { state, events: [{ type: "blocked" }] }; // no way back up a trap
      if (state.noWithdrawTurn === state.turn) return { state, events: [{ type: "blocked" }] }; // Well/Bell fired this turn (SC-EXT-9)
      if (((state.areas[state.prev]?.flags ?? 0) & AF_DESTROYED) !== 0) return { state, events: [{ type: "blocked" }] }; // the way back collapsed (earthquake)
      if (guideLostHere(state, undefined)) {
        const fallen = structuredClone(state); // the Dwarf is gone: the trap takes the party instead of the step back
        return { state: fallen, events: springUnguidedTrap(fallen) };
      }
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
      // Bug fix 2026-08-04 (Gap A, SC-4-18a): route the destination through the SAME shared landing
      // resolution every other arrival uses (`resolveArea` → `resolveAreaLoop`/`finishChamber`),
      // instead of a hand-rolled Demon-only check + hardcoded `explore`. `withdraw` used to be the
      // one landing path that skipped this (`resolveArea`'s own comment already flagged the general
      // gap) — closing it here also reopens a genuine, not-yet-permanent encounter left behind by
      // Gap C's leave window (re-entering "must in the same turn either test the strangers again or
      // attack them"), triggers an on-sight fight for a `hostileAreas` tile, reveals a Spell-remapped
      // tile, and frees stoned members via a Wizard+Staff — all for free, since every tile type is
      // now handled uniformly (the Demon pull-in/ambush included — `resolveAreaLoop`'s own branches
      // already cover it identically for a tunnel/chamber/Deep-Pool/Viper-Pit destination).
      const events = resolveArea(next);
      return { state: next, events };
    }

    case "takeTreasure": {
      if (state.phase !== "pickup") return { state, events: [{ type: "blocked" }] };
      // Deep Pool recovery is Giant-only: no other creature may lift treasure out of the water.
      if (decodeOpen(state.areas[state.partyArea]!).special === SPECIAL_DEEP_POOL) {
        const taker = state.party[action.mi];
        if (!taker || taker.creatureId !== C_GIANT) return { state, events: [{ type: "blocked" }] };
      }
      const next = structuredClone(state);
      // Lost Ruby — guarded by a strength-8 statue (§16), but only until freed once (`rubyFreed`,
      // SC-11-26/27/28): after that it's ordinary treasure, even if dropped and re-taken elsewhere.
      if (next.treasures[action.ti] === 11 && !next.rubyFreed) {
        const fighter = next.party[action.mi];
        if (!fighter || !(fighter.status === 0 || fighter.status === 1)) return { state, events: [{ type: "blocked" }] };
        const events: GameEvent[] = [];
        if (eyeActive(next)) { // the Eye stills the statue: take the Ruby with no fight
          fighter.treasure.push(11);
          next.treasures.splice(action.ti, 1);
          next.rubyFreed = true;
          events.push({ type: "rubyTaken" }, { type: "statuePowerless" });
          if (next.treasures.length === 0) persistAndExplore(next);
          return { state: next, events };
        }
        const partyRoll = rollDieForState(next);
        const enemyRoll = rollDieForState(next);
        const fighterTotal = frontStrength(fighter) + partyRoll;
        const won = fighterTotal >= 8 + enemyRoll; // the statue guards with strength 8 (§16)
        // Surface the roll so the UI can show the fight (the statue is a foe you must beat).
        events.push({
          type: "combatRoll",
          party: CREATURES[fighter.creatureId]!.name,
          enemy: "Statue",
          partyRoll,
          enemyRoll,
          partyTotal: fighterTotal,
          enemyTotal: 8 + enemyRoll,
          result: won ? "partyWon" : "enemyWon",
        });
        if (won) {
          fighter.treasure.push(11);
          next.treasures.splice(action.ti, 1);
          next.rubyFreed = true;
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
          markDied(next, fighter);
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
        const special = decodeOpen(area).special;
        // Special-areas revision (2026-08-08, SC-10.5-16): a Chasm/Whirlpool drop falls through the
        // floor to the level below, rather than sinking into THIS tile's own sub-location bucket —
        // delivered immediately if that area has already been entered, else queued in
        // `state.pendingDrops` until it genuinely is (mirrors the Lair/Harpies holding pen,
        // SC-EXT-12, keyed by coordinate since any number of distinct targets can be pending).
        const fallsThrough = special === SPECIAL_CHASM || special === SPECIAL_WHIRLPOOL;
        const key = !fallsThrough && SUB_LOCATION_SPECIALS.has(special) ? sunkKey(getSubLocation(next)) : undefined;
        // Bug fix 2026-08-05: dropping while genuinely at rest (explore, no active/guarded stranger
        // markers on THIS tile) never actually leaves the room, so offer it straight back — phase
        // "pickup", same as a fresh entry — instead of parking it and forcing a leave-and-return
        // round trip through resolveArea just to notice it again (SC-7.3-5/6 previously required
        // this; a pacified area's guards, or an active encounter, still park it untouchable).
        const restingUnguarded = next.phase === "explore" && !area.contents.some(isGuardCode);
        if (fallsThrough) {
          const { level, x, y } = unpackCoord(area.coord);
          const targetCoordVal = packCoord(level + 1, x, y);
          const targetIdx = next.areas.findIndex((a) => a.coord === targetCoordVal);
          const target = targetIdx >= 0 ? next.areas[targetIdx] : undefined;
          if (target?.visited) {
            target.contents.push(200 + tid);
          } else {
            next.pendingDrops = next.pendingDrops ?? {};
            next.pendingDrops[targetCoordVal] = [...(next.pendingDrops[targetCoordVal] ?? []), tid];
          }
        } else if (key !== undefined) {
          area.sunkTreasure = area.sunkTreasure ?? [];
          let bucket = area.sunkTreasure.find((b) => b.at === key);
          if (!bucket) { bucket = { at: key, items: [] }; area.sunkTreasure.push(bucket); }
          bucket.items.push(tid);
        } else if (restingUnguarded) {
          next.treasures.push(tid);
          next.phase = "pickup";
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
      if (sibylWaiting(state)) return meetSibyl(state);
      if ((state.indiffStreak ?? 0) >= 3) return { state, events: [{ type: "blocked" }] }; // permanently indifferent
      const next = structuredClone(state);
      next.surpriseReady = false; // approaching to test forfeits the chance of a surprise attack (§Surprise)
      // Bug fix 2026-08-04 (Gap C, SC-4-18a): testing again always forfeits any leave window opened
      // by a PRIOR test this visit — the branch below re-opens it fresh only if THIS test's own
      // outcome qualifies (indifferent, count still <3). `delete`, not `= false` — an always-present
      // key would change every tested state's hash even when closed (SC-EXT-1 byte-identity).
      delete next.indiffLeaveOpen;
      const { outcome, roll: rollValue } = rollReaction(next);
      // `certain` (bug fix 2026-08-02): the Unicorn's hostileMax/indiffMax (0/0) make `outcome`
      // "friendly" no matter what the die shows — the roll above still genuinely advanced the seed
      // (or, under Test Mode, still returned a representative display value), but the UI has
      // nothing worth animating for it. Computed from the SAME leader `reactionRoll`/
      // `forcedReactionRoll` just used, not re-derived independently.
      const leaderId = next.strangers[findLeader(next.strangers)];
      const certain = leaderId === C_UNICORN;
      const events: GameEvent[] = [{ type: "reaction", outcome, roll: rollValue, ...(certain ? { certain: true as const } : {}) }];
      if (outcome === "friendly") {
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
          // The Sibyl is met only once the real strangers are dealt with (SC-SIB-4): if she is here,
          // stay in the encounter so she can be tested next, ahead of any pickup.
          if (sibylWaiting(next)) next.surpriseReady = false;
          else if (next.treasures.length > 0) next.phase = "pickup";
          else persistAndExplore(next);
        }
      } else if (outcome === "indifferent") {
        next.indiffStreak = (next.indiffStreak ?? 0) + 1;
        // Bug fix 2026-08-04 (Gap D, SC-4-18a): write the fresh count through to the DURABLE,
        // per-area store so a later re-entry (chamber.ts's enterChamber) resumes from here instead
        // of restarting at 0 — "they remember forever how many times your party has approached
        // them ... even if you went away in between."
        next.indiffCounts = { ...(next.indiffCounts ?? {}), [next.partyArea]: next.indiffStreak };
        if (next.indiffStreak >= 3) {
          // Permanently indifferent to this party: treasure stays guarded (no pickup) UNLESS a
          // living Thief ally is present (design US-17, SC-EXT-19) — but the party may now leave by
          // any valid exit either way. Record the area so re-entry skips the encounter.
          if (!next.pacifiedAreas?.includes(next.partyArea)) {
            next.pacifiedAreas = [...(next.pacifiedAreas ?? []), next.partyArea];
          }
          events.push({ type: "pacified" }); // tell the player they may now move on
          settlePacifiedWithSibyl(next); // Thief present + treasure here -> live pickup; else the ordinary re-park (and the Sibyl, if here, steps forward)
        } else {
          // Bug fix 2026-08-04 (Gap C, SC-4-18a): open the one-shot leave window — the party's VERY
          // NEXT action may freely leave by any doorway, forfeiting the treasure.
          next.indiffLeaveOpen = true;
        }
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
          state.areas[state.partyArea]!.contents.some(isGuardCode)) {
        const next = structuredClone(state);
        const area = next.areas[next.partyArea]!;
        next.strangers = area.contents.filter(isGuardCode).map((c) => c - 100);
        next.treasures = area.contents.filter((c) => c >= 200 && c < 300).map((c) => c - 200);
        // A parked Sibyl is no guard: she steps aside (parked awake) and is met once the fight is won.
        if (area.contents.includes(SIBYL_CODE)) next.lulled = [...(next.lulled ?? []), C_SIBYL];
        area.contents = area.contents.filter((c) => c < 100 || c >= 300); // keep display markers / sleeping
        return { state: next, events: startFight(next, 0) };
      }
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      // Surprise only on an immediate attack from a fresh, non-trap entry (§Surprise).
      return { state: next, events: startFight(next, next.surpriseReady ? 1 : 0) };
    }

    case "resolveRound": {
      if (state.phase !== "fight" || state.fight?.rev) return { state, events: [{ type: "blocked" }] };   // a revised fight is played by deploy / engage / redeploy
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
      const roll = rollDieForState(next);
      // 4-6 grants the player's preference (§"A Round of Fighting"). The revised rules add the Ring's +1 (a 7 counting as 6), as for the strangers.
      const ring = next.fight!.rev?.bonus?.partyRing ? 1 : 0;
      const victim = Math.min(6, roll + ring) >= 4 ? preferred : other;
      markDied(next, next.party[victim]!);
      dropPartyMember(next, victim);
      const events: GameEvent[] = [
        { type: "casualtyChosen", creatureId: next.party[victim]!.creatureId, roll, gotPreference: victim === preferred },
        { type: "memberDied", creatureId: next.party[victim]!.creatureId },
        ...eyeForsakenByDeath(next, next.party[victim]!),
      ];
      queue.shift();
      if (queue.length === 0) {
        next.fight!.casualtyQueue = undefined;
        if (next.fight!.rev) events.push(...resumeAfterCasualties(next));
        events.push(...finalizeRound(next));
      }
      return { state: next, events };
    }

    case "retreat": {
      if (state.phase !== "fight") return { state, events: [{ type: "blocked" }] };
      if (state.fellThroughTrap) return { state, events: [{ type: "blocked" }] }; // no way back up a trap
      if (state.fight?.ghouls) return { state, events: [{ type: "blocked" }] };   // the Ghouls are a hazard: no retreat from them
      // A party may retreat only after at least one round has been fought (§Retreat).
      if (!state.fight || state.fight.round <= 1) return { state, events: [{ type: "blocked" }] };
      // A party may retreat by ANY doorway or stairway — even an unexplored one (§Retreat). Attempt
      // the move; if the way is a dead end (or blocked), the party must fight another round this turn.
      const fromIdx = state.partyArea;
      // Guide lost (`trapRules`): the retreat succeeds in every respect except where it ends — the trap, not the
      // doorway, takes the party. Same bookkeeping as a real retreat; only the destination differs.
      const guideLost = guideLostHere(state, action.dir);
      const res = guideLost ? { state: structuredClone(state), moved: true, deadEnd: false } : tryMove(state, action.dir);
      if (!res.moved) {
        // The retreat failed — a dead-end tile, or no tile left to draw (pack exhausted). Either way the
        // party can't escape this round and must fight on (§Retreat): lock out further retreats AND tell
        // the player (always a deadEnd event, so the bounce-back to the fight is never silent).
        // tryMove clones the state for a dead end but returns the original for a no-tile way, so clone
        // before flagging the latter to avoid mutating the input state.
        const next = res.deadEnd ? res.state : structuredClone(state);
        if (next.fight) next.fight = { ...next.fight, retreatBlocked: true };
        const events: GameEvent[] = [{ type: "deadEnd", dir: action.dir, retreat: true }];
        // In a standoff there is no decision pending that would bring the round on, so the failed retreat itself sets the next round going
        // (a Spectre that cannot be faced slays another of the party); once it is fought, retreat opens again (SC-9.7-22).
        if (next.fight?.rev?.standoff) events.push(...resumeAfterStandoff(next), ...finalizeRound(next));
        return { state: next, events };
      }
      // Retreat succeeds: the strangers and any dropped treasure are LEFT BEHIND in the chamber we fled.
      // What the strangers bore goes back on the floor with the rest, and is handed out afresh next fight.
      const sorcererEvents = settleFelledSorcerer(res.state); // a Sorcerer defeated earlier in the fight dies after all
      if (res.state.apprenticeWatch !== undefined) {   // ...and the party has already left the area where he fell: she is left there too
        res.state.apprenticeWatch = fromIdx;
        sorcererEvents.push(...partCompany(res.state));
      }
      dropAllGear(res.state);
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
      const events = [...sorcererEvents, ...(guideLost ? springUnguidedTrap(res.state) : resolveArea(res.state))]; // resolve the area we retreated into (fresh tunnel/chamber)
      return { state: res.state, events };
    }

    case "stay": {
      // The revised combat (Peter, 14-OCT-2026): the party lingers where the Sorcerer was slain, so the Apprentice joins the other
      // strangers there and they attack it with surprise.
      if (state.phase !== "explore" || state.fight || state.apprenticeWatch !== state.partyArea) return { state, events: [{ type: "blocked" }] };
      if (!state.party.some((m) => m.status === 1 && m.creatureId === C_APPRENTICE)) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      delete next.apprenticeWatch;
      const events = revertApprenticesOnSorcererDeath(next);
      const area = next.areas[next.partyArea]!;
      next.strangers.push(...area.contents.filter(isGuardCode).map((c) => c - 100));   // every guard of the chamber joins her
      next.treasures.push(...area.contents.filter((c) => c >= 200 && c < 300).map((c) => c - 200));
      area.contents = area.contents.filter((c) => !isGuardCode(c) && (c < 200 || c >= 300));
      events.push(...startFight(next, -1));
      return { state: next, events };
    }

    case "slaySorcerer": {
      // The player declines to spare the Sorcerer: he dies as the killing blow would have had him die.
      if (state.phase !== "sorcerer") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const events = slaySorcerer(next);
      afterFight(next, events);
      return { state: next, events };
    }

    case "spareSorcerer": {
      // Spared on condition that he transport the party, and the treasure in the chamber, to any discovered
      // area (§The Sorcerer). He stays behind in the chamber he was defeated in.
      if (state.phase !== "sorcerer" || !canTeleportTo(state, action.area)) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const from = next.partyArea;
      const carried = next.treasures;
      next.treasures = [];
      persistAndExplore(next); // park whatever else stays in the chamber (the sleeping, the statues)
      next.areas[from]!.contents.push(100 + C_SORCERER);
      const to = next.areas[action.area]!;
      to.contents.push(...carried.map((t) => 200 + t));
      next.prev2 = next.prev;
      next.prev = from;
      next.partyArea = action.area;
      next.level = unpackCoord(to.coord).level;
      next.fellThroughTrap = true; // magic leaves no way back: no withdrawing from the landing
      delete next.deliberateFall;
      delete next.subLocation;
      const events: GameEvent[] = [
        { type: "sorcererSpared" },
        { type: "partyTeleported", from, to: action.area, level: next.level, treasureIds: carried },
        ...resolveArea(next),
      ];
      return { state: next, events };
    }

    case "proceed": {
      // Decline the Medusa-pause throw: the held hazards (her gaze included) now fire as normal.
      if (state.phase !== "medusa") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      return { state: next, events: resumeFromMedusaPause(next) };
    }

    case "avoidTrap":
    case "fallThroughTrap": {
      // The Dwarf's choice at a trap (`variants.trapRules`): only legal in the `trap` pause.
      if (state.phase !== "trap" || !state.trapPause) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      return { state: next, events: resumeFromTrapPause(next, action.type === "fallThroughTrap") };
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
        case 6: { // Healing Balm — at rest or while looting, target a dead member (house rule SC-11-15a:
          // only the same turn and area the death occurred — see healingBalmEligible)
          if ((next.phase !== "explore" && next.phase !== "pickup") || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          if (!healingBalmEligible(next, action.target)) return { state, events: [{ type: "blocked" }] };
          const dm = next.party[action.target]!;
          dm.status = 0;
          dm.diedTurn = undefined;
          dm.diedArea = undefined;
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
          removeStrangerFromFight(next, action.target); // (what it bore drops onto the floor)
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
          // Bug fix 2026-08-09 (QOTO-02/03): the carpet is left behind on the tile it was used from,
          // not destroyed — "the carpet must be left in the area where it was used, but can be
          // retrieved and used again" (rulebook §Magic carpet). Parked as an ordinary 200+tid floor
          // code on the VACATED area (before carpetMove changes partyArea), so it surfaces normally
          // for pickup on any later (re-)visit — the same mechanism `leaveTreasure`/`dropTreasure`
          // already use for treasure left on a floor.
          next.areas[next.partyArea]!.contents.push(204);
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
            const dec = decodeOpen(cur);
            if (action.dir === DIR_DOWN) {
              if (dec.stairDown) return { state, events: [{ type: "blocked" }] }; // already a visible stair
              const below = next.areas.find((a) => a.coord === packCoord(level + 1, x, y));
              if (!below || !decodeOpen(below).stairUp) return { state, events: [{ type: "blocked" }] };
              cur.card |= 64; // reveal stair DOWN
              if (cur.deadDoors) cur.deadDoors &= ~64;
            } else {
              if (dec.stairUp) return { state, events: [{ type: "blocked" }] };
              const above = next.areas.find((a) => a.coord === packCoord(level - 1, x, y));
              if (!above || !decodeOpen(above).stairDown) return { state, events: [{ type: "blocked" }] };
              cur.card |= 32; // reveal stair UP
              if (cur.deadDoors) cur.deadDoors &= ~32;
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
          const roll = rollDieForState(next);
          const events: GameEvent[] = [{ type: "artifactUsed", artifact: 15 }];
          if (roll === 1) {
            // Poison — a normal "killing die-roll" death: the Ring's usual invincibility still
            // applies (§Ring), and when it doesn't, the curse check runs BEFORE the spill (Task 9
            // lesson — spillCarried would otherwise strip the Eye of God out of `treasure` first
            // and mask eyeForsakenByDeath's own check), matching every other death site.
            if (ringInvincible(drinker, next)) {
              events.push({ type: "deathPrevented", creatureId: drinker.creatureId });
            } else {
              markDied(next, drinker);
              events.push(...eyeForsakenByDeath(next, drinker));
              const items = spillCarried(drinker);
              if (items.length) { next.treasures.push(...items); events.push({ type: "itemsSpilled", creatureId: drinker.creatureId, items }); }
            }
          } else if (roll >= 4) {
            drinker.fsBonus = (drinker.fsBonus ?? 0) + 2; // permanent, stacks if drunk again
          }
          events.push({
            type: "elixirDrunk", creatureId: drinker.creatureId, roll,
            outcome: roll === 1 ? "death" : roll <= 3 ? "nothing" : "strength",
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
              // Bug fix 2026-08-09 (QOTO-04): the statue may be live (mid-resolution, state.statues)
              // or already PARKED on the tile's own contents as 500+cid (settled to explore with
              // nothing else pending, holyWaterTargets' own comment explains why) — remove it from
              // whichever it actually came from.
              if (found.target >= HW_PARKED_STATUE_BASE) {
                const ci = found.target - HW_PARKED_STATUE_BASE;
                next.areas[next.partyArea]!.contents.splice(ci, 1);
              } else {
                const idx = found.target - HW_STATUE_BASE;
                next.statues!.splice(idx, 1);
              }
              addStranger(next, found.creatureId!);
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
              removeStrangerFromFight(next, idx);
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
          if (next.variants?.combatRevision) return { state, events: [{ type: "blocked" }] };   // the revised combat has its own Scroll step (revisedRound.ts)
          if (!hasLivingHuman(next) || next.strangers.length === 0) return { state, events: [{ type: "blocked" }] };
          consume();
          const destroyed: number[] = [];
          const survivors: number[] = [];
          for (const sid of next.strangers) (CREATURES[sid]!.mp === 0 ? destroyed : survivors).push(sid);
          for (let i = next.strangers.length - 1; i >= 0; i--) if (CREATURES[next.strangers[i]!]!.mp === 0) removeStranger(next, i); // (their gear drops)
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
      const roll = rollDieForState(next);
      const events: GameEvent[] = [{ type: "chestOpened", result: roll }];
      switch (roll) {
        case 1: next.curses += 1; break; // a Curse
        case 2: // a Spectre appears and attacks (one round)
          next.strangers.push(9);
          // Like every other Spectre arrival (`resolveAreaLoop`, `resolveExtraDraw`): a held Eye of God destroys it
          // on sight and the Talisman drives it off on level 4+ — before it can fight. (Bug DOFO: the chest used to
          // conjure its Spectre straight into a fight, past both.)
          events.push(...annihilateWithEye(next));
          events.push(...wardOffSpectres(next));
          if (next.strangers.includes(9)) {
            // No surprise either way (Peter, 10-OCT-2026, Q6): the Consolidated Rules say the Spectre "attacks", not
            // "surprise attacks".
            next.fight = { surprise: 0, round: 1, focus: next.strangers.length - 1 };
            if (next.variants?.combatRevision) next.fight.oneRound = true;   // Peter, 14-OCT-2026: the fight ends after one round
            next.phase = "fight";
            events.push({ type: "fightStarted", surprise: 0 }, ...beginRevised(next));
          }
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
      if (decodeOpen(state.areas[state.partyArea]!).special !== SPECIAL_CHASM) return { state, events: [{ type: "blocked" }] };
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
      if (decodeOpen(state.areas[state.partyArea]!).special !== SPECIAL_WELL) return { state, events: [{ type: "blocked" }] };
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
      if (decodeOpen(state.areas[state.partyArea]!).special !== SPECIAL_BELL_ROPE) return { state, events: [{ type: "blocked" }] };
      if ((state.areas[state.partyArea]!.flags & AF_BELL_SPENT) !== 0) return { state, events: [{ type: "blocked" }] };
      const puller = state.party[action.mi];
      if (!puller || !(puller.status === 0 || puller.status === 1)) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.areas[next.partyArea]!.flags |= AF_BELL_SPENT; // spent forever, whatever the roll (design US-03)
      const creatureId = next.party[action.mi]!.creatureId;
      const roll = rollDieForState(next);
      const events: GameEvent[] = [];
      if (roll === 1) {
        // Desertion semantics (design Resolved-3): removed from the game with everything carried —
        // not dead (no memberDied), not revivable. Splice out entirely, like Mutiny's deserters.
        next.party.splice(action.mi, 1);
        events.push({ type: "bellRoll", roll, outcome: "vanish", creatureId });
        if (!next.party.some((m) => m.status === 0 || m.status === 1)) {
          next.gs = GS_DEAD;
          next.phase = "gameOver";
          events.push({ type: "gameOver", gs: GS_DEAD });
        }
        return { state: next, events };
      }
      if (roll <= 3) {
        // Foreboding narration only — no mechanical effect (design US-03, Resolved-2).
        events.push({ type: "bellRoll", roll, outcome: "toll", creatureId });
        return { state: next, events };
      }
      events.push({ type: "bellRoll", roll, outcome: "stir", creatureId });
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
      const roll = rollDieForState(next);
      const events: GameEvent[] = [];
      if (roll <= 2) {
        // Unavoidable trap: the WHOLE party falls, whatever a Dwarf's GUIDES_PAST_TRAP would normally
        // do (this bypasses `applyHazards`' HAZARD_TRAP case entirely — there is no Dwarf check here
        // to bypass, by construction). `relocateDown` sets `fellThroughTrap`, blocking withdraw at the
        // landing exactly like any other trap fall.
        events.push({ type: "cryptRoll", roll, outcome: "trap" });
        relocateDown(next);
        events.push(...resolveArea(next));
        return { state: next, events };
      }
      // A find: the crypt card itself becomes the gems — ordinary treasure 21 (25 kg), dropped for a
      // normal, carry-capacity-gated pickup (design Resolved-13).
      events.push({ type: "cryptRoll", roll, outcome: "find" });
      next.treasures.push(T_CRYPT);
      next.phase = "pickup";
      return { state: next, events };
    }

    case "testPlaceArea": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      // SC-Test-8: `special` also accepts TILE_MIN..TILE_MAX, the pseudo-ids for a plain chamber
      // or a tunnel of a given exit shape — a second, contiguous range appended right after the
      // real specials (SPECIAL_DEEP_POOL..SPECIAL_WELL).
      const isSpecial = action.special >= SPECIAL_DEEP_POOL && action.special <= SPECIAL_WELL;
      const isTile = action.special >= TILE_MIN && action.special <= TILE_MAX;
      if (!isSpecial && !isTile) return { state, events: [{ type: "blocked" }] };
      // Variant gating (SC-Test-6): a kit-only special (6-11) is invalid content for a kit-off
      // game, same as `legalActions` already rejects anything else invalid for the active variant
      // set (design plan §8). SC-Test-8 adds one more kit-only case: TILE_TUNNEL_ES is the only
      // plain-tile shape that exists solely on an extension-kit tile (x05-3).
      const kitOnly = (isSpecial && action.special > SPECIAL_GREAT_HALL) || action.special === TILE_TUNNEL_ES;
      if (kitOnly && !state.variants?.extensionKit) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.testNextArea = { dir: action.dir, special: action.special };
      return { state: next, events: [{ type: "testAreaQueued", dir: action.dir, special: action.special }] };
    }

    case "testSetChamber": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      // Variant gating (SC-Test-6): a kit-only creature/treasure/hazard id is invalid content for
      // a kit-off game — an id is kit-only iff it falls beyond the base table's own length, which
      // stays correct even if a future kit expansion changes the counts.
      // The Sibyl (id 21, SC-SIB-1) sits beyond the base table too but belongs to her OWN variant, not the
      // kit's: she is valid exactly when `variants.sibyl` is on, whether or not the kit is.
      if (action.strangers.includes(C_SIBYL) && !state.variants?.sibyl) return { state, events: [{ type: "blocked" }] };
      if (!state.variants?.extensionKit) {
        const kitOnly =
          action.strangers.some((id) => id >= BASE_CREATURES.length && id !== C_SIBYL) ||
          action.treasures.some((id) => id >= BASE_TREASURES.length) ||
          action.hazards.some((id) => id >= HAZARD_NAMES.length);
        if (kitOnly) return { state, events: [{ type: "blocked" }] };
      }
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

    case "testForceDie": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      if (action.value < 1 || action.value > 6) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.testNextDie = action.value;
      return { state: next, events: [{ type: "testDieQueued", value: action.value }] };
    }

    case "testForceAllDice": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      if (action.value < 1 || action.value > 6) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.testAllDiceRoll = action.value;
      return { state: next, events: [{ type: "testAllDiceQueued", value: action.value }] };
    }

    case "testClearOverrides": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      delete next.testNextArea;
      delete next.testNextChamber;
      delete next.testNextReaction;
      delete next.testNextDie;
      delete next.testAllDiceRoll;
      return { state: next, events: [{ type: "testOverridesCleared" }] };
    }
  }
}
