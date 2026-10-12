// Random scenarios drawn from the real small-pack card counts: the strangers and the party take cards from the
// same finite pack, so no creature type is used more often than the deck holds (scenario-space report §3).
import { smallPackTemplate, smallPackExtension, defaultLoadout, swordBonus, axeBonus, staffBonus, shieldEligible, ringEligible } from "@sorcerers-cave/engine";
import { makeRng, type Rng } from "./rng";
import { DEFAULT_RULES, T, totalOf, unit } from "./rules";
import type { Scenario, Side, Unit } from "./types";

/** Decides who bears the fight artefacts lying in the chamber, given the finished fight (so it can see the party). Returns the
 *  allocations, as the engine's loadout does. */
export type LoadoutFn = (input: { strangers: Unit[]; floor: number[]; eye: boolean; party: Unit[]; level: number; curses: number; scenario?: Scenario }) => { artifact: number; stranger: number }[];

/** The game's own ceilings. Allies are drawn from the creature cards that can ever be friendly: 30 in the base deck and
 *  40 with the kit (Spectre, Dragon, Sorcerer and Demon never are). Strangers can number 20 or more only after a Mutiny. */
export const MAX_PARTY = { base: 30, kit: 40 } as const;
export const MAX_STRANGERS = 20;

const creatureCards = (kit: boolean): number[] =>
  [...smallPackTemplate(), ...(kit ? smallPackExtension() : [])].filter((c) => c >= 100 && c < 200).map((c) => c - 100);
const CARDS = { base: creatureCards(false), kit: creatureCards(true) };

// Creatures that never take part: a Spectre and a Demon (version 1 limit), and the Unicorn, which "will not fight in the current
// situation" and so is neither engaged nor unengaged (reformulated rules, definition 9; the engine still lets it fight, C4).
const NOT_FIGHTING = [13];
const NOT_STRANGERS = new Set([9, 15, ...NOT_FIGHTING]);   // Spectre, Demon, Unicorn
const NOT_ALLIES = new Set([9, 10, 11, 15, ...NOT_FIGHTING]);   // never friendly: Spectre, Dragon, Sorcerer, Demon; and the Unicorn

// Who can bear what, from the engine's own capability table (Peter's A4: the Sword is a Hero, Woman-Hero, Man, Woman or
// Thief's; the Axe also a Dwarf's), so the lab and the game agree by construction.
const CAN_BEAR: Record<number, (cid: number) => boolean> = {
  [T.SWORD]: (c) => swordBonus(c) > 0,
  [T.STAFF]: (c) => staffBonus(c) > 0,
  [T.RING]: ringEligible,
  [T.AXE]: (c) => axeBonus(c) > 0,
  [T.SHIELD]: shieldEligible,
};
const POTION_OK = new Set([0, 1, 5, 6]);

// How many strangers a chamber holds (roughly the level 4+ draw odds, with a thin tail up to a Great Hall's six).
const K_WEIGHTS = [0.25, 0.37, 0.26, 0.08, 0.03, 0.01];
// For balanced fights the tail is fatter, so big fights (a Mutiny) are covered: weights for 1..20 strangers.
const K_WEIGHTS_WIDE = [0.20, 0.28, 0.20, 0.10, 0.06, 0.04, 0.03, 0.025, 0.02, 0.015, ...Array.from({ length: 10 }, () => 0.005)];

const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(xs.length)]!;

function drawCount(rng: Rng, weights: number[], max: number): number {
  const w = weights.slice(0, max);
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < w.length; i++) { r -= w[i]!; if (r < 0) return i + 1; }
  return w.length;
}

/** The attacker's round-1 surprise bonus. Strangers who are approached and prove hostile always have +1. A party that attacks has 0, 1
 *  or 2: a route that cannot be walked back (carpet, teleport, Whirlpool, Chasm, a deliberate trap fall) or a fresh doorway gives 1,
 *  and the Scroll can add 1. The odds are an assumption (the rules give the conditions, not how often they hold). */
function surpriseFor(rng: Rng, attacker: Side): 0 | 1 | 2 {
  if (attacker === "strangers") return 1;
  const r = rng.next();
  return r < 0.45 ? 0 : r < 0.95 ? 1 : 2;
}

