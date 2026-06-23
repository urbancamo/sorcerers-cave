import { GS_PLAYING, GS_QUIT, GS_ESCAPED, GS_DEAD, PARTY_CAP, AF_DESTROYED, type GameState, type PartyMember } from "./state";
import { tryMove } from "./map";
import { decodeArea } from "./decode";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT } from "./data/areaCards";
import { viperCrossing, deepPoolCrossing } from "./special";
import { enterChamber } from "./chamber";
import { applyHazards } from "./hazards";
import { takeTreasure, canCarry } from "./pickup";
import { unpackCoord, packCoord, targetCoord, DIR_UP, DIR_DOWN } from "./coords";
import type { GameAction, GameEvent } from "./actions";
import { reactionRoll } from "./reaction";
import { frontStrength } from "./combat";
import { validatePlan, resolvePlannedRound } from "./combatPlan";
import { wardOffSpectres, annihilateWithEye, eyeActive, reconcileUnicorns, hasWoman, fluteLulls } from "./effects";
import { rollDie } from "./rng";
import { CREATURES } from "./data/creatures";

const T_EYE_OF_GOD = 13; // treasure id — must stay with its bearer or the party is cursed (§Eye of God)

/** First living member who may bear+use `artifact` now (some artifacts need a specific creature). */
function findBearer(state: GameState, artifact: number): number {
  return state.party.findIndex((m: PartyMember) => {
    if (!(m.status === 0 || m.status === 1) || !m.treasure.includes(artifact)) return false;
    if (artifact === 6) return m.creatureId === 6 || m.creatureId === 1 || m.creatureId === 4 || m.creatureId === 8; // Balm: Woman/W-Hero/Priest/Wizard
    if (artifact === 9) return m.creatureId === 8; // Staff reanimation: Wizard
    if (artifact === 4) return m.creatureId === 4 || m.creatureId === 8; // Magic Carpet: Priest/Wizard
    if (artifact === 12) return m.creatureId === 0 || m.creatureId === 1 || m.creatureId === 4 || m.creatureId === 5 || m.creatureId === 6 || m.creatureId === 8; // Charmed Flute: Hero/W-Hero/Priest/Man/Woman/Wizard
    return true;
  });
}

