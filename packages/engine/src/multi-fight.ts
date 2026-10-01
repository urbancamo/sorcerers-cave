import { AF_DESTROYED, GS_DEAD, type GameState, type PartyMember, type PlacedArea } from "./state";
import type { GameEvent } from "./actions";
import { frontStrength, casterMP, isCaster, partyRollBonus } from "./combat";
import { shieldedMP } from "./combatPlan";
import { eyeForsakenByDeath, ringInvincible, shieldWardActive } from "./effects";
import { sweepFallen } from "./loot";
import { rollDie } from "./rng";
import { decodeArea } from "./decode";
import { ALL_CREATURES } from "./data/creatures";
import { ALL_TREASURES } from "./data/treasures";
import { canCarry } from "./pickup";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN, targetCoord, unpackCoord } from "./coords";
import { areaInteractionMask, partyView, pvpSurprise, type MpGameState, type PartyState } from "./multi";
import type { PvpSession, ReactionWindow } from "./multi-session";

/**
 * PvP fight rounds (spec I-9/I-10/I-11; plan WS-3, milestone M4). Pure functions over
 * MpGameState + PvpSession — the pairing/round orchestration is NEW (never composes a solo fight),
 * but all combat arithmetic is read-only reuse of the solo functions (frontStrength, casterMP,
 * partyRollBonus, ringInvincible, eyeForsakenByDeath, sweepFallen).
 *
 * Member addressing: "seat:idx" strings, as in PvpSession's layout fields. A command is a seat
 * array (length 1 until unions land in M5) — every function already iterates the arrays.
 *
 * Round shape (§"Fights between Exploring Parties" steps 1–3): each ROUND runs the same fixed
 * layout order defender-line → attacker-engage → defender-casters, then resolves. The round OWNER
 * (activeSide) alternates — "the first round is fought during the attacker's turn, the second in
 * the defender's" — but the layout ORDER never changes; "the player whose turn it is has the same
 * options" is modelled as both sides re-submitting layouts 1-2-3 each round.
 *
 * WIRING CONTRACTS (this module edits no existing file):
 * - `retreatPvp` returns `fleeGrace: { seat, turns: 2 }` in its RESULT rather than persisting it on
 *   PartyState (which this milestone may not edit). The session dies on retreat, so the (later)
 *   Convex wiring must persist the grace token itself (spec I-11's two-turn clean-flight rule).
 * - The session object stored in `mp.session` is a `PvpFightSession` (a structural subtype of
 *   PvpSession) carrying `drops`: the §388 heavy-treasure pre-drop memory `{seat, id, tid}[]` used
 *   by the both-agree stop to hand each side back its OWN dropped items.
 * - Roll-your-own-dice (M6, spec §0 principle 2): every die here goes through ONE `rollFor(side)`
 *   indirection, which rolls from that side's command lead's `PartyState.diceSeed` substream —
 *   the shared `cave.seed` is never touched by an inter-party round. Parties without a diceSeed
 *   (pre-M6 states, hand-built fixtures) fall back to `cave.seed` exactly as before M6.
 */

export const PVP_WINDOW_MS = 45_000;

/** §388 pre-drop memory: which member (by "seat:idx" id) dropped which heavy treasure at declaration. */
export interface PvpDrop { seat: number; id: string; tid: number }

/** The live PvP session as this module stores it — PvpSession plus the drop memory. */
export interface PvpFightSession extends PvpSession { drops: PvpDrop[] }

export interface PvpResult { state: MpGameState; events: GameEvent[] }

export type PvpEngagement = { attackers: string[]; defenders: string[] };
export type PvpBacker = { caster: string; at: number };

// --- id & side helpers --------------------------------------------------------------------------

const mkId = (seat: number, idx: number): string => `${seat}:${idx}`;

function parseId(id: string): { seat: number; idx: number } {
  const colon = id.indexOf(":");
  return { seat: Number(id.slice(0, colon)), idx: Number(id.slice(colon + 1)) };
}

function memberAt(mp: MpGameState, id: string): PartyMember | undefined {
  const { seat, idx } = parseId(id);
  return mp.parties[seat]?.party[idx];
}

const alive = (m?: PartyMember): boolean => !!m && (m.status === 0 || m.status === 1);

/** Living members of a command, as "seat:idx" ids (seat order, then party order — stable). */
function livingIds(mp: MpGameState, seats: number[]): string[] {
  const ids: string[] = [];
  for (const seat of seats) {
    const p = mp.parties[seat];
    if (!p) continue;
    p.party.forEach((m, idx) => { if (alive(m)) ids.push(mkId(seat, idx)); });
  }
  return ids;
}

function sideOf(s: PvpSession, seat: number): "attacker" | "defender" | null {
  if (s.attacker.includes(seat)) return "attacker";
  if (s.defender.includes(seat)) return "defender";
  return null;
}

function pvpOf(mp: MpGameState): PvpFightSession | null {
  return mp.session && mp.session.kind === "pvp" ? (mp.session as PvpFightSession) : null;
}

/** The COMMAND a seat fights in (M5): its union's seats, commander FIRST (windows/layouts land on
 *  index 0 — the commander speaks for the union), or just the seat itself. Kept local to avoid a
 *  runtime import cycle with multi-union.ts. */
