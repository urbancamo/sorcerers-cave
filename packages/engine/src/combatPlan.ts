import { rollDie } from "./rng";
// Extension kit (SC-EXT-17): aliases `ALL_CREATURES` — every dynamic lookup below indexes by an
// actual party member's or stranger's `creatureId` (never enumerates the array), so a kit ally or
// kit stranger (id 14-20) fighting no longer crashes; byte-identical for ids 0-13.
import { ALL_CREATURES as CREATURES } from "./data/creatures";
import { ALL_TREASURES } from "./data/treasures";
import { frontStrength, casterMP, partyRollBonus, isCaster } from "./combat";
import { eyeActive, ringInvincible, activeCurses, eyeForsakenByDeath, revertApprenticesOnSorcererDeath } from "./effects";
import type { GameState, PartyMember, BattlePlan } from "./state";
import type { GameEvent } from "./actions";

const C_SPECTRE = 9;
const C_DRAGON = 10;
const C_SORCERER = 11;
// Extension kit (SC-EXT-21) — the Demon, like the Spectre, can only be touched by magic; a Magic
// Axe bearer (ANY species — design US-24, unlike the Sword-Spectre precedent below) also counts.
const C_DEMON = 15;
const T_MAGIC_SWORD = 3;
const T_MAGIC_STAFF = 9;
const T_THE_RING = 10;
const T_MAGIC_AXE = 17; // extension-kit treasure — mere possession is enough here (canSwordSpectre precedent); full borne/bonus wiring is a later kit task

export type PlanError =
  | "notFighting" | "emptyPlan" | "badIndex" | "deadMember" | "memberReused"
  | "strangerReused" | "groupTooBig" | "twoVsTwo" | "backerNotCaster"
  | "backerNoFront" | "spectreNeedsMagic" | "demonNeedsMagic" | "mustEngageAll";

const living = (state: GameState, i: number): boolean => {
  const m = state.party[i];
  return !!m && (m.status === 0 || m.status === 1);
};

/** A Man/Woman/Hero/W-Hero bearing the Magic Sword may fight a Spectre hand-to-hand (§Spectre). */
const canSwordSpectre = (state: GameState, m: PartyMember): boolean =>
  !eyeActive(state) && m.treasure.includes(T_MAGIC_SWORD) && [0, 1, 5, 6].includes(m.creatureId);

/** Any bearer of the Magic Axe may fight a Demon hand-to-hand, even with mp 0 — no species
 *  restriction, unlike the Sword's Spectre precedent (design US-13/US-24, SC-EXT-21). */
const canAxeDemon = (state: GameState, m: PartyMember): boolean =>
  !eyeActive(state) && m.treasure.includes(T_MAGIC_AXE);

const MAGIC_ONLY_IDS = [C_SPECTRE, C_DEMON];

/** Does `m` have the enabling artifact for the specific magic-only foe `sid` (Sword for a
 *  Spectre, Axe for a Demon)? Only meaningful when `sid` is one of `MAGIC_ONLY_IDS`. */
const magicOnlyBypass = (state: GameState, m: PartyMember, sid: number): boolean =>
  sid === C_SPECTRE ? canSwordSpectre(state, m) : sid === C_DEMON ? canAxeDemon(state, m) : false;

/** Can the party engage this stranger at all this round? (Always, unless it is an un-fightable
 *  magic-only foe — a Spectre or a Demon, SC-EXT-21.) */
const engageable = (state: GameState, sIdx: number): boolean => {
  const sid = state.strangers[sIdx]!;
  if (!MAGIC_ONLY_IDS.includes(sid)) return true;
  return state.party.some((m, i) => living(state, i) && (casterMP(m, state) > 0 || magicOnlyBypass(state, m, sid)));
};

