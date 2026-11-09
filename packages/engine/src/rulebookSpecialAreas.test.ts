import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { SPECIAL_WELL, SPECIAL_BELL_ROPE, SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_WHIRLPOOL, SPECIAL_TOMB, SPECIAL_GREAT_HALL } from "./data/areaCards";
import { deepPoolCrossing, viperCrossing, whirlpoolCrossing } from "./special";
import { rollDie } from "./rng";
import { GS_PLAYING, type GameState, type PartyMember } from "./state";

/**
 * Special area cards, checked against Peter's Expanded Consolidated Rules PV2026 V2 (§Special area cards).
 * Clause list: docs/validation/clauses/special-areas.md. Differences are recorded in the rulings register
 * (R-29, R-30) and asserted with `it.fails` so they turn red the day the engine changes.
 */

const MAN = 5;
const GIANT = 12;
const member = (creatureId: number, treasure: number[] = []): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure });
const tile = (special: number) => (special << 7) | 31;
const scene = (special: number, over: Partial<GameState>): GameState => makeState({
  gs: GS_PLAYING, phase: "explore",
  areas: [{ card: tile(special), coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
  partyArea: 0, prev: 0, smallPack: [], smallIdx: 0, ...over,
});
const seedFor = (want: (v: number) => boolean): number => { for (let s = 1; s < 100000; s++) if (want(rollDie(s).value)) return s; throw new Error('no seed'); };

describe('Viper pit: "creature perishes with roll of 1 or 2"', () => {
  it.each([1, 2, 3, 4, 5, 6])('a roll of %i', (face) => {
    const seed = seedFor((v) => v === face);
    const s = scene(SPECIAL_VIPER_PIT, { party: [member(MAN)], seed });
    viperCrossing(s, 0);
    expect(s.party[0]!.status).toBe(face <= 2 ? 3 : 0);
  });
  it('a creature that falls loses what it carried', () => {
    const s = scene(SPECIAL_VIPER_PIT, { party: [member(MAN, [0, 1])], seed: seedFor((v) => v === 1) });
    viperCrossing(s, 0);
    expect(s.party[0]!.treasure).toEqual([]);
  });
});

describe('Whirlpool: "roll die each time the party crosses; on 1 or 2 the entire party goes to the area below"', () => {
  it.each([1, 2, 3, 4, 5, 6])('a roll of %i drags the party only on 1-2, and only one die is rolled', (face) => {
    const s = scene(SPECIAL_WHIRLPOOL, { party: [member(MAN), member(MAN), member(MAN)], seed: seedFor((v) => v === face) });
    const { events, dragged } = whirlpoolCrossing(s);
    expect(dragged).toBe(face <= 2);
    expect(events).toHaveLength(1);
  });
});

describe('Tomb of Kings and Great Hall: extra small cards', () => {
  it('the card ids are the book\'s two areas', () => {
    expect(SPECIAL_TOMB).toBeDefined();
    expect(SPECIAL_GREAT_HALL).toBeDefined();
  });
});

describe('Bell Rope: "assign one to pull it. 1 puller disappears. 2-3 bell rings. 4-6 draw 2 small cards and do not withdraw. Once only."', () => {
  const bell = (seed: number) => scene(SPECIAL_BELL_ROPE, { party: [member(MAN), member(MAN)], seed, smallPack: [100 + MAN, 100 + MAN], smallIdx: 0 });
  it('1: the puller disappears, the rest stay', () => {
    const { state } = reduce(bell(seedFor((v) => v === 1)), { type: "pullBellRope", mi: 0 });
    expect(state.party.filter((m) => m.status === 0)).toHaveLength(1);
  });
  it('2-3: nothing happens', () => {
    const { state } = reduce(bell(seedFor((v) => v === 2 || v === 3)), { type: "pullBellRope", mi: 0 });
    expect(state.party.filter((m) => m.status === 0)).toHaveLength(2);
    expect(state.smallIdx).toBe(0);
  });
  it('4-6: two small cards are drawn, and the party may not withdraw', () => {
    const { state } = reduce(bell(seedFor((v) => v >= 4)), { type: "pullBellRope", mi: 0 });
    expect(state.smallIdx).toBe(2);
    expect(reduce(state, { type: "withdraw" }).events.some((e) => e.type === "blocked")).toBe(true);
  });
  it('once only, whatever the roll', () => {
    const { state } = reduce(bell(seedFor((v) => v === 2)), { type: "pullBellRope", mi: 0 });
    expect(reduce(state, { type: "pullBellRope", mi: 0 }).events.some((e) => e.type === "blocked")).toBe(true);
  });
});

describe('Well: "you may draw 1 small card and not withdraw"; surprise if attacking a stranger crawling up the shaft', () => {
  const well = (over: Partial<GameState> = {}) => scene(SPECIAL_WELL, { party: [member(MAN)], smallPack: [100 + MAN], smallIdx: 0, ...over });
  it('draws exactly one card, and the party may not withdraw that turn', () => {
    const { state } = reduce(well(), { type: 'drawFromWell' });
    expect(state.smallIdx).toBe(1);
    expect(reduce(state, { type: 'withdraw' }).events.some((e) => e.type === 'blocked')).toBe(true);
  });
  // R-29: Peter gives the party surprise against a stranger drawn from the Well; the engine gives none.
  it('R-29: attacking a stranger drawn from the Well has the advantage of surprise', () => {
    const { state } = reduce(well(), { type: 'drawFromWell' });
    expect(reduce(state, { type: 'attack' }).events).toContainEqual({ type: 'fightStarted', surprise: 1 });
  });
});

describe('Deep Pool: heavy treasure and the Giant', () => {
  it('without a Giant, heavy treasure is left behind', () => {
    const s = scene(SPECIAL_DEEP_POOL, { party: [member(MAN, [0, 1])] });
    deepPoolCrossing(s, 0);
    expect(s.party[0]!.treasure).toEqual([]);
    expect(s.areas[0]!.dropped).toEqual([0, 1]);
  });
  it('a Giant carries the heavy treasure across', () => {
    const s = scene(SPECIAL_DEEP_POOL, { party: [member(GIANT), member(MAN, [0])] });
    expect(deepPoolCrossing(s, 0)).toEqual([]);
  });
  // R-30: a load is the Giant's 150 kg (six 25 kg sacks); each extra load costs the party one turn.
  it('R-30: six sacks is one load, no delay', () => {
    const s = scene(SPECIAL_DEEP_POOL, { party: [member(GIANT, [0, 0, 0]), member(MAN, [0, 0, 0])], turn: 5 });
    expect(deepPoolCrossing(s, 0)).toEqual([]);
    expect(s.turn).toBe(5);
  });
  it('R-30: seven sacks is two loads, so the party is delayed one turn', () => {
    const s = scene(SPECIAL_DEEP_POOL, { party: [member(GIANT, [0, 0, 0, 0]), member(MAN, [0, 0, 0])], turn: 5 });
    expect(deepPoolCrossing(s, 0)).toEqual([{ type: 'deepPoolDelay', loads: 2, turns: 1 }]);
    expect(s.turn).toBe(6);
  });
  it('R-30: thirteen sacks is three loads, two turns; two Giants carry twice as much', () => {
    const a = scene(SPECIAL_DEEP_POOL, { party: [member(GIANT, [0, 0, 0, 0, 0, 0]), member(MAN, [0, 0, 0, 0, 0, 0, 0])], turn: 1 });
    expect(deepPoolCrossing(a, 0)).toEqual([{ type: 'deepPoolDelay', loads: 3, turns: 2 }]);
    const b = scene(SPECIAL_DEEP_POOL, { party: [member(GIANT, [0, 0, 0, 0, 0, 0]), member(GIANT, [0, 0, 0, 0, 0, 0]), member(MAN)], turn: 1 });
    expect(deepPoolCrossing(b, 0)).toEqual([]);
  });
});