function commandOf(mp: MpGameState, seat: number): number[] {
  const u = mp.unions?.find((x) => !x.dissolved && x.members.includes(seat));
  return u ? [u.commander, ...u.members.filter((m) => m !== u.commander)] : [seat];
}

const blocked = (mp: MpGameState): PvpResult => ({ state: mp, events: [{ type: "blocked" }] });
const rejected = (mp: MpGameState, reason: string): PvpResult => ({ state: mp, events: [{ type: "planRejected", reason }] });

/** A member's hand-to-hand strength through its OWN seat's composed view (Sword/potion/Eye per party). */
function strengthOf(mp: MpGameState, id: string): number {
  return frontStrength(memberAt(mp, id)!, partyView(mp, parseId(id).seat));
}

/** A background caster's magical power through its own seat's view (Staff bonus, Eye nullification).
 *  Zombie commands (M7, §Zombies "no magical power … only normal physical strength") lend none. */
function backerMP(mp: MpGameState, id: string): number {
  const seat = parseId(id).seat;
  if (mp.variants?.zombies === true && mp.parties[seat]?.zombie === true) return 0;
  return casterMP(memberAt(mp, id)!, partyView(mp, seat));
}

// --- the Magic Shield's PvP pairing ward (extension kit, SC-EXT-35, design US-23 MP note) ---------
//
// The solo Shield (SC-EXT-27) is PAIRING-scoped: `combatPlan.ts`'s `matchShielded` asks whether THIS
// match's own front line holds a live, eligible bearer, and `strangerMP` then turns aside the magic
// of the foes slotted directly against it — never another match's foes, and never a background
// caster folded in from elsewhere (`enemyBackers`, §395), which are not literally "paired" against
// anyone. The PvP layer's engagement IS that pairing, so the same two helpers reappear here in the
// same shape, one engagement at a time, and share `shieldedMP` verbatim with the solo path.

/** Does this group of ENGAGED fighters include a live, eligible Magic Shield bearer? Eligibility
 *  (Man / Woman / Hero / W-Hero), liveness and the Eye's nullification are all read through the
 *  bearer's OWN seat view, exactly as `shieldWardActive` reads them in solo. */
function pairShielded(mp: MpGameState, ids: readonly string[]): boolean {
  return ids.some((id) => shieldWardActive(partyView(mp, parseId(id).seat), memberAt(mp, id)!));
}

/** One engaged fighter's contribution to its side's strength, with the enemy Shield's ward applied
 *  when `warded`: its magic is turned aside (the Apprentice's own resistance instead takes only the
 *  −2 `shieldedMP` gives it — the Sorcerer shares that branch but can never stand in a PvP line, see
 *  the test). PHYSICAL strength is untouched, so an Elixir's `fsBonus`, a Sword/Axe bonus, dragon
 *  kills and a Strength Potion all survive the ward exactly as they do in solo. */
function wardedStrength(mp: MpGameState, id: string, warded: boolean): number {
  const m = memberAt(mp, id)!;
  const view = partyView(mp, parseId(id).seat);
  const base = frontStrength(m, view);
  if (!warded) return base;
  const power = casterMP(m, view);
  return base - (power - shieldedMP(m.creatureId, power));
}

// The two creatures whose own resistance downgrades the ward from nullify to −2 (design US-23) —
// the same pair `shieldedMP` branches on. Declared locally (hazards.ts's own C_WOLF/C_LION pattern)
// so this module reads the mode without reaching into combatPlan's private constants.
const C_SORCERER = 11, C_APPRENTICE = 14;

/** One `shieldWarded` per warded fighter the ward ACTUALLY bit (base mp > 0) — the solo notice
 *  contract verbatim (SC-EXT-27): never fired merely because a Shield is in play. `mode` keys off
 *  the CREATURE, not the resulting number, so an already-weakened Apprentice still reads "weaken". */
function wardNotices(mp: MpGameState, ids: readonly string[], warded: boolean): GameEvent[] {
  if (!warded) return [];
  const out: GameEvent[] = [];
  for (const id of ids) {
    const m = memberAt(mp, id)!;
    if (casterMP(m, partyView(mp, parseId(id).seat)) === 0) continue;
    const resists = m.creatureId === C_SORCERER || m.creatureId === C_APPRENTICE;
    out.push({ type: "shieldWarded", creatureId: m.creatureId, mode: resists ? "weaken" : "nullify" });
  }
  return out;
}

/** Pull every parked 200+tid item off the tile into `party`'s working treasure set (a pickup). */
function reclaimContents(area: PlacedArea, party: PartyState): number {
  const ids: number[] = [];
  for (const c of area.contents) if (c >= 200 && c < 300) ids.push(c - 200);
  if (ids.length) {
    party.treasures.push(...ids);
    area.contents = area.contents.filter((c) => c < 200 || c >= 300);
    if (party.phase === "explore") party.phase = "pickup";
  }
  return ids.length;
}

// --- declare (I-9) ------------------------------------------------------------------------------

/**
 * Declare a PvP attack (§I-9). Legal only where the area mask allows it, both parties exploring &
 * at rest, co-located, and no other session live. §388 heavy-drop happens HERE for BOTH commands:
 * every living member drops its heavy treasure onto the tile (200+tid), "left on the area card
 * until the issue is decided" — artefacts are kept. The drops are remembered on the session so a
 * both-agree stop can hand each side back its own.
 */