/** Validate a player's battle plan against the §FIGHTS pairing rules. */
export function validatePlan(state: GameState, plan: BattlePlan): { ok: true } | { ok: false; reason: PlanError } {
  if (state.phase !== "fight") return { ok: false, reason: "notFighting" };
  const matches = plan.matches ?? [];
  if (matches.length === 0) {
    // A forced round with nothing to engage: every remaining stranger is an un-fightable magic-only
    // foe (a Spectre, or a Demon — SC-EXT-21) and the party has no magic (or enabling artifact) to
    // pit against it. The round is still fought — the strongest member is matched against it and
    // automatically slain (§Spectre; the Demon follows the same rule, Resolved-6). Allowing the
    // empty plan lets the player proceed instead of deadlocking when retreat is also blocked.
    const mustSufferMagicOnly = state.strangers.length > 0 && state.strangers.every((_, s) => !engageable(state, s));
    if (mustSufferMagicOnly) return { ok: true };
    return { ok: false, reason: "emptyPlan" };
  }

  const usedParty = new Set<number>();
  const usedStranger = new Set<number>();

  for (const mt of matches) {
    const front = mt.front ?? [], backers = mt.backers ?? [], strangers = mt.strangers ?? [];
    if (front.length === 0 && backers.length > 0) return { ok: false, reason: "backerNoFront" };
    if (front.length < 1 || front.length > 2) return { ok: false, reason: "groupTooBig" };
    if (strangers.length < 1 || strangers.length > 2) return { ok: false, reason: "groupTooBig" };
    if (front.length === 2 && strangers.length === 2) return { ok: false, reason: "twoVsTwo" };

    for (const i of [...front, ...backers]) {
      if (!Number.isInteger(i) || i < 0 || i >= state.party.length) return { ok: false, reason: "badIndex" };
      if (!living(state, i)) return { ok: false, reason: "deadMember" };
      if (usedParty.has(i)) return { ok: false, reason: "memberReused" };
      usedParty.add(i);
    }
    for (const s of strangers) {
      if (!Number.isInteger(s) || s < 0 || s >= state.strangers.length) return { ok: false, reason: "badIndex" };
      if (usedStranger.has(s)) return { ok: false, reason: "strangerReused" };
      usedStranger.add(s);
    }
    // Background eligibility is by creature TYPE (a Priest or Wizard), not current magical power — an
    // active Eye of God zeroes a caster's power but it is still a caster and may stand in the background.
    for (const i of backers) if (!isCaster(state.party[i]!)) return { ok: false, reason: "backerNotCaster" };

    for (const s of strangers) {
      const sid = state.strangers[s]!;
      if (!MAGIC_ONLY_IDS.includes(sid)) continue;
      const reason: PlanError = sid === C_DEMON ? "demonNeedsMagic" : "spectreNeedsMagic";
      for (const i of front) {
        const m = state.party[i]!;
        if (casterMP(m, state) <= 0 && !magicOnlyBypass(state, m, sid)) return { ok: false, reason };
      }
    }
  }

  // Engage-all: you must engage every stranger that a still-free, CAPABLE fighter could fight. A
  // magic-only foe (Spectre or Demon, SC-EXT-21) needs a free caster or its own enabling artifact
  // bearer; any other foe, any free fighter. This is deliberately narrower than "every engageable
  // stranger": if the only caster is already committed, a second Spectre may be left un-engaged —
  // otherwise two Spectres against a lone caster would deadlock, since no plan engages both and
  // retreat is blocked in round 1 (§Spectre, §FIGHTS).
  const canFightWithFree = (s: number) => {
    const sid = state.strangers[s]!;
    return state.party.some((m, i) => living(state, i) && !usedParty.has(i) &&
      (!MAGIC_ONLY_IDS.includes(sid) || casterMP(m, state) > 0 || magicOnlyBypass(state, m, sid)));
  };
  const unengagedFightable = state.strangers.some((_, s) => !usedStranger.has(s) && canFightWithFree(s));
  if (unengagedFightable) return { ok: false, reason: "mustEngageAll" };

  return { ok: true };
}