/** Hand the fight artefacts out and set the situation. Each artefact exists once in the pack: it is with the party, lying in the
 *  chamber under the strangers' guard (`strangerOdds`), or not in play. The party's are placed at random among those who can bear
 *  them; the strangers' go by Peter's Default Loadout, run once, with every artefact starting on the floor (Q10). */
function dress(rng: Rng, deck: "base" | "kit", party: Unit[], strangers: Unit[], o: { attacker?: Side; strangerOdds?: number; loadout?: LoadoutFn; deferLoadout?: boolean }): Scenario {
  const eye = rng.next() < 0.03;
  const artefacts = deck === "kit" ? [T.SWORD, T.STAFF, T.RING, T.AXE, T.SHIELD] : [T.SWORD, T.STAFF, T.RING];
  const odds = o.strangerOdds ?? 0.04;
  const floor: number[] = [];
  for (const a of artefacts) {
    const roll = rng.next();
    if (roll < 0.55) {
      const eligible = party.filter((u) => CAN_BEAR[a]!(u.cid));
      if (!eligible.length) continue;
      const u = pick(rng, eligible);
      u.gear.push(a);
      u.g = unit(u.cid, u.gear).g;
    } else if (roll < 0.55 + odds) floor.push(a);
  }
  if (floor.length && !o.loadout && !o.deferLoadout) {
    const allocations = defaultLoadout({ strangers: strangers.map((u) => u.cid), gear: strangers.map(() => []), floor, eyePresent: eye, pick: (n) => rng.int(n) });
    for (const { artifact, stranger } of allocations) {
      const u = strangers[stranger]!;
      u.gear.push(artifact);
      u.g = unit(u.cid, u.gear).g;
    }
  }
  if (rng.next() < 0.2) { const c = party.filter((u) => POTION_OK.has(u.cid)); if (c.length) pick(rng, c).potion = true; }
  if (deck === "kit" && rng.next() < 0.1) pick(rng, party).fsBonus = 2;
  if (rng.next() < 0.03) pick(rng, party).dragonKills = 1;

  const cr = rng.next();
  const attacker: Side = o.attacker ?? (rng.next() < 0.5 ? "strangers" : "party");
  const curses = cr < 0.7 ? 0 : cr < 0.9 ? 1 : cr < 0.98 ? 2 : 3;
  const level = 1 + rng.int(6);
  const surprise = surpriseFor(rng, attacker);
  // A loadout strategy decides last, so it sees the party as it will fight (its gear, bonuses, the level and the curses).
  if (floor.length && o.loadout) {
    for (const { artifact, stranger } of o.loadout({ strangers, floor, eye, party, level, curses })) {
      const u = strangers[stranger]!;
      u.gear.push(artifact);
      u.g = unit(u.cid, u.gear).g;
    }
  }
  return { party, strangers, eye, curses, level, attacker, surprise, ...(o.deferLoadout && floor.length ? { floor } : {}) };
}

export interface ScenarioOptions {
  deferLoadout?: boolean;   // leave the strangers unarmed and record the floor artefacts in `Scenario.floor`, to be handed out with `armStrangers`
  loadout?: LoadoutFn;   // decides the strangers' artefacts (default: the engine's default loadout)
  attacker?: Side;      // who started the fight (default: drawn, half each way)
  strangerOdds?: number; // the chance each fight artefact lies in the chamber with the strangers (default 0.04)
  strangers?: number;   // exact number of strangers, 1..MAX_STRANGERS (default: drawn from the usual odds, 1-6)
  party?: number;       // exact party size (default: the strangers' number plus 0-8, at most 14); capped by the allies the deck has left
}

export function randomScenario(seed: number, deck: "base" | "kit", opts: ScenarioOptions = {}): Scenario {
  if (opts.strangers !== undefined && (!Number.isInteger(opts.strangers) || opts.strangers < 1 || opts.strangers > MAX_STRANGERS)) {
    throw new RangeError(`strangers must be 1..${MAX_STRANGERS}`);
  }
  const rng = makeRng(seed);
  const cards = CARDS[deck];

  const k = opts.strangers ?? drawCount(rng, K_WEIGHTS, K_WEIGHTS.length);
  const order = rng.shuffle(cards.map((_, i) => i));
  const strangerIdx = order.filter((i) => !NOT_STRANGERS.has(cards[i]!)).slice(0, k);
  const taken = new Set(strangerIdx);
  const allyIdx = order.filter((i) => !taken.has(i) && !NOT_ALLIES.has(cards[i]!));
  const m = Math.min(allyIdx.length, MAX_PARTY[deck], opts.party ?? Math.min(14, k + rng.int(9)));   // by default a party at least as large as the strangers, at most 14

  const strangers: Unit[] = strangerIdx.map((i) => unit(cards[i]!));
  const party: Unit[] = allyIdx.slice(0, m).map((i) => unit(cards[i]!));
  return dress(rng, deck, party, strangers, opts);
}

