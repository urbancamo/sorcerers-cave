import { potionEligible } from "./capabilities";
import { decodeArea, decodeOpen, type DecodedArea } from "./decode";
import { examinableAreas, isGuardCode, sibylWaiting } from "./sibyl";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN, unpackCoord, packCoord, targetCoord } from "./coords";
import { nothingToDraw, existingAreaConnects } from "./map";
import { GS_PLAYING, AF_DESTROYED, AF_BELL_SPENT, AF_WELL_SPENT, type GameState } from "./state";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_CHASM, SPECIAL_WELL, SPECIAL_BELL_ROPE } from "./data/areaCards";
import type { GameAction } from "./actions";
import { canCarry } from "./pickup";
import { canUseArtifact, holyWaterTargets, hasLivingHuman, fluteLulls, healingBalmEligible, isHumanOrPriestClass } from "./effects";
import { getSubLocation, chasmMoveAllowed, oppositeDir, RING_ADJACENCY_SPECIALS, ISLAND_JUMP_SPECIALS, type SubLocation } from "./subLocation";
import { giantCanRecover, sunkKey } from "./special";
import { teleportDestinations } from "./sorcerer";

const C_THIEF = 19; // R-33: only the Thief steals from indifferent strangers (Thief-unlocked pickup)
const C_GIANT = 12; // only a Giant may lift treasure out of a Deep Pool (§Deep Pool)

/**
 * Ordinary lateral/stair `move` actions open from the given (decoded) tile — shared by the
 * explore phase's own list and an indifferent-tested encounter's "leave by any doorway" option
 * (rules §Encountering Strangers: "in its next turn the party may test them again, or attack
 * them, or leave the chamber by any doorway without picking up any treasure found there" — ONE
 * indifferent result is enough, not the three the old code required; see the encounter branch
 * below, SC-4-18a). Excludes the level-1 stair-up cave exit deliberately: leaving the Cave is a
 * much larger, separately-confirmed action than "move to the next tile," and the rules text was
 * written with ordinary dungeon movement in mind, not the game-ending case.
 *
 * Bug fix 2026-08-04 (Gap C): the encounter branch gates this on the one-shot `indiffLeaveOpen`
 * window, NOT `indiffStreak >= 1` — the leave option is only offered for the single turn right
 * after a qualifying test, and is forfeited by a dead-end leave attempt or by testing again
 * ("finds itself delayed by a dead end ... must in the same turn either test the strangers again
 * or attack them"). It is not a standing condition of the streak.
 */
function lateralMoves(state: GameState, dec: DecodedArea, sub: SubLocation): GameAction[] {
  const actions: GameAction[] = [];
  const blockedDir = RING_ADJACENCY_SPECIALS.has(dec.special) && sub.at === "doorway" && sub.dir !== undefined
    ? oppositeDir(sub.dir) : undefined;
  // Once every tile has been placed an unexplored exit is no longer viable (ruling R-15, MSW 2026-11-06; SC-6.1-6): a move toward empty
  // space has nothing to draw, so it is not offered. A move onto a tile already on the map is offered only if it would connect: a revealed
  // dead end (no matching doorway on the far side, a collapsed tile, a stair onto the Whirlpool) could only waste the turn, so it is hidden
  // (Peter's report 2026-11-06, MSW: hide it entirely; SC-6.1-12).
  const here = state.areas[state.partyArea];
  const placed = (dir: number) => {
    if (!here) return true;
    const { level, x, y } = unpackCoord(here.coord);
    const target = targetCoord(dir, level, x, y);
    const dest = state.areas.find((a) => a.coord === target);
    if (dest) return existingAreaConnects(dest, dir);
    return state.largePack.length === 0 || !nothingToDraw(state, dir); // (no pack at all = a bare test fixture, not a used-up one)
  };
  const ok = (dir: number) => chasmMoveAllowed(state, dir) && placed(dir);
  if (dec.n && blockedDir !== DIR_N && ok(DIR_N)) actions.push({ type: "move", dir: DIR_N });
  if (dec.e && blockedDir !== DIR_E && ok(DIR_E)) actions.push({ type: "move", dir: DIR_E });
  if (dec.s && blockedDir !== DIR_S && ok(DIR_S)) actions.push({ type: "move", dir: DIR_S });
  if (dec.w && blockedDir !== DIR_W && ok(DIR_W)) actions.push({ type: "move", dir: DIR_W });
  if (dec.stairDown && ok(DIR_DOWN)) actions.push({ type: "move", dir: DIR_DOWN });
  // An ordinary climb is an "any doorway" leave like any other; the level-1 stair-up cave exit is
  // deliberately excluded (see doc comment above) — that one stays explore-only.
  if (dec.stairUp && state.level > 1 && ok(DIR_UP)) actions.push({ type: "move", dir: DIR_UP });
  return actions;
}

