// The revised round engine (technical spec §4.2; Peter's reformulated fighting rules as ruled on 10-OCT-2026), played only when
// `variants.combatRevision` is on. The legacy path (combatPlan.ts, `resolveRound`) is untouched.
//
// A fight is a set of persistent matches. The roles never change: the attacker is whoever started the fight. Each round is
//   deploy   the defender puts at least as many unengaged creatures in the front line as the attacker has (or all it has),
//   engage   the attacker pairs its unengaged creatures one-to-one against that front line, until none can be paired,
//   surplus  each side in turn (attacker first) may put unengaged creatures into a match's front line (never a third, never a new
//            match) or a caster into its background,
//   fight    every match is fought; a tie, or a match neither side can win and kill in, persists; a lost two-creature front line
//            nominates one creature and a die decides ("high roll kills the nominated creature"),
//   wrap     matches with an empty front dissolve, background and deployed creatures become unengaged, and the fight ends by
//            Peter's single test (Q2): nobody can continue a match, make one, or break a stalemate.
//
// Each decision is either the player's (an action) or the strangers' (a pending decision the driver answers with a logged action,
// strangerDriver.ts). The engine decides nothing for either side: it only checks legality and plays out what was chosen.
import { ALL_CREATURES as CREATURES } from "./data/creatures";
import { ALL_TREASURES } from "./data/treasures";
import { rollDieForState } from "./rng";
import { casterMP, frontStrength, isCaster, partyRollBonus } from "./combat";
import { eyeForsakenByDeath, eyePresent, hasLivingHuman, markDied, ringInvincible, slaySorcerer } from "./effects";
import {
  MAGIC_ONLY_IDS, enemyRollBonus, isShieldStalemate, living, magicOnlyBypass, matchShielded, shieldedMP, strangerFS, strangerInvincible,
  strangerMP, strangerShielded,
} from "./combatPlan";
import { removeStranger } from "./strangerGear";
import type { GameState, RevFight, RevMatch } from "./state";
import type { GameEvent } from "./actions";
import type { FightView, MatchView, UnitView } from "./strategy";

type Side = "party" | "strangers";
type Move = { creature: number; match: number; back: boolean };
type Pair = { party: number; stranger: number };

const C_SPECTRE = 9;
const C_DRAGON = 10;
const C_SIBYL = 21;
const T_SCROLL = 19;
const C_SORCERER = 11;
const C_APPRENTICE = 14;
const T_THE_RING = 10;
const MAX_ROUNDS = 200;   // a safety stop; Peter's test and the no-progress rule end every real fight long before

const other = (s: Side): Side => (s === "party" ? "strangers" : "party");
const revOf = (state: GameState): RevFight => state.fight!.rev!;

/** Is this fight played by the revised rules? */
export const isRevised = (state: GameState): boolean => state.fight?.rev !== undefined;

// ---------------------------------------------------------------------------------------------------------------------------
// Who is where

const front = (m: RevMatch, side: Side): number[] => (side === "party" ? m.pf : m.sf);
const back = (m: RevMatch, side: Side): number[] => (side === "party" ? m.pb : m.sb);

const livingParty = (state: GameState): number[] => state.party.map((_, i) => i).filter((i) => living(state, i));
const livingStrangers = (state: GameState): number[] => state.strangers.map((_, i) => i).filter((i) => !revOf(state).killed.includes(i));
const aliveOf = (state: GameState, side: Side): number[] => (side === "party" ? livingParty(state) : livingStrangers(state));

function inMatch(rev: RevFight, side: Side): Set<number> {
  const out = new Set<number>();
  for (const m of rev.matches) for (const i of [...front(m, side), ...back(m, side)]) out.add(i);
  return out;
}

/** Unengaged creatures of `side` that have not been deployed this round. */
export function freeOf(state: GameState, side: Side): number[] {
  const rev = revOf(state), engaged = inMatch(rev, side), dep = rev.deployed[side];
  return aliveOf(state, side).filter((i) => !engaged.has(i) && !dep.includes(i));
}

/** Unengaged creatures that may still be placed in step e: free, or deployed but not engaged. */
function candidatesOf(state: GameState, side: Side): number[] {
  const rev = revOf(state), engaged = inMatch(rev, side);
  return aliveOf(state, side).filter((i) => !engaged.has(i));
}