export interface BalancedOptions {
  deferLoadout?: boolean;   // see ScenarioOptions
  loadout?: LoadoutFn;   // decides the strangers' artefacts (default: the engine's default loadout)
  attacker?: Side;       // who started the fight (default: drawn, half each way)
  strangerOdds?: number; // the chance each fight artefact lies in the chamber with the strangers (default 0.04)
  band?: [number, number];   // the party's total strength as a multiple of the strangers' (default 0.7 to 1.4)
  maxStrangers?: number;     // at most this many strangers (default MAX_STRANGERS)
}

/** A strength-matched fight of any size: draw the strangers, then add allies until the two sides' total strengths are
 *  within the band. Big parties are therefore only built against big (or strong) stranger groups, so the fight is contested. */
export function balancedScenario(seed: number, deck: "base" | "kit", opts: BalancedOptions = {}): Scenario {
  const [lo, hi] = opts.band ?? [0.7, 1.4];
  const maxK = Math.min(opts.maxStrangers ?? MAX_STRANGERS, MAX_STRANGERS);
  const cards = CARDS[deck];
  const plain = { eye: false, curses: 0, level: 1, attacker: "party" as Side, surprise: 0 as const, rules: DEFAULT_RULES };

  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = makeRng(Math.imul(seed, 1000003) + attempt);
    const k = drawCount(rng, K_WEIGHTS_WIDE, maxK);
    const order = rng.shuffle(cards.map((_, i) => i));
    const strangerIdx = order.filter((i) => !NOT_STRANGERS.has(cards[i]!)).slice(0, k);
    const taken = new Set(strangerIdx);
    const strangers: Unit[] = strangerIdx.map((i) => unit(cards[i]!));
    const strangerTotal = strangers.reduce((a, u) => a + totalOf(u, plain), 0);

    // add allies, in random order, while the party stays at or under the top of the band, until it reaches the band
    const target = lo + rng.next() * (hi - lo);
    const party: Unit[] = [];
    let sum = 0;
    for (const i of order) {
      if (taken.has(i) || NOT_ALLIES.has(cards[i]!) || party.length >= MAX_PARTY[deck]) continue;
      const u = unit(cards[i]!), t = totalOf(u, plain);
      if (sum + t > hi * strangerTotal) continue;
      party.push(u); sum += t;
      if (sum >= target * strangerTotal) break;
    }
    if (party.length === 0 || sum < lo * strangerTotal) continue;

    const s = dress(rng, deck, party, strangers, opts);
    const c = { eye: s.eye, curses: s.curses, level: s.level, attacker: s.attacker, surprise: s.surprise, rules: DEFAULT_RULES };
    const ratio = s.party.reduce((a, u) => a + totalOf(u, c), 0) / s.strangers.reduce((a, u) => a + totalOf(u, c), 0);
    if (ratio >= lo && ratio <= hi) return s;     // gear and the Eye move the ratio a little, so check it again
  }
  throw new Error("balancedScenario: could not build a fight in the band (band too narrow?)");
}

/** A copy of a scenario whose deferred floor artefacts have been handed to the strangers by `loadout`. */
export function armStrangers(scn: Scenario, loadout: LoadoutFn): Scenario {
  const strangers = scn.strangers.map((u) => ({ ...u, gear: u.gear.slice() }));
  const floor = scn.floor ?? [];
  if (floor.length) {
    for (const { artifact, stranger } of loadout({ strangers, floor, eye: scn.eye, party: scn.party, level: scn.level, curses: scn.curses, scenario: scn })) {
      const u = strangers[stranger]!;
      u.gear.push(artifact);
      u.g = unit(u.cid, u.gear).g;
    }
  }
  const { floor: _floor, ...rest } = scn;
  return { ...rest, strangers };
}
