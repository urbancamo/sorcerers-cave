import {
  ALL_CREATURES, DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN, legalActions, type GameState, type GameAction,
} from '@sorcerers-cave/engine';
import { memberLabel } from './memberLabels';
import { holyWaterTargetName } from './holyWaterLabel';

export type UseArtifact = Extract<GameAction, { type: 'useArtifact' }>;

// Extension kit blocking confirms (design Part 2, trap-fall pattern), verbatim per story.
export const ELIXIR_CONFIRM = 'One draught. 1: death. 2–3: nothing. 4–6: +2 strength, forever.';
export const SCROLL_CONFIRM = 'Destroys every enemy here save the magical — and curses the party.';

const DIR_NAME: Record<number, string> = {
  [DIR_N]: 'north', [DIR_E]: 'east', [DIR_S]: 'south', [DIR_W]: 'west', [DIR_UP]: 'up', [DIR_DOWN]: 'down',
};

export interface UseOption { label: string; action: UseArtifact }

/** Disambiguate identical option labels (e.g. two Men) by appending " #2", " #3" to the repeats. */
function dedupe(labels: string[]): string[] {
  const total = new Map<string, number>();
  labels.forEach((l) => total.set(l, (total.get(l) ?? 0) + 1));
  const seen = new Map<string, number>();
  return labels.map((l) => {
    if ((total.get(l) ?? 0) <= 1) return l;
    const n = (seen.get(l) ?? 0) + 1;
    seen.set(l, n);
    return `${l} #${n}`;
  });
}

function targetLabel(a: UseArtifact, state: GameState): string {
  const who = (mi: number) => memberLabel(state.party, mi);
  switch (a.artifact) {
    case 6: return `revive ${who(a.target!)}`;
    case 9: return `free ${who(a.target!)} from stone`;
    case 4: return `fly ${DIR_NAME[a.dir ?? -1] ?? '?'}`;
    case 12: return `reveal the secret stair ${a.dir === DIR_DOWN ? 'below' : 'above'}`;
    case 15: return who(a.target!);
    case 16: return a.target !== undefined ? holyWaterTargetName(state, a.target, who) : 'use';
    // The Sorcerer is only weakened by Lotus Dust (SC-11-12), so his option says what actually happens.
    case 5: return a.target === undefined ? 'put to sleep'
      : state.strangers[a.target] === 11 ? 'Sorcerer — weakens him by 2, he cannot be slept'
      : ALL_CREATURES[state.strangers[a.target]!]!.name;
    case 19: return 'read the Scroll';
    default: return 'use';
  }
}

/** The ways the party can use one artifact right now, from the engine's own offer, with each target or direction named. The Medusa pause keeps its own two buttons (a must-act choice), so it offers none here. */
export function useOptions(state: GameState, artifact: number): UseOption[] {
  if (state.phase === 'medusa') return [];
  const acts = legalActions(state).filter((a): a is UseArtifact => a.type === 'useArtifact' && a.artifact === artifact);
  const labels = dedupe(acts.map((a) => targetLabel(a, state)));
  return acts.map((action, i) => ({ label: labels[i]!, action }));
}
