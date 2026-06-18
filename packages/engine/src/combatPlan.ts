import { rollDie } from "./rng";
import { CREATURES } from "./data/creatures";
import { TREASURES } from "./data/treasures";
import { frontStrength, casterMP, partyRollBonus } from "./combat";
import { eyeActive, ringInvincible } from "./effects";
import type { GameState, PartyMember, BattlePlan } from "./state";
import type { GameEvent } from "./actions";

const C_SPECTRE = 9;
const C_DRAGON = 10;
const C_SORCERER = 11;
const T_MAGIC_SWORD = 3;

export type PlanError =
  | "notFighting" | "emptyPlan" | "badIndex" | "deadMember" | "memberReused"
  | "strangerReused" | "groupTooBig" | "twoVsTwo" | "backerNotCaster"
  | "spectreNeedsMagic" | "mustEngageAll";

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
  if (matches.length === 0) return { ok: false, reason: "emptyPlan" };

  const usedParty = new Set<number>();
  const usedStranger = new Set<number>();

  for (const mt of matches) {
    const front = mt.front ?? [], backers = mt.backers ?? [], strangers = mt.strangers ?? [];
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

/** Resolve one round of fighting from a validated battle plan. Mutates `state`; returns events. */
export function resolvePlannedRound(state: GameState, plan: BattlePlan): GameEvent[] {
  const fight = state.fight!;
  const events: GameEvent[] = [];
  const rollBonus = partyRollBonus(state);
  const surpriseParty = fight.round === 1 && fight.surprise === 1 ? 1 : 0;
  const surpriseEnemy = fight.round === 1 && fight.surprise === -1 ? 1 : 0;
  const killedStrangerIdx: number[] = [];
  const pendingCasualties: number[][] = [];
  const isSpectre = (sIdx: number) => state.strangers[sIdx] === C_SPECTRE;
  const spectreMatch = (strangers: number[]) => strangers.some(isSpectre);

  // 1) working copy of the plan's matches
  const matches = plan.matches.map((mt) => ({ front: [...mt.front], backers: [...(mt.backers ?? [])], strangers: [...mt.strangers] }));

  // §387: members fighting hand-to-hand drop heavy treasure onto the area floor for the duration — kept
  // off them so it is not lost if they fall (reclaimed into the pickup on a win, left behind on retreat).
  const area = state.areas[state.partyArea]!;
  for (const mt of matches) {
    for (const i of mt.front) {
      const m = state.party[i]!;
      const heavy = m.treasure.filter((t) => TREASURES[t]!.kind === "heavy");
      if (heavy.length) {
        area.contents.push(...heavy.map((t) => 200 + t));
        m.treasure = m.treasure.filter((t) => TREASURES[t]!.kind !== "heavy");
      }
    }
  }

  // 2) out-numbered → form the strangers' strongest combination (§395): add one extra hand-to-hand foe
  //    to each lone-fighter corporeal match, and fold leftover enemy caster MP into the first such match.
  const engaged = new Set<number>(matches.flatMap((mt) => mt.strangers));
  const leftover = state.strangers.map((_, i) => i).filter((i) => !engaged.has(i) && !isSpectre(i));
  const extraHand = leftover.filter((i) => enemyMP(state, state.strangers[i]!) === 0)
    .sort((a, b) => CREATURES[state.strangers[b]!]!.fs - CREATURES[state.strangers[a]!]!.fs);
  const leftoverCasterMP = leftover.filter((i) => enemyMP(state, state.strangers[i]!) > 0)
    .reduce((sum, i) => sum + enemyMP(state, state.strangers[i]!), 0);
  let ei = 0;
  for (const mt of matches) {
    if (spectreMatch(mt.strangers)) continue;
    if (mt.front.length === 1 && mt.strangers.length === 1 && ei < extraHand.length) mt.strangers.push(extraHand[ei++]!);
  }
  const focusCorporeal = matches.find((mt) => !spectreMatch(mt.strangers));

  // 3) an un-fightable, unengaged Spectre slays the strongest member (§Spectre)
  const engagedNow = new Set<number>(matches.flatMap((mt) => mt.strangers));
  const spectreLoose = state.strangers.some((_, i) => isSpectre(i) && !engagedNow.has(i));
  if (spectreLoose) {
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

  // 4) resolve each match (one die per side)
  for (const mt of matches) {
    const spectre = spectreMatch(mt.strangers);
    const front = mt.front.map((i) => state.party[i]!);
    const backers = mt.backers.map((i) => state.party[i]!);
    // Casters fighting a Spectre contribute MP; everyone else contributes front strength.
    const memberStr = (m: PartyMember) => (spectre && casterMP(m, state) > 0 ? casterMP(m, state) : frontStrength(m, state));
    const partyStr = front.reduce((s, m) => s + memberStr(m), 0) + backers.reduce((s, m) => s + casterMP(m, state), 0);
    let enemyStr = mt.strangers.reduce((s, si) => s + CREATURES[state.strangers[si]!]!.fs + enemyMP(state, state.strangers[si]!), 0);
    if (mt === focusCorporeal) enemyStr += leftoverCasterMP;

    const pr = rollDie(state.seed); state.seed = pr.seed;
    const er = rollDie(state.seed); state.seed = er.seed;
    const partyTotal = partyStr + pr.value + rollBonus + surpriseParty;
    const enemyTotal = enemyStr + er.value + surpriseEnemy;
    events.push({
      type: "combatRoll",
      party: front.concat(backers).map((m) => CREATURES[m.creatureId]!.name).join(" + "),
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
      if (sid === C_DRAGON && front.length === 1 && mt.strangers.length === 1) front[0]!.dragonKills += 1;
      events.push({ type: "strangerKilled", creatureId: sid });
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
