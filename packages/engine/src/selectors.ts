import { decodeArea } from "./decode";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN, unpackCoord, packCoord } from "./coords";
import { GS_PLAYING, AF_DESTROYED, AF_BELL_SPENT, type GameState } from "./state";
import { SPECIAL_DEEP_POOL, SPECIAL_CHASM, SPECIAL_WELL, SPECIAL_BELL_ROPE } from "./data/areaCards";
import type { GameAction } from "./actions";
import { canCarry } from "./pickup";
import { usesArtifactsAs, holyWaterTargets, hasLivingHuman } from "./effects";

const C_GIANT = 12; // only a Giant may lift treasure out of a Deep Pool (§Deep Pool)

function living(state: GameState) {
  return state.party.map((m, idx) => ({ m, idx })).filter(({ m }) => m.status === 0 || m.status === 1);
}

/** `useArtifact` actions available in the given phase (so the UI can show "use item" controls). */
function artifactActions(state: GameState): GameAction[] {
  const has = (artifact: number, ok: (creatureId: number) => boolean) =>
    living(state).some(({ m }) => m.treasure.includes(artifact) && ok(m.creatureId));
  const actions: GameAction[] = [];

  if (state.phase === "fight") {
    if (has(8, () => true)) { // Strength Potion -> each boostable living member
      living(state).forEach(({ m, idx }) => {
        if ([0, 1, 5, 6].includes(m.creatureId)) actions.push({ type: "useArtifact", artifact: 8, target: idx });
      });
    }
  }
  // Extension kit (SC-EXT-22, design US-19): the Elixir is usable ANY time the party is not
  // mid-fight — offered in every phase `artifactActions` is called from except "fight" (medusa's
  // pause offers no artifactActions at all, unlike Lotus Dust, so it's excluded there too, same as
  // every other artifact here). "Any creature" may drink it — one action per living member.
  if (state.phase !== "fight" && has(15, () => true)) {
    living(state).forEach(({ idx }) => actions.push({ type: "useArtifact", artifact: 15, target: idx }));
  }
  // Extension kit (SC-EXT-24, design US-20): Holy Water's target picker — `holyWaterTargets`
  // (effects.ts) is the SAME function `reduce.ts`'s case 16 validates a chosen target against, so
  // the offered list and the accepted list can never drift. It already self-gates by `state.phase`
  // (explore/pickup for revive/wake/destroyMedusa; encounter/fight for destroy/weaken), so no
  // additional phase check is needed here.
  if (has(16, () => true)) {
    holyWaterTargets(state).forEach((t) => actions.push({ type: "useArtifact", artifact: 16, target: t.target }));
  }
  // Extension kit (SC-EXT-25, design US-21/Resolved-10): the Scroll needs a living human present
  // and strangers to burn, in encounter or fight — no target/picker (any human reads it).
  if ((state.phase === "encounter" || state.phase === "fight") && has(19, () => true) &&
      state.strangers.length > 0 && hasLivingHuman(state)) {
    actions.push({ type: "useArtifact", artifact: 19 });
  }
  if (state.phase === "fight" || state.phase === "encounter") {
    if (has(5, () => true)) { // Lotus Dust -> each stranger (but not a Spectre — no effect, per card)
      for (let i = 0; i < state.strangers.length; i++) {
        if (state.strangers[i] !== 9) actions.push({ type: "useArtifact", artifact: 5, target: i });
      }
    }
    // The Charmed Flute lulls Dragons passively (on chamber entry, while held) — see resolveArea —
    // so there is no explicit lull action to offer here.
  }
  // Reviving the fallen is offered at rest (explore) AND while looting (pickup), so a party can
  // restore members straight after a fight that dropped treasure.
  const atRestOrLooting = state.phase === "explore" || state.phase === "pickup";
  // Extension kit (SC-EXT-17): each class-keyed eligibility check below routes the base class id
  // through `usesArtifactsAs` so a kit creature "using artifacts as" that class (design §1.3) is
  // offered the same actions — Apprentice as Wizard(8), Scholar/Witch as Priest(4), Thief as
  // Man(5). Strength Potion's target list above names specific base creatures, not a class of
  // USERS, so it is deliberately excluded from this treatment.
  if (atRestOrLooting && has(6, (id) => id === 6 || id === 1 || usesArtifactsAs(id, 4) || usesArtifactsAs(id, 8))) { // Healing Balm -> Woman/W-Hero/Priest/Wizard, per dead member
    state.party.forEach((m, idx) => { if (m.status === 3) actions.push({ type: "useArtifact", artifact: 6, target: idx }); });
  }
  if (atRestOrLooting && has(9, (id) => usesArtifactsAs(id, 8))) { // Magic Staff (Wizard) -> each stoned member left in THIS area
    state.party.forEach((m, idx) => { if (m.status === 2 && m.stoneArea === state.partyArea) actions.push({ type: "useArtifact", artifact: 9, target: idx }); });
  }
  if (state.phase === "explore") {
    if (has(4, (id) => usesArtifactsAs(id, 4) || usesArtifactsAs(id, 8))) { // Magic Carpet -> teleport in each available direction
      for (const dir of [DIR_N, DIR_E, DIR_S, DIR_W, DIR_DOWN]) actions.push({ type: "useArtifact", artifact: 4, dir });
      if (state.level > 1) actions.push({ type: "useArtifact", artifact: 4, dir: DIR_UP });
    }
    if (has(12, (id) => id === 0 || id === 1 || usesArtifactsAs(id, 4) || usesArtifactsAs(id, 5) || id === 6 || usesArtifactsAs(id, 8))) { // Charmed Flute -> Hero/W-Hero/Priest/Man/Woman/Wizard
      const cur = state.areas[state.partyArea]!;
      const { level, x, y } = unpackCoord(cur.coord);
      const dec = decodeArea(cur.card);
      const below = state.areas.find((a) => a.coord === packCoord(level + 1, x, y));
      if (!dec.stairDown && below && decodeArea(below.card).stairUp) actions.push({ type: "useArtifact", artifact: 12, dir: DIR_DOWN });
      const above = state.areas.find((a) => a.coord === packCoord(level - 1, x, y));
      if (!dec.stairUp && above && decodeArea(above.card).stairDown) actions.push({ type: "useArtifact", artifact: 12, dir: DIR_UP });
    }
  }
  return actions;
}