export function declarePvp(mp: MpGameState, attackerSeat: number, defenderSeat: number, now: number, windowMs: number): PvpResult {
  if (mp.phase !== "playing" || mp.session) return blocked(mp);
  if (attackerSeat === defenderSeat) return blocked(mp);
  // Union commands (M5): a command is the seat's whole union (commander first). Only the commander
  // may declare for a union (subordinates' creatures are on loan in his array — they have no force
  // of their own); attacking any member of a rival union engages that union entire; and a union
  // cannot attack itself.
  const attCmd = commandOf(mp, attackerSeat);
  const defCmd = commandOf(mp, defenderSeat);
  if (attCmd[0] !== attackerSeat) return blocked(mp);
  if (attCmd.some((s) => defCmd.includes(s))) return blocked(mp);
  if ([...attCmd, ...defCmd].some((s) => !mp.parties[s] || mp.parties[s]!.status !== "exploring")) return blocked(mp);
  // Concurrent-mode pursuit lockout (M6, I-11 degraded gracefully): with no consecutive turns to
  // grant, the two-turn flee grace instead shields the fleeing command from declareAttack until
  // the grace clears — consumed/cancelled by mpReduce on the same clean/dirty flight rules.
  // Strict mode keeps the original consecutive-turn tempo and needs no gate here.
  if (mp.concurrent === true && defCmd.some((s) => (mp.parties[s]?.fleeGrace ?? 0) > 0)) return blocked(mp);
  const att = mp.parties[attCmd[0]!]!, def = mp.parties[defCmd[0]!]!;
  if (att.phase !== "explore" || def.phase !== "explore") return blocked(mp);
  if (att.partyArea !== def.partyArea) return blocked(mp);
  const area = att.partyArea;
  if (!areaInteractionMask(mp, area).pvpLegal) return blocked(mp);

  const next = structuredClone(mp);
  const events: GameEvent[] = [];
  const tile = next.cave.areas[area]!;
  const drops: PvpDrop[] = [];
  for (const seat of [...attCmd, ...defCmd]) {
    let count = 0;
    next.parties[seat]!.party.forEach((m, idx) => {
      if (!alive(m)) return;
      // `ALL_TREASURES` (base + kit, SC-EXT-2) — a kit heavy treasure (Crypt/Gems 21, Idol 18) would
      // otherwise crash this lookup against the base-only `TREASURES` table.
      const heavy = m.treasure.filter((t) => ALL_TREASURES[t]!.kind === "heavy");
      if (!heavy.length) return;
      tile.contents.push(...heavy.map((t) => 200 + t));
      m.treasure = m.treasure.filter((t) => ALL_TREASURES[t]!.kind !== "heavy");
      for (const tid of heavy) drops.push({ seat, id: mkId(seat, idx), tid });
      count += heavy.length;
    });
    if (count) events.push({ type: "heavyDownForFight", count });
  }

  const session: PvpFightSession = {
    kind: "pvp", area,
    attacker: attCmd, defender: defCmd,
    round: 1, activeSide: "attacker",
    surprise: pvpSurprise(att, def),
    stage: "defenderLine",
    defenderLine: [], engagements: [], attackerBackers: [], defenderBackers: [],
    window: { seat: defCmd[0]!, deadline: now + windowMs, kind: "pvpLayout" },
    stopProposedBy: null,
    drops,
  };
  next.session = session;
  events.push({ type: "fightStarted", surprise: session.surprise });
  return { state: next, events };
}

// --- the three layout steps (I-10, rulebook steps 1–3) --------------------------------------------

/**
 * Step 1 — the defender "lays out all his fighting creatures in a line of battle". Every living
 * non-caster must stand in the line; a Priest/Wizard may be OMITTED (deployed behind, direction
 * unspecified) only if the defender command has MORE living members than the attacker command.
 */
export function setDefenderLine(mp: MpGameState, seat: number, line: string[], now: number, windowMs: number): PvpResult {
  const s = pvpOf(mp);
  // Only the command's LEAD seat (a union's commander) lays out — "the commander has complete
  // control" (§Union). For a solo command the lead is the seat itself, as before.
  if (!s || s.stage !== "defenderLine" || s.defender[0] !== seat) return blocked(mp);
  const defLiving = livingIds(mp, s.defender);
  const attCount = livingIds(mp, s.attacker).length;
  const inLine = new Set(line);
  if (inLine.size !== line.length) return rejected(mp, "memberReused");
  for (const id of line) if (!defLiving.includes(id)) return rejected(mp, "badIndex");
  if (line.length === 0 && defLiving.length > 0) return rejected(mp, "emptyLine");
  const advantage = defLiving.length > attCount;
  for (const id of defLiving) {
    if (inLine.has(id)) continue;
    if (!isCaster(memberAt(mp, id)!)) return rejected(mp, "nonCasterMustStandInLine");
    if (!advantage) return rejected(mp, "casterBehindNeedsAdvantage");
  }

  const next = structuredClone(mp);
  const ns = pvpOf(next)!;
  ns.defenderLine = [...line];
  ns.engagements = []; ns.attackerBackers = []; ns.defenderBackers = [];
  ns.stage = "attackerEngage";
  ns.window = { seat: ns.attacker[0]!, deadline: now + windowMs, kind: "pvpLayout" };
  ns.stopProposedBy = null; // laying out a fresh round implicitly declines any stop offer
  return { state: next, events: [] };
}

