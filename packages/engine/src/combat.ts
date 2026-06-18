import { rollDie } from "./rng";
import { CREATURES } from "./data/creatures";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";
import { eyeActive, ringInvincible } from "./effects";

const T_MAGIC_SWORD = 3;
const T_MAGIC_STAFF = 9;
const T_THE_RING = 10;

export function isCaster(member: PartyMember): boolean {
  return CREATURES[member.creatureId]!.mp > 0;
}

function holds(member: PartyMember, treasureId: number): boolean {
  return member.treasure.includes(treasureId);
}

/** Front-line fighting strength: FS + dragon-kills + Magic Sword bonus (spec §9.3). The Eye nullifies artefacts. */
export function frontStrength(member: PartyMember, state?: GameState): number {
  const c = CREATURES[member.creatureId]!;
  let s = c.fs + member.dragonKills;
  const artefactsPowerless = state ? eyeActive(state) : false;
  if (!artefactsPowerless && holds(member, T_MAGIC_SWORD)) {
    if (member.creatureId === 0 || member.creatureId === 1) s += 2; // Hero / W-Hero
    else if (member.creatureId === 5 || member.creatureId === 6) s += 1; // Man / Woman
  }
  if (member.potionActive) s += 2; // Strength Potion (consumable; not nullified by the Eye)
  return s;
}

/** Background magical power a caster contributes: MP + Magic Staff bonus (spec §9.3). The Eye zeroes all magic. */
export function casterMP(member: PartyMember, state?: GameState): number {
  if (state && eyeActive(state)) return 0; // the Eye renders all magic powerless (§ Eye of God)
  const c = CREATURES[member.creatureId]!;
  let mp = c.mp;
  if (holds(member, T_MAGIC_STAFF)) {
    if (member.creatureId === 4) mp += 1; // Priest
    else if (member.creatureId === 8) mp += 2; // Wizard
  }
  return mp;
}

/** Bonus added to every PARTY die roll this fight: +1 if any living member holds The Ring (Eye negates it), minus curses. */
export function partyRollBonus(state: GameState): number {
  const ring = !eyeActive(state) && state.party.some((m) => (m.status === 0 || m.status === 1) && holds(m, T_THE_RING));
  return (ring ? 1 : 0) - state.curses;
}

const C_SPECTRE = 9;
const C_DRAGON = 10;
const C_SORCERER = 11;

function livingParty(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
}