// ---------------------------------------------------------------------------------------------------------------------------
// Legality

const isMagicOnly = (state: GameState, s: number): boolean => MAGIC_ONLY_IDS.includes(state.strangers[s]!);

/** May party member `p` be matched against stranger `s`? A Spectre or Demon can only be fought with magic (or its enabling artefact). */
export function canPair(state: GameState, p: number, s: number): boolean {
  if (!isMagicOnly(state, s)) return true;
  const m = state.party[p]!;
  return casterMP(m, state) > 0 || magicOnlyBypass(state, m, state.strangers[s]!);
}

export function legalPairs(state: GameState, attacker: Side): Pair[] {
  const rev = revOf(state), def = other(attacker);
  const own = freeOf(state, attacker), foes = rev.deployed[def].filter((i) => !inMatch(rev, def).has(i));
  const out: Pair[] = [];
  for (const a of own) for (const d of foes) {
    const pair = attacker === "party" ? { party: a, stranger: d } : { party: d, stranger: a };
    if (canPair(state, pair.party, pair.stranger)) out.push(pair);
  }
  return out;
}

/** Every single placement the rules allow in step e for `side`, given the matches as they stand. */
export function legalMoves(state: GameState, side: Side): Move[] {
  const rev = revOf(state), out: Move[] = [];
  const caster = (i: number): boolean => (side === "party" ? isCaster(state.party[i]!) : CREATURES[state.strangers[i]!]!.mp > 0);
  for (const c of candidatesOf(state, side)) rev.matches.forEach((m, mi) => {
    if (front(m, side).length < 2 && compatible(state, m, side, c)) out.push({ creature: c, match: mi, back: false });
    if (front(m, side).length > 0 && caster(c)) out.push({ creature: c, match: mi, back: true });
  });
  return out;
}

/** May `c` join this match's front line? A magic-only foe needs everyone in front of it to be able to face it. */
function compatible(state: GameState, m: RevMatch, side: Side, c: number): boolean {
  if (side === "party") return m.sf.every((s) => canPair(state, c, s));
  return !isMagicOnly(state, c) || m.pf.every((p) => canPair(state, p, c));
}

export function deployViolation(state: GameState, side: Side, creatures: unknown): string | null {
  if (!Array.isArray(creatures)) return "creatures is not a list";
  const free = freeOf(state, side), pending = state.fight?.pending;
  const min = pending && pending.kind === "deploy" ? pending.min : 0;
  const seen = new Set<number>();
  for (const c of creatures) {
    if (!Number.isInteger(c) || !free.includes(c as number)) return `creature ${String(c)} cannot be deployed`;
    if (seen.has(c as number)) return `creature ${String(c)} deployed twice`;
    seen.add(c as number);
  }
  if (seen.size < min) return `at least ${min} must be deployed`;
  return null;
}

export function engageViolation(state: GameState, attacker: Side, pairs: unknown): string | null {
  if (!Array.isArray(pairs)) return "pairs is not a list";
  const rev = revOf(state), def = other(attacker);
  const own = freeOf(state, attacker), foes = rev.deployed[def].filter((i) => !inMatch(rev, def).has(i));
  const usedP = new Set<number>(), usedS = new Set<number>();
  for (const p of pairs) {
    if (!p || !Number.isInteger(p.party) || !Number.isInteger(p.stranger)) return "malformed pair";
    const a = attacker === "party" ? p.party : p.stranger, d = attacker === "party" ? p.stranger : p.party;
    if (!own.includes(a)) return `creature ${a} is not an unengaged attacker`;
    if (!foes.includes(d)) return `creature ${d} is not in the deployed front line`;
    if (usedP.has(p.party) || usedS.has(p.stranger)) return "a creature is paired twice";
    if (!canPair(state, p.party, p.stranger)) return "that pairing is not allowed";
    usedP.add(p.party); usedS.add(p.stranger);
  }
  const rest = legalPairs(state, attacker).some((p) => !usedP.has(p.party) && !usedS.has(p.stranger));
  return rest ? "every unengaged attacker that can be paired must be" : null;
}

