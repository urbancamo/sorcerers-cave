import { TUTORIAL_ROUTE, type GameAction, type TutorialBeat } from '@sorcerers-cave/engine';

// The tutorial's step machine: pure, so it is unit-tested like shellState. The script is a list of coach steps; an 'info' step waits
// for Continue, an 'act' step waits until the player has made the route actions up to `until` (an index into TUTORIAL_ROUTE).

export type Anchor =
  | { kind: 'exit'; dir: 'N' | 'E' | 'S' | 'W' | 'U' | 'D' } // an exit marker in the 3D view
  | { kind: 'selector'; selector: string; prefer?: string }; // a piece of the page's own UI; `prefer` is looked for first (e.g. an enabled confirm button)

export interface CoachStep {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  kind: 'info' | 'act' | 'ui'; // ui: waits for the player to press a control that is not a game action (the Home button)
  /** act steps: the route cursor at which this step is done */
  until?: number;
  /** ui steps: the name of the UI event that completes the step */
  event?: string;
  anchor?: Anchor;
  /** the player may play freely while this card is up (the end of the guide) */
  free?: boolean;
  /** the card offers a short recorded demo game */
  demo?: boolean;
}

export interface TutorialState {
  step: number; // index into the script; === script.length when the script is over
  cursor: number; // how many TUTORIAL_ROUTE actions the player has made
}

export type TutorialEvent = { type: 'continue' } | { type: 'back' } | { type: 'played' } | { type: 'ui'; name: string };

export const initialTutorial: TutorialState = { step: 0, cursor: 0 };

// Steps done by what the player has already done are skipped over.
const settle = (script: CoachStep[], s: TutorialState): TutorialState => {
  let step = s.step;
  while (step < script.length && script[step]!.kind === 'act' && s.cursor >= (script[step]!.until ?? 0)) step++;
  return step === s.step ? s : { ...s, step };
};

export function tutorialReduce(script: CoachStep[], s: TutorialState, e: TutorialEvent): TutorialState {
  switch (e.type) {
    case 'continue':
      return s.step < script.length && script[s.step]!.kind === 'info' ? settle(script, { ...s, step: s.step + 1 }) : s;
    case 'back':
      // Back is for the explanatory cards only: it never undoes a game action.
      return s.step > 0 && script[s.step - 1]!.kind === 'info' ? { ...s, step: s.step - 1 } : s;
    case 'played':
      return settle(script, { ...s, cursor: s.cursor + 1 });
    case 'ui':
      return script[s.step]?.kind === 'ui' && script[s.step]!.event === e.name ? settle(script, { ...s, step: s.step + 1 }) : s;
  }
}

/** The route beat the player must make now, or null when no action is wanted (an info card is up, or the script is over). */
export function wantedBeat(script: CoachStep[], s: TutorialState): TutorialBeat | null {
  const step = script[s.step];
  return step && step.kind === 'act' && s.cursor < (step.until ?? 0) ? (TUTORIAL_ROUTE[s.cursor] ?? null) : null;
}

// Key order and list order must not matter (the party may be selected in either order): the views build their actions their own way.
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)])) : v;
const same = (a: GameAction, b: GameAction) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** Does the player's action match the wanted one? Extra fields the view adds to a move are ignored for moves. */
export function matchesBeat(beat: TutorialBeat, action: GameAction): boolean {
  const want = beat.play;
  if (want.type === 'move' && action.type === 'move') return want.dir === action.dir;
  return same(want, action);
}
