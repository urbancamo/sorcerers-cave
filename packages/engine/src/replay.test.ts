import { describe, it, expect } from "vitest";
import { replay } from "./replay";
import { newGame } from "./setup";
import { reduce } from "./reduce";
import { DIR_N, DIR_E, DIR_S, DIR_W } from "./coords";
import type { GameAction, GameEvent } from "./actions";

const PICKS = [0]; // a lone Hero (selection value 6 = the full budget)
// A representative action stream. Some entries may be blocked no-ops in a given game — replay must
// reproduce those too, so the script deliberately doesn't depend on any particular outcome.
const SCRIPT: GameAction[] = [
  { type: "move", dir: DIR_S },
  { type: "move", dir: DIR_E },
  { type: "move", dir: DIR_N },
  { type: "move", dir: DIR_W },
  { type: "move", dir: DIR_S },
  { type: "exitCave" },
];

/** Play a game live, capturing exactly what the DB's gameEvents table would store: the ordered
 *  actions and the events each produced. */
function record(
  seed: number,
  picks: readonly number[],
  script: readonly GameAction[],
  variants?: { extensionKit?: boolean },
) {
  let state = newGame(seed, picks, variants);
  const rows: { action: GameAction; events: GameEvent[] }[] = [];
  for (const action of script) {
    const r = reduce(state, action);
    rows.push({ action, events: r.events });
    state = r.state;
  }
  return { finalState: state, rows };
}

describe("replay (deterministic move-by-move reconstruction)", () => {
  it("reproduces the exact final state and per-move events from the action log alone", () => {
    const seed = 987654321;
    const rec = record(seed, PICKS, SCRIPT);
    // Replay is given ONLY seed + picks + the action list — the same data the machine-readable log holds.
    const frames = replay(seed, PICKS, rec.rows.map((r) => r.action));
    expect(frames).toHaveLength(SCRIPT.length + 1); // +1 for the initial frame
    expect(frames[frames.length - 1]!.state).toEqual(rec.finalState);
    // Each replayed move regenerates the exact consequences that were recorded.
    rec.rows.forEach((row, i) => expect(frames[i + 1]!.events).toEqual(row.events));
  });

  it("frame 0 is the untouched initial state; frame i is the state after i actions", () => {
    const seed = 42;
    const frames = replay(seed, PICKS, SCRIPT);
    expect(frames[0]!.seq).toBe(0);
    expect(frames[0]!.action).toBeNull();
    expect(frames[0]!.events).toEqual([]);
    expect(frames[0]!.state).toEqual(newGame(seed, PICKS));
    // Walk the fold independently and compare every frame (state, action, seq).
    let s = newGame(seed, PICKS);
    for (let i = 0; i < SCRIPT.length; i++) {
      s = reduce(s, SCRIPT[i]!).state;
      expect(frames[i + 1]!.seq).toBe(i + 1);
      expect(frames[i + 1]!.action).toEqual(SCRIPT[i]);
      expect(frames[i + 1]!.state).toEqual(s);
    }
  });

  it("is deterministic — replaying the same log twice yields identical frames", () => {
    expect(replay(7, PICKS, SCRIPT)).toEqual(replay(7, PICKS, SCRIPT));
  });

  it("holds across a seed sweep", () => {
    for (const seed of [1, 2, 3, 100, 12345, 999999]) {
      const rec = record(seed, PICKS, SCRIPT);
      const frames = replay(seed, PICKS, rec.rows.map((r) => r.action));
      expect(frames[frames.length - 1]!.state).toEqual(rec.finalState);
    }
  });

  it("an empty action list yields just the initial frame", () => {
    const frames = replay(3, PICKS, []);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.state).toEqual(newGame(3, PICKS));
  });
});

describe("replay — extension kit variants (SC-EXT-29)", () => {
  const KIT = { extensionKit: true };
  const KIT_PICKS = [18, 20]; // Witch + Wolf, cost 6 — only selectable kit-on

  it("threads variants into newGame so a kit-on game's decks/state reconstruct exactly", () => {
    const seed = 555;
    const rec = record(seed, KIT_PICKS, SCRIPT, KIT);
    const frames = replay(seed, KIT_PICKS, rec.rows.map((r) => r.action), KIT);
    expect(frames[0]!.state).toEqual(newGame(seed, KIT_PICKS, KIT));
    expect(frames[frames.length - 1]!.state).toEqual(rec.finalState);
  });

  it("omitting variants (old codes) decodes kit-off — identical to no fourth argument at all", () => {
    const seed = 61;
    const a = replay(seed, PICKS, SCRIPT);
    const b = replay(seed, PICKS, SCRIPT, undefined);
    expect(a).toEqual(b);
    expect(a[0]!.state.variants).toBeUndefined();
  });
});
