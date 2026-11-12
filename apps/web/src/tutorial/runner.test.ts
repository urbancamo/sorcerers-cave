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

describe('tutorial runner: ui steps', () => {
  const ui: CoachStep[] = [
    { id: 'u', kind: 'ui', event: 'home', eyebrow: '', title: '', body: '' },
    { id: 'a', kind: 'act', until: 1, eyebrow: '', title: '', body: '' },
  ];
  it('waits for its own UI event: Continue and other events do nothing, and no game action is wanted', () => {
    expect(tutorialReduce(ui, initialTutorial, { type: 'continue' }).step).toBe(0);
    expect(tutorialReduce(ui, initialTutorial, { type: 'ui', name: 'other' }).step).toBe(0);
    expect(wantedBeat(ui, initialTutorial)).toBeNull();
    expect(tutorialReduce(ui, initialTutorial, { type: 'ui', name: 'home' }).step).toBe(1);
  });
});

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
  it('the shipped script plays the whole route: act cards count up through it, in order, ending on the free closing card', () => {
    const acts = TUTORIAL_SCRIPT.filter((s) => s.kind === 'act').map((s) => s.until!);
    expect([...acts].sort((x, y) => x - y)).toEqual(acts);
    expect(acts.at(-1)).toBe(TUTORIAL_ROUTE.length);
    expect(TUTORIAL_SCRIPT.at(-1)!.free).toBe(true);
    let s = initialTutorial;
    for (let i = 0; i < 200 && s.step < TUTORIAL_SCRIPT.length - 1; i++) {
      const cur = TUTORIAL_SCRIPT[s.step]!;
      s = tutorialReduce(TUTORIAL_SCRIPT, s, cur.kind === 'ui' ? { type: 'ui', name: cur.event! } : wantedBeat(TUTORIAL_SCRIPT, s) ? { type: 'played' } : { type: 'continue' });
    }
    expect(s).toEqual({ step: TUTORIAL_SCRIPT.length - 1, cursor: TUTORIAL_ROUTE.length });
  });
  it('compares actions whatever order the view built their fields in', () => {
    const beat = TUTORIAL_ROUTE.find((b) => b.play.type === 'redeploy')!;
    expect(matchesBeat(beat, JSON.parse(JSON.stringify({ moves: [{ back: false, match: 0, creature: 1 }], type: 'redeploy' })))).toBe(true);
  });
});