export function redeployViolation(state: GameState, side: Side, moves: unknown): string | null {
  if (!Array.isArray(moves)) return "moves is not a list";
  const rev = revOf(state), cand = candidatesOf(state, side);
  const fronts = rev.matches.map((m) => ({ pf: m.pf.slice(), sf: m.sf.slice() }));
  const moved = new Set<number>();
  for (const mv of moves) {
    if (!mv || !Number.isInteger(mv.creature) || !Number.isInteger(mv.match) || typeof mv.back !== "boolean") return "malformed move";
    if (!cand.includes(mv.creature) || moved.has(mv.creature)) return `creature ${mv.creature} cannot be placed`;
    const m = rev.matches[mv.match], f = fronts[mv.match];
    if (!m || !f) return `no match ${mv.match}`;
    const own = side === "party" ? f.pf : f.sf;
    if (mv.back) {
      const caster = side === "party" ? isCaster(state.party[mv.creature]!) : CREATURES[state.strangers[mv.creature]!]!.mp > 0;
      if (!caster || own.length === 0) return `creature ${mv.creature} cannot back match ${mv.match}`;
    } else {
      if (own.length >= 2) return `match ${mv.match} already has two in front`;
      if (!compatible(state, { ...m, pf: f.pf, sf: f.sf }, side, mv.creature)) return `creature ${mv.creature} cannot face that match`;
      own.push(mv.creature);
    }
    moved.add(mv.creature);
  }
  return null;
}

export function nominateViolation(state: GameState, nominated: unknown): string | null {
  const p = state.fight?.pending;
  if (!p || p.kind !== "casualty") return "no casualty is pending";
  return p.pair.includes(nominated as number) ? null : "the nominated creature must be one of the pair";
}

// ---------------------------------------------------------------------------------------------------------------------------
// Strength

interface Strength { party: number; strangers: number; shieldStalemate: boolean; ward: { creatureId: number; mode: "nullify" | "weaken" }[] }

/** The two sides' totals in one match (Fighting a Match, steps i and ii): the same arithmetic as the legacy preview, for the match as it
 *  stands. A Shield also wards stranger casters backing the match (the card). */
export function matchStrength(state: GameState, m: RevMatch): Strength {
  const magicOnly = m.sf.some((s) => isMagicOnly(state, s));
  const partyMagicOff = !magicOnly && m.sf.some((s) => strangerShielded(state, s));
  const memberStr = (i: number): number => {
    const mem = state.party[i]!;
    if (magicOnly && casterMP(mem, state) > 0) return casterMP(mem, state);
    return partyMagicOff ? frontStrength(mem, state) - casterMP(mem, state) : frontStrength(mem, state);
  };
  const party = m.pf.reduce((a, i) => a + memberStr(i), 0) + (partyMagicOff ? 0 : m.pb.reduce((a, i) => a + casterMP(state.party[i]!, state), 0));
  const shieldStalemate = isShieldStalemate(state, { front: m.pf, strangers: m.sf });
  const shielded = matchShielded(state, m.pf), ward: Strength["ward"] = [];
  const wardedMP = (s: number): number => {
    const sid = state.strangers[s]!, base = strangerMP(state, s);
    if (!shielded || base === 0) return base;
    if (!shieldStalemate) ward.push({ creatureId: sid, mode: sid === C_SORCERER || sid === C_APPRENTICE ? "weaken" : "nullify" });
    return shieldedMP(sid, base);
  };
  const strangers = [...m.sf, ...m.sb].reduce((a, s) => a + (m.sf.includes(s) ? strangerFS(state, s) : 0) + wardedMP(s), 0);
  return { party, strangers, shieldStalemate, ward };
}

/** Peter's Q3 (with his invulnerable Ring bearer): a match is a stalemate when neither side can beat the other on any roll — where
 *  beating means being able to win AND to kill with the win. A stranger who is defeated is always removed. */
function isStalemate(state: GameState, m: RevMatch, str: Strength, pB: number, sB: number): boolean {
  if (str.shieldStalemate) return true;
  const partyCanWin = str.party + 6 + pB > str.strangers + 1 + sB;
  const strangersCanWin = str.strangers + 6 + sB > str.party + 1 + pB;
  const strangersCanKill = strangersCanWin && m.pf.some((i) => !ringInvincible(state.party[i]!, state));
  return !partyCanWin && !strangersCanKill;
}

