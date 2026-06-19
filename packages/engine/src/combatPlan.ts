import { rollDie } from "./rng";
import { CREATURES } from "./data/creatures";
import { TREASURES } from "./data/treasures";
import { frontStrength, casterMP, partyRollBonus } from "./combat";
import { eyeActive, ringInvincible, activeCurses } from "./effects";
import type { GameState, PartyMember, BattlePlan } from "./state";
import type { GameEvent } from "./actions";

const C_SPECTRE = 9;
const C_DRAGON = 10;
const C_SORCERER = 11;
const T_MAGIC_SWORD = 3;
const T_MAGIC_STAFF = 9;
const T_THE_RING = 10;

export type PlanError =
  | "notFighting" | "emptyPlan" | "badIndex" | "deadMember" | "memberReused"
  | "strangerReused" | "groupTooBig" | "twoVsTwo" | "backerNotCaster"
  | "backerNoFront" | "spectreNeedsMagic" | "mustEngageAll";

const living = (state: GameState, i: number): boolean => {
  const m = state.party[i];
  return !!m && (m.status === 0 || m.status === 1);
};

/** A Man/Woman/Hero/W-Hero bearing the Magic Sword may fight a Spectre hand-to-hand (§Spectre). */
const canSwordSpectre = (state: GameState, m: PartyMember): boolean =>
  !eyeActive(state) && m.treasure.includes(T_MAGIC_SWORD) && [0, 1, 5, 6].includes(m.creatureId);

/** Can the party engage this stranger at all this round? (Always, unless it is an un-fightable Spectre.) */
const engageable = (state: GameState, sIdx: number): boolean => {
  if (state.strangers[sIdx] !== C_SPECTRE) return true;
  return state.party.some((m, i) => living(state, i) && (casterMP(m, state) > 0 || canSwordSpectre(state, m)));
};

/** Validate a player's battle plan against the §FIGHTS pairing rules. */
export function validatePlan(state: GameState, plan: BattlePlan): { ok: true } | { ok: false; reason: PlanError } {
  if (state.phase !== "fight") return { ok: false, reason: "notFighting" };
  const matches = plan.matches ?? [];
  if (matches.length === 0) {
    // A forced round with nothing to engage: every remaining stranger is an un-fightable Spectre and the
    // party has no magic to pit against it. The round is still fought — the strongest member is matched
    // against the Spectre and automatically slain (§Spectre). Allowing the empty plan lets the player
    // proceed instead of deadlocking when retreat is also blocked.
    const mustSufferSpectre = state.strangers.length > 0 && state.strangers.every((_, s) => !engageable(state, s));
    if (mustSufferSpectre) return { ok: true };
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
    for (const i of backers) if (casterMP(state.party[i]!, state) <= 0) return { ok: false, reason: "backerNotCaster" };

    if (strangers.some((s) => state.strangers[s] === C_SPECTRE)) {
      for (const i of front) {
        const m = state.party[i]!;
        if (casterMP(m, state) <= 0 && !canSwordSpectre(state, m)) return { ok: false, reason: "spectreNeedsMagic" };
      }
    }
  }

  // Engage-all: every engageable stranger must be engaged unless every living fighter is already committed.
  const allCommitted = state.party.every((_, i) => !living(state, i) || usedParty.has(i));
  const unengagedEngageable = state.strangers.some((_, s) => !usedStranger.has(s) && engageable(state, s));
  if (unengagedEngageable && !allCommitted) return { ok: false, reason: "mustEngageAll" };

  return { ok: true };
}

/** Enemy magical power, mirroring combat.ts: the Eye zeroes magic, but the Sorcerer is only reduced. */
function enemyMP(state: GameState, sid: number): number {
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
  idle: number[]; // foe indices left unengaged this round (out-numbered leftovers / un-fightable spectres)
}

const isSpectreIdx = (state: GameState, sIdx: number) => state.strangers[sIdx] === C_SPECTRE;

/**
 * Work out how a battle plan will actually be fought: apply the §395 strongest-combination for an
 * out-numbered party (one extra hand-to-hand foe per lone fighter, strongest first; leftover enemy
 * caster MP folded into the focus match) and compute each side's strength. Pure — used both by the
 * resolver and by the fight UI so the screen shows exactly what the round will do.
 */
