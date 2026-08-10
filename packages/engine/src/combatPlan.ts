import { rollDie } from "./rng";
// Extension kit (SC-EXT-17): aliases `ALL_CREATURES` — every dynamic lookup below indexes by an
// actual party member's or stranger's `creatureId` (never enumerates the array), so a kit ally or
// kit stranger (id 14-20) fighting no longer crashes; byte-identical for ids 0-13.
import { ALL_CREATURES as CREATURES } from "./data/creatures";
import { ALL_TREASURES } from "./data/treasures";
import { frontStrength, casterMP, partyRollBonus, isCaster } from "./combat";
import { eyeActive, ringInvincible, activeCurses, eyeForsakenByDeath, markDied, revertApprenticesOnSorcererDeath, shieldWardActive } from "./effects";
import type { GameState, PartyMember, BattlePlan } from "./state";
import type { GameEvent } from "./actions";

const C_SPECTRE = 9;
const C_DRAGON = 10;
const C_SORCERER = 11;
const C_APPRENTICE = 14; // Holy Water's WEAKEN mode also targets her (design US-20, SC-EXT-24)
// Extension kit (SC-EXT-21) — the Demon, like the Spectre, can only be touched by magic; a Magic
// Axe bearer (ANY species — design US-24, unlike the Sword-Spectre precedent below) also counts.
const C_DEMON = 15;
const T_MAGIC_SWORD = 3;
const T_MAGIC_STAFF = 9;
const T_THE_RING = 10;
const T_MAGIC_AXE = 17; // extension-kit treasure (SC-EXT-26) — mere possession is enough for the Demon predicate below; the fs bonus itself lives in combat.ts's frontStrength, mirrored here only for this file's own modifier-chip display

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

/** Extension kit (SC-EXT-27, design US-23/Resolved-15): does THIS match's own front line — not the
 *  whole party — include a live, eligible Magic Shield bearer? Pairing-scoped: only strangers
 *  slotted directly against this match's front are ever warded, never a different match's foes and
 *  never a leftover enemy caster folded in from the background (`enemyBackers`, §395) — those
 *  aren't literally "paired" against anyone. */
const matchShielded = (state: GameState, front: readonly number[]): boolean =>
  front.some((i) => { const m = state.party[i]; return !!m && shieldWardActive(state, m); });

/** The Shield's effect on one foe's mp CONTRIBUTION, given its un-warded `base` (from `enemyMP`,
 *  which folds in the Eye/Lotus Dust/Holy Water): an ordinary foe is fully nullified; the Sorcerer/
 *  Apprentice's own resistance instead takes an extra −2, floored at 0 (design US-23). EXPORTED so
 *  multi-fight.ts's PvP pairing ward (SC-EXT-35) weakens by this same arithmetic — one source. */
export const shieldedMP = (sid: number, base: number): number =>
  sid === C_SORCERER || sid === C_APPRENTICE ? Math.max(0, base - 2) : 0;

/** Bug fix 2026-08-09 (SC-EXT-40, card text): "the shield-bearer may match himself against a
 *  spectre or demon" — a live, eligible Magic Shield bearer may face EITHER magic-only foe, unlike
 *  the Sword (Spectre-only) or Axe (Demon-only) bypasses. Reuses `shieldWardActive`'s own gate
 *  (eligible class, living, no active Eye) — the Eye nullifying this too is consistent with it
 *  already nullifying the Shield's ordinary MP-ward (SC-EXT-27). */
const canShieldStalemate = (state: GameState, m: PartyMember): boolean => shieldWardActive(state, m);

/** Does `m` have the enabling artifact for the specific magic-only foe `sid` (Sword for a
 *  Spectre, Axe for a Demon, or the Shield's stalemate clause for either)? Only meaningful when
 *  `sid` is one of `MAGIC_ONLY_IDS`. */
const magicOnlyBypass = (state: GameState, m: PartyMember, sid: number): boolean =>
  (sid === C_SPECTRE && canSwordSpectre(state, m)) || (sid === C_DEMON && canAxeDemon(state, m)) || canShieldStalemate(state, m);

