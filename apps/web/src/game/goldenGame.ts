import { replay, type GameAction } from "@sorcerers-cave/engine";
import golden from "../data/golden-game.json";
import type { ReplayBundle } from "./ReplayView";

/** The reserved replay code for the golden game: type it into the splash screen's replay box. */
export const GOLDEN_CODE = "GOLD";

// The record is generated from a conformance-vector run (packages/engine/src/conformance-vectors.test.ts,
// "golden game") and holds only the initial conditions and the action list. It lives in the app bundle
// rather than in Convex so opening it writes nothing to the shared backend and can never drift from the
// engine version it ships with — that test fails first if it would.
const RECORDS = golden as Record<string, { seed: number; picks: number[]; actions: GameAction[] }>;

/** The replay bundle for a golden-game code (case and surrounding spaces ignored), or null if it isn't one. */
export function goldenBundle(code: string): ReplayBundle | null {
  const key = code.trim().toUpperCase();
  const rec = RECORDS[key];
  if (!rec) return null;
  // One engine pass derives each move's events for the viewer's log, exactly as a Convex-stored game's
  // `gameEvents` rows carry them; frame 0 is the initial deal and has no move.
  const frames = replay(rec.seed, rec.picks, rec.actions);
  return {
    replayable: true,
    game: { code: key, seed: rec.seed, picks: rec.picks, color: null, status: "finished", createdAt: 0 },
    moves: frames.slice(1).map((f) => ({ seq: f.seq, action: f.action as GameAction, events: f.events })),
  };
}
