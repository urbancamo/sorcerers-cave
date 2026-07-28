import { GS_PLAYING, GS_DEAD, type PartyMember } from "./state";
import type { GameEvent } from "./actions";
import { decodeArea } from "./decode";
import { SPECIAL_DEEP_POOL } from "./data/areaCards";
import { HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_DESERTION, HAZARD_QUARREL } from "./data/hazards";
import { DIR_UP, DIR_DOWN, targetCoord, unpackCoord } from "./coords";
import { advanceTurn, type MpGameState, type MpAction, type PartyState } from "./multi";

/**
 * The ZOMBIES option (M7, plan WS-6; spec I-15; rulebook §Zombies). When `variants.zombies` is on,
 * a wiped seat does not go terminal: it forfeits one turn, then its corpses rise as a spoiler
 * zombie party — "he cannot win the game, but he can try to keep any other player from winning".
 *
 * ENFORCEMENT MAP (solo `reduce` is frozen — every rule lands in the multi layer):
 *  - PRE-GATES (`zombieActionGate`, called by mpReduce before dispatch): no loot (takeTreasure /
 *    retakeDropped / openChest / useArtifact), no test/attack on strangers, no stepping onto or
 *    across a Deep Pool tile, and no secret stairs — ALL of them if the Sorcerer is in the party,
 *    NONE otherwise (the per-seat knownDoors gate, I-18, is overridden both ways).
 *  - POST-REPAIR (`zombieAfterAction`, called by mpReduce after a successful solo dispatch):
 *    Medusa / vipers / Ghouls fire INSIDE the composed reduce, so immunity is enforced by
 *    reverting their petrifications/deaths member-by-member against the pre-action snapshot and
 *    filtering their events from the returned set (documented enforcement point). Strangers a
 *    zombie entry uncovered are parked back onto the tile untested (strangers are indifferent to
 *    zombies and zombies will not attack), and any treasure that reached the working set goes
 *    back to the floor. Traps apply normally: a zombie party has no LIVING dwarf.
 *  - KIT HAZARDS (SC-EXT-33, extending the same POST-REPAIR seam — the design-Part-4 proposal,
 *    pending MSW's confirmation): Desertion and Quarrel are the kit's own "the party turns on
 *    itself" hazards, and the dead have no politics left to fall out over, so both are run-then-
 *    undo repaired the same way as Medusa/Ghouls above (Desertion's per-ALLY roll is already
 *    inert for a risen party — status is always 0, never 1, since a zombie party can never test a
 *    stranger to recruit one — so its repair only strips the announcement; Quarrel's top-two duel
 *    picks from ALL living members regardless of origin, so a 2+-member zombie party can genuinely
 *    lose a duelist without this repair, reverted by the same index-matched status restore). Crypt
 *    falls and Harpies' theft are NOT hazards immune to the dead: a Crypt fall is an unavoidable
 *    trap by design (no Dwarf check to bypass, same "no LIVING dwarf" logic as an ordinary Trap),
 *    and Harpies' theft targets *artifacts*, not "treasure" in the cannot-carry-or-use sense the
 *    pre-gate/treasure-strip enforce — both apply to a zombie party exactly as they would a living
 *    one, needing no gate or repair of their own. The kit's other six specials (Chasm, Bell Rope,
 *    Lair, Whirlpool, Gallery, Well) are ordinary CHAMBERS (`decodeArea(card).chamber === true`) —
 *    zombies enter them like any chamber, with no gate entry needed; a Whirlpool drag in
 *    particular needs no twin to the Deep-Pool special-case below, since (unlike Deep Pool) it is
 *    entered normally and its crossing-drag (SC-EXT-6) runs entirely inside solo `reduce`'s "move"
 *    case (reduce.ts:612-634) — the same solo-composed channel a Crypt/Trap fall uses — so it
 *    already applies to a zombie party by construction, with no MP/zombie-layer code of its own.
 *  - GAME SWEEP (`zombiePostSweep`, run by the mpReduce wrapper on EVERY result and by the Convex
 *    reaction-window expiry): auto-rise of freshly wiped living seats (MVP: no "Rise as the
 *    dead?" prompt — the dead simply rise, announced by a system line), annihilation of every
 *    zombie party the moment any seat's Sorcerer-kill lands ("If the Sorcerer is killed all
 *    zombies are annihilated and no more may be created"), and a belt-and-braces treasure strip
 *    (covers paths that hand a zombie loot outside a solo action, e.g. a PvP victor's floor
 *    reclaim).
 *  - PvP: zombies attack and are attacked by living parties normally (multi-fight.ts), but their
 *    casters lend NO magical power — "no magical power … only normal physical strength".
 *  - UNIONS: zombie-with-zombie only (gated in mpReduce's proposeUnion case); trade with a zombie
 *    party never opens.
 *
 * DOCUMENTED SIMPLIFICATIONS (each deliberate, with its rationale):
 *  - "Last-fallen creature + other bodies in the area": the engine keeps a wiped party's dead in
 *    its own party array with no per-corpse location, so ALL of the seat's corpses rise together
 *    at the wipe area. Stone members are not corpses and stay down; Dragons and Spectres leave no
 *    corpses (§Zombies) and never rise.
 *  - Corpse ABSORPTION (entering an area with dead creatures / the Sorcerer joining the dead) is
 *    NOT implemented: corpses are not modelled on tiles (a rival's dead stay in that rival's
 *    array), so the minimum viable zombie is the risen party wandering as a PvP spoiler.
 *  - A zombie party "killed" in PvP is terminal for good (no one-turn re-animation): tracking the
 *    "main body still in the area" condition would need a corpse model the engine doesn't have.
 *  - Borne items rest with the flesh and are LOST when it rises (carried items already spilled to
 *    the chamber at the wipe, I-12); risen members carry nothing, ever.
 *  - The one-turn forfeit is charged AT the rise (forfeitTurnsOwed = 1): strict rotation consumes
 *    it via advanceTurn's skip-and-decrement, concurrent play via the existing forfeit lockout —
 *    the same net timing as "forfeits one turn, then … is resurrected".
 *  - Scoring: a finally-terminal zombie seat records outcome wiped / score 0 (score.ts's
 *    wipe-zero rule fires on gs === GS_DEAD — no extra arithmetic needed).
 */