/** Persist the chamber working set back into the area, then return to exploring. */
function persistAndExplore(state: GameState): void {
  const area = state.areas[state.partyArea]!;
  area.contents = [
    ...area.contents,
    ...state.strangers.map((id) => 100 + id),
    ...state.treasures.map((id) => 200 + id),
    ...(state.sleeping ?? []).map((id) => 400 + id), // sleeping creatures stay (inert) in the chamber
    ...(state.lulled ?? []).map((id) => 100 + id), // flute-lulled dragons park AWAKE — re-lulled on re-entry only if the flute is still held
  ];
  // Clear the live working set now that it's parked on the area — otherwise leftover cards (e.g.
  // treasure the party left behind) keep rendering on the party's current tile as they move on.
  state.strangers = [];
  state.treasures = [];
  state.hazards = [];
  state.sleeping = [];
  state.lulled = [];
  state.fightDrops = []; // moving on — the drop record no longer applies
  state.phase = "explore";
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

/** Settle the outcome once a round (and any casualty choices) is fully resolved: a Unicorn may
 *  depart, the party may be wiped, or the foes cleared (→ pickup / explore). */
function finalizeRound(state: GameState): GameEvent[] {
  const events = reconcileUnicorns(state); // a Unicorn departs if the last Woman fell (§ Unicorn)
  const partyAlive = state.party.some((m) => m.status === 0 || m.status === 1);
  if (!partyAlive) {
    state.gs = GS_DEAD;
    state.phase = "gameOver";
    state.fight = null;
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
    state.fight = null;
    state.party.forEach((m) => { m.potionActive = false; });
    events.push({ type: "fightWon" });
    if (state.treasures.length > 0) state.phase = "pickup";
    else persistAndExplore(state);
  }
  // else: still fighting; resolveRound already advanced the round
  return events;
}

/** Free any party members left as stone in the party's CURRENT area, if a living Wizard bearing the
 *  Magic Staff is present (§Medusa). They rejoin the party and leave the chamber's stone display. */
function reviveStoned(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const wizardWithStaff = state.party.some(
    (m) => (m.status === 0 || m.status === 1) && m.creatureId === 8 && m.treasure.includes(9),
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

/** Resolve the area just entered: special markers, then chamber draw + hazards + phase (spec §4/§7). */
function resolveArea(state: GameState): GameEvent[] {
  const events: GameEvent[] = [{ type: "moved", area: state.partyArea, level: state.level }];
  // Returning to a chamber with our petrified members + a Wizard's Magic Staff frees them on arrival.
  events.push(...reviveStoned(state));

  for (;;) {
    const dec = decodeArea(state.areas[state.partyArea]!.card);
    if (dec.special === SPECIAL_DEEP_POOL) {
      const area = state.areas[state.partyArea]!;
      if (area.dropped && area.dropped.length > 0) {
        state.treasures = area.dropped;
        area.dropped = [];
        events.push({ type: "treasureReclaimed", count: state.treasures.length });
        state.phase = "pickup"; // reclaim dropped heavy treasure (weight-limited)
        return events;
      }
      events.push({ type: "enteredSpecial", special: dec.special });
      state.phase = "explore";
      return events;
    }
    if (dec.special === SPECIAL_VIPER_PIT) {
      events.push({ type: "enteredSpecial", special: dec.special });
      state.phase = "explore";
      return events;
    }
    if (!dec.chamber) {
      state.phase = "explore";
      return events;
    }
    const freshEntry = !state.areas[state.partyArea]!.visited; // first visit by this (unused) doorway → eligible for surprise
    events.push(...enterChamber(state));
    events.push(...annihilateWithEye(state)); // the Eye destroys Spectres on sight (§ Eye of God)
    events.push(...wardOffSpectres(state)); // the Talisman drives off Spectres on level >= 4 (§ Talisman)
    const { events: hzEvents, fell } = applyHazards(state);
    events.push(...hzEvents);
    // A hazard may incapacitate the whole party (Medusa petrifies everyone, or Ghouls slay them) —
    // with no one left able to act, the expedition ends.
    if (!state.party.some((m) => m.status === 0 || m.status === 1)) {
      state.gs = GS_DEAD;
      state.phase = "gameOver";
      if (state.party.every((m) => m.status === 2)) events.push({ type: "petrifiedOut" }); // all turned to stone
      events.push({ type: "gameOver", gs: GS_DEAD });
      return events;
    }
    if (fell) {
      // The party falls away from this chamber — its strangers and treasure stay behind here (parked
      // to its contents). Clearing the working set first stops them leaking onto the tile fallen into.
      persistAndExplore(state);
      relocateDown(state);
      events.push({ type: "trapSprung", level: state.level });
      events.push({ type: "moved", area: state.partyArea, level: state.level });
      continue;
    }
    // The Charmed Flute lulls every Dragon for as long as the party holds it: they sleep in the
    // chamber, no longer leading or blocking, so a friendlier creature reacts and the area plays
    // out as if empty (§ Charmed Flute). Re-evaluated each entry, so they wake if the flute is gone.
    if (fluteLulls(state) && state.strangers.includes(10)) {
      const dragons = state.strangers.filter((id) => id === 10);
      state.lulled = [...(state.lulled ?? []), ...dragons];
      state.strangers = state.strangers.filter((id) => id !== 10);
      if (freshEntry) events.push({ type: "dragonsLulled", count: dragons.length });
    }
    // Permanently indifferent to this party (§Reactions): the party may walk freely through (any exit)
    // — so park the guards to the tile and go to explore for full traversal — but it may also still
    // CHOOSE to attack them (selectors offers an Attack action; the guarded treasure stays out of reach
    // unless they're beaten). Other parties are unaffected.
    if (state.pacifiedAreas?.includes(state.partyArea)) {
      persistAndExplore(state);
      return events;
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
    return events;
  }
}

/** Move the whole party to the area directly below (same x,y), creating it if needed. */
function relocateDown(state: GameState): void {
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
    if (targetLevel === 1) drawn &= ~32; // only the Gateway exits level 1
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
}

export function reduce(state: GameState, action: GameAction): { state: GameState; events: GameEvent[] } {
  if (state.gs !== GS_PLAYING) return { state, events: [] };

  switch (action.type) {
    case "quit":
      return { state: { ...state, gs: GS_QUIT, phase: "gameOver" }, events: [{ type: "gameOver", gs: GS_QUIT }] };

    case "exitCave": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const dec = decodeArea(state.areas[state.partyArea]!.card);
      if (state.level === 1 && dec.stairUp) {
        return { state: { ...state, gs: GS_ESCAPED, phase: "gameOver" }, events: [{ type: "gameOver", gs: GS_ESCAPED }] };
      }
      return { state, events: [{ type: "blocked" }] };
    }

    case "move": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const fromSpecial = decodeArea(state.areas[state.partyArea]!.card).special;
      const fromIdx = state.partyArea;
      const oldPrev = state.prev;
      const res = tryMove(state, action.dir);
      if (!res.moved) {
        return { state: res.state, events: [res.deadEnd ? { type: "deadEnd", dir: action.dir } : { type: "blocked" }] };
      }
      const next = { ...res.state, turn: res.state.turn + 1 };
      next.fellThroughTrap = false; // a normal move reaches a reachable area (resolveArea re-sets it if a trap fires)
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
      }

      events.push(...resolveArea(next));
      return { state: next, events };
    }

    case "withdraw": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      if (state.fellThroughTrap) return { state, events: [{ type: "blocked" }] }; // no way back up a trap
      if (((state.areas[state.prev]?.flags ?? 0) & AF_DESTROYED) !== 0) return { state, events: [{ type: "blocked" }] }; // the way back collapsed (earthquake)
      const next = structuredClone(state);
      next.areas[next.partyArea]!.contents = [
        ...next.areas[next.partyArea]!.contents,
        ...next.strangers.map((id) => 100 + id),
        ...next.treasures.map((id) => 200 + id),
        ...(next.sleeping ?? []).map((id) => 400 + id),
        ...(next.lulled ?? []).map((id) => 100 + id), // flute-lulled dragons park awake (re-lulled on re-entry if held)
      ];
      next.strangers = []; next.treasures = []; next.hazards = []; next.sleeping = []; next.lulled = [];
      next.partyArea = next.prev;
      next.level = unpackCoord(next.areas[next.partyArea]!.coord).level;
      next.phase = "explore";
      return { state: next, events: [{ type: "moved", area: next.partyArea, level: next.level }] };
    }

    case "takeTreasure": {
      if (state.phase !== "pickup") return { state, events: [{ type: "blocked" }] };
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
        } else {
          // The wrestler is slain, but the statue does NOT stay aroused: it only ever strikes the
          // member who explicitly tries to take the Ruby — never the party on a passive re-entry.
          // The Ruby is left in place (not spliced) so it can be attempted again later. statueAroused
          // here just labels this wrestle's dice overlay (§16).
          fighter.status = 3;
          events.push({ type: "memberDied", creatureId: fighter.creatureId });
          events.push({ type: "statueAroused" });
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
      takeTreasure(next, action.ti, action.mi);
      if (next.treasures.length === 0) persistAndExplore(next);
      return { state: next, events: [] };
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
      from.treasure.splice(action.idx, 1);
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
      m.treasure.splice(action.idx, 1);
      // During an active pickup the chamber floor IS the live working set, so a member dropping
      // treasure to free capacity (e.g. a Giant clearing room for the 100kg Chest) lands it back on
      // the floor where it can be re-taken this same visit. Otherwise (at rest) it parks on contents.
      if (next.phase === "pickup") next.treasures.push(tid);
      else next.areas[next.partyArea]!.contents.push(200 + tid); // left on the chamber floor
      // Forsaking the Eye of God curses the party (§Eye of God).
      if (tid === T_EYE_OF_GOD) { next.curses += 1; return { state: next, events: [{ type: "eyeForsaken" }] }; }
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
        const room = PARTY_CAP - next.party.length;
        // A Womanless Unicorn (id 13) will not join — it stays behind guarding the area.
        const joinPool = next.strangers.filter((id) => !(id === 13 && !womanPresent));
        const guardPool = next.strangers.filter((id) => id === 13 && !womanPresent);
        const joining = joinPool.slice(0, Math.max(0, room));
        for (const id of joining) next.party.push({ creatureId: id, status: 1, dragonKills: 0, treasure: [] });
        events.push({ type: "strangersJoined", count: joining.length });
        if (guardPool.length > 0) {
          next.strangers = guardPool;
          for (const id of guardPool) events.push({ type: "unicornGuards", creatureId: id });
          // The womanless Unicorn guards the area for THIS party (per-party): pass through, no loot.
          if (!next.pacifiedAreas?.includes(next.partyArea)) {
            next.pacifiedAreas = [...(next.pacifiedAreas ?? []), next.partyArea];
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
          // Permanently indifferent to this party: treasure stays guarded (no pickup), but the
          // party may now leave by any valid exit. Record the area so re-entry skips the encounter.
          if (!next.pacifiedAreas?.includes(next.partyArea)) {
            next.pacifiedAreas = [...(next.pacifiedAreas ?? []), next.partyArea];
          }
          events.push({ type: "pacified" }); // tell the player they may now move on
          persistAndExplore(next); // park strangers + treasure back as guarded; return to explore
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
        return { state: next, events: [{ type: "deadEnd", dir: action.dir }] };
      }
      // Retreat succeeds: the strangers and any dropped treasure are LEFT BEHIND in the chamber we fled.
      const fled = res.state.areas[fromIdx]!;
      fled.contents = [
        ...fled.contents,
        ...res.state.strangers.map((id) => 100 + id),
        ...res.state.treasures.map((id) => 200 + id),
        ...(res.state.sleeping ?? []).map((id) => 400 + id),
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
      res.state.strangers = []; res.state.treasures = []; res.state.hazards = []; res.state.sleeping = []; res.state.lulled = [];
      res.state.fight = null;
      res.state.party.forEach((m) => { m.potionActive = false; });
      // The strangers we fled stay hostile to this party for the rest of the game (§Retreat).
      if (!res.state.hostileAreas?.includes(fromIdx)) {
        res.state.hostileAreas = [...(res.state.hostileAreas ?? []), fromIdx];
      }
      const events = resolveArea(res.state); // resolve the area we retreated into (fresh tunnel/chamber)
      return { state: res.state, events };
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
        case 5: { // Lotus Dust — encounter or fight, target a stranger (put to sleep)
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
  }
}