/**
 * Step 2 — the attacker engages "every creature in the other's front line if he can (sending one
 * against two if necessary)". Engagements are 1–2 vs 1–2, never 2-vs-2, no reuse on either side.
 * Casters may back an engagement (direction SPECIFIED) only with the numerical advantage — else all
 * the attacker's members fight. Greedy feasibility: a line member may go unengaged only when every
 * attacker fighter is already committed.
 */
export function setAttackerEngage(
  mp: MpGameState, seat: number, engagements: PvpEngagement[], attackerBackers: PvpBacker[],
  now: number, windowMs: number,
): PvpResult {
  const s = pvpOf(mp);
  if (!s || s.stage !== "attackerEngage" || s.attacker[0] !== seat) return blocked(mp); // lead seat only
  const attLiving = livingIds(mp, s.attacker);
  const defLiving = livingIds(mp, s.defender);

  const backerSet = new Set<string>();
  for (const b of attackerBackers) {
    if (backerSet.has(b.caster)) return rejected(mp, "memberReused");
    backerSet.add(b.caster);
    if (!attLiving.includes(b.caster)) return rejected(mp, "badIndex");
    if (!isCaster(memberAt(mp, b.caster)!)) return rejected(mp, "backerNotCaster");
    if (!Number.isInteger(b.at) || b.at < 0 || b.at >= engagements.length) return rejected(mp, "badIndex");
  }
  if (attackerBackers.length > 0 && attLiving.length <= defLiving.length) return rejected(mp, "backerNeedsAdvantage");

  const usedAtt = new Set<string>(), usedDef = new Set<string>();
  for (const e of engagements) {
    const atts = e.attackers ?? [], defs = e.defenders ?? [];
    if (atts.length < 1 || atts.length > 2 || defs.length < 1 || defs.length > 2) return rejected(mp, "groupTooBig");
    if (atts.length === 2 && defs.length === 2) return rejected(mp, "twoVsTwo");
    for (const id of atts) {
      if (!attLiving.includes(id) || backerSet.has(id)) return rejected(mp, "badIndex");
      if (usedAtt.has(id)) return rejected(mp, "memberReused");
      usedAtt.add(id);
    }
    for (const id of defs) {
      if (!s.defenderLine.includes(id)) return rejected(mp, "badIndex");
      if (usedDef.has(id)) return rejected(mp, "memberReused");
      usedDef.add(id);
    }
  }
  const fighters = attLiving.filter((id) => !backerSet.has(id));
  const unengagedLine = s.defenderLine.some((id) => !usedDef.has(id));
  if (unengagedLine && fighters.some((id) => !usedAtt.has(id))) return rejected(mp, "mustEngageAll");

  // Union fairness (M5, §Union: "the principle of strongest fights strongest must apply"): a
  // union's commander may not point a weak partner creature at the strongest foe while his own
  // strong one takes a soft target. Across any two engagements, the one facing the stronger enemy
  // spearhead must field an own-side spearhead at least as strong. Solo commands are unrestricted
  // (a lone player may gamble with his own creatures as he pleases).
  if (s.attacker.length > 1) {
    const maxStr = (ids: string[]): number => Math.max(0, ...ids.map((id) => strengthOf(mp, id)));
    for (const a of engagements) {
      for (const b of engagements) {
        if (maxStr(a.defenders) > maxStr(b.defenders) && maxStr(a.attackers) < maxStr(b.attackers)) {
          return rejected(mp, "strongestFightsStrongest");
        }
      }
    }
  }

  const next = structuredClone(mp);
  const ns = pvpOf(next)!;
  ns.engagements = engagements.map((e) => ({ attackers: [...e.attackers], defenders: [...e.defenders] }));
  ns.attackerBackers = attackerBackers.map((b) => ({ caster: b.caster, at: b.at }));
  ns.stage = "defenderCasters";
  ns.window = { seat: ns.defender[0]!, deadline: now + windowMs, kind: "pvpCasters" };
  return { state: next, events: [] };
}

/**
 * Step 3 — the defender "assigns the magical power of any priests or wizards he has in the
 * background" (those omitted from the line) to engagement indices. Then the round is ready to roll.
 */
export function setDefenderCasters(mp: MpGameState, seat: number, defenderBackers: PvpBacker[], _now: number, _windowMs: number): PvpResult {
  const s = pvpOf(mp);
  if (!s || s.stage !== "defenderCasters" || s.defender[0] !== seat) return blocked(mp); // lead seat only
  const defLiving = livingIds(mp, s.defender);
  const seen = new Set<string>();
  for (const b of defenderBackers) {
    if (seen.has(b.caster)) return rejected(mp, "memberReused");
    seen.add(b.caster);
    if (!defLiving.includes(b.caster) || s.defenderLine.includes(b.caster)) return rejected(mp, "badIndex");
    if (!isCaster(memberAt(mp, b.caster)!)) return rejected(mp, "backerNotCaster");
    if (!Number.isInteger(b.at) || b.at < 0 || b.at >= s.engagements.length) return rejected(mp, "badIndex");
  }
  const next = structuredClone(mp);
  const ns = pvpOf(next)!;
  ns.defenderBackers = defenderBackers.map((b) => ({ caster: b.caster, at: b.at }));
  ns.stage = "resolved";
  ns.window = null;
  return { state: next, events: [] };
}

