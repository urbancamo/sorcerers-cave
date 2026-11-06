import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { validatePlan } from "./combatPlan";
import { casterMP, frontStrength } from "./combat";
import { scoreBreakdown } from "./score";
import { decodeOpen } from "./decode";
import { existingAreaConnects, hasExit } from "./map";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN, targetCoord, unpackCoord } from "./coords";
import { buildPlan, buildStrongPlan, prepareAction } from "./botKit";
import { GS_ESCAPED, GS_PLAYING, PARTY_BUDGET, type GameState } from "./state";
import { ALL_CREATURES } from "./data/creatures";
import { validatePicks } from "./setup";
import type { GameAction } from "./actions";

// A look-ahead search for a whole game: beam search over real engine states. Every game is a pure function of its seed and its
// actions, so the search can try an action on a copy of the state, see exactly what the dice do, and keep the promising
// branches. It is a way to FIND a game that reaches a goal (the golden game: Sorcerer slain, party back on the surface, a high
// score) — what it finds is an ordinary action list that `replay()` plays back on the real engine, so nothing it does is a rule.

const LATERAL = [DIR_N, DIR_E, DIR_S, DIR_W] as const;

/** Walking distances over the map as it stands, using the engine's own door rule: `home` to the cave exit (a level-1 tile with a
 *  stair up) and `frontier` to the nearest doorway that leads onto a tile not yet placed. Infinity when there is no known way.
 *  Guidance only: the replay is the authority. (A fall or a teleport can leave the party cut off from the way it came.) */
export function walkDistances(state: GameState): { home: number; frontier: number } {
  const index = new Map<number, number>();
  state.areas.forEach((a, i) => index.set(a.coord, i));
  const dist = new Map<number, number>([[state.partyArea, 0]]);
  const queue = [state.partyArea];
  let frontier = Infinity;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const a = state.areas[i]!;
    const dec = decodeOpen(a);
    const { level, x, y } = unpackCoord(a.coord);
    if (level === 1 && dec.stairUp) return { home: dist.get(i)!, frontier: Math.min(frontier, 0) };
    for (const dir of [...LATERAL, DIR_UP, DIR_DOWN]) {
      if (!hasExit(dec, dir)) continue;
      const j = index.get(targetCoord(dir, level, x, y));
      if (j === undefined) { frontier = Math.min(frontier, dist.get(i)! + 1); continue; }
      if (dist.has(j) || !existingAreaConnects(state.areas[j]!, dir)) continue;
      dist.set(j, dist.get(i)! + 1);
      queue.push(j);
    }
  }
  return { home: Infinity, frontier };
}

/** Distance in moves from the party's tile to the cave exit; Infinity when no known path exists. */
export const homeDistance = (state: GameState): number => walkDistances(state).home;

/** What the party could win or lose in a fight right now: the living members' fighting strength plus their magic. */
export function power(state: GameState): number {
  let p = 0;
  for (const m of state.party) if (m.status === 0 || m.status === 1) p += frontStrength(m) + casterMP(m, state);
  return p;
}

/** The tunable weights of the heuristic. The search is run with several settings because no one setting suits every party. */
export interface Weights {
  power: number;     // per point of fighting strength + magic of the living party
  areas: number;     // per area placed on the map
  deck: number;      // per card drawn from the small pack (the Sorcerer is one of them)
  sibyl: number;     // for having the Sibyl in the party
  killBonus: number; // for the Sorcerer being dead — must outweigh everything the deck term can reach
  home: number;      // per move still to walk to the surface, once he is dead
}

export const DEFAULT_WEIGHTS: Weights = { power: 3, areas: 0.2, deck: 6, sibyl: 40, killBonus: 3000, home: 4 };

/** How promising a state is. Higher is better. Carried value is the real score so far; power keeps the party able to fight; deck
 *  progress is the way to meet the Sorcerer; his death is worth a lot; once he is dead the way home matters. */
export function heuristic(state: GameState, w: Weights = DEFAULT_WEIGHTS, homing = true, requireSorcerer = true): number {
  let h = scoreBreakdown(state).total + w.power * power(state) + w.areas * state.areas.length + w.deck * state.smallIdx;
  if (state.hasSibyl) h += w.sibyl;
  if (state.sorcererKilled) h += w.killBonus;
  // The way home matters once the party has done what it came for: always, when the goal is only the score; after the
  // Sorcerer's death, when he must die first. `homing` is false while the search is still told to keep collecting.
  if (homing && (state.sorcererKilled || !requireSorcerer)) {
    const { home, frontier } = walkDistances(state);
    // No known way out: head for the nearest unexplored doorway, and for the higher levels, where the stairs up are.
    h -= Number.isFinite(home) ? w.home * home : 200 + 4 * (Number.isFinite(frontier) ? frontier : 60) + 40 * state.level;
  }
  return h;
}

/** Every starting party the draft allows, as sorted creature-id lists: each selectable creature any number of times within the
 *  budget and the per-creature stock, checked with the engine's own `validatePicks` so this can never disagree with `newGame`. */
export function legalParties(variants?: { extensionKit?: boolean }): number[][] {
  const ids = ALL_CREATURES.map((c) => c.id).filter((id) => validatePicks([id], variants));
  const out: number[][] = [];
  const grow = (party: number[], from: number): void => {
    if (party.length > 0) out.push(party);
    for (let i = from; i < ids.length; i++) {
      const next = [...party, ids[i]!];
      if (next.length <= PARTY_BUDGET && validatePicks(next, variants)) grow(next, i);
    }
  };
  grow([], 0);
  return out;
}