function living(state: GameState) {
  return state.party.map((m, idx) => ({ m, idx })).filter(({ m }) => m.status === 0 || m.status === 1);
}

/** `useArtifact` actions available in the given phase (so the UI can show "use item" controls). */
function artifactActions(state: GameState): GameAction[] {
  const has = (artifact: number, ok: (creatureId: number) => boolean) =>
    living(state).some(({ m }) => m.treasure.includes(artifact) && ok(m.creatureId));
  const actions: GameAction[] = [];

  if (state.phase === "fight") {
    if (has(8, potionEligible)) { // Strength Potion -> each boostable living member
      living(state).forEach(({ m, idx }) => {
        if (potionEligible(m.creatureId)) actions.push({ type: "useArtifact", artifact: 8, target: idx });
      });
    }
  }
  // Extension kit (SC-EXT-22, design US-19): the Elixir is usable ANY time the party is not
  // mid-fight — offered in every phase `artifactActions` is called from except "fight" (medusa's
  // pause offers no artifactActions at all, unlike Lotus Dust, so it's excluded there too, same as
  // every other artifact here). A human or magic user must carry it ("U" in Peter's Appendices 20261110) and gives it to ANY living member
  // of the party ("T"): one action per living member as the recipient.
  if (state.phase !== "fight" && has(15, (id) => canUseArtifact(id, 15))) {
    living(state).forEach(({ idx }) => actions.push({ type: "useArtifact", artifact: 15, target: idx }));
  }
  // Extension kit (SC-EXT-24, design US-20): Holy Water's target picker — `holyWaterTargets`
  // (effects.ts) is the SAME function `reduce.ts`'s case 16 validates a chosen target against, so
  // the offered list and the accepted list can never drift. It already self-gates by `state.phase`
  // (explore/pickup for revive/wake/destroyMedusa; encounter/fight for destroy/weaken), so no
  // additional phase check is needed here.
  // Bug fix 2026-08-18 (inhuman-artifacts): Holy Water is Human/Priest only — a Dwarf (or other
  // inhuman) holder gets no useArtifact actions offered at all, matching findBearer's own gate.
  if (has(16, (id) => canUseArtifact(id, 16))) {
    holyWaterTargets(state).forEach((t) => actions.push({ type: "useArtifact", artifact: 16, target: t.target }));
  }
  // Extension kit (SC-EXT-25, design US-21/Resolved-10): the Scroll needs a living human present
  // and strangers to burn, in encounter or fight — no target/picker (any human reads it).
  if ((state.phase === "encounter" || state.phase === "fight") && !state.variants?.combatRevision && has(19, (id) => canUseArtifact(id, 19)) &&
      state.strangers.length > 0 && hasLivingHuman(state)) {
    actions.push({ type: "useArtifact", artifact: 19 });
  }
  if (state.phase === "fight" || state.phase === "encounter") {
    // Bug fix 2026-08-18 (inhuman-artifacts): Lotus Dust is Human/Priest only (a Dwarf holder was
    // able to sleep Medusa with it in playtesting).
    if (has(5, (id) => canUseArtifact(id, 5))) { // Lotus Dust -> each stranger (but not a Spectre — no effect, per card)
      for (let i = 0; i < state.strangers.length; i++) {
        if (state.strangers[i] !== 9) actions.push({ type: "useArtifact", artifact: 5, target: i });
      }
    }
  }
  // Reviving the fallen is offered at rest (explore) AND while looting (pickup), so a party can
  // restore members straight after a fight that dropped treasure.
  const atRestOrLooting = state.phase === "explore" || state.phase === "pickup";
  // Extension kit (SC-EXT-17): each class-keyed eligibility check below routes the base class id
  // through `usesArtifactsAs` so a kit creature "using artifacts as" that class (design §1.3) is
  // offered the same actions — Apprentice as Wizard(8), Scholar/Witch as Priest(4), Thief as
  // Man(5). Strength Potion's target list above names specific base creatures, not a class of
  // USERS, so it is deliberately excluded from this treatment.
  // House rule (SC-11-15a): only offered for a member who fell THIS turn, in THIS area — the
  // same "before the party's next move" window `healingBalmEligible` enforces in the reducer.
  if (atRestOrLooting && has(6, (id) => canUseArtifact(id, 6))) { // Healing Balm -> Woman/W-Hero/Priest/Wizard, per dead member
    state.party.forEach((_, idx) => { if (healingBalmEligible(state, idx)) actions.push({ type: "useArtifact", artifact: 6, target: idx }); });
  }
  if (atRestOrLooting && has(9, (id) => canUseArtifact(id, 9))) { // Magic Staff (Wizard) -> each stoned member left in THIS area
    state.party.forEach((m, idx) => { if (m.status === 2 && m.stoneArea === state.partyArea) actions.push({ type: "useArtifact", artifact: 9, target: idx }); });
  }
  // The Charmed Flute, played at an encounter, lulls its Dragons (the player's choice; it is never automatic).
  if (state.phase === "encounter" && state.strangers.includes(10) && has(12, (id) => canUseArtifact(id, 12))) actions.push({ type: "useArtifact", artifact: 12 });
  if (state.phase === "explore") {
    // The turncoat Apprentice (revised combat): the party may linger where the Sorcerer was slain, and so meet her (any other action
    // that leaves the area parts company with her instead).
    if (state.apprenticeWatch === state.partyArea && !state.fight && state.party.some((m) => m.status === 1 && m.creatureId === 14)) actions.push({ type: "stay" });
    if (has(4, (id) => canUseArtifact(id, 4))) { // Magic Carpet -> teleport in each available direction
      for (const dir of [DIR_N, DIR_E, DIR_S, DIR_W, DIR_DOWN]) actions.push({ type: "useArtifact", artifact: 4, dir });
      if (state.level > 1) actions.push({ type: "useArtifact", artifact: 4, dir: DIR_UP });
    }
    if (has(12, (id) => canUseArtifact(id, 12))) { // Charmed Flute -> Hero/W-Hero/Priest/Man/Woman/Wizard
      const cur = state.areas[state.partyArea]!;
      const { level, x, y } = unpackCoord(cur.coord);
      const dec = decodeOpen(cur);
      // At a Viper Pit the Flute is played to lull the Vipers (once; they sleep until the party leaves).
      if (dec.special === SPECIAL_VIPER_PIT && state.vipersLulledArea !== state.partyArea) actions.push({ type: "useArtifact", artifact: 12 });
      const below = state.areas.find((a) => a.coord === packCoord(level + 1, x, y));
      if (!dec.stairDown && below && decodeOpen(below).stairUp) actions.push({ type: "useArtifact", artifact: 12, dir: DIR_DOWN });
      const above = state.areas.find((a) => a.coord === packCoord(level - 1, x, y));
      if (!dec.stairUp && above && decodeOpen(above).stairDown) actions.push({ type: "useArtifact", artifact: 12, dir: DIR_UP });
    }
  }
  return actions;
}