// --- resolution ----------------------------------------------------------------------------------

/**
 * Fight every engagement of the laid-out round. Per side: Σ frontStrength(fighters) + Σ casterMP
 * (backers assigned here) + own d6 + Ring/curse roll bonus from that side's OWN party effects
 * + surprise (+1 attacker, round 1 only). Higher total slays the STRONGEST of the losing group
 * (ties: nobody); Ring-invincible members can't be chosen. Then: fallen members' carried items
 * spill to the tile; a side with nobody left standing is WIPED (winner reclaims the floor as a
 * pickup); otherwise the round ends — ownership flips, and the new round's layout starts with the
 * defender's line again.
 */
export function resolveRoundPvp(mp: MpGameState, now: number, windowMs: number = PVP_WINDOW_MS): PvpResult {
  const s0 = pvpOf(mp);
  if (!s0 || s0.stage !== "resolved") return blocked(mp);
  const next = structuredClone(mp);
  const s = pvpOf(next)!;
  const events: GameEvent[] = [];

  // Composed per-seat views. Object spread shares the party/area ARRAY references with `next`, so
  // member mutations and contents pushes land in the real state; scalar fields (curses) need an
  // explicit write-back below.
  const views = new Map<number, GameState>();
  const viewFor = (seat: number): GameState => {
    let v = views.get(seat);
    if (!v) { v = partyView(next, seat); views.set(seat, v); }
    return v;
  };
  const viewOfId = (id: string) => viewFor(parseId(id).seat);
  const memberOf = (id: string) => memberAt(next, id)!;

  // M6 roll-your-own-dice (spec §0 principle 2): each side rolls from its OWN command lead's
  // diceSeed substream — attacker rolls consume the attacker lead's, defender rolls the
  // defender's — so an inter-party round never perturbs the shared cave stream (deck order and
  // solo-composed rolls are unaffected; mpReduce's determinism test pins this). States whose
  // parties carry no diceSeed (pre-M6 games mid-flight, hand-built fixtures) fall back to the
  // shared cave.seed exactly as before, keeping their pinned roll streams intact.
  const rollFor = (side: "attacker" | "defender"): number => {
    const lead = (side === "attacker" ? s.attacker : s.defender)[0]!;
    const p = next.parties[lead]!;
    if (p.diceSeed === undefined) {
      const r = rollDie(next.cave.seed);
      next.cave.seed = r.seed;
      return r.value;
    }
    const r = rollDie(p.diceSeed);
    p.diceSeed = r.seed;
    return r.value;
  };

  // Ring +1 / curse −1 per side, from that side's own party effects (summed across a command's
  // seats — one seat per command until unions land). Fixed for the whole round (§The Ring: the
  // bonus holds "even if the bearer is slain in that round").
  let attBonus = 0; for (const seat of s.attacker) attBonus += partyRollBonus(viewFor(seat));
  let defBonus = 0; for (const seat of s.defender) defBonus += partyRollBonus(viewFor(seat));
  const surprise = s.round === 1 ? s.surprise : 0;

  const nameOfSide = (seats: number[]) => seats.map((x) => next.parties[x]!.name).join(" + ");
  const attName = nameOfSide(s.attacker), defName = nameOfSide(s.defender);

  for (let ei = 0; ei < s.engagements.length; ei++) {
    const eng = s.engagements[ei]!;
    // Zombie commands lend no magical power (M7, §Zombies) — a risen caster backs for zero.
    const zombieMP = (id: string): boolean =>
      next.variants?.zombies === true && next.parties[parseId(id).seat]?.zombie === true;
    // Extension kit (SC-EXT-35): the Magic Shield's ward, scoped to THIS engagement's own pairing —
    // a bearer among one side's engaged fighters turns aside the magic of the fighters facing it,
    // and of nobody else (the backers below are deliberately outside the ward; see pairShielded).
    const attWarded = pairShielded(next, eng.defenders); // a bearer among the DEFENDING fighters wards…
    const defWarded = pairShielded(next, eng.attackers); // …the attackers, and vice versa
    let attStr = 0; for (const id of eng.attackers) attStr += wardedStrength(next, id, attWarded);
    for (const b of s.attackerBackers) if (b.at === ei) attStr += zombieMP(b.caster) ? 0 : casterMP(memberOf(b.caster), viewOfId(b.caster));
    let defStr = 0; for (const id of eng.defenders) defStr += wardedStrength(next, id, defWarded);
    for (const b of s.defenderBackers) if (b.at === ei) defStr += zombieMP(b.caster) ? 0 : casterMP(memberOf(b.caster), viewOfId(b.caster));
    // One notice per foe the ward actually bit, before the dice — solo's own ordering (SC-EXT-27).
    events.push(...wardNotices(next, eng.attackers, attWarded), ...wardNotices(next, eng.defenders, defWarded));

    const ar = rollFor("attacker");
    const dr = rollFor("defender");
    const attTotal = attStr + ar + attBonus + surprise;
    const defTotal = defStr + dr + defBonus;
    events.push({
      type: "combatRoll", party: attName, enemy: defName,
      partyRoll: ar, enemyRoll: dr, partyTotal: attTotal, enemyTotal: defTotal,
      result: attTotal > defTotal ? "partyWon" : defTotal > attTotal ? "enemyWon" : "tie",
    });
    if (attTotal === defTotal) continue; // tie: no one is slain in that match

    // The higher total slays the STRONGEST creature of the losing group; the Ring's bearer (4th
    // level or deeper) cannot be chosen — if nobody in the group is mortal, no one falls. The
    // victim is picked on UN-warded strength, matching solo, whose own strongest-foe pick weighs
    // `fs + enemyMP` rather than the Shield-reduced `strangerMP` (combatPlan.ts, SC-EXT-27): the
    // ward turns a foe's magic aside for the round, it does not make him a lesser creature.
    const losers = attTotal > defTotal ? eng.defenders : eng.attackers;
    let victim: string | null = null;
    for (const id of losers) {
      const m = memberOf(id);
      if (!alive(m) || ringInvincible(m, viewOfId(id))) continue;
      if (victim === null || frontStrength(m, viewOfId(id)) > frontStrength(memberOf(victim), viewOfId(victim))) victim = id;
    }
    if (victim === null) {
      events.push({ type: "deathPrevented", creatureId: memberOf(losers[0]!).creatureId });
      continue;
    }
    const vm = memberOf(victim);
    vm.status = 3;
    events.push({ type: "memberDied", creatureId: vm.creatureId });
    const vseat = parseId(victim).seat;
    const v = viewFor(vseat);
    const eyeEvents = eyeForsakenByDeath(v, vm); // a slain Eye-bearer curses ITS OWN party
    if (eyeEvents.length) {
      next.parties[vseat]!.curses = v.curses; // scalar write-back (the view copies scalars)
      events.push(...eyeEvents);
    }
  }

  // The fallen spill their CARRIED items onto the tile (borne items go down with the body) so the
  // eventual victor — or any later party — can loot them (I-12).
  for (const seat of [...s.attacker, ...s.defender]) events.push(...sweepFallen(viewFor(seat), "contents"));

  const sideAlive = (seats: number[]) => seats.some((x) => next.parties[x]!.party.some((m) => alive(m)));
  const attAlive = sideAlive(s.attacker), defAlive = sideAlive(s.defender);
  if (!attAlive || !defAlive) {
    // A command with no living member is WIPED: its seats end terminally (same mapping multi.ts's
    // TERMINAL applies for GS_DEAD). The session ends; the winner holds the field and immediately
    // reclaims everything parked on the tile as a pickup (mirroring finalizeRound's win path).
    const losers = [...(attAlive ? [] : s.attacker), ...(defAlive ? [] : s.defender)];
    const winners = !defAlive && attAlive ? s.attacker : !attAlive && defAlive ? s.defender : [];
    for (const seat of losers) {
      const p = next.parties[seat]!;
      p.status = "wiped"; p.gs = GS_DEAD; p.phase = "gameOver"; p.fight = null;
    }
    next.session = null;
    if (winners.length) {
      events.push({ type: "fightWon" });
      const count = reclaimContents(next.cave.areas[s.area]!, next.parties[winners[0]!]!);
      if (count) events.push({ type: "treasureReclaimed", count });
    }
    return { state: next, events };
  }

  // Round complete, fight goes on: ownership alternates, but each round's layout re-runs the same
  // fixed 1-2-3 order starting from the defender's line (see module doc).
  s.round += 1;
  s.activeSide = s.activeSide === "attacker" ? "defender" : "attacker";
  s.stage = "defenderLine";
  s.defenderLine = []; s.engagements = []; s.attackerBackers = []; s.defenderBackers = [];
  s.window = { seat: s.defender[0]!, deadline: now + windowMs, kind: "pvpLayout" };
  return { state: next, events };
}