const C_SPECTRE = 9;
const C_DRAGON = 10;
const C_SORCERER = 11;

const living = (m: PartyMember): boolean => m.status === 0 || m.status === 1;

/** Is this seat a RISEN party under the zombies variant? (False whenever the variant is off.) */
export function isZombieParty(mp: MpGameState, seat: number): boolean {
  return mp.variants?.zombies === true && mp.parties[seat]?.zombie === true;
}

/** "If the Sorcerer is with them they have access to all secret doors; otherwise … none." */
const hasSorcerer = (p: PartyState): boolean => p.party.some((m) => living(m) && m.creatureId === C_SORCERER);

const reject = (reason: string): GameEvent[] => [{ type: "planRejected", reason }];

/**
 * Pre-dispatch gate for a zombie seat's solo action (rulebook §Zombies). Returns the rejection
 * events when the action is barred to the dead, or null to let it through to the composed reduce.
 */
export function zombieActionGate(mp: MpGameState, seat: number, action: MpAction): GameEvent[] | null {
  const p = mp.parties[seat]!;
  switch (action.type) {
    // "Zombies cannot carry or use treasure" — every acquisition or use path is barred; the only
    // way OUT of a pickup that slipped through is leaveTreasure (which stays legal).
    case "takeTreasure": case "retakeDropped": case "openChest": case "useArtifact":
      return reject("zombies cannot carry or use treasure");
    // "They will not attack strangers" (and strangers are indifferent to them — no test needed).
    case "test": case "attack":
      return reject("zombies will not attack strangers");
    case "move": {
      const here = mp.cave.areas[p.partyArea];
      if (!here) return null;
      const { level, x, y } = unpackCoord(here.coord);
      const dest = targetCoord(action.dir, level, x, y);
      // "They will not cross water": never step onto a Deep Pool tile; and from one (a fresh draw
      // can land the party at its doorway) only the retrace back the way it came is walkable —
      // every other exit would mean crossing the water.
      const destArea = mp.cave.areas.find((a) => a.coord === dest);
      if (destArea && decodeArea(destArea.card).special === SPECIAL_DEEP_POOL) {
        return reject("zombies will not cross water");
      }
      if (decodeArea(here.card).special === SPECIAL_DEEP_POOL &&
          mp.cave.areas[p.prev] && dest !== mp.cave.areas[p.prev]!.coord) {
        return reject("zombies will not cross water");
      }
      // Secret doors: all with the Sorcerer aboard, none without. A mirrored (unprinted) stair
      // end IS the secret door (I-18); printed stairs are ordinary and stay open to the dead.
      if ((action.dir === DIR_UP || action.dir === DIR_DOWN) && !hasSorcerer(p)) {
        const bit = action.dir === DIR_UP ? 32 : 64;
        if (((here.mirroredStairs ?? 0) & bit) !== 0) return reject("the dead find no secret doors");
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Post-dispatch repair for a zombie seat's completed solo action (see the module doc's
 * enforcement map). `before` is the seat's pre-action PartyState (mpReduce holds it); `settled`
 * reports that an encounter/pickup was forced back to explore, which ends the turn.
 */
export function zombieAfterAction(
  mp: MpGameState, seat: number, before: PartyState, events: GameEvent[],
): { state: MpGameState; events: GameEvent[]; settled: boolean } {
  let out = mp;
  let evs = events;
  let settled = false;
  let cloned = false;
  const ensure = (): void => { if (!cloned) { out = structuredClone(mp); cloned = true; } };

  // 1. Hazard immunity ("not affected by Medusa, vipers, or ghouls" — extended by SC-EXT-33 to
  //    Desertion and Quarrel, the kit's own party-turns-on-itself hazards: the dead have no
  //    politics to fall out over). Revert what they just did. Members are index-matched against
  //    the snapshot — a zombie party array is stable across one action (no allies to desert, no
  //    trades, appends only).
  const immuneFired = evs.some((e) =>
    e.type === "medusaGaze" || e.type === "viperPit" || e.type === "quarrel" ||
    (e.type === "hazardFired" && (
      e.hazard === HAZARD_MEDUSA || e.hazard === HAZARD_GHOULS ||
      e.hazard === HAZARD_DESERTION || e.hazard === HAZARD_QUARREL)));
  if (immuneFired) {
    ensure();
    const p = out.parties[seat]!;
    const restored: number[] = [];
    p.party.forEach((m, i) => {
      const was = before.party[i];
      if (was && living(was) && (m.status === 2 || m.status === 3)) {
        restored.push(m.creatureId);
        m.status = was.status;
        delete m.stoneArea;
      }
    });
    const restoredLeft = [...restored];
    evs = evs.filter((e) => {
      if (e.type === "medusaGaze" || e.type === "viperPit" || e.type === "petrifiedOut" || e.type === "quarrel") return false;
      if (e.type === "hazardFired" && (
        e.hazard === HAZARD_MEDUSA || e.hazard === HAZARD_GHOULS ||
        e.hazard === HAZARD_DESERTION || e.hazard === HAZARD_QUARREL)) return false;
      if (e.type === "combatRoll" && e.enemy === "Ghouls") return false;
      if (e.type === "memberDied") {
        const at = restoredLeft.indexOf(e.creatureId);
        if (at >= 0) { restoredLeft.splice(at, 1); return false; }
      }
      return true;
    });
    // A "wipe" those hazards caused is undone with its victims.
    if (p.gs === GS_DEAD && p.party.some(living)) {
      p.gs = GS_PLAYING; p.status = "exploring"; p.phase = "explore"; p.fight = null;
      evs = evs.filter((e) => e.type !== "gameOver");
    }
  }

  // 2. Strangers are indifferent to zombies and zombies will not attack: any encounter (or an
  //    on-sight fight) the entry produced dissolves — the working set parks back onto the tile
  //    (exactly as a retreat would leave it) and the party stands at rest.
  {
    const cur = out.parties[seat]!;
    if (cur.strangers.length > 0 || (cur.sleeping?.length ?? 0) > 0 || (cur.lulled?.length ?? 0) > 0 ||
        cur.phase === "encounter" || cur.phase === "fight") {
      ensure();
      const p = out.parties[seat]!;
      const tile = out.cave.areas[p.partyArea]!;
      tile.contents = [
        ...tile.contents,
        ...p.strangers.map((id) => 100 + id),
        ...(p.sleeping ?? []).map((id) => 400 + id),
        ...(p.lulled ?? []).map((id) => 100 + id),
      ];
      p.strangers = []; p.sleeping = []; p.lulled = []; p.hazards = [];
      p.fight = null; p.surpriseReady = false; p.indiffStreak = 0;
      if (p.phase === "encounter" || p.phase === "fight") { p.phase = "explore"; settled = true; }
    }
  }

  // 3. Treasure cannot stick to the dead: whatever the entry swept into the working set — or any
  //    path handed to a member — goes straight back onto the floor of the tile they stand on.
  {
    const cur = out.parties[seat]!;
    if (cur.treasures.length > 0 || cur.party.some((m) => m.treasure.length > 0)) {
      ensure();
      const p = out.parties[seat]!;
      const tile = out.cave.areas[p.partyArea]!;
      tile.contents = [...tile.contents, ...p.treasures.map((t) => 200 + t)];
      p.treasures = [];
      for (const m of p.party) {
        if (m.treasure.length) {
          tile.contents.push(...m.treasure.map((t) => 200 + t));
          m.treasure = [];
          m.borne = undefined;
        }
      }
      if (p.phase === "pickup") { p.phase = "explore"; settled = true; }
    }
  }

  return { state: out, events: evs, settled };
}

/**
 * Raise a freshly wiped seat as a zombie party (rulebook §Zombies). Pure; returns the input state
 * unchanged when the seat is ineligible — already risen, not a GS_DEAD wipe, no corpses (all
 * stone, or Dragons/Spectres only), or the Sorcerer has fallen ("no more may be created").
 */
export function riseAsZombies(mp: MpGameState, seat: number): MpGameState {
  const p = mp.parties[seat];
  if (mp.variants?.zombies !== true || !p || p.zombie === true) return mp;
  if (p.status !== "wiped" || p.gs !== GS_DEAD) return mp;
  if (mp.parties.some((q) => q.sorcererKilled)) return mp;
  const corpses = p.party.filter((m) => m.status === 3 && m.creatureId !== C_DRAGON && m.creatureId !== C_SPECTRE);
  if (corpses.length === 0) return mp;
  // Corpses rise clean: borne items are lost with the rising flesh; carried items spilled at the
  // wipe (I-12). Encounter memory (hostile/pacified areas, streaks) belonged to the living party.
  const members: PartyMember[] = corpses.map((m) => ({ creatureId: m.creatureId, status: 0, dragonKills: 0, treasure: [] }));
  const risen: PartyState = {
    ...p, zombie: true, status: "exploring", gs: GS_PLAYING, phase: "explore",
    party: members, strangers: [], treasures: [], hazards: [], sleeping: [], lulled: [],
    fight: null, fightDrops: undefined, surpriseReady: false, fellThroughTrap: false,
    indiffStreak: 0, pacifiedAreas: [], hostileAreas: [], fleeGrace: undefined,
    forfeitTurnsOwed: (p.forfeitTurnsOwed ?? 0) + 1, // "he forfeits one turn" — charged at the rise
  };
  return { ...mp, parties: mp.parties.map((q, i) => (i === seat ? risen : q)) };
}

/**
 * The game-level zombies sweep (run on every mpReduce result, and by the Convex reaction-window
 * expiry whose PvP auto-resolve bypasses mpReduce). In order: Sorcerer-death annihilation (which
 * also forecloses all future rises), auto-rise of freshly wiped living seats, and the
 * belt-and-braces treasure strip. Returns the seats that rose so the caller can narrate them.
 */
export function zombiePostSweep(mp: MpGameState): { state: MpGameState; risen: number[] } {
  if (mp.variants?.zombies !== true) return { state: mp, risen: [] };
  let out = mp;
  const risen: number[] = [];

  // "If the Sorcerer is killed all zombies are annihilated and no more may be created."
  if (out.parties.some((p) => p.sorcererKilled)) {
    const doomed = out.parties.filter((p) => p.zombie === true && p.status === "exploring").map((p) => p.seat);
    if (doomed.length > 0) {
      out = {
        ...out,
        parties: out.parties.map((p) => doomed.includes(p.seat)
          ? { ...p, status: "wiped" as const, gs: GS_DEAD, phase: "gameOver" as const, fight: null }
          : p),
      };
      // A live session involving an annihilated seat cannot go on — it ends where it stands.
      const s = out.session;
      if (s) {
        const participants =
          s.kind === "pvp" ? [...s.attacker, ...s.defender] :
          s.kind === "trade" ? [s.a, s.b] :
          [s.commander, ...s.invited, ...s.accepted];
        if (participants.some((x) => doomed.includes(x))) out = { ...out, session: null };
      }
      if (out.phase === "playing" && out.concurrent !== true &&
          out.parties[out.order[out.active]!]!.status !== "exploring") {
        out = advanceTurn(out); // never leave the turn cursor on an annihilated seat
      }
      if (out.phase === "playing" && !out.parties.some((p) => p.status === "exploring")) {
        out = { ...out, phase: "finished" };
      }
    }
    return { state: out, risen };
  }

  // Auto-rise on wipe (MVP: no prompt — announced by the caller's system line). A game already
  // finished stays finished: the last party's fall ends the game, zombies raise no curtain calls.
  if (out.phase === "playing") {
    for (const p of out.parties) {
      if (p.zombie === true || p.status !== "wiped") continue;
      const next = riseAsZombies(out, p.seat);
      if (next !== out) { out = next; risen.push(p.seat); }
    }
  }

  // Belt-and-braces: strip treasure any non-solo path handed a zombie (e.g. a PvP victor's
  // automatic floor reclaim) back onto the tile it stands on.
  const needStrip = out.parties.some((p) => p.zombie === true && p.status === "exploring" &&
    (p.treasures.length > 0 || p.party.some((m) => m.treasure.length > 0)));
  if (needStrip) {
    const c = structuredClone(out);
    for (const p of c.parties) {
      if (p.zombie !== true || p.status !== "exploring") continue;
      const tile = c.cave.areas[p.partyArea];
      if (!tile) continue;
      if (p.treasures.length > 0) {
        tile.contents.push(...p.treasures.map((t) => 200 + t));
        p.treasures = [];
      }
      for (const m of p.party) {
        if (m.treasure.length) {
          tile.contents.push(...m.treasure.map((t) => 200 + t));
          m.treasure = [];
          m.borne = undefined;
        }
      }
      if (p.phase === "pickup") p.phase = "explore";
    }
    out = c;
  }
  return { state: out, risen };
}