/** Extension kit (SC-EXT-8): one `pullBellRope` action per living party member, offered while the
 *  party stands on an unspent Bell Rope tile (design US-03 — the "member picker"). */
function bellRopeActions(state: GameState): GameAction[] {
  const dec = decodeArea(state.areas[state.partyArea]!.card);
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
export function legalActions(state: GameState): GameAction[] {
  if (state.gs !== GS_PLAYING) return [];

  if (state.phase === "medusa") {
    // Medusa looms and the party holds Lotus Dust: throw it at her before her gaze, or proceed.
    // With Holy Water ALSO held, destroy her outright pre-gaze (design answer 2026-07-27,
    // SC-EXT-24) — a third plain-button option, target implicit like the Lotus throw.
    const acts: GameAction[] = [{ type: "useArtifact", artifact: 5 }];
    if (state.party.some((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(16))) {
      acts.push({ type: "useArtifact", artifact: 16 });
    }
    acts.push({ type: "proceed" });
    return acts;
  }
  if (state.phase === "encounter") {
    // Withdraw retreats to the area the party came from — but not back up a trap it fell through, nor
    // into an area an earthquake has since collapsed (§Earthquake): both leave no way back.
    const prevGone = ((state.areas[state.prev]?.flags ?? 0) & AF_DESTROYED) !== 0;
    // A Well draw or a Bell Rope 4-6 roll blocks withdraw for the turn it fired on, same as a trap
    // fall (SC-EXT-9, design US-03/US-07).
    const noWithdrawTurn = state.noWithdrawTurn === state.turn;
    const canWithdraw = !state.fellThroughTrap && !prevGone && !noWithdrawTurn;
    const actions: GameAction[] = canWithdraw ? [{ type: "withdraw" }, { type: "attack" }] : [{ type: "attack" }];
    if ((state.indiffStreak ?? 0) < 3) actions.push({ type: "test" });
    const special = decodeArea(state.areas[state.partyArea]!.card).special;
    // The Chasm offers an escape hatch even mid-encounter — descending abandons the strangers here,
    // no test/fight required (design US-02).
    if (special === SPECIAL_CHASM) actions.push({ type: "descendChasm" });
    // The Well and the Bell Rope are likewise offered mid-encounter — drawing/pulling doesn't require
    // resolving the current strangers first (design US-03/US-07 — same "no test/fight required" logic
    // as the Chasm's escape hatch above).
    if (special === SPECIAL_WELL && state.smallIdx < state.smallPack.length) actions.push({ type: "drawFromWell" });
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
    // and never back up a trap (§Retreat). A party may flee by ANY of the tile's doorways/stairs.
    if (!state.fellThroughTrap && state.fight && state.fight.round > 1 && !state.fight.retreatBlocked) {
      const dec = decodeArea(state.areas[state.partyArea]!.card);
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
    const giantOnly = decodeArea(state.areas[state.partyArea]!.card).special === SPECIAL_DEEP_POOL;
    for (let ti = 0; ti < state.treasures.length; ti++) {
      for (let mi = 0; mi < state.party.length; mi++) {
        const m = state.party[mi]!;
        // Only offer the take to living/ally members who have the spare capacity to carry it
        // (heavy treasure counts against carry weight; artifacts are weightless so always fit).
        if ((m.status === 0 || m.status === 1) && canCarry(m, state.treasures[ti]!) && (!giantOnly || m.creatureId === C_GIANT)) {
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
    actions.push(...artifactActions(state)); // e.g. Healing Balm to revive the fallen before moving on
    return actions;
  }
  if (state.phase !== "explore") return [];

  const dec = decodeArea(state.areas[state.partyArea]!.card);
  const actions: GameAction[] = [];
  if (dec.n) actions.push({ type: "move", dir: DIR_N });
  if (dec.e) actions.push({ type: "move", dir: DIR_E });
  if (dec.s) actions.push({ type: "move", dir: DIR_S });
  if (dec.w) actions.push({ type: "move", dir: DIR_W });
  if (dec.stairDown) actions.push({ type: "move", dir: DIR_DOWN });
  if (dec.stairUp) {
    if (state.level === 1) actions.push({ type: "exitCave" });
    else actions.push({ type: "move", dir: DIR_UP });
  }
  if (state.party.some((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(14))) actions.push({ type: "openChest" });
  // The Chasm is reusable terrain: always offered while resting on it, not a one-shot (design US-02).
  if (dec.special === SPECIAL_CHASM) actions.push({ type: "descendChasm" });
  // The Well is likewise reusable terrain, repeatable every turn — no spent flag (design US-07,
  // Resolved interpretation 4) — gated only on the small pack having a card left to draw.
  if (dec.special === SPECIAL_WELL && state.smallIdx < state.smallPack.length) actions.push({ type: "drawFromWell" });
  // The Bell Rope, unlike the Well, is spent forever once pulled (AF_BELL_SPENT, design US-03).
  actions.push(...bellRopeActions(state));
  // The Crypt (SC-EXT-13): offered only at rest ("the start of any turn", design US-08 — no
  // Chasm/Well/Bell-style mid-encounter latitude) while standing on the area `cryptCoord` names;
  // gone the instant `enterCrypt` resolves it, whatever the roll (no second entry).
  if (state.cryptCoord !== undefined && state.areas[state.partyArea]!.coord === state.cryptCoord) {
    actions.push({ type: "enterCrypt" });
  }
  // A permanently-indifferent chamber is traversed in the explore phase, but the party may still choose
  // to attack its guards (to win the treasure they guard) — offer it while they're parked on the tile.
  if (state.pacifiedAreas?.includes(state.partyArea) &&
      state.areas[state.partyArea]!.contents.some((c) => c >= 100 && c < 200)) {
    actions.push({ type: "attack" });
  }
  actions.push(...artifactActions(state));
  return actions; // quitting is via the HUD Quit button, not an in-menu action
}