/** Enemy magical power, mirroring combat.ts: the Eye zeroes magic, but the Sorcerer is only reduced.
 *  Exported so the UI shows the same effective foe strength the resolver fights with. */
export function enemyMP(state: GameState, sid: number): number {
  if (sid === C_SORCERER) {
    let mp = CREATURES[C_SORCERER]!.mp;
    if (eyeActive(state)) mp -= 2;
    if (state.lotusOnSorcerer) mp -= 2;
    return Math.max(0, mp);
  }
  return eyeActive(state) ? 0 : CREATURES[sid]!.mp;
}

/** A match as it will actually be fought: the player's front + backers, the foe(s) it faces (the
 *  player's target plus any auto-attached strongest-combination foes), and the resolved strengths. */
/** A named adjustment in play this round (an artefact bonus, a curse, surprise). `value` is signed;
 *  `roll` true means it's added to the die roll (Ring/curse/surprise) rather than baked into strength. */
export interface MatchModifier { label: string; value: number; side: "party" | "enemy"; roll: boolean; }

export interface PreviewMatch {
  front: number[];     // party indices fighting hand-to-hand
  backers: number[];   // caster party indices in the background
  strangers: number[]; // foe indices: the player's target first, then any auto-attached foes
  attached: number[];  // the subset of `strangers` the engine ganged on (not chosen by the player)
  enemyBackers: number[]; // leftover enemy caster indices lending magical power from the background (§395)
  partyStr: number;
  enemyStr: number;
  modifiers: MatchModifier[]; // artefact/curse/surprise modifiers affecting this matchup
}
export interface PlanPreview {
  matches: PreviewMatch[];
  idle: number[]; // foe indices left unengaged this round (out-numbered leftovers / un-fightable magic-only foes)
}

// Extension kit (SC-EXT-21): a Demon shares the Spectre's "magic-only" shape throughout this
// preview/resolve pipeline — never auto-attached as an extra hand-to-hand foe, never folded in as
// a passive background caster, fought with magic when a front fighter has it.
const isMagicOnlyIdx = (state: GameState, sIdx: number) => MAGIC_ONLY_IDS.includes(state.strangers[sIdx]!);

/**
 * Work out how a battle plan will actually be fought: apply the §395 strongest-combination for an
 * out-numbered party (one extra hand-to-hand foe per lone fighter, strongest first; leftover enemy
 * caster MP folded into the focus match) and compute each side's strength. Pure — used both by the
 * resolver and by the fight UI so the screen shows exactly what the round will do.
 */
