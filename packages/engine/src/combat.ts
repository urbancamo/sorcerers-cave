import { rollDie } from "./rng";
import { CREATURES } from "./data/creatures";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

const T_MAGIC_SWORD = 3;
const T_MAGIC_STAFF = 9;
const T_THE_RING = 10;

export function isCaster(member: PartyMember): boolean {
  return CREATURES[member.creatureId]!.mp > 0;
}

function holds(member: PartyMember, treasureId: number): boolean {
  return member.treasure.includes(treasureId);
}

/** Front-line fighting strength: FS + dragon-kills + Magic Sword bonus (spec §9.3). */
export function frontStrength(member: PartyMember): number {
  const c = CREATURES[member.creatureId]!;
  let s = c.fs + member.dragonKills;
  if (holds(member, T_MAGIC_SWORD)) {
    if (member.creatureId === 0 || member.creatureId === 1) s += 2; // Hero / W-Hero
    else if (member.creatureId === 5 || member.creatureId === 6) s += 1; // Man / Woman
  }
  return s;
}

/** Background magical power a caster contributes: MP + Magic Staff bonus (spec §9.3). */
export function casterMP(member: PartyMember): number {
  const c = CREATURES[member.creatureId]!;
  let mp = c.mp;
  if (holds(member, T_MAGIC_STAFF)) {
    if (member.creatureId === 4) mp += 1; // Priest
    else if (member.creatureId === 8) mp += 2; // Wizard
  }
  return mp;
}

/** Bonus added to every PARTY die roll this fight: +1 if any living member holds The Ring, minus curses. */
export function partyRollBonus(state: GameState): number {
  const ring = state.party.some((m) => (m.status === 0 || m.status === 1) && holds(m, T_THE_RING));
  return (ring ? 1 : 0) - state.curses;
}

const C_SPECTRE = 9;
const C_DRAGON = 10;

function livingParty(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
}

/** Resolve one round of the current fight (spec §9). Mutates state; returns events. */
export function resolveRound(state: GameState): GameEvent[] {
  const fight = state.fight!;
  const events: GameEvent[] = [];

  // --- Spectre auto-slay: a Spectre the party can't engage kills the strongest member each round.
  const hasSpectre = state.strangers.includes(C_SPECTRE);
  const party = livingParty(state);
  const partyHasMP = party.some((m) => casterMP(m) > 0);
  const partyHasSword = party.some((m) => m.treasure.includes(T_MAGIC_SWORD));
  const spectreUnfightable = hasSpectre && !partyHasMP && !partyHasSword;
  if (spectreUnfightable) {
    let strongest: PartyMember | undefined;
    for (const m of party) if (!strongest || frontStrength(m) > frontStrength(strongest)) strongest = m;
    if (strongest) {
      strongest.status = 3;
      events.push({ type: "spectreSlew", creatureId: strongest.creatureId });
    }
  }

  // --- Pairing (focus-fire). Strangers fightable this round (exclude an unfightable Spectre).
  const eligible: number[] = [];
  state.strangers.forEach((id, idx) => {
    if (spectreUnfightable && id === C_SPECTRE) return;
    eligible.push(idx);
  });
  const fighters = livingParty(state); // re-read (a spectre may have slain one)
  if (fighters.length === 0 || eligible.length === 0) {
    fight.round += 1;
    return events;
  }
  const nonCasters = fighters.filter((m) => !isCaster(m));
  const frontFighters = nonCasters.length > 0
    ? nonCasters
    : fighters; // if no non-casters, casters fight hand-to-hand
  const casters = fighters.filter((m) => isCaster(m) && !frontFighters.includes(m));
  const casterMPTotal = casters.reduce((sum, m) => sum + casterMP(m), 0);

  const focusIdx = eligible.includes(fight.focus) ? fight.focus : eligible[0]!;
  const order = [focusIdx, ...eligible.filter((i) => i !== focusIdx)];
  const matches = new Map<number, PartyMember[]>();
  frontFighters.forEach((f, i) => {
    const target = i < order.length ? order[i]! : focusIdx; // extras gang the focus
    const existing = matches.get(target);
    if (existing) {
      existing.push(f);
    } else {
      matches.set(target, [f]);
    }
  });
  // Unmatched eligible strangers fold their strength into the focus enemy.
  const unmatchedStrength = eligible
    .filter((i) => !matches.has(i))
    .reduce((sum, i) => sum + CREATURES[state.strangers[i]!]!.fs + CREATURES[state.strangers[i]!]!.mp, 0);

  // --- Resolve each match. Collect outcomes, then apply (so indices stay valid during rolls).
  const killedStrangerIdx: number[] = [];
  const rollBonus = partyRollBonus(state);
  for (const [sIdx, group] of matches) {
    const sid = state.strangers[sIdx]!;
    let enemyStr = CREATURES[sid]!.fs + CREATURES[sid]!.mp;
    let partyStr = group.reduce((sum, m) => sum + frontStrength(m), 0);
    if (sIdx === focusIdx) {
      enemyStr += unmatchedStrength;
      partyStr += casterMPTotal;
    }
    const pr = rollDie(state.seed); state.seed = pr.seed;
    const er = rollDie(state.seed); state.seed = er.seed;
    const partyTotal = partyStr + pr.value + rollBonus + (fight.round === 1 && fight.surprise === 1 ? 1 : 0);
    const enemyTotal = enemyStr + er.value + (fight.round === 1 && fight.surprise === -1 ? 1 : 0);

    if (partyTotal > enemyTotal) {
      killedStrangerIdx.push(sIdx);
      if (sid === C_DRAGON && group.length === 1) group[0]!.dragonKills += 1; // single-handed slayer
      events.push({ type: "strangerKilled", creatureId: sid });
    } else if (enemyTotal > partyTotal) {
      let weakest: PartyMember | undefined;
      for (const m of group) if (!weakest || frontStrength(m) < frontStrength(weakest)) weakest = m;
      if (weakest) { weakest.status = 3; events.push({ type: "memberDied", creatureId: weakest.creatureId }); }
    }
    // tie: no death
  }

  // Apply stranger removals (highest index first so earlier indices stay valid).
  killedStrangerIdx.sort((a, b) => b - a).forEach((i) => state.strangers.splice(i, 1));
  fight.round += 1;
  return events;
}