// --- retreat (I-11) & agreed stop ------------------------------------------------------------------

/**
 * Retreat at a round boundary (a fresh round's defenderLine stage, round > 1) instead of laying
 * out. SIMPLIFIED (documented): the retreating command moves to the adjacent EXISTING area behind
 * an open exit — no drawing during a PvP retreat (a missing destination blocks). Everything on the
 * floor stays for the victor, who reclaims the tile as a pickup (§427 "must leave behind any
 * treasure dropped in the area, including artefacts that were being carried by creatures who have
 * perished"; the spoils include the fled side's §388 pre-drop, I-11/I-12). The two-turn flee grace
 * is RETURNED (not persisted — see module doc): `fleeGrace: { seat, turns: 2 }`.
 */
export function retreatPvp(mp: MpGameState, seat: number, dir: number, _now: number): PvpResult & { fleeGrace?: { seat: number; turns: number } } {
  const s = pvpOf(mp);
  if (!s || s.stage !== "defenderLine" || s.round <= 1) return blocked(mp);
  // Only the command's lead seat may order the retreat — it moves the WHOLE command (a union
  // retreats together under its commander; a subordinate wanting out must leaveUnion afterwards).
  const side = s.attacker[0] === seat ? "attacker" : s.defender[0] === seat ? "defender" : null;
  if (!side) return blocked(mp);

  const area = mp.cave.areas[s.area]!;
  const dec = decodeArea(area.card);
  const open =
    dir === DIR_N ? dec.n : dir === DIR_E ? dec.e : dir === DIR_S ? dec.s : dir === DIR_W ? dec.w :
    dir === DIR_UP ? dec.stairUp : dir === DIR_DOWN ? dec.stairDown : false;
  if (!open) return blocked(mp);
  const { level, x, y } = unpackCoord(area.coord);
  const target = targetCoord(dir, level, x, y);
  const destIdx = mp.cave.areas.findIndex((a) => a.coord === target);
  if (destIdx < 0) return blocked(mp); // no destination exists — blocked (no drawing during PvP retreat)
  const dest = mp.cave.areas[destIdx]!;
  if ((dest.flags & AF_DESTROYED) !== 0) return blocked(mp);
  if (dir !== DIR_UP && dir !== DIR_DOWN) {
    const dd = decodeArea(dest.card);
    const back = dir === DIR_N ? dd.s : dir === DIR_E ? dd.w : dir === DIR_S ? dd.n : dd.e;
    if (!back) return blocked(mp); // no matching reverse doorway — a dead end, not an escape
  }

  const next = structuredClone(mp);
  const events: GameEvent[] = [];
  const retreatSeats = side === "attacker" ? s.attacker : s.defender;
  const staySeats = side === "attacker" ? s.defender : s.attacker;
  const destLevel = unpackCoord(target).level;
  next.cave.areas[destIdx]!.faceUp = true;
  for (const rs of retreatSeats) {
    const p = next.parties[rs]!;
    p.prev2 = p.prev;
    p.prev = p.partyArea;
    p.partyArea = destIdx;
    p.level = destLevel;
  }
  events.push({ type: "moved", area: destIdx, level: destLevel });
  next.session = null;
  // The side that held the field won the fight; the fled side's dropped treasure is its spoils.
  events.push({ type: "fightWon" });
  const count = reclaimContents(next.cave.areas[s.area]!, next.parties[staySeats[0]!]!);
  if (count) events.push({ type: "treasureReclaimed", count });
  return { state: next, events, fleeGrace: { seat, turns: 2 } };
}

