import type { CoachStep } from './runner';

// Peter's tutorial script, steps 2-5 so far (docs/requirements/tutorial). `until` counts actions in the engine's TUTORIAL_ROUTE:
// 0 north, 1 north, 2 withdraw, 3 south, 4 west, 5 north (to the trap chamber).
export const TUTORIAL_SCRIPT: CoachStep[] = [
  {
    id: 'welcome', kind: 'info', eyebrow: 'Step 2 of 12', title: 'Your party',
    body: 'You lead a small party into the Sorcerer\'s Cave: a Woman Hero and a Dwarf. Chosen for you, so you can start at once. Everything you see is the real game; this guide just tells you what to press.',
    anchor: { kind: 'selector', selector: '[aria-label="Party"]' },
  },
  {
    id: 'gateway', kind: 'info', eyebrow: 'Step 3 of 12', title: 'The Gateway',
    body: 'You start at the Gateway, the way in and, at the end, the way out. The cave is unexplored: every tile is laid face down as you find it. The brass arrows mark the ways you can go.',
  },
  {
    id: 'explore-north', kind: 'act', eyebrow: 'Step 3 of 12', title: 'Explore north',
    body: 'Press the arrow to the north, or the N key, to step into the unknown.', until: 1,
    anchor: { kind: 'exit', dir: 'N' },
  },
  {
    id: 'tunnel', kind: 'info', eyebrow: 'Step 4 of 12', title: 'A tunnel',
    body: 'A tunnel: nothing lives here, it only joins one place to the next. Drag to turn the view, and scroll or pinch to zoom; the camera buttons snap it back to the party.',
  },
  {
    id: 'north-again', kind: 'act', eyebrow: 'Step 4 of 12', title: 'Go north again',
    body: 'Carry on north.', until: 2, anchor: { kind: 'exit', dir: 'N' },
  },
  {
    id: 'spectre', kind: 'info', eyebrow: 'Step 5 of 12', title: 'A Spectre',
    body: 'A chamber, and a Spectre in it. Chambers hold strangers and treasure; this one is too dangerous to fight yet. You can always withdraw: the party steps back to where it came from.',
  },
  {
    id: 'withdraw', kind: 'act', eyebrow: 'Step 5 of 12', title: 'Withdraw',
    body: 'Press Withdraw.', until: 3, anchor: { kind: 'selector', selector: '[data-tutorial-action="withdraw"]' },
  },
  {
    id: 'back-to-gateway', kind: 'act', eyebrow: 'Step 5 of 12', title: 'Back to the Gateway, then west',
    body: 'Head south to the Gateway, then west, then north again, to find another way.', until: 6,
    anchor: { kind: 'exit', dir: 'S' },
  },
  {
    id: 'preview-end', kind: 'info', free: true, eyebrow: 'Preview', title: 'More steps are on their way',
    body: 'The rest of the guide (the trap, the Priest and the Axe, the Troll and the Witch) is still being built. You are free to look around.',
  },
];
