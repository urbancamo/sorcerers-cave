import { GS_PLAYING, GS_QUIT, GS_ESCAPED, GS_DEAD, PARTY_CAP, type GameState, type PartyMember } from "./state";
import { tryMove } from "./map";
import { decodeArea } from "./decode";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT } from "./data/areaCards";
import { viperCrossing, deepPoolCrossing } from "./special";
import { enterChamber } from "./chamber";
import { applyHazards } from "./hazards";
import { takeTreasure } from "./pickup";
import { unpackCoord, packCoord, targetCoord, DIR_UP, DIR_DOWN } from "./coords";
import type { GameAction, GameEvent } from "./actions";
import { reactionRoll } from "./reaction";
import { resolveRound, frontStrength } from "./combat";
import { wardOffSpectres, annihilateWithEye, eyeActive, reconcileUnicorns, hasWoman } from "./effects";
import { rollDie } from "./rng";
import { CREATURES } from "./data/creatures";

/** First living member who may bear+use `artifact` now (some artifacts need a specific creature). */
function findBearer(state: GameState, artifact: number): number {
  return state.party.findIndex((m: PartyMember) => {
    if (!(m.status === 0 || m.status === 1) || !m.treasure.includes(artifact)) return false;
    if (artifact === 6) return m.creatureId === 6 || m.creatureId === 4 || m.creatureId === 8; // Balm: Woman/Priest/Wizard
    if (artifact === 9) return m.creatureId === 8; // Staff reanimation: Wizard
    if (artifact === 4) return m.creatureId === 4 || m.creatureId === 8; // Magic Carpet: Priest/Wizard
    if (artifact === 12) return m.creatureId === 0 || m.creatureId === 4 || m.creatureId === 5 || m.creatureId === 6 || m.creatureId === 8; // Charmed Flute: Hero/Priest/Man/Woman/Wizard
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
  ];
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
  return [{ type: "fightStarted", surprise }];
}

/** Resolve the area just entered: special markers, then chamber draw + hazards + phase (spec §4/§7). */
function resolveArea(state: GameState): GameEvent[] {
  const events: GameEvent[] = [{ type: "moved", area: state.partyArea, level: state.level }];

  for (;;) {
    const dec = decodeArea(state.areas[state.partyArea]!.card);
    const here = state.areas[state.partyArea]!;
    if ((here.flags & 32) !== 0) { // an aroused Lost-Ruby statue strikes the strongest member (§16)
      if (eyeActive(state)) {
        events.push({ type: "statuePowerless" }); // the Eye renders the statue powerless to attack
      } else {
        let strongest: typeof state.party[number] | undefined;
        for (const m of state.party) {
          if ((m.status === 0 || m.status === 1) && (!strongest || frontStrength(m) > frontStrength(strongest))) strongest = m;
        }
        if (strongest) {
          const pr = rollDie(state.seed); state.seed = pr.seed;
          const sr = rollDie(state.seed); state.seed = sr.seed;
          if (8 + sr.value > frontStrength(strongest) + pr.value) {
            strongest.status = 3;
            events.push({ type: "memberDied", creatureId: strongest.creatureId });
          }
          events.push({ type: "statueAttacked" });
          if (!state.party.some((m) => m.status === 0 || m.status === 1)) {
            state.gs = GS_DEAD;
            state.phase = "gameOver";
            events.push({ type: "gameOver", gs: GS_DEAD });
            return events;
          }
        }
      }
    }
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
    events.push(...enterChamber(state));
    events.push(...annihilateWithEye(state)); // the Eye destroys Spectres on sight (§ Eye of God)
    events.push(...wardOffSpectres(state)); // the Talisman drives off Spectres on level >= 4 (§ Talisman)
    const { events: hzEvents, fell } = applyHazards(state);
    events.push(...hzEvents);
    if (fell) {
      relocateDown(state);
      events.push({ type: "moved", area: state.partyArea, level: state.level });
      continue;
    }
    if (state.strangers.length > 0) {
      state.phase = "encounter";
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
    const card = state.largeIdx < state.largePack.length ? state.largePack[state.largeIdx++]! | 32 : 31 | 32;
    state.areas.push({ card, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 });
    idx = state.areas.length - 1;
  }
  state.prev2 = state.prev;
  state.prev = state.partyArea;
  state.partyArea = idx;
  state.level = level + 1;
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
      const next = structuredClone(state);
      next.areas[next.partyArea]!.contents = [
        ...next.areas[next.partyArea]!.contents,
        ...next.strangers.map((id) => 100 + id),
        ...next.treasures.map((id) => 200 + id),
      ];
      next.strangers = []; next.treasures = []; next.hazards = [];
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
          fighter.status = 3;
          next.areas[next.partyArea]!.flags |= 32; // statue aroused
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

    case "test": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      const area = state.areas[state.partyArea]!;
      if (area.indiffCount >= 3) return { state, events: [{ type: "blocked" }] }; // permanently indifferent
      const next = structuredClone(state);
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
          next.areas[next.partyArea]!.indiffCount = 3; // cannot be approached further; it guards any treasure
          persistAndExplore(next); // the party moves on, leaving the Unicorn (and guarded treasure) behind
        } else {
          next.strangers = [];
          if (next.treasures.length > 0) next.phase = "pickup";
          else persistAndExplore(next);
        }
      } else if (roll.outcome === "indifferent") {
        next.areas[next.partyArea]!.indiffCount += 1;
        // stays in the encounter phase
      } else {
        events.push(...startFight(next, -1)); // strangers gain surprise
      }
      return { state: next, events };
    }

    case "attack": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      return { state: next, events: startFight(next, 1) }; // party gains surprise
    }

    case "focusTarget": {
      if (state.phase !== "fight") return { state, events: [{ type: "blocked" }] };
      if (action.idx < 0 || action.idx >= state.strangers.length) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.fight!.focus = action.idx;
      return { state: next, events: [] };
    }

    case "fightOn": {
      if (state.phase !== "fight") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const events = resolveRound(next);
      events.push(...reconcileUnicorns(next)); // a Unicorn departs if the last Woman fell this round (§ Unicorn)
      const partyAlive = next.party.some((m) => m.status === 0 || m.status === 1);
      if (!partyAlive) {
        next.gs = GS_DEAD;
        next.phase = "gameOver";
        next.fight = null;
        next.party.forEach((m) => { m.potionActive = false; });
        events.push({ type: "gameOver", gs: GS_DEAD });
      } else if (next.strangers.length === 0) {
        next.fight = null;
        next.party.forEach((m) => { m.potionActive = false; });
        events.push({ type: "fightWon" });
        if (next.treasures.length > 0) next.phase = "pickup";
        else persistAndExplore(next);
      }
      // else: still fighting; resolveRound already advanced the round
      return { state: next, events };
    }

    case "retreat": {
      if (state.phase !== "fight") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.areas[next.partyArea]!.contents = [
        ...next.areas[next.partyArea]!.contents,
        ...next.strangers.map((id) => 100 + id),
        ...next.treasures.map((id) => 200 + id),
      ];
      next.strangers = []; next.treasures = []; next.hazards = [];
      next.fight = null;
      next.party.forEach((m) => { m.potionActive = false; });
      next.partyArea = next.prev;
      next.level = unpackCoord(next.areas[next.partyArea]!.coord).level;
      next.phase = "explore";
      return { state: next, events: [{ type: "moved", area: next.partyArea, level: next.level }] };
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
        case 6: { // Healing Balm — explore only, target a dead member
          if (next.phase !== "explore" || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          const dm = next.party[action.target];
          if (!dm || dm.status !== 3) return { state, events: [{ type: "blocked" }] };
          dm.status = 0;
          consume();
          return ok;
        }
        case 9: { // Magic Staff reanimation — explore only, target a stoned member; NOT consumed
          if (next.phase !== "explore" || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          const sm = next.party[action.target];
          if (!sm || sm.status !== 2) return { state, events: [{ type: "blocked" }] };
          sm.status = 0;
          return ok;
        }
        case 5: { // Lotus Dust — encounter or fight, target a stranger (put to sleep)
          if ((next.phase !== "encounter" && next.phase !== "fight") || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          if (action.target < 0 || action.target >= next.strangers.length) return { state, events: [{ type: "blocked" }] };
          const sid = next.strangers[action.target]!;
          next.areas[next.partyArea]!.contents.push(100 + sid);
          next.strangers.splice(action.target, 1);
          consume();
          if (next.strangers.length === 0) { // no one left to face
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
          // Lull Dragons (encounter/fight) — not consumed.
          // Deferred: Vipers are a special-area crossing (viperCrossing in special.ts), not creatures
          // in `strangers`, so flute-lulling of Vipers is not implemented.
          if (next.phase !== "encounter" && next.phase !== "fight") return { state, events: [{ type: "blocked" }] };
          if (!next.strangers.includes(10)) return { state, events: [{ type: "blocked" }] };
          let count = 0;
          for (let i = next.strangers.length - 1; i >= 0; i--) {
            if (next.strangers[i] === 10) { next.areas[next.partyArea]!.contents.push(110); next.strangers.splice(i, 1); count += 1; }
          }
          const events: GameEvent[] = [{ type: "artifactUsed", artifact: 12 }, { type: "dragonsLulled", count }];
          if (next.strangers.length === 0) { // nothing left to face
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
  }
}