/** Offer to end the fight at a round boundary ("both parties agree to end the fight at the end of
 *  a round"). The other side accepts via `acceptStop`; laying out a new line implicitly declines. */
export function proposeStop(mp: MpGameState, seat: number, _now: number): PvpResult {
  const s = pvpOf(mp);
  if (!s || s.stage !== "defenderLine" || s.round <= 1 || !sideOf(s, seat)) return blocked(mp);
  if (s.stopProposedBy !== null) return blocked(mp);
  const next = structuredClone(mp);
  pvpOf(next)!.stopProposedBy = seat;
  return { state: next, events: [] };
}

/** The other command agrees: the fight ends, and each side retakes its OWN §388-dropped items where
 *  the dropper still lives and has the capacity; leftovers stay on the floor for whoever comes next. */
export function acceptStop(mp: MpGameState, seat: number, _now: number): PvpResult {
  const s = pvpOf(mp);
  if (!s || s.stopProposedBy === null) return blocked(mp);
  const side = sideOf(s, seat);
  if (!side || side === sideOf(s, s.stopProposedBy)) return blocked(mp);

  const next = structuredClone(mp);
  const ns = pvpOf(next)!;
  const tile = next.cave.areas[ns.area]!;
  const events: GameEvent[] = [];
  const retaken: Record<"attacker" | "defender", number> = { attacker: 0, defender: 0 };
  for (const d of ns.drops) {
    const m = memberAt(next, d.id);
    const at = tile.contents.indexOf(200 + d.tid);
    if (at < 0 || !alive(m) || !canCarry(m!, d.tid)) continue; // leftovers stay on the floor
    m!.treasure.push(d.tid);
    tile.contents.splice(at, 1);
    retaken[sideOf(ns, d.seat)!] += 1;
  }
  if (retaken.attacker) events.push({ type: "droppedRetaken", count: retaken.attacker });
  if (retaken.defender) events.push({ type: "droppedRetaken", count: retaken.defender });
  next.session = null;
  return { state: next, events };
}

// --- reaction-window expiry (auto-defaults; spec §1.3 "auto-defaults NEVER dead-stop") --------------

/** Greedy strongest-fights-strongest legal pairing for an auto-defaulted attacker engage. */
function defaultEngagements(mp: MpGameState, s: PvpFightSession): PvpEngagement[] {
  const byStr = (ids: string[]) => [...ids].sort((a, b) => strengthOf(mp, b) - strengthOf(mp, a));
  const fighters = byStr(livingIds(mp, s.attacker));
  const defs = byStr([...s.defenderLine]);
  const engagements: PvpEngagement[] = [];
  const n = Math.min(fighters.length, defs.length);
  for (let i = 0; i < n; i++) engagements.push({ attackers: [fighters[i]!], defenders: [defs[i]!] });
  // Outnumbered: send one against two, strongest leftover foes first. Leftovers beyond capacity
  // stay unengaged — legal, since every fighter is already used.
  for (let i = n, e = 0; i < defs.length && e < engagements.length; e++) {
    const eng = engagements[e]!;
    if (eng.attackers.length === 1 && eng.defenders.length === 1) eng.defenders.push(defs[i++]!);
  }
  // Outnumbering: double up two-against-one with the spare fighters.
  for (let i = n, e = 0; i < fighters.length && e < engagements.length; e++) {
    const eng = engagements[e]!;
    if (eng.attackers.length === 1 && eng.defenders.length === 1) eng.attackers.push(fighters[i++]!);
  }
  return engagements;
}

