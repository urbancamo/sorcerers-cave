import { newGame } from "./setup";
import { reduce } from "./reduce";
import type { GameState } from "./state";
import type { GameAction, GameEvent } from "./actions";

/** One point on a game's timeline. `seq` 0 is the initial deal; `seq` i is the state AFTER the i-th
 *  action. `action`/`events` describe the transition that PRODUCED this frame (null/[] for frame 0). */
export interface ReplayFrame {
  seq: number;
  action: GameAction | null;
  state: GameState;
  events: GameEvent[];
}

/**
 * Reconstruct every intermediate state of a game from its initial conditions and ordered action log.
 *
 * The engine is a pure, deterministic, seeded reducer, so a game is fully captured by
 * `seed + picks + actions` — folding the actions over `reduce()` reproduces the exact game, including
 * every RNG-driven outcome (the RNG cursor lives inside the state). This is the basis of the
 * machine-readable game log: store the actions, replay to regenerate the states and consequences.
 *
 * Returns `actions.length + 1` frames: frame 0 is the untouched `newGame(seed, picks)` deal, and
 * frame i (i ≥ 1) is the state after `actions[0..i-1]`, carrying the i-th action and the events it
 * produced. A move-by-move viewer simply indexes the array — stepping backward or forward is O(1).
 */
export function replay(seed: number, picks: readonly number[], actions: readonly GameAction[]): ReplayFrame[] {
  let state = newGame(seed, picks);
  const frames: ReplayFrame[] = [{ seq: 0, action: null, state, events: [] }];
  for (let i = 0; i < actions.length; i++) {
    const { state: next, events } = reduce(state, actions[i]!);
    state = next;
    frames.push({ seq: i + 1, action: actions[i]!, state, events });
  }
  return frames;
}