/** Extension kit (SC-EXT-7): the Well is drawable on an unspent Well tile while the small pack has a card. */
function wellDrawable(state: GameState, special: number): boolean {
  return special === SPECIAL_WELL && state.smallIdx < state.smallPack.length
    && (state.areas[state.partyArea]!.flags & AF_WELL_SPENT) === 0;
}

/** Extension kit (SC-EXT-8): one `pullBellRope` action per living party member, offered while the
 *  party stands on an unspent Bell Rope tile (design US-03 — the "member picker"). */
function bellRopeActions(state: GameState): GameAction[] {
  const dec = decodeOpen(state.areas[state.partyArea]!);
  if (dec.special !== SPECIAL_BELL_ROPE) return [];
  if ((state.areas[state.partyArea]!.flags & AF_BELL_SPENT) !== 0) return [];
  const actions: GameAction[] = [];
  state.party.forEach((m, mi) => { if (m.status === 0 || m.status === 1) actions.push({ type: "pullBellRope", mi }); });
  return actions;
}

/**
 * The actions the UI may offer in the current state (the interactive contract).
 * The UI renders controls from this list; reduce validates against the same rules.
 */
/** A sealed crypt is parked in the area the party stands in (SC-EXT-13). */
const cryptHere = (state: GameState): boolean => state.cryptCoord !== undefined && state.areas[state.partyArea]!.coord === state.cryptCoord;

