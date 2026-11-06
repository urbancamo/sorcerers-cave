import { ALL_CREATURES, replay, scoreBreakdown, type GameAction } from "@sorcerers-cave/engine";
import type { ReplayBundle } from "./ReplayView";

/** The replay codes for the 75 searched games: a rules prefix and a three-digit rank within that rule set —
 *  `B001`–`B025` base game, `K001`–`K025` Extension Kit, `S001`–`S025` kit + Sibyl. `K001` is the best score found.
 *  A real game code is always four letters A–Z, so a code with digits can never be one. */
export const SCENARIO_CODE = /^[BKS]\d{3}$/;
export const isScenarioCode = (code: string) => SCENARIO_CODE.test(code.trim().toUpperCase());

type Scenario = { seed: number; picks: number[]; variants?: ReplayBundle["game"]["variants"]; actions: GameAction[] };

// The records are generated from the engine's pinned search results (packages/engine/src/fixtures/top-score-games.json, via the
// "scenario games" test in conformance-vectors.test.ts) and hold only the initial conditions, variants and the action list. They
// live in the app bundle rather than in Convex so opening one writes nothing to the shared backend and can never drift from the
// engine version it ships with — that test fails first if it would. They are loaded on demand (about 700 KB) so the game's
// main bundle doesn't carry them.
let records: Promise<Record<string, Scenario>> | null = null;
const load = () => (records ??= import("../data/scenario-games.json").then((m) => m.default as unknown as Record<string, Scenario>));

/** The replay bundle for a scenario code (case and surrounding spaces ignored), or null if it isn't one. */
export async function goldenBundle(code: string): Promise<ReplayBundle | null> {
  const key = code.trim().toUpperCase();
  if (!SCENARIO_CODE.test(key)) return null;
  const rec = (await load())[key];
  if (!rec) return null;
  // One engine pass derives each move's events for the viewer's log, exactly as a Convex-stored game's
  // `gameEvents` rows carry them; frame 0 is the initial deal and has no move.
  const frames = replay(rec.seed, rec.picks, rec.actions, rec.variants);
  return {
    replayable: true,
    game: { code: key, seed: rec.seed, picks: rec.picks, variants: rec.variants, color: null, status: "finished", createdAt: 0 },
    moves: frames.slice(1).map((f) => ({ seq: f.seq, action: f.action as GameAction, events: f.events })),
  };
}

/** The three rule sets, by code prefix. */
export const SCENARIO_SETS = [
  { prefix: "B", label: "Base game" },
  { prefix: "K", label: "Extension Kit" },
  { prefix: "S", label: "Kit + Sibyl" },
] as const;

/** One row of the scenario browser: what the game is and how it ended, derived by replaying it. */
export interface ScenarioSummary {
  code: string;
  score: number;
  draft: string;       // the starting party, e.g. "Hero, Man ×2"
  moves: number;
  slain: boolean;      // the Sorcerer was slain
  sibyl: boolean;      // the Sibyl joined
  alive: number;       // party members who walked out
  total: number;       // party members at the end, living or not
}

const draftName = (picks: number[]) => {
  const n = new Map<string, number>();
  for (const id of picks) { const name = ALL_CREATURES.find((c) => c.id === id)?.name ?? `#${id}`; n.set(name, (n.get(name) ?? 0) + 1); }
  return [...n].map(([name, k]) => (k > 1 ? `${name} ×${k}` : name)).join(", ");
};

/** Summaries of the 25 games of one rule set (prefix B, K or S), best first. Each is replayed once on the engine. */
export async function scenarioSummaries(prefix: string): Promise<ScenarioSummary[]> {
  const all = await load();
  return Object.keys(all)
    .filter((code) => code.startsWith(prefix))
    .sort()
    .map((code) => {
      const rec = all[code]!;
      const frames = replay(rec.seed, rec.picks, rec.actions, rec.variants);
      const end = frames[frames.length - 1]!.state;
      const events = frames.flatMap((f) => f.events);
      return {
        code,
        score: scoreBreakdown(end).total,
        draft: draftName(rec.picks),
        moves: rec.actions.length,
        slain: events.some((e) => e.type === "sorcererSlain"),
        sibyl: events.some((e) => e.type === "sibylJoins"),
        alive: end.party.filter((m) => m.status === 0 || m.status === 1).length,
        total: end.party.length,
      };
    });
}