export function previewPlan(state: GameState, plan: BattlePlan): PlanPreview {
  const spectreMatch = (ss: number[]) => ss.some((si) => isSpectreIdx(state, si));
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
    const leftover = state.strangers.map((_, i) => i).filter((i) => !engaged.has(i) && !isSpectreIdx(state, i));
    const extraHand = leftover.filter((i) => enemyMP(state, state.strangers[i]!) === 0)
      .sort((a, b) => CREATURES[state.strangers[b]!]!.fs - CREATURES[state.strangers[a]!]!.fs);
    // Leftover enemy casters lend their magical power from the background, strongest first (§395).
    leftoverCasterIdx = leftover.filter((i) => enemyMP(state, state.strangers[i]!) > 0)
      .sort((a, b) => enemyMP(state, state.strangers[b]!) - enemyMP(state, state.strangers[a]!));
    let ei = 0;
    for (const mt of base) {
      if (spectreMatch(mt.strangers)) continue;
      if (mt.front.length === 1 && mt.strangers.length === 1 && ei < extraHand.length) {
        const x = extraHand[ei++]!;
        mt.strangers.push(x);
        mt.attached.push(x);
      }
    }
  }
  const focus = base.find((mt) => !spectreMatch(mt.strangers));
  if (focus) focus.enemyBackers = leftoverCasterIdx; // the folded magic shows on the focus match

  const eye = eyeActive(state);
  const round1 = state.fight?.round === 1;
  const named = (i: number) => CREATURES[state.party[i]!.creatureId]!.name;

  const matches: PreviewMatch[] = base.map((mt) => {
    const spectre = spectreMatch(mt.strangers);
    const memberStr = (i: number) => (spectre && casterMP(state.party[i]!, state) > 0 ? casterMP(state.party[i]!, state) : frontStrength(state.party[i]!, state));
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
      // shown unless this member is fighting a Spectre with magic only (where FS doesn't apply).
      if (m.dragonKills > 0 && !(spectre && casterMP(m, state) > 0)) {
        modifiers.push({ label: `Dragon-slayer · ${named(i)}`, value: m.dragonKills, side: "party", roll: false });
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
  const area = state.areas[state.partyArea]!;
  for (const mt of plan.matches) {
    for (const i of mt.front) {
      const m = state.party[i]!;
      const heavy = m.treasure.filter((t) => TREASURES[t]!.kind === "heavy");
      if (heavy.length) {
        area.contents.push(...heavy.map((t) => 200 + t));
        m.treasure = m.treasure.filter((t) => TREASURES[t]!.kind !== "heavy");
        state.fightDrops = [...(state.fightDrops ?? []), ...heavy.map((t) => ({ mi: i, tid: t }))]; // remember who dropped what
      }
    }
  }

  // The matches as they will be fought (strongest-combination + strengths).
  const { matches, idle } = previewPlan(state, plan);

  // An un-fightable, unengaged Spectre slays the strongest member (§Spectre).
  if (idle.some((i) => isSpectreIdx(state, i))) {
    const party = state.party.filter((m) => m.status === 0 || m.status === 1);
    const canEngage = party.some((m) => casterMP(m, state) > 0 || canSwordSpectre(state, m));
    if (!canEngage) {
      let strongest: PartyMember | undefined;
      for (const m of party) if (!strongest || frontStrength(m, state) > frontStrength(strongest, state)) strongest = m;
      if (strongest) {
        if (ringInvincible(strongest, state)) events.push({ type: "deathPrevented", creatureId: strongest.creatureId });
        else { strongest.status = 3; events.push({ type: "spectreSlew", creatureId: strongest.creatureId }); }
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
      if (sid === C_SORCERER) { state.sorcererKilled = true; events.push({ type: "sorcererSlain" }); }
    } else if (enemyTotal > partyTotal) {
      const mortal = front.filter((m) => !ringInvincible(m, state));
      if (mortal.length === 0) events.push({ type: "deathPrevented", creatureId: front[0]!.creatureId });
      else if (mortal.length === 1) { mortal[0]!.status = 3; events.push({ type: "memberDied", creatureId: mortal[0]!.creatureId }); }
      else pendingCasualties.push(mortal.map((m) => state.party.indexOf(m)));
    }
    // tie: no death
  }

  killedStrangerIdx.sort((a, b) => b - a).forEach((i) => state.strangers.splice(i, 1));
  fight.round += 1;
  if (pendingCasualties.length > 0) fight.casualtyQueue = pendingCasualties;
  return events;
}