export function previewPlan(state: GameState, plan: BattlePlan): PlanPreview {
  const magicOnlyMatch = (ss: number[]) => ss.some((si) => isMagicOnlyIdx(state, si));
  const base = plan.matches.map((mt) => ({
    front: [...mt.front], backers: [...(mt.backers ?? [])], strangers: [...mt.strangers],
    attached: [] as number[], enemyBackers: [] as number[],
  }));

  // Strangers gang up only once the party is OUT of fighters (§395 "if he is still unable to engage
  // all the strangers"). While a living member is still free, leftover foes stay separate so the player
  // can pair one fighter to each (e.g. 2-v-2 = two 1-v-1 matches, not one fighter facing both).
  const usedParty = new Set<number>(base.flatMap((mt) => [...mt.front, ...mt.backers]));
  const hasFreeFighter = state.party.some((m, i) => (m.status === 0 || m.status === 1) && !usedParty.has(i));

  let leftoverCasterIdx: number[] = [];
  if (!hasFreeFighter) {
    const engaged = new Set<number>(base.flatMap((mt) => mt.strangers));
    const leftover = state.strangers.map((_, i) => i).filter((i) => !engaged.has(i) && !isMagicOnlyIdx(state, i));
    const extraHand = leftover.filter((i) => enemyMP(state, state.strangers[i]!) === 0)
      .sort((a, b) => CREATURES[state.strangers[b]!]!.fs - CREATURES[state.strangers[a]!]!.fs);
    // Leftover enemy casters lend their magical power from the background, strongest first (§395).
    leftoverCasterIdx = leftover.filter((i) => enemyMP(state, state.strangers[i]!) > 0)
      .sort((a, b) => enemyMP(state, state.strangers[b]!) - enemyMP(state, state.strangers[a]!));
    let ei = 0;
    for (const mt of base) {
      if (magicOnlyMatch(mt.strangers)) continue;
      if (mt.front.length === 1 && mt.strangers.length === 1 && ei < extraHand.length) {
        const x = extraHand[ei++]!;
        mt.strangers.push(x);
        mt.attached.push(x);
      }
    }
  }
  const focus = base.find((mt) => !magicOnlyMatch(mt.strangers));
  if (focus) focus.enemyBackers = leftoverCasterIdx; // the folded magic shows on the focus match

  const eye = eyeActive(state);
  const round1 = state.fight?.round === 1;
  const named = (i: number) => CREATURES[state.party[i]!.creatureId]!.name;

  const matches: PreviewMatch[] = base.map((mt) => {
    const magicOnly = magicOnlyMatch(mt.strangers);
    const memberStr = (i: number) => (magicOnly && casterMP(state.party[i]!, state) > 0 ? casterMP(state.party[i]!, state) : frontStrength(state.party[i]!, state));
    const partyStr = mt.front.reduce((s, i) => s + memberStr(i), 0) + mt.backers.reduce((s, i) => s + casterMP(state.party[i]!, state), 0);
    const enemyStr = mt.strangers.reduce((s, si) => s + CREATURES[state.strangers[si]!]!.fs + enemyMP(state, state.strangers[si]!), 0)
      + mt.enemyBackers.reduce((s, si) => s + enemyMP(state, state.strangers[si]!), 0);

    // Modifiers in play for this matchup — artefact strength bonuses (already in the totals) plus the
    // roll-time adjustments (Ring / curse / surprise) that get added to the die.
    const modifiers: MatchModifier[] = [];
    for (const i of mt.front) {
      const m = state.party[i]!, c = m.creatureId;
      if (!eye && m.treasure.includes(T_MAGIC_SWORD)) {
        const v = c === 0 || c === 1 ? 2 : c === 5 || c === 6 ? 1 : 0; // Hero/W-Hero +2, Man/Woman +1
        if (v) modifiers.push({ label: `Magic Sword · ${named(i)}`, value: v, side: "party", roll: false });
      }
      if (m.potionActive) modifiers.push({ label: `Strength Potion · ${named(i)}`, value: 2, side: "party", roll: false });
      // Dragon-slayer: +1 fighting strength per dragon felled single-handed (baked into the total) —
      // shown unless this member is fighting a magic-only foe with magic only (where FS doesn't apply).
      if (m.dragonKills > 0 && !(magicOnly && casterMP(m, state) > 0)) {
        modifiers.push({ label: `Dragon-slayer · ${named(i)}`, value: m.dragonKills, side: "party", roll: false });
      }
      // Extension kit (SC-EXT-22): the Elixir's permanent +2 fs (design US-19) — same magic-only
      // guard as Dragon-slayer above: a caster fighting a magic-only foe with its magic alone (not
      // combined frontStrength) doesn't actually draw on this bonus, so it's hidden for that matchup.
      if (m.fsBonus && !(magicOnly && casterMP(m, state) > 0)) {
        modifiers.push({ label: `Elixir · ${named(i)}`, value: m.fsBonus, side: "party", roll: false });
      }
    }
    for (const i of mt.backers) {
      const m = state.party[i]!, c = m.creatureId;
      if (!eye && m.treasure.includes(T_MAGIC_STAFF)) {
        const v = c === 4 ? 1 : c === 8 ? 2 : 0; // Priest +1, Wizard +2
        if (v) modifiers.push({ label: `Magic Staff · ${named(i)}`, value: v, side: "party", roll: false });
      }
    }
    if (!eye && state.party.some((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(T_THE_RING))) {
      modifiers.push({ label: "The Ring", value: 1, side: "party", roll: true });
    }
    const curses = activeCurses(state); // a curse has no effect once the Sorcerer is dead (§Curse)
    if (curses > 0) modifiers.push({ label: curses > 1 ? `Curse ×${curses}` : "Curse", value: -curses, side: "party", roll: true });
    if (round1 && state.fight?.surprise === 1) modifiers.push({ label: "Surprise", value: 1, side: "party", roll: true });
    if (round1 && state.fight?.surprise === -1) modifiers.push({ label: "Surprise", value: 1, side: "enemy", roll: true });
    if (eye) modifiers.push({ label: "Eye of God — magic & artefacts nullified", value: 0, side: "party", roll: false });

    return { front: mt.front, backers: mt.backers, strangers: mt.strangers, attached: mt.attached, enemyBackers: mt.enemyBackers, partyStr, enemyStr, modifiers };
  });

  const inMatch = new Set<number>(matches.flatMap((m) => [...m.strangers, ...m.enemyBackers]));
  const idle = state.strangers.map((_, i) => i).filter((i) => !inMatch.has(i));
  return { matches, idle };
}

/** Resolve one round of fighting from a validated battle plan. Mutates `state`; returns events. */
export function resolvePlannedRound(state: GameState, plan: BattlePlan): GameEvent[] {
  const fight = state.fight!;
  const events: GameEvent[] = [];
  const rollBonus = partyRollBonus(state);
  const surpriseParty = fight.round === 1 && fight.surprise === 1 ? 1 : 0;
  const surpriseEnemy = fight.round === 1 && fight.surprise === -1 ? 1 : 0;
  const killedStrangerIdx: number[] = [];
  const pendingCasualties: number[][] = [];

  // §387: members fighting hand-to-hand drop heavy treasure onto the area floor for the duration — kept
  // off them so it is not lost if they fall (reclaimed into the pickup on a win, left behind on retreat).
  // `ALL_TREASURES` (base + kit, SC-EXT-2) — a member carrying a kit heavy treasure (Crypt/Gems 21,
  // Idol 18) would otherwise crash this lookup against the base-only `TREASURES` table.
  const area = state.areas[state.partyArea]!;
  for (const mt of plan.matches) {
    for (const i of mt.front) {
      const m = state.party[i]!;
      const heavy = m.treasure.filter((t) => ALL_TREASURES[t]!.kind === "heavy");
      if (heavy.length) {
        area.contents.push(...heavy.map((t) => 200 + t));
        m.treasure = m.treasure.filter((t) => ALL_TREASURES[t]!.kind !== "heavy");
        state.fightDrops = [...(state.fightDrops ?? []), ...heavy.map((t) => ({ mi: i, tid: t }))]; // remember who dropped what
      }
    }
  }

  // The matches as they will be fought (strongest-combination + strengths).
  const { matches, idle } = previewPlan(state, plan);

  // An un-fightable, unengaged magic-only foe slays the strongest member (§Spectre; the Demon
  // follows the SAME rule, Resolved-6/SC-EXT-21). Only one slaying per round, matching the
  // original Spectre-only behaviour, even in the (untested, vanishingly rare) case where both an
  // idle Spectre AND an idle Demon are simultaneously unfightable.
  const livingParty = state.party.filter((m) => m.status === 0 || m.status === 1);
  const idleUnfightable = idle.filter((i) => {
    if (!isMagicOnlyIdx(state, i)) return false;
    const sid = state.strangers[i]!;
    return !livingParty.some((m) => casterMP(m, state) > 0 || magicOnlyBypass(state, m, sid));
  });
  if (idleUnfightable.length > 0) {
    let strongest: PartyMember | undefined;
    for (const m of livingParty) if (!strongest || frontStrength(m, state) > frontStrength(strongest, state)) strongest = m;
    if (strongest) {
      if (ringInvincible(strongest, state)) events.push({ type: "deathPrevented", creatureId: strongest.creatureId });
      else {
        strongest.status = 3;
        const culpritSid = state.strangers[idleUnfightable[0]!]!;
        events.push(
          { type: culpritSid === C_DEMON ? "demonSlew" : "spectreSlew", creatureId: strongest.creatureId },
          ...eyeForsakenByDeath(state, strongest),
        );
      }
    }
  }

  // Resolve each match (one die per side).
  for (const mt of matches) {
    const front = mt.front.map((i) => state.party[i]!);
    const pr = rollDie(state.seed); state.seed = pr.seed;
    const er = rollDie(state.seed); state.seed = er.seed;
    const partyTotal = mt.partyStr + pr.value + rollBonus + surpriseParty;
    const enemyTotal = mt.enemyStr + er.value + surpriseEnemy;
    events.push({
      type: "combatRoll",
      party: mt.front.concat(mt.backers).map((i) => CREATURES[state.party[i]!.creatureId]!.name).join(" + "),
      enemy: mt.strangers.map((si) => CREATURES[state.strangers[si]!]!.name).join(" + "),
      partyRoll: pr.value, enemyRoll: er.value, partyTotal, enemyTotal,
      result: partyTotal > enemyTotal ? "partyWon" : enemyTotal > partyTotal ? "enemyWon" : "tie",
    });

    if (partyTotal > enemyTotal) {
      // §405: one of the foes is slain — the strongest of the match.
      const weight = (x: number) => CREATURES[state.strangers[x]!]!.fs + enemyMP(state, state.strangers[x]!);
      const victim = mt.strangers.reduce((best, si) => (weight(si) > weight(best) ? si : best), mt.strangers[0]!);
      const sid = state.strangers[victim]!;
      killedStrangerIdx.push(victim);
      // Single-handed = one front fighter, the lone Dragon, and NO caster backer lending magic.
      if (sid === C_DRAGON && front.length === 1 && mt.backers.length === 0 && mt.strangers.length === 1) front[0]!.dragonKills += 1;
      events.push({ type: "strangerKilled", creatureId: sid });
      // Felling the Sorcerer himself is the campaign's crowning feat: record it (worth 30 at scoring)
      // and announce it so the UI can give the party a hero's congratulations (§"The Sorcerer").
      // Extension kit (SC-EXT-20): this is also the ONE moment his death fires — every Apprentice
      // ally's loyalty breaks right here (design US-14/Resolved-7). Appending her reversion to
      // `state.strangers` here (mid-loop, before `killedStrangerIdx` is spliced below) is safe:
      // `killedStrangerIdx` only ever holds indices from the PRE-round array, all strictly less
      // than any index a push appends at the end.
      if (sid === C_SORCERER) {
        state.sorcererKilled = true;
        events.push({ type: "sorcererSlain" }, ...revertApprenticesOnSorcererDeath(state));
      }
    } else if (enemyTotal > partyTotal) {
      const mortal = front.filter((m) => !ringInvincible(m, state));
      if (mortal.length === 0) events.push({ type: "deathPrevented", creatureId: front[0]!.creatureId });
      else if (mortal.length === 1) { mortal[0]!.status = 3; events.push({ type: "memberDied", creatureId: mortal[0]!.creatureId }, ...eyeForsakenByDeath(state, mortal[0]!)); }
      else pendingCasualties.push(mortal.map((m) => state.party.indexOf(m)));
    }
    // tie: no death
  }

  killedStrangerIdx.sort((a, b) => b - a).forEach((i) => state.strangers.splice(i, 1));
  fight.round += 1;
  if (pendingCasualties.length > 0) fight.casualtyQueue = pendingCasualties;
  return events;
}