const planKey = (m: unknown) => JSON.stringify(m);

/** The actions worth trying from a state: the engine's legal actions, with the two fixed choices taken for the search — wield
 *  and wear before anything else, and leave the cave only once the Sorcerer is dead — and the fight plans legalActions leaves to
 *  the UI built for it (the strongest-foe-first plan and the one-to-one plan). */
export function candidateActions(state: GameState, canExit = true, requireSorcerer = true): GameAction[] {
  const legal = legalActions(state);
  switch (state.phase) {
    case "explore": {
      const prep = prepareAction(state);
      if (prep) return [prep];
      return legal.filter((a) => a.type !== "exitCave" || (canExit && (state.sorcererKilled || !requireSorcerer)));
    }
    case "sorcerer":
      return legal.filter((a) => a.type === "slaySorcerer"); // the golden game slays him; sparing him is a different game
    case "fight": {
      if (state.fight?.casualtyQueue?.length) return legal;
      const plans: { front: number[]; backers: number[]; strangers: number[] }[][] = [];
      const seen = new Set<string>();
      for (const matches of [buildStrongPlan(state), buildPlan(state)]) {
        if (!matches.length || seen.has(planKey(matches)) || !validatePlan(state, { matches }).ok) continue;
        seen.add(planKey(matches));
        plans.push(matches);
      }
      if (!plans.length) {
        // Neither builder found a legal plan (found by the invariant soak): a Spectre or Demon the party cannot engage is faced with the
        // empty round, and a magic-capable ally the builders overlook with a single front, so the search is never left with nothing to try.
        if (validatePlan(state, { matches: [] }).ok) plans.push([]);
        else for (let i = 0; i < state.party.length; i++) for (let j = 0; j < state.strangers.length; j++) {
          const matches = [{ front: [i], backers: [] as number[], strangers: [j] }];
          if (validatePlan(state, { matches }).ok) plans.push(matches);
        }
      }
      return [...plans.map((matches): GameAction => ({ type: "resolveRound", matches })), ...legal];
    }
    default:
      return legal;
  }
}

/** One finished game: the party reached the surface. */
export interface Finished {
  actions: GameAction[];
  score: number;
  sorcererKilled: boolean;
  hasSibyl: boolean;
}

interface Node {
  state: GameState;
  parent: Node | null;
  action: GameAction | null;
  h: number;
}

const actionsOf = (n: Node): GameAction[] => {
  const out: GameAction[] = [];
  for (let c: Node | null = n; c && c.action; c = c.parent) out.push(c.action);
  return out.reverse();
};

export interface BeamResult {
  finished: Finished[];          // every game that reached the surface, in the order found
  best: { actions: GameAction[]; state: GameState; h: number } | null; // the most promising unfinished state when the search stopped
  steps: number;                 // beam steps taken
  expanded: number;              // reduce() calls made — the search budget actually spent
  crashes: { actions: GameAction[]; error: string }[]; // actions on which reduce() threw (never expected; skipped)
  sorcererKilledAt: number | null; // the first beam step at which some state had slain him
}

/** Beam search from `initial`: each step tries every candidate action on every state in the beam and keeps the `width` best
 *  distinct results. Dead or quit parties are dropped; a party on the surface is recorded and not expanded further. */
export function beamSearch(initial: GameState, opts: { width: number; maxSteps: number; weights?: Partial<Weights>; exitAfter?: number; requireSorcerer?: boolean }): BeamResult {
  const w: Weights = { ...DEFAULT_WEIGHTS, ...opts.weights };
  const requireSorcerer = opts.requireSorcerer ?? true; // false: the goal is only the score of a party that escapes
  let beam: Node[] = [{ state: initial, parent: null, action: null, h: heuristic(initial, w, true, requireSorcerer) }];
  const finished: Finished[] = [];
  let expanded = 0;
  const crashes: { actions: GameAction[]; error: string }[] = [];
  let sorcererKilledAt: number | null = null;
  let step = 0;
  for (; step < opts.maxSteps && beam.length > 0; step++) {
    const seen = new Set<string>();
    const next: Node[] = [];
    for (const node of beam) {
      const homing = step >= (opts.exitAfter ?? 0);
      for (const action of candidateActions(node.state, homing, requireSorcerer)) {
        let r: ReturnType<typeof reduce>;
        try {
          r = reduce(node.state, action);
        } catch (e) {
          crashes.push({ actions: [...actionsOf(node), action], error: String(e) }); // an engine fault, kept for the report
          continue;
        }
        expanded++;
        if (r.events.some((e) => e.type === "blocked")) continue;
        const s = r.state;
        const child: Node = { state: s, parent: node, action, h: 0 };
        if (s.gs === GS_ESCAPED) {
          finished.push({ actions: actionsOf(child), score: scoreBreakdown(s).total, sorcererKilled: s.sorcererKilled, hasSibyl: !!s.hasSibyl });
          continue;
        }
        if (s.gs !== GS_PLAYING) continue; // dead (GS_DEAD) or quit
        const key = JSON.stringify(s);
        if (seen.has(key)) continue;
        seen.add(key);
        child.h = heuristic(s, w, homing, requireSorcerer);
        if (s.sorcererKilled && sorcererKilledAt === null) sorcererKilledAt = step;
        next.push(child);
      }
    }
    next.sort((a, b) => b.h - a.h);
    beam = next.slice(0, opts.width);
  }
  const top = beam[0];
  return {
    finished,
    best: top ? { actions: actionsOf(top), state: top.state, h: top.h } : null,
    steps: step,
    expanded,
    crashes,
    sorcererKilledAt,
  };
}

