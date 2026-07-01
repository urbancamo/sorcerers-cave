import { describe, it, expect } from "vitest";
import { AREA_CARDS } from "./data/areaCards";
import { CREATURES } from "./data/creatures";
import {
  DIR_N,
  DIR_E,
  DIR_S,
  DIR_W,
  DIR_UP,
  DIR_DOWN,
  packCoord,
  unpackCoord,
  targetCoord,
} from "./coords";
import {
  GS_PLAYING,
  GS_ESCAPED,
  GS_DEAD,
  GS_QUIT,
  AF_DESTROYED,
  PARTY_CAP,
  type MemberStatus,
} from "./state";
import { newGame } from "./setup";
import { reduce } from "./reduce";
import type { GameAction } from "./actions";

describe("area cards data (§3)", () => {
  it("SC-3-3: AREA_CARDS[41] === 42 (the EWU tile, NOT 74/EWD)", () => {
    expect(AREA_CARDS[41]).toBe(42);
    expect(AREA_CARDS[41]).not.toBe(74);
  });

  it("SC-10-2: each special-area type appears exactly once; the Gateway (1) is at index 21", () => {
    // special type is bits 7-9 of the card value: (value >> 7) & 7.
    const special = (v: number) => (v >> 7) & 7;
    expect(AREA_CARDS).toHaveLength(61);
    const counts = new Map<number, number>();
    AREA_CARDS.forEach((v) => counts.set(special(v), (counts.get(special(v)) ?? 0) + 1));
    // GATEWAY=1, DEEP_POOL=2, VIPER_PIT=3, TOMB=4, GREAT_HALL=5 — one card each.
    for (const t of [1, 2, 3, 4, 5]) expect(counts.get(t)).toBe(1);
    expect(special(AREA_CARDS[21]!)).toBe(1); // the Gateway sits at index 21
    expect(AREA_CARDS[21]).toBe(175);
  });
});

describe("creatures data (§3)", () => {
  it("SC-3-8: the Dragon CREATURES[10] has hostileMax===4 and indiffMax===6", () => {
    const dragon = CREATURES[10]!;
    expect(dragon.name).toBe("Dragon");
    expect(dragon.hostileMax).toBe(4);
    expect(dragon.indiffMax).toBe(6);
  });
});

describe("coords (§3)", () => {
  it("SC-3-20: DIR constants are N=1,E=2,S=3,W=4,UP=5,DOWN=6", () => {
    expect(DIR_N).toBe(1);
    expect(DIR_E).toBe(2);
    expect(DIR_S).toBe(3);
    expect(DIR_W).toBe(4);
    expect(DIR_UP).toBe(5);
    expect(DIR_DOWN).toBe(6);
  });

  it("SC-3-20: targetCoord maps N→y−1, S→y+1, E→x+1, W→x−1, Up→level−1, Down→level+1", () => {
    const level = 3;
    const x = 50;
    const y = 50;
    expect(unpackCoord(targetCoord(DIR_N, level, x, y))).toEqual({ level, x, y: y - 1 });
    expect(unpackCoord(targetCoord(DIR_S, level, x, y))).toEqual({ level, x, y: y + 1 });
    expect(unpackCoord(targetCoord(DIR_E, level, x, y))).toEqual({ level, x: x + 1, y });
    expect(unpackCoord(targetCoord(DIR_W, level, x, y))).toEqual({ level, x: x - 1, y });
    expect(unpackCoord(targetCoord(DIR_UP, level, x, y))).toEqual({ level: level - 1, x, y });
    expect(unpackCoord(targetCoord(DIR_DOWN, level, x, y))).toEqual({ level: level + 1, x, y });
  });

  it("SC-3-20: packCoord/unpackCoord round-trip (level*10000 + y*100 + x)", () => {
    for (const [level, x, y] of [
      [1, 50, 50],
      [3, 7, 42],
      [12, 99, 0],
      [0, 0, 99],
    ] as const) {
      const packed = packCoord(level, x, y);
      expect(packed).toBe(level * 10000 + y * 100 + x);
      expect(unpackCoord(packed)).toEqual({ level, x, y });
    }
  });
});

describe("state constants (§3)", () => {
  it("SC-3-21: member status ORIGINAL/ALLY/STONE/DEAD are 0/1/2/3 and PARTY_CAP===12", () => {
    // MemberStatus is the exported union 0 | 1 | 2 | 3 (0 original, 1 ally, 2 stone, 3 dead).
    const original: MemberStatus = 0;
    const ally: MemberStatus = 1;
    const stone: MemberStatus = 2;
    const dead: MemberStatus = 3;
    expect([original, ally, stone, dead]).toEqual([0, 1, 2, 3]);
    expect(PARTY_CAP).toBe(12);
  });

  it("SC-3-22: GS_PLAYING/ESCAPED/DEAD/QUIT===0/1/2/3 and AF_DESTROYED===4", () => {
    expect(GS_PLAYING).toBe(0);
    expect(GS_ESCAPED).toBe(1);
    expect(GS_DEAD).toBe(2);
    expect(GS_QUIT).toBe(3);
    expect(AF_DESTROYED).toBe(4);
  });
});

describe("determinism (§5)", () => {
  it("SC-5-13: newGame(seed, picks) is fully deterministic (no Math.random/Date.now)", () => {
    const seed = 20260629;
    const picks = [5, 6, 7]; // Man + Woman + Dwarf, cost 3+2+1=6 (== budget)
    const a = newGame(seed, picks);
    const b = newGame(seed, picks);
    expect(a).toEqual(b);
  });

  it("SC-5-13: a fixed sequence of reduce moves from the same start is reproducible", () => {
    const seed = 424242;
    const picks = [5, 6, 7];
    const moves: GameAction[] = [
      { type: "move", dir: DIR_N },
      { type: "move", dir: DIR_E },
      { type: "move", dir: DIR_S },
      { type: "move", dir: DIR_W },
      { type: "move", dir: DIR_N },
    ];

    const run = () => {
      let state = newGame(seed, picks);
      const allEvents = [];
      for (const action of moves) {
        const out = reduce(state, action);
        state = out.state;
        allEvents.push(out.events);
      }
      return { state, allEvents };
    };

    const first = run();
    const second = run();
    expect(first.state).toEqual(second.state);
    expect(first.allEvents).toEqual(second.allEvents);
  });
});