/**
 * Fire an overdue reaction window: auto-default the awaited stage so the fight always progresses.
 * defenderLine → all living non-casters in line (casters behind only with the numerical advantage);
 * attackerEngage → greedy strongest-fights-strongest, no backers; defenderCasters → background
 * casters spread round-robin over the engagements, then the round ALSO auto-resolves.
 */
export function expirePvp(mp: MpGameState, now: number, windowMs: number = PVP_WINDOW_MS): PvpResult & { fired: boolean } {
  const s = pvpOf(mp);
  if (!s || !s.window || now < s.window.deadline) return { state: mp, events: [], fired: false };

  if (s.stage === "defenderLine") {
    const defLiving = livingIds(mp, s.defender);
    const attCount = livingIds(mp, s.attacker).length;
    const advantage = defLiving.length > attCount;
    const line = defLiving.filter((id) => !advantage || !isCaster(memberAt(mp, id)!));
    const r = setDefenderLine(mp, s.defender[0]!, line.length ? line : defLiving, now, windowMs);
    return { ...r, fired: true };
  }
  if (s.stage === "attackerEngage") {
    const r = setAttackerEngage(mp, s.attacker[0]!, defaultEngagements(mp, s), [], now, windowMs);
    return { ...r, fired: true };
  }
  // defenderCasters: round-robin the background casters, then the round resolves immediately.
  const background = livingIds(mp, s.defender)
    .filter((id) => !s.defenderLine.includes(id) && isCaster(memberAt(mp, id)!));
  const backers: PvpBacker[] = s.engagements.length
    ? background.map((c, i) => ({ caster: c, at: i % s.engagements.length }))
    : [];
  const r1 = setDefenderCasters(mp, s.defender[0]!, backers, now, windowMs);
  const r2 = resolveRoundPvp(r1.state, now, windowMs);
  return { state: r2.state, events: [...r1.events, ...r2.events], fired: true };
}

// --- UI summary ------------------------------------------------------------------------------------

export interface PvpEngagementView {
  attackers: string[]; defenders: string[];
  attackerNames: string[]; defenderNames: string[];
  attackerStr: number; defenderStr: number; // strengths incl. assigned backers, before dice & roll mods
}

export interface PvpView {
  round: number;
  activeSide: "attacker" | "defender";
  stage: PvpSession["stage"];
  surprise: number;
  attackerName: string;
  defenderName: string;
  engagements: PvpEngagementView[];
  window: ReactionWindow | null;
  stopProposedBy: number | null;
  // Card identity for EVERY member of both commands, keyed by "seat:idx". Rules-legitimate even in
  // serious play: "players need keep on display in their parties only their creature cards"
  // (§Hidden Cards) — the cards themselves are never concealed, only what they carry. `copy` is the
  // member's ordinal among same-creature members of ITS OWN party, for per-copy card art.
  cards: Record<string, { creatureId: number; copy: number; alive: boolean }>;
}

/** Per-engagement totals preview for the two-sided fight surface. Pure read. */
export function pvpView(session: PvpSession, mp: MpGameState): PvpView {
  const cards: PvpView["cards"] = {};
  for (const seat of [...session.attacker, ...session.defender]) {
    const tally = new Map<number, number>();
    mp.parties[seat]!.party.forEach((m, idx) => {
      const copy = tally.get(m.creatureId) ?? 0;
      tally.set(m.creatureId, copy + 1);
      cards[`${seat}:${idx}`] = { creatureId: m.creatureId, copy, alive: m.status === 0 || m.status === 1 };
    });
  }
  // `ALL_CREATURES` (base + kit, SC-EXT-2) — a kit creature (e.g. Witch 18) would otherwise crash
  // this lookup against the base-only `CREATURES` table (SC-EXT-31).
  const nameOf = (id: string) => ALL_CREATURES[memberAt(mp, id)!.creatureId]!.name;
  const engagements: PvpEngagementView[] = session.engagements.map((eng, ei) => {
    // The preview must show exactly what the round will fight, so it applies the SAME pairing-scoped
    // Shield ward `resolveRoundPvp` does (SC-EXT-35). (The layout-time helpers — `defaultEngagements`
    // and the union fairness check — keep using raw `strengthOf`: the ward depends on which pairing
    // is chosen, so weighing candidate pairings by it would be circular.)
    const attWarded = pairShielded(mp, eng.defenders);
    const defWarded = pairShielded(mp, eng.attackers);
    let a = 0; for (const id of eng.attackers) a += wardedStrength(mp, id, attWarded);
    for (const b of session.attackerBackers) if (b.at === ei) a += backerMP(mp, b.caster);
    let d = 0; for (const id of eng.defenders) d += wardedStrength(mp, id, defWarded);
    for (const b of session.defenderBackers) if (b.at === ei) d += backerMP(mp, b.caster);
    return {
      attackers: [...eng.attackers], defenders: [...eng.defenders],
      attackerNames: eng.attackers.map(nameOf), defenderNames: eng.defenders.map(nameOf),
      attackerStr: a, defenderStr: d,
    };
  });
  return {
    round: session.round,
    activeSide: session.activeSide,
    stage: session.stage,
    surprise: session.surprise,
    attackerName: session.attacker.map((x) => mp.parties[x]!.name).join(" + "),
    defenderName: session.defender.map((x) => mp.parties[x]!.name).join(" + "),
    engagements,
    cards,
    window: session.window,
    stopProposedBy: session.stopProposedBy,
  };
}