/** The die bonuses for a round: Ring and curses, plus the attacker's surprise in round 1. */
function bonusesFor(state: GameState): NonNullable<RevFight["bonus"]> {
  const fight = state.fight!, rev = fight.rev!;
  const surprise = fight.round === 1 ? 1 : 0;
  const sBonus = enemyRollBonus(state);
  return {
    party: partyRollBonus(state) + (surprise && rev.attacker === "party" && fight.surprise > 0 ? 1 : 0) + (surprise && rev.scrollSurprise ? 1 : 0),
    strangers: sBonus + (surprise && rev.attacker === "strangers" && fight.surprise < 0 ? 1 : 0),
    partyRing: !eyePresent(state) && livingParty(state).some((i) => state.party[i]!.treasure.includes(T_THE_RING)),
    strangersRing: sBonus > 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// What a strategy sees

const partyView = (state: GameState, i: number): UnitView => {
  const m = state.party[i]!, c = CREATURES[m.creatureId]!;
  return { index: i, creatureId: m.creatureId, strength: frontStrength(m, state), magic: casterMP(m, state), caster: isCaster(m), points: c.points };
};
const strangerView = (state: GameState, i: number): UnitView => {
  const id = state.strangers[i]!, c = CREATURES[id]!;
  return { index: i, creatureId: id, strength: strangerFS(state, i) + strangerMP(state, i), magic: strangerMP(state, i), caster: c.mp > 0, points: c.points };
};

export function fightView(state: GameState): FightView {
  const fight = state.fight!, rev = fight.rev!, b = rev.bonus ?? bonusesFor(state);
  const matches: MatchView[] = rev.matches.map((m) => {
    const s = matchStrength(state, m);
    return { pf: m.pf.slice(), pb: m.pb.slice(), sf: m.sf.slice(), sb: m.sb.slice(), partyStrength: s.party, strangerStrength: s.strangers };
  });
  return {
    round: fight.round, attacker: rev.attacker, eyePresent: eyePresent(state), level: state.level,
    party: livingParty(state).map((i) => partyView(state, i)), strangers: livingStrangers(state).map((i) => strangerView(state, i)),
    matches, deployed: { party: rev.deployed.party.slice(), strangers: rev.deployed.strangers.slice() },
    partyDieBonus: b.party, strangerDieBonus: b.strangers,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Starting a fight, and the decisions

/** Begin the revised round engine for the fight just set up in `state.fight`. The attacker is who started it: the strangers when they
 *  gained the surprise, otherwise the party. */
export function initRevised(state: GameState): void {
  const fight = state.fight!;
  fight.rev = {
    attacker: fight.surprise < 0 ? "strangers" : "party", matches: [], deployed: { party: [], strangers: [] },
    step: "scroll", surplusTurn: 0, progress: false, cursor: 0, killed: [],
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The Scroll option (Peter's Step b, 14-OCT-2026): the attacking player party only, once per area, never under the Eye

/** Is the Scroll on offer to the party now? It must be the attacker, a living member must carry the Scroll and a living human be present
 *  to read it, the Eye absent, the area unused, and there must be something to gain: the round-1 surprise, or a stranger to destroy. */
function scrollOffered(state: GameState): boolean {
  const fight = state.fight!;
  if (fight.rev!.attacker !== "party" || eyePresent(state) || state.scrollAreas?.includes(state.partyArea)) return false;
  if (!livingParty(state).some((i) => state.party[i]!.treasure.includes(T_SCROLL)) || !hasLivingHuman(state)) return false;
  return fight.round === 1 || state.strangers.some(destroyedByScroll);
}

/** The Scroll destroys a stranger without innate magical power — a Ring-bearer on level 4+ too (Peter, 15-OCT-2026) — but not the Sibyl. */
const destroyedByScroll = (id: number): boolean => CREATURES[id]!.mp === 0 && id !== C_SIBYL;

export function applyScroll(state: GameState, use: "destroy" | "surprise" | "decline"): GameEvent[] {
  const fight = state.fight!, rev = fight.rev!, events: GameEvent[] = [];
  rev.partyActed = true;
  delete fight.pending;
  rev.step = "deploy";
  if (use === "decline") return [...events, ...advance(state)];
  state.curses += 1;                                          // the attacker is cursed either way; the Scroll is not consumed
  state.scrollAreas = [...(state.scrollAreas ?? []), state.partyArea];
  if (use === "surprise") return [{ type: "scrollSurprise" }, ...((rev.scrollSurprise = true), advance(state))];
  const destroyed: number[] = [], survivors: number[] = [];
  for (let i = state.strangers.length - 1; i >= 0; i--) {    // highest first, so the indices still to visit stay put
    const id = state.strangers[i]!;
    if (!destroyedByScroll(id)) { survivors.unshift(id); continue; }
    destroyed.unshift(id);
    removeStranger(state, i);                                 // what they bore falls to the floor
    const shift = (list: number[]): number[] => list.filter((n) => n !== i).map((n) => (n > i ? n - 1 : n));
    for (const m of rev.matches) { m.sf = shift(m.sf); m.sb = shift(m.sb); }
    rev.deployed.strangers = shift(rev.deployed.strangers);
  }
  rev.matches = rev.matches.filter((m) => m.sf.length > 0);   // a match whose strangers are gone dissolves; its party side is unengaged again
  rev.progress = true;
  events.push({ type: "scrollRead", destroyed, survivors });
  return [...events, ...advance(state)];
}

export function applyDeploy(state: GameState, side: Side, creatures: number[]): GameEvent[] {
  const rev = revOf(state);
  if (side === "party") rev.partyActed = true;
  rev.deployed[side] = creatures.slice();
  rev.step = "engage";
  delete state.fight!.pending;
  return [{ type: "deployed", side, creatures: creatures.slice() }, ...advance(state)];
}

export function applyEngage(state: GameState, attacker: Side, pairs: Pair[]): GameEvent[] {
  const rev = revOf(state), def = other(attacker);
  if (attacker === "party") rev.partyActed = true;
  for (const p of pairs) {
    rev.matches.push(attacker === "strangers" ? { sf: [p.stranger], pf: [p.party], pb: [], sb: [] } : { pf: [p.party], sf: [p.stranger], pb: [], sb: [] });
    rev.progress = true;
  }
  // the engaged leave the deployed list
  rev.deployed[def] = rev.deployed[def].filter((i) => !pairs.some((p) => (def === "party" ? p.party : p.stranger) === i));
  rev.step = "surplus";
  delete state.fight!.pending;
  return [{ type: "engaged", pairs: pairs.map((p) => ({ ...p })) }, ...advance(state)];
}

export function applyRedeploy(state: GameState, side: Side, moves: Move[]): GameEvent[] {
  const rev = revOf(state);
  if (side === "party") rev.partyActed = true;
  for (const mv of moves) {
    const m = rev.matches[mv.match]!;
    (mv.back ? back(m, side) : front(m, side)).push(mv.creature);
    rev.deployed[side] = rev.deployed[side].filter((i) => i !== mv.creature);
    rev.progress = true;
  }
  rev.surplusTurn++;
  delete state.fight!.pending;
  return [{ type: "redeployed", side, moves: moves.map((m) => ({ ...m })) }, ...advance(state)];
}

/** The strangers' nomination for a lost two-creature front line, then the die: 4-6 (with the Ring's +1, a 7 counting as 6) and the
 *  nominated creature falls, otherwise the other. */
export function applyNominate(state: GameState, nominated: number): GameEvent[] {
  const fight = state.fight!, rev = fight.rev!, pending = fight.pending;
  if (!pending || pending.kind !== "casualty") return [];
  const [a, b] = pending.pair, victim = nominated === a ? b : a;
  const roll = rollDieForState(state);
  const fallen = Math.min(6, roll + (rev.bonus?.strangersRing ? 1 : 0)) >= 4 ? nominated : victim;
  const events: GameEvent[] = [{ type: "strangerCasualty", nominated: state.strangers[nominated]!, victim: state.strangers[fallen]!, roll }];
  delete fight.pending;
  const mi = rev.nominating!;
  delete rev.nominating;
  const m = rev.matches[mi]!;
  events.push(...slayStranger(state, m, fallen));
  return [...events, ...advance(state)];
}

/** A party casualty chosen (legacy `chooseCasualty` handler calls this once the queue is empty): carry on with the round. */
export function resumeAfterCasualties(state: GameState): GameEvent[] {
  return advance(state);
}

/** The party member died (a lost match, the Spectre's touch): take them out of any match. */
export function dropPartyMember(state: GameState, idx: number): void {
  const rev = state.fight?.rev;
  if (!rev) return;
  for (const m of rev.matches) { m.pf = m.pf.filter((i) => i !== idx); m.pb = m.pb.filter((i) => i !== idx); }
  rev.deployed.party = rev.deployed.party.filter((i) => i !== idx);
}

// ---------------------------------------------------------------------------------------------------------------------------
// The round machine

/** Run the engine's own steps until a decision is needed (`fight.pending`), the round is waiting on the player's casualty choice, or
 *  the fight is over (a side wiped out, or a standoff). Returns the events; the caller settles a win or loss with `finalizeRound`. */
export function advance(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const fight = state.fight!, rev = fight.rev!;
  for (let guard = 0; guard < 8 * MAX_ROUNDS; guard++) {
    if (rev.standoff || fight.pending) return events;
    // a side wiped out ends the fight, but only once the round is wrapped (the slain are removed there)
    if (rev.step !== "fight" && rev.step !== "wrap" && (livingParty(state).length === 0 || livingStrangers(state).length === 0)) return events;
    switch (rev.step) {
      case "scroll": {
        if (scrollOffered(state)) { fight.pending = { by: "party", kind: "scroll", surprise: fight.round === 1 }; return events; }
        rev.step = "deploy";
        break;
      }
      case "deploy": {
        const attacker = rev.attacker, defender = other(attacker);
        const attFree = freeOf(state, attacker).length, defFree = freeOf(state, defender);
        if (attFree === 0 || defFree.length === 0) { rev.step = "engage"; break; }
        fight.pending = { by: defender, kind: "deploy", min: Math.min(defFree.length, attFree) };
        return events;
      }
      case "engage": {
        if (legalPairs(state, rev.attacker).length === 0) { rev.step = "surplus"; break; }
        fight.pending = { by: rev.attacker, kind: "engage" };
        return events;
      }
      case "surplus": {
        if (rev.surplusTurn >= 2) {
          // A round from the second on in which the party has had nothing to decide (every creature is already in a match) would be
          // fought on the spot, with no chance to retreat first. Pause on an empty redeploy: fight on, or retreat.
          const retreatOpen = !state.fellThroughTrap && !fight.retreatBlocked;
          if (fight.round >= 2 && !rev.partyActed && retreatOpen && livingParty(state).length > 0 && rev.matches.length > 0) {
            rev.partyActed = true;
            fight.pending = { by: "party", kind: "redeploy" };
            return events;
          }
          rev.step = "fight"; break;
        }
        const side = rev.surplusTurn === 0 ? rev.attacker : other(rev.attacker);
        if (rev.matches.length === 0 || legalMoves(state, side).length === 0) { rev.surplusTurn++; break; }
        fight.pending = { by: side, kind: "redeploy" };
        return events;
      }
      case "fight": {
        events.push(...fightMatches(state));
        if (fight.pending) return events;           // a stranger casualty to nominate
        rev.step = "wrap";
        break;
      }
      case "wrap": {
        if (fight.casualtyQueue?.length) return events;   // the player still has to say who falls
        events.push(...wrapUp(state));
        if (livingParty(state).length === 0 || state.strangers.length === 0) return events;
        break;
      }
    }
  }
  rev.standoff = true;
  return events;
}

/** Slay stranger `s` of match `m`: the legacy kill, with its Ring, Dragon-slayer and Sorcerer consequences. It leaves the match at once
 *  and `state.strangers` at wrap-up, so positions stay stable while the round is fought. */
function slayStranger(state: GameState, m: RevMatch, s: number): GameEvent[] {
  const rev = revOf(state), events: GameEvent[] = [];
  const sid = state.strangers[s]!;
  const soleDragonFight = sid === C_DRAGON && m.pf.length === 1 && m.pb.length === 0 && m.sf.length === 1 && m.sb.length === 0;
  const slayer = soleDragonFight ? state.party[m.pf[0]!]! : undefined;
  if (strangerInvincible(state, s)) {
    // An invulnerable Ring bearer (level 4+) that is defeated disappears WITH the Ring, leaving its other gear behind.
    const g = state.fight!.gear![s]!;
    g.splice(g.indexOf(T_THE_RING), 1);
    events.push({ type: "strangerVanished", creatureId: sid, artifact: T_THE_RING });
  }
  m.sf = m.sf.filter((i) => i !== s); m.sb = m.sb.filter((i) => i !== s);
  rev.killed.push(s);
  if (slayer) slayer.dragonKills += 1;
  events.push({ type: "strangerKilled", creatureId: sid });
  if (slayer) events.push({ type: "dragonSlain", creatureId: slayer.creatureId, kills: slayer.dragonKills });
  if (sid === C_SORCERER) {
    // With `variants.sorcererTeleport` he is only defeated for now: the player may spare him once the fight is over.
    if (state.variants?.sorcererTeleport && !eyePresent(state)) { state.fight!.sorcererFelled = true; events.push({ type: "sorcererFelled" }); }
    else events.push(...slaySorcerer(state));
  }
  return events;
}

function fightMatches(state: GameState): GameEvent[] {
  const fight = state.fight!, rev = fight.rev!, events: GameEvent[] = [];
  if (!rev.bonus) {
    rev.bonus = bonusesFor(state);
    // §387: members fighting hand-to-hand drop heavy treasure onto the floor for the duration (reclaimed on a win, left on a retreat).
    const area = state.areas[state.partyArea]!;
    for (const m of rev.matches) for (const i of m.pf) {
      const mem = state.party[i]!, heavy = mem.treasure.filter((t) => ALL_TREASURES[t]!.kind === "heavy");
      if (heavy.length) {
        area.contents.push(...heavy.map((t) => 200 + t));
        mem.treasure = mem.treasure.filter((t) => ALL_TREASURES[t]!.kind !== "heavy");
        state.fightDrops = [...(state.fightDrops ?? []), ...heavy.map((t) => ({ mi: i, tid: t }))];
      }
    }
    events.push(...idleMagicOnlyKills(state));
  }
  const b = rev.bonus;
  while (rev.cursor < rev.matches.length) {
    const mi = rev.cursor++, m = rev.matches[mi]!;
    if (m.pf.length === 0 || m.sf.length === 0) continue;
    const str = matchStrength(state, m);
    if (str.shieldStalemate) { events.push({ type: "shieldStalemate", creatureIds: m.sf.map((s) => state.strangers[s]!) }); continue; }
    if (isStalemate(state, m, str, b.party, b.strangers)) continue;   // neither side can win and kill: the match persists unfought
    for (const w of str.ward) events.push({ type: "shieldWarded", creatureId: w.creatureId, mode: w.mode });
    const partyRoll = rollDieForState(state), enemyRoll = rollDieForState(state);
    const partyTotal = str.party + partyRoll + b.party, enemyTotal = str.strangers + enemyRoll + b.strangers;
    rev.progress = true;
    events.push({
      type: "combatRoll",
      party: m.pf.concat(m.pb).map((i) => CREATURES[state.party[i]!.creatureId]!.name).join(" + "),
      enemy: m.sf.concat(m.sb).map((s) => CREATURES[state.strangers[s]!]!.name).join(" + "),
      partyRoll, enemyRoll, partyTotal, enemyTotal,
      result: partyTotal > enemyTotal ? "partyWon" : enemyTotal > partyTotal ? "enemyWon" : "tie",
    });
    if (partyTotal === enemyTotal) continue;   // a tie is unresolved: the match persists
    if (partyTotal > enemyTotal) {
      if (m.sf.length === 1) events.push(...slayStranger(state, m, m.sf[0]!));
      else {
        // two in front lost: they nominate one and a die decides (resumed by `applyNominate`)
        rev.nominating = mi;
        fight.pending = { by: "strangers", kind: "casualty", pair: [m.sf[0]!, m.sf[1]!] };
        return events;
      }
    } else {
      const mortal = m.pf.filter((i) => !ringInvincible(state.party[i]!, state));
      if (mortal.length === 0) events.push({ type: "deathPrevented", creatureId: state.party[m.pf[0]!]!.creatureId });
      else if (mortal.length === 1) {
        const i = mortal[0]!, mem = state.party[i]!;
        markDied(state, mem);
        dropPartyMember(state, i);
        events.push({ type: "memberDied", creatureId: mem.creatureId }, ...eyeForsakenByDeath(state, mem));
      } else fight.casualtyQueue = [...(fight.casualtyQueue ?? []), mortal.slice()];
    }
  }
  return events;
}

/** An unfightable, unengaged magic-only foe (a Spectre or Demon the party has no magic to face) slays the party's strongest member. */
function idleMagicOnlyKills(state: GameState): GameEvent[] {
  const rev = revOf(state);
  const engaged = inMatch(rev, "strangers");
  const idle = livingStrangers(state).filter((s) => isMagicOnly(state, s) && !engaged.has(s));
  const party = livingParty(state);
  const unfightable = idle.filter((s) => !party.some((p) => canPair(state, p, s)));
  if (unfightable.length === 0) return [];
  let strongest = party[0]!;
  for (const p of party) if (frontStrength(state.party[p]!, state) > frontStrength(state.party[strongest]!, state)) strongest = p;
  const mem = state.party[strongest]!;
  rev.progress = true;
  if (ringInvincible(mem, state)) return [{ type: "deathPrevented", creatureId: mem.creatureId }];
  markDied(state, mem);
  dropPartyMember(state, strongest);
  const culprit = state.strangers[unfightable[0]!]!;
  return [{ type: culprit === 15 ? "demonSlew" : "spectreSlew", creatureId: mem.creatureId }, ...eyeForsakenByDeath(state, mem)];
}

/** Wrap up the round, then decide whether the fight is over (Peter's Q2). */
function wrapUp(state: GameState): GameEvent[] {
  const fight = state.fight!, rev = fight.rev!, events: GameEvent[] = [];

  // the slain leave the chamber (what they bore falls to the floor), and every stored position shifts down past them
  for (const r of rev.killed.slice().sort((a, b) => b - a)) {
    removeStranger(state, r);
    const shift = (list: number[]): number[] => list.map((n) => (n > r ? n - 1 : n));
    for (const m of rev.matches) { m.sf = shift(m.sf); m.sb = shift(m.sb); }
    rev.deployed.strangers = shift(rev.deployed.strangers.filter((n) => n !== r));
  }
  rev.killed = [];
  fight.round += 1;
  fight.retreatBlocked = false;                    // a round was fought: retreat opens again
  if (livingParty(state).length === 0 || state.strangers.length === 0) return events;
  if (fight.oneRound) {   // the chest Spectre attacks for one round only, then vanishes (Peter, 14-OCT-2026)
    for (let i = state.strangers.length - 1; i >= 0; i--) if (state.strangers[i] === C_SPECTRE) removeStranger(state, i);
    events.push({ type: "spectreDeparts" });
    return events;
  }

  const keep: RevMatch[] = [];
  for (const m of rev.matches) {
    if (m.pf.length === 0 || m.sf.length === 0) continue;   // an empty front line dissolves the match; its survivors become unengaged
    m.pb = []; m.sb = [];                                   // background casters are unengaged again
    keep.push(m);
  }
  rev.matches = keep;
  rev.deployed = { party: [], strangers: [] };

  if (!rev.progress || !canContinue(state) || fight.round > MAX_ROUNDS) {
    rev.standoff = true;
    events.push({ type: "fightStandoff" });
    return events;
  }
  rev.step = "scroll"; rev.surplusTurn = 0; rev.progress = false; rev.cursor = 0; delete rev.bonus; delete rev.partyActed;
  return events;
}

/** Peter's Q2 test: a match that can still be decided, or two sides each with an unengaged creature (so a match can be made), or an
 *  unengaged creature that has a place in a stalemated match. */
function canContinue(state: GameState): boolean {
  const rev = revOf(state), pB = partyRollBonus(state), sB = enemyRollBonus(state);
  const stalemated: RevMatch[] = [];
  for (const m of rev.matches) {
    if (isStalemate(state, m, matchStrength(state, m), pB, sB)) stalemated.push(m); else return true;
  }
  const pFree = freeOf(state, "party"), sFree = freeOf(state, "strangers");
  if (pFree.length && sFree.length && legalPairsAny(state, pFree, sFree)) return true;
  const room = (m: RevMatch, side: Side): boolean => {
    const free = side === "party" ? pFree : sFree;
    return free.some((c) => (front(m, side).length < 2 && compatible(state, m, side, c))
      || (front(m, side).length > 0 && (side === "party" ? isCaster(state.party[c]!) : CREATURES[state.strangers[c]!]!.mp > 0)));
  };
  return stalemated.some((m) => room(m, "party") || room(m, "strangers"));
}

const legalPairsAny = (state: GameState, party: number[], strangers: number[]): boolean => party.some((p) => strangers.some((s) => canPair(state, p, s)));