/** Resolve one round of the current fight (spec §9). Mutates state; returns events. */
export function resolveRound(state: GameState): GameEvent[] {
  const fight = state.fight!;
  const events: GameEvent[] = [];
  // The Eye nullifies enemy magic outright — but the Sorcerer is too powerful: the Eye, and Lotus
  // Dust, EACH reduce his Strength by only 2 (Sorcerer card text), never to zero.
  const enemyMP = (sid: number): number => {
    if (sid === C_SORCERER) {
      let mp = CREATURES[sid]!.mp;
      if (eyeActive(state)) mp -= 2;
      if (state.lotusOnSorcerer) mp -= 2;
      return Math.max(0, mp);
    }
    return eyeActive(state) ? 0 : CREATURES[sid]!.mp;
  };

  // A Spectre is not of flesh and blood (§ Spectre): it can be fought ONLY with magical power — a
  // Priest's or Wizard's MP — or, failing a caster, by a Man/Woman/Hero/W-Hero bearing the Magic
  // Sword. Ordinary hand-to-hand fighters can never harm it.
  const canSwordSpectre = (m: PartyMember): boolean =>
    !eyeActive(state) && m.treasure.includes(T_MAGIC_SWORD) && [0, 1, 5, 6].includes(m.creatureId);

  // --- Spectre auto-slay: a Spectre the party can't engage at all kills the strongest member each round.
  const hasSpectre = state.strangers.includes(C_SPECTRE);
  const party = livingParty(state);
  const partyHasMP = party.some((m) => casterMP(m, state) > 0);
  const partyHasSword = party.some(canSwordSpectre);
  const spectreUnfightable = hasSpectre && !partyHasMP && !partyHasSword;
  if (spectreUnfightable) {
    let strongest: PartyMember | undefined;
    for (const m of party) if (!strongest || frontStrength(m, state) > frontStrength(strongest, state)) strongest = m;
    if (strongest) {
      if (ringInvincible(strongest, state)) {
        events.push({ type: "deathPrevented", creatureId: strongest.creatureId });
      } else {
        strongest.status = 3;
        events.push({ type: "spectreSlew", creatureId: strongest.creatureId });
      }
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

  const rollBonus = partyRollBonus(state);
  const surpriseParty = fight.round === 1 && fight.surprise === 1 ? 1 : 0;
  const surpriseEnemy = fight.round === 1 && fight.surprise === -1 ? 1 : 0;
  // Collect outcomes, then apply removals after (so indices stay valid during rolls).
  const killedStrangerIdx: number[] = [];
  const pendingCasualties: number[][] = []; // pairs (party indices) whose casualty the player picks

  // Resolve one stranger match: roll, surface both dice, and apply the kill / death / casualty.
  // `partyStr` is the group's pooled strength against this foe (front strength, or MP vs a Spectre).
  const resolveMatch = (group: PartyMember[], sIdx: number, partyStr: number, enemyStr: number): void => {
    const sid = state.strangers[sIdx]!;
    const pr = rollDie(state.seed); state.seed = pr.seed;
    const er = rollDie(state.seed); state.seed = er.seed;
    const partyTotal = partyStr + pr.value + rollBonus + surpriseParty;
    const enemyTotal = enemyStr + er.value + surpriseEnemy;
    events.push({
      type: "combatRoll",
      party: group.map((m) => CREATURES[m.creatureId]!.name).join(" + "),
      enemy: CREATURES[sid]!.name,
      partyRoll: pr.value,
      enemyRoll: er.value,
      partyTotal,
      enemyTotal,
      result: partyTotal > enemyTotal ? "partyWon" : enemyTotal > partyTotal ? "enemyWon" : "tie",
    });
    if (partyTotal > enemyTotal) {
      killedStrangerIdx.push(sIdx);
      if (sid === C_DRAGON && group.length === 1) group[0]!.dragonKills += 1; // single-handed slayer
      events.push({ type: "strangerKilled", creatureId: sid });
    } else if (enemyTotal > partyTotal) {
      // The Ring makes its bearer invincible; the death falls on a mortal member.
      const mortal = group.filter((m) => !ringInvincible(m, state));
      if (mortal.length === 0) {
        events.push({ type: "deathPrevented", creatureId: group[0]!.creatureId });
      } else if (mortal.length === 1) {
        mortal[0]!.status = 3;
        events.push({ type: "memberDied", creatureId: mortal[0]!.creatureId });
      } else {
        // Two members lost together — the player chooses which falls (resolved after the round).
        pendingCasualties.push(mortal.map((m) => state.party.indexOf(m)));
      }
    }
    // tie: no death
  };

  // --- Spectre match: pit the party's magical contingent against ONE Spectre this round (the focus
  // Spectre if the player aimed there, else the first). Prefer casters (magical power only); a
  // sword-bearer takes it on only when the party has no caster. These members are reserved — they
  // never join the hand-to-hand matches, and a caster fighting the Spectre is "otherwise engaged",
  // so it no longer supports the front line.
  const reserved = new Set<PartyMember>();
  let engagedSpectre = -1;
  const spectreIdxs = eligible.filter((i) => state.strangers[i] === C_SPECTRE);
  if (spectreIdxs.length > 0) {
    engagedSpectre = spectreIdxs.includes(fight.focus) ? fight.focus : spectreIdxs[0]!;
    const casters = fighters.filter((m) => casterMP(m, state) > 0);
    const group = casters.length > 0
      ? casters
      : fighters.filter(canSwordSpectre).sort((a, b) => frontStrength(b, state) - frontStrength(a, state)).slice(0, 1);
    group.forEach((m) => reserved.add(m));
    if (group.length > 0) {
      // Casters contribute magical power only; a sword-bearer contributes front strength.
      const partyStr = group.reduce((s, m) => s + (casterMP(m, state) > 0 ? casterMP(m, state) : frontStrength(m, state)), 0);
      resolveMatch(group, engagedSpectre, partyStr, CREATURES[C_SPECTRE]!.fs + enemyMP(C_SPECTRE));
    }
  }

  // --- Corporeal foes: ordinary focus-fire with the fighters NOT reserved to the Spectre. Any extra
  // Spectres beyond the one engaged are left for a later round (only one magic contingent per round).
  const corporealIdxs = eligible.filter((i) => state.strangers[i] !== C_SPECTRE);
  const available = fighters.filter((m) => !reserved.has(m));
  if (corporealIdxs.length > 0 && available.length > 0) {
    const nonCasters = available.filter((m) => !isCaster(m));
    const frontFighters = nonCasters.length > 0
      ? nonCasters
      : available; // if no non-casters, casters fight hand-to-hand
    const casters = available.filter((m) => isCaster(m) && !frontFighters.includes(m));
    const casterMPTotal = casters.reduce((sum, m) => sum + casterMP(m, state), 0);

    const focusIdx = corporealIdxs.includes(fight.focus) ? fight.focus : corporealIdxs[0]!;
    const order = [focusIdx, ...corporealIdxs.filter((i) => i !== focusIdx)];
    // Pair each front fighter with a distinct stranger (focus first).
    const matches = new Map<number, PartyMember[]>();
    const primary = Math.min(frontFighters.length, order.length);
    for (let i = 0; i < primary; i++) matches.set(order[i]!, [frontFighters[i]!]);
    // Party larger: spare fighters gang existing matches, at most TWO party per stranger
    // ("send two against one"). Any beyond 2× the strangers stand idle this round.
    const spareFighters = frontFighters.slice(primary);
    for (const k of order.slice(0, primary)) {
      if (spareFighters.length === 0) break;
      if (matches.get(k)!.length < 2) matches.get(k)!.push(spareFighters.shift()!);
    }
    // Out-numbered: a fighter may be set against at most TWO strangers hand-to-hand; further
    // non-caster strangers stand idle. Unengaged stranger casters add their magical power to the
    // focus group from the background (§"Setting up the Fight").
    const matchedIdx = new Set(matches.keys());
    const unmatched = corporealIdxs.filter((i) => !matchedIdx.has(i));
    const enemyBgMP = unmatched.reduce((sum, i) => sum + enemyMP(state.strangers[i]!), 0); // non-casters add 0
    const extraFighters = unmatched
      .filter((i) => enemyMP(state.strangers[i]!) === 0) // non-caster strangers fight hand-to-hand
      .sort((a, b) => CREATURES[state.strangers[b]!]!.fs - CREATURES[state.strangers[a]!]!.fs);
    const extraForMatch = new Map<number, number>(); // one extra hand-to-hand stranger per single-fighter match
    order.filter((k) => matches.get(k)?.length === 1).forEach((k, i) => {
      const ex = extraFighters[i];
      if (ex !== undefined) extraForMatch.set(k, CREATURES[state.strangers[ex]!]!.fs);
    });

    for (const [sIdx, group] of matches) {
      const sid = state.strangers[sIdx]!;
      let enemyStr = CREATURES[sid]!.fs + enemyMP(sid) + (extraForMatch.get(sIdx) ?? 0);
      let partyStr = group.reduce((sum, m) => sum + frontStrength(m, state), 0);
      if (sIdx === focusIdx) {
        enemyStr += enemyBgMP;
        partyStr += casterMPTotal;
      }
      resolveMatch(group, sIdx, partyStr, enemyStr);
    }
  }

  // Apply stranger removals (highest index first so earlier indices stay valid).
  killedStrangerIdx.sort((a, b) => b - a).forEach((i) => state.strangers.splice(i, 1));
  fight.round += 1;
  if (pendingCasualties.length > 0) fight.casualtyQueue = pendingCasualties;
  return events;
}