/** Unlike the Sword/Axe (which let their bearer fight a magic-only foe normally, win or lose), the
 *  Shield's own clause is a forced STALEMATE — "the spectre or demon is simply ignored for that
 *  round; neither it nor the shield bearer will be killed" (bug fix 2026-08-09, SC-EXT-40). True
 *  only when `m` has NO other way to touch `sid` — real magic, or the matching Sword/Axe — so
 *  pairing a Shield-bearer ALONGSIDE an actual caster/Sword/Axe-bearer in the same match still
 *  fights for real (the Shield never downgrades an otherwise-winnable fight). */
const shieldOnlyQualifies = (state: GameState, m: PartyMember, sid: number): boolean =>
  casterMP(m, state) <= 0 &&
  !(sid === C_SPECTRE && canSwordSpectre(state, m)) &&
  !(sid === C_DEMON && canAxeDemon(state, m)) &&
  canShieldStalemate(state, m);

/** Is this whole match a Magic Shield stalemate — every stranger a magic-only foe (Spectre/Demon),
 *  and EVERY front member's ability to face ALL of them coming solely from the Shield? (SC-EXT-40) */
const isShieldStalemate = (state: GameState, mt: { front: readonly number[]; strangers: readonly number[] }): boolean =>
  mt.strangers.length > 0 &&
  mt.strangers.every((si) => MAGIC_ONLY_IDS.includes(state.strangers[si]!)) &&
  mt.front.every((i) => mt.strangers.every((si) => shieldOnlyQualifies(state, state.party[i]!, state.strangers[si]!)));

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
    // Extension kit (SC-EXT-24): Holy Water's WEAKEN mode stacks with Lotus Dust/Eye exactly like
    // they already stack with each other — a separate flag, its own separate -2, summed here.
    if (state.holyWaterOnSorcerer) mp -= 2;
    return Math.max(0, mp);
  }
  // Extension kit (SC-EXT-24): the Apprentice can also be Holy-Water-weakened. The Eye nullifies her
  // magic entirely, same as any non-Sorcerer foe (she has no Sorcerer-style partial resistance) —
  // Holy Water's -2 only matters when the Eye is inactive, floored at 0 same as the Sorcerer's own.
  if (sid === C_APPRENTICE) {
    if (eyeActive(state)) return 0;
    return Math.max(0, CREATURES[C_APPRENTICE]!.mp - (state.holyWaterOnApprentice ? 2 : 0));
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
  // Extension kit (SC-EXT-27): strangers in THIS match whose mp the Magic Shield's ward actually
  // reduced (base mp>0) — already folded into `enemyStr`/`modifiers` above; also consumed by
  // `resolvePlannedRound` to fire one `shieldWarded` notice per entry.
  shieldWard: { creatureId: number; mode: "nullify" | "weaken" }[];
  // Bug fix 2026-08-09 (SC-EXT-40): true when this match's front qualifies to face its magic-only
  // foe(s) SOLELY via the Magic Shield — `resolvePlannedRound` fires `shieldStalemate` instead of
  // rolling; `partyStr`/`enemyStr` above are still computed (informational — "what it would be"),
  // but never actually contested.
  stalemate: boolean;
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
    // Bug fix 2026-08-09 (SC-EXT-40): computed BEFORE shieldWard below — a stalemate match suppresses
    // the ordinary shieldWarded notice (redundant: the round never happens at all for this match, so
    // "turns the creature's power aside" would be misleading alongside "ignored for the round").
    const stalemate = isShieldStalemate(state, mt);
    const memberStr = (i: number) => (magicOnly && casterMP(state.party[i]!, state) > 0 ? casterMP(state.party[i]!, state) : frontStrength(state.party[i]!, state));
    const partyStr = mt.front.reduce((s, i) => s + memberStr(i), 0) + mt.backers.reduce((s, i) => s + casterMP(state.party[i]!, state), 0);

    // Extension kit (SC-EXT-27): the Magic Shield's ward, pairing-scoped to THIS match's own front
    // line — never `mt.enemyBackers` (leftover enemy casters lent from the background, §395, aren't
    // literally "paired" against anyone).
    const shielded = matchShielded(state, mt.front);
    const shieldWard: { creatureId: number; mode: "nullify" | "weaken" }[] = [];
    const strangerMP = (si: number) => {
      const sid = state.strangers[si]!;
      const base = enemyMP(state, sid);
      if (!shielded || base === 0) return base; // 0 already — nothing for the ward to turn aside
      if (!stalemate) shieldWard.push({ creatureId: sid, mode: sid === C_SORCERER || sid === C_APPRENTICE ? "weaken" : "nullify" });
      return shieldedMP(sid, base);
    };
    const enemyStr = mt.strangers.reduce((s, si) => s + CREATURES[state.strangers[si]!]!.fs + strangerMP(si), 0)
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
      // Extension kit (SC-EXT-26): the Magic Axe's own bonus-table chip, mirroring the Sword's.
      if (!eye && m.treasure.includes(T_MAGIC_AXE)) {
        const v = c === 7 ? 3 : [0, 1, 5, 6].includes(c) ? 1 : 0; // Dwarf +3, Hero/W-Hero/Man/Woman +1
        if (v) modifiers.push({ label: `Magic Axe · ${named(i)}`, value: v, side: "party", roll: false });
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
    // Extension kit (SC-EXT-27): one enemy-side chip per warded stranger, mirroring the Sword/Staff
    // chips' shape but on the OTHER side of the matchup. Recomputed from `enemyMP` rather than a
    // flat -2 for the weaken mode, so the chip's value always matches the ACTUAL (floored) change
    // already folded into `enemyStr` above, even in the rare case Lotus Dust/Holy Water had already
    // brought the Sorcerer/Apprentice down near 0.
    for (const w of shieldWard) {
      const before = enemyMP(state, w.creatureId);
      modifiers.push({ label: `Magic Shield · ${CREATURES[w.creatureId]!.name}`, value: shieldedMP(w.creatureId, before) - before, side: "enemy", roll: false });
    }
    // Bug fix 2026-08-09 (SC-EXT-40): flag the standoff directly in the modifier list the fight UI
    // already renders per matchup — no FightSurface changes needed to surface it before rolling.
    if (stalemate) modifiers.push({ label: "Magic Shield — a standoff, neither side can be harmed", value: 0, side: "party", roll: false });

    return { front: mt.front, backers: mt.backers, strangers: mt.strangers, attached: mt.attached, enemyBackers: mt.enemyBackers, partyStr, enemyStr, modifiers, shieldWard, stalemate };
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

  // Extension kit (SC-EXT-27): the Magic Shield's ward notice — one `shieldWarded` per stranger it
  // actually bit against this round (design US-23 Feedback), computed once by `previewPlan` above
  // and simply replayed here as events; never fired merely because the Shield is in play.
  for (const mt of matches) for (const w of mt.shieldWard) events.push({ type: "shieldWarded", creatureId: w.creatureId, mode: w.mode });

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
        markDied(state, strongest);
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
    // Bug fix 2026-08-09 (SC-EXT-40): a Magic Shield stalemate never rolls — "the spectre or demon
    // is simply ignored for that round; neither it nor the shield bearer will be killed." No dice,
    // no casualty either side; the foe(s) stay exactly where they were, ready to fight another round.
    if (mt.stalemate) {
      events.push({ type: "shieldStalemate", creatureIds: mt.strangers.map((si) => state.strangers[si]!) });
      continue;
    }
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
      else if (mortal.length === 1) { markDied(state, mortal[0]!); events.push({ type: "memberDied", creatureId: mortal[0]!.creatureId }, ...eyeForsakenByDeath(state, mortal[0]!)); }
      else pendingCasualties.push(mortal.map((m) => state.party.indexOf(m)));
    }
    // tie: no death
  }

  killedStrangerIdx.sort((a, b) => b - a).forEach((i) => state.strangers.splice(i, 1));
  fight.round += 1;
  if (pendingCasualties.length > 0) fight.casualtyQueue = pendingCasualties;
  return events;
}