/** The explore-phase tile actions that an open treasure pickup must not hide (an uncarryable treasure reopens the pickup on every visit). */
export const AT_REST_FROM_PICKUP: ReadonlySet<string> = new Set([
  "enterCrypt", "descendChasm", "drawFromWell", "pullBellRope", "jumpToIsland", "openChest", "examineArea", "exitCave", "stay",
]);

export function legalActions(state: GameState): GameAction[] {
  if (state.gs !== GS_PLAYING) return [];

  if (state.phase === "medusa") {
    // Medusa looms and the party holds Lotus Dust: throw it at her before her gaze, or proceed.
    // With Holy Water ALSO held, destroy her outright pre-gaze (design answer 2026-07-27,
    // SC-EXT-24) — a third plain-button option, target implicit like the Lotus throw.
    // Entering this phase already implies an eligible Lotus Dust holder (medusaLooms, reduce.ts) —
    // but the Holy Water pre-gaze option (bug fix 2026-08-18) needs its OWN eligibility check: the
    // two artifacts can be held by different members, and a Dwarf holding Holy Water alongside an
    // eligible Lotus Dust holder must not see the Holy Water button.
    const acts: GameAction[] = [{ type: "useArtifact", artifact: 5 }];
    if (state.party.some((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(16) && isHumanOrPriestClass(m.creatureId))) {
      acts.push({ type: "useArtifact", artifact: 16 });
    }
    acts.push({ type: "proceed" });
    return acts;
  }
  if (state.phase === "leader") {
    // R-07/R-10: no original member is left — pick which living ally leads (and counts as original from then on).
    return state.party.flatMap((m, idx): GameAction[] => (m.status === 1 ? [{ type: "chooseLeader", idx }] : []));
  }
  if (state.phase === "quarrel") {
    // R-14: the tie between equals — every way of choosing the missing combatants from the tied candidates.
    const pause = state.quarrelPause;
    if (!pause) return [];
    const picks: number[][] = [[]];
    for (let n = 0; n < pause.slots; n++) for (const p of picks.filter((q) => q.length === n)) for (const c of pause.candidates) if (!p.length || c > p[p.length - 1]!) picks.push([...p, c]);
    return picks.filter((p) => p.length === pause.slots).map((members): GameAction => ({ type: "chooseQuarrel", members }));
  }
  if (state.phase === "trap") {
    // The Dwarf's choice at a trap (`variants.trapRules`): be guided past it, or fall through it on purpose.
    return [{ type: "avoidTrap" }, { type: "fallThroughTrap" }];
  }
  if (state.phase === "sorcerer") {
    // The Sorcerer lies defeated (§The Sorcerer): slay him, or spare him for a teleport to any discovered area.
    return [{ type: "slaySorcerer" }, ...teleportDestinations(state).map((area): GameAction => ({ type: "spareSorcerer", area }))];
  }
  if (state.phase === "encounter") {
    // Withdraw retreats to the area the party came from — but not back up a trap it fell through, nor
    // into an area an earthquake has since collapsed (§Earthquake): both leave no way back.
    const prevGone = ((state.areas[state.prev]?.flags ?? 0) & AF_DESTROYED) !== 0;
    // A Well draw or a Bell Rope 4-6 roll blocks withdraw for the turn it fired on, same as a trap
    // fall (SC-EXT-9, design US-03/US-07).
    const noWithdrawTurn = state.noWithdrawTurn === state.turn;
    const canWithdraw = !state.fellThroughTrap && !prevGone && !noWithdrawTurn;
    // A lone, unmet Sibyl is no one to attack or surprise (SC-SIB-4): she is only tested, or left.
    const sibylOnly = sibylWaiting(state);
    const actions: GameAction[] = [];
    if (canWithdraw) actions.push({ type: "withdraw" });
    if (!sibylOnly) actions.push({ type: "attack" });
    if (sibylOnly || (state.indiffStreak ?? 0) < 3) actions.push({ type: "test" });
    const dec = decodeOpen(state.areas[state.partyArea]!);
    // Rules §Encountering Strangers: the party may also simply leave by any doorway, forfeiting the
    // treasure — but only during the one-shot window a qualifying indifferent test just opened
    // (Gap C, bug fix 2026-08-04; see lateralMoves' own doc comment). NOT a standing condition of
    // `indiffStreak >= 1`: a dead-end leave attempt or testing again closes it, and a streak of 0
    // (hostile-only or fresh, untested strangers) never opens it — no walking past strangers you
    // haven't even approached.
    if (state.indiffLeaveOpen === true) actions.push(...lateralMoves(state, dec, getSubLocation(state)));
    const special = dec.special;
    // The Chasm offers an escape hatch even mid-encounter — descending abandons the strangers here,
    // no test/fight required (design US-02).
    if (special === SPECIAL_CHASM) actions.push({ type: "descendChasm" });
    // The Well and the Bell Rope are likewise offered mid-encounter — drawing/pulling doesn't require
    // resolving the current strangers first (design US-03/US-07 — same "no test/fight required" logic
    // as the Chasm's escape hatch above).
    if (wellDrawable(state, special)) actions.push({ type: "drawFromWell" });
    actions.push(...bellRopeActions(state));
    actions.push(...artifactActions(state));
    return actions; // quitting is via the HUD Quit button, not an in-menu action
  }
  if (state.phase === "fight") {
    // A pending casualty must be decided before anything else: pick which of the losing pair falls.
    const pending = state.fight?.casualtyQueue?.[0];
    if (pending) return pending.map((idx) => ({ type: "chooseCasualty", idx }));
    const actions: GameAction[] = [];
    // The round itself is resolved from the player's pairing via the `resolveRound` action (built by the
    // fight UI), not from a menu item. Retreat is allowed only after at least one round has been fought,
    // and never back up a trap (§Retreat), nor from the Ghouls (a hazard, not a stranger party: no retreat). A party may flee by ANY of the tile's doorways/stairs.
    if (!state.fellThroughTrap && !state.fight?.ghouls && state.fight && state.fight.round > 1 && !state.fight.retreatBlocked) {
      const dec = decodeOpen(state.areas[state.partyArea]!);
      if (dec.n) actions.push({ type: "retreat", dir: DIR_N });
      if (dec.e) actions.push({ type: "retreat", dir: DIR_E });
      if (dec.s) actions.push({ type: "retreat", dir: DIR_S });
      if (dec.w) actions.push({ type: "retreat", dir: DIR_W });
      if (dec.stairDown) actions.push({ type: "retreat", dir: DIR_DOWN });
      if (dec.stairUp && state.level > 1) actions.push({ type: "retreat", dir: DIR_UP }); // not the level-1 cave exit
    }
    actions.push(...artifactActions(state));
    return actions; // quitting is via the HUD Quit button, not an in-menu action
  }
  if (state.phase === "pickup") {
    const actions: GameAction[] = [];
    // Recovering treasure from a Deep Pool is a Giant-only pickup (§Deep Pool) — no other creature
    // can lift it out of the water; ordinary chamber pickups are open to any member.
    const giantOnly = decodeOpen(state.areas[state.partyArea]!).special === SPECIAL_DEEP_POOL;
    for (let ti = 0; ti < state.treasures.length; ti++) {
      for (let mi = 0; mi < state.party.length; mi++) {
        const m = state.party[mi]!;
        // Only offer the take to living/ally members who have the spare capacity to carry it
        // (heavy treasure counts against carry weight; artifacts are weightless so always fit).
        if ((m.status === 0 || m.status === 1) && canCarry(m, state.treasures[ti]!) && (!giantOnly || m.creatureId === C_GIANT) && (!state.thiefPickup || m.creatureId === C_THIEF)) {
          actions.push({ type: "takeTreasure", ti, mi });
        }
      }
    }
    // After a win, offer to retake the heavy treasure dropped to fight, in its prior distribution —
    // when at least one dropped item is still on the floor and its dropper can carry it back.
    const canRetake = (state.fightDrops ?? []).some(({ mi, tid }) => {
      const m = state.party[mi];
      return !!m && (m.status === 0 || m.status === 1) && state.treasures.includes(tid) && canCarry(m, tid);
    });
    if (canRetake) actions.push({ type: "retakeDropped" });
    actions.push({ type: "leaveTreasure" });
    // An open pickup is a quiet pre-step: the at-rest tile actions (crypt, chasm, well, bell rope, chest, island, exit, the Sibyl's
    // look, the Apprentice) stay on offer, and taking one leaves the floor treasure behind, as walking on does (SC-EXT-13).
    actions.push(...legalActions({ ...state, phase: "explore", treasures: [] }).filter((a) => AT_REST_FROM_PICKUP.has(a.type)));
    actions.push(...artifactActions(state)); // e.g. Healing Balm to revive the fallen before moving on
    return actions;
  }
  if (state.phase !== "explore") return [];

  const dec = decodeOpen(state.areas[state.partyArea]!);
  const actions: GameAction[] = [];
  // Precise Locations (§10.5, §8.1): a Viper-Pit/Whirlpool ledge only reaches its two ADJACENT
  // doorways — the one directly opposite the party's current doorway is unreachable without first
  // jumping to the island (Viper Pit only — Whirlpool has none). Retracing the entry doorway is
  // unaffected (it's never the opposite of itself); an island-sourced crossing is unrestricted.
  const sub = getSubLocation(state);
  actions.push(...lateralMoves(state, dec, sub));
  // The level-1 stair-up cave exit is the one lateralMoves deliberately excludes (see its doc
  // comment) — explore phase is the only place it's ever legal.
  if (dec.stairUp && state.level === 1) actions.push({ type: "exitCave" });
  // Precise Locations (§10.5, §8.2): jump from a doorway onto the island — Viper Pit/Deep Pool only
  // (Peter's house rule), never from the island itself (an ordinary `move` already crosses out
  // unrestricted from there) and never once already jumped this visit.
  if (ISLAND_JUMP_SPECIALS.has(dec.special) && sub.at === "doorway") actions.push({ type: "jumpToIsland" });
  if (state.party.some((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(14))) actions.push({ type: "openChest" });
  // The Chasm is reusable terrain: always offered while resting on it, not a one-shot (design US-02).
  if (dec.special === SPECIAL_CHASM) actions.push({ type: "descendChasm" });
  // The Well, like the Bell Rope, is spent forever once drawn from (AF_WELL_SPENT / AF_BELL_SPENT) and
  // needs a card left in the small pack.
  if (wellDrawable(state, dec.special)) actions.push({ type: "drawFromWell" });
  actions.push(...bellRopeActions(state));
  // The Crypt (SC-EXT-13): offered only at rest ("the start of any turn", design US-08 — no
  // Chasm/Well/Bell-style mid-encounter latitude) while standing on the area `cryptCoord` names;
  // gone the instant `enterCrypt` resolves it, whatever the roll (no second entry).
  if (cryptHere(state)) actions.push({ type: "enterCrypt" });
  // A permanently-indifferent chamber is traversed in the explore phase, but the party may still choose
  // to attack its guards (to win the treasure they guard) — offer it while they're parked on the tile.
  if (state.pacifiedAreas?.includes(state.partyArea) &&
      state.areas[state.partyArea]!.contents.some(isGuardCode)) {
    actions.push({ type: "attack" });
  }
  // Deep Pool/Viper Pit stationary reclaim (bug fix 2026-08-02): offer a live pickup for treasure
  // already sitting at the party's current area — the auto-dropped pile, or the sunk bucket at the
  // EXACT current sub-location (§10.5) — while they're simply parked there, not just on (re-)entry.
  // Read-only mirror of `tryReclaimSunk`'s own eligibility check (reduce.ts); never mutates state.
  if (dec.special === SPECIAL_DEEP_POOL || dec.special === SPECIAL_VIPER_PIT) {
    const area = state.areas[state.partyArea]!;
    const key = sunkKey(sub);
    const sunkItems = key !== undefined ? area.sunkTreasure?.find((b) => b.at === key)?.items : undefined;
    const reclaimable = area.dropped?.length ? area.dropped : sunkItems;
    const eligible = dec.special === SPECIAL_DEEP_POOL ? giantCanRecover(state, reclaimable ?? []) : fluteLulls(state);
    if (reclaimable?.length && eligible) actions.push({ type: "reclaimTreasure" });
  }
  // The Sibyl's free look (SC-SIB-8): the top of the large pack, and every face-down tile on the map.
  if (state.hasSibyl === true) {
    if (state.largeIdx < state.largePack.length) actions.push({ type: "examineArea" });
    for (const area of examinableAreas(state)) actions.push({ type: "examineArea", area });
  }
  actions.push(...artifactActions(state));
  return actions; // quitting is via the HUD Quit button, not an in-menu action
}
