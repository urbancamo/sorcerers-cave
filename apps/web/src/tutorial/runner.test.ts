import { describe, expect, it } from 'vitest';
import { TUTORIAL_ROUTE } from '@sorcerers-cave/engine';
import { initialTutorial, matchesBeat, tutorialReduce, wantedBeat, type CoachStep, type TutorialState } from './runner';
import { TUTORIAL_SCRIPT } from './script';

const script: CoachStep[] = [
  { id: 'a', kind: 'info', eyebrow: '', title: '', body: '' },
  { id: 'b', kind: 'act', eyebrow: '', title: '', body: '', until: 2 },
  { id: 'c', kind: 'info', eyebrow: '', title: '', body: '' },
];
const run = (events: Parameters<typeof tutorialReduce>[2][], from: TutorialState = initialTutorial) => events.reduce((s, e) => tutorialReduce(script, s, e), from);

describe('tutorial runner', () => {
  it('waits for Continue on an info card, then for the actions of an act card', () => {
    expect(run([{ type: 'played' }])).toEqual({ step: 0, cursor: 1 }); // an action does not skip a card
    const s = run([{ type: 'continue' }]);
    expect(s.step).toBe(1);
    expect(run([{ type: 'continue' }, { type: 'played' }]).step).toBe(1); // one of two actions
    expect(run([{ type: 'continue' }, { type: 'played' }, { type: 'played' }])).toEqual({ step: 2, cursor: 2 });
  });
  it('ignores Continue on an act card', () => {
    expect(run([{ type: 'continue' }, { type: 'continue' }]).step).toBe(1);
  });
  it('Back returns to an explanatory card but never past an act card', () => {
    expect(run([{ type: 'continue' }, { type: 'back' }]).step).toBe(0);
    expect(run([{ type: 'continue' }, { type: 'played' }, { type: 'played' }, { type: 'back' }]).step).toBe(2);
  });
  it('wants the route beat only while an act card is up', () => {
    expect(wantedBeat(script, initialTutorial)).toBeNull();
    expect(wantedBeat(script, { step: 1, cursor: 0 })).toBe(TUTORIAL_ROUTE[0]);
    expect(wantedBeat(script, { step: 2, cursor: 2 })).toBeNull();
  });
  it('matches the wanted action; a move ignores view-added fields', () => {
    const beat = TUTORIAL_ROUTE[0]!;
    expect(matchesBeat(beat, { type: 'move', dir: 1 })).toBe(true);
    expect(matchesBeat(beat, { type: 'move', dir: 2 })).toBe(false);
    expect(matchesBeat(beat, { type: 'withdraw' })).toBe(false);
  });
  it('the shipped script ends exactly where the route has taken the party to the trap chamber (route step 6 starts at the trap)', () => {
    const last = TUTORIAL_SCRIPT.filter((s) => s.kind === 'act').at(-1)!;
    expect(last.until).toBe(6);
    expect(TUTORIAL_ROUTE[5]!.step).toBe(5);
    expect(TUTORIAL_ROUTE[6]!.step).toBe(6);
  });
});
