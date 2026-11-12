import { describe, expect, it } from 'vitest';
import { replay } from '@sorcerers-cave/engine';
import { goldenBundle } from '../game/goldenGame';
import { DEMO_CAPTIONS, DEMO_CODE, DEMO_FRAMES } from './demo';

describe('the tutorial demo game', () => {
  it('replays cleanly for as long as it plays, and every caption names a move inside it', async () => {
    const b = (await goldenBundle(DEMO_CODE))!;
    const frames = replay(b.game.seed!, b.game.picks!, b.moves.map((m) => m.action), b.game.variants, b.game.testMode).slice(0, DEMO_FRAMES + 1);
    expect(frames).toHaveLength(DEMO_FRAMES + 1);
    expect(frames.flatMap((f) => f.events).some((e) => e.type === 'blocked')).toBe(false);
    for (const at of Object.keys(DEMO_CAPTIONS).map(Number)) expect(at).toBeLessThanOrEqual(DEMO_FRAMES);
    expect(DEMO_CAPTIONS[0]).toBeTruthy();
  });
  it('captions the moves they describe: a reaction test, the stair down, the Troll and the withdrawal, the friendly reaction', async () => {
    const b = (await goldenBundle(DEMO_CODE))!;
    const acts = b.moves.map((m) => m.action.type);
    expect(acts[2]).toBe('test'); // frame 3 is move 3
    expect(acts[15]).toBe('withdraw'); // frame 16
    expect(acts[20]).toBe('test'); // frame 21
  });
});
