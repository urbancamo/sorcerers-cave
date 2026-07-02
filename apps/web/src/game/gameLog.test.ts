import { describe, it, expect, vi, afterEach } from "vitest";
import { newGame, reduce, replay, type GameAction, type GameEvent, type GameState } from "@sorcerers-cave/engine";
import { actionLabel, describeEvent, formatLog, machineLog, downloadLog, type GameLog } from "./gameLog";

const SEED = 7;
const PICKS = [0]; // Hero

/** Build a realistic log by driving the real engine, exactly as the DB would record it. */
function sampleLog(over: Partial<GameLog["game"]> = {}): GameLog {
  const script: GameAction[] = [{ type: "move", dir: 1 }, { type: "test" }, { type: "attack" }];
  let s = newGame(SEED, PICKS);
  const moves: GameLog["moves"] = [];
  let seq = 0;
  for (const action of script) {
    const r = reduce(s, action);
    const blocked = r.events.length === 1 && r.events[0]!.type === "blocked";
    if (!blocked) moves.push({ seq: seq++, action, events: r.events });
    s = r.state;
  }
  return {
    game: { code: "ABCD", seed: SEED, picks: PICKS, color: "green", status: "active", createdAt: 1_720_000_000_000, ...over },
    moves,
  };
}

describe("actionLabel", () => {
  it("labels the common actions readably", () => {
    expect(actionLabel({ type: "move", dir: 1 })).toBe("Move north");
    expect(actionLabel({ type: "retreat", dir: 4 })).toBe("Retreat west");
    expect(actionLabel({ type: "test" })).toMatch(/reaction/i);
    expect(actionLabel({ type: "exitCave" })).toBe("Exit the cave");
  });

  it("names the treasure and creature (not indices) when given the pre-move state", () => {
    // Treasure ids: 0 Silver, 1 Gold, 3 Magic Sword. Creature ids: 0 Hero, 4 Priest, 5 Man.
    const chamber = { treasures: [1], party: [{ creatureId: 0, treasure: [] }] } as unknown as GameState;
    expect(actionLabel({ type: "takeTreasure", ti: 0, mi: 0 }, chamber)).toBe("Take Gold → Hero");

    const carrying = { treasures: [], party: [{ creatureId: 0, treasure: [3] }, { creatureId: 5, treasure: [] }] } as unknown as GameState;
    expect(actionLabel({ type: "moveTreasure", from: 0, to: 1, idx: 0 }, carrying)).toBe("Give Magic Sword from Hero to Man");
    expect(actionLabel({ type: "dropTreasure", mi: 0, idx: 0 }, carrying)).toBe("Drop Magic Sword (Hero)");

    const losing = { party: [{ creatureId: 4 }] } as unknown as GameState;
    expect(actionLabel({ type: "chooseCasualty", idx: 0 }, losing)).toBe("Let Priest fall");
  });

  it("falls back to indices when no state is available (a game that predates logging)", () => {
    expect(actionLabel({ type: "takeTreasure", ti: 2, mi: 1 })).toBe("Take item #2 → member #1");
    expect(actionLabel({ type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] })).toMatch(/1 matchup/);
  });
});

describe("describeEvent", () => {
  it("describes mapped events and falls back to the raw type for anything unmapped", () => {
    expect(describeEvent({ type: "moved", area: 1, level: 1 })).toMatch(/area 1 \(level 1\)/);
    expect(describeEvent({ type: "reaction", outcome: "hostile", roll: 3 })).toMatch(/hostile.*3/);
    // Unknown event type → raw fallback (nothing is silently dropped).
    expect(describeEvent({ type: "somethingNew" } as unknown as GameEvent)).toBe("somethingNew");
  });

  it("appends the tile type + layout (exits, stairs, special) to a moved event when the state is given", () => {
    // 31 = NSEW chamber (all four exits, no stairs, not special).
    const chamber = { areas: [{ card: 31 }] } as unknown as GameState;
    expect(describeEvent({ type: "moved", area: 0, level: 1 }, chamber)).toBe("moved to area 0 (level 1) — chamber · exits N E S W");
    // 175 = the Gateway: NSEW + stair up + special.
    const gateway = { areas: [{ card: 175 }] } as unknown as GameState;
    expect(describeEvent({ type: "moved", area: 0, level: 1 }, gateway)).toBe("moved to area 0 (level 1) — the Gateway · exits N E S W · stair up");
    // 71 = NESD tunnel (N,E,S doors + stair down, no chamber bit).
    const tunnel = { areas: [{ card: 71 }] } as unknown as GameState;
    expect(describeEvent({ type: "moved", area: 0, level: 2 }, tunnel)).toBe("moved to area 0 (level 2) — tunnel · exits N E S · stair down");
  });

  it("omits tile info when no state is available (a game that predates logging)", () => {
    expect(describeEvent({ type: "moved", area: 0, level: 1 })).toBe("moved to area 0 (level 1)");
  });
});

describe("formatLog", () => {
  it("renders a header and one block per move with described consequences", () => {
    const text = formatLog(sampleLog());
    expect(text).toMatch(/Sorcerer's Cave — Game Log/);
    expect(text).toMatch(/Code: ABCD/);
    expect(text).toMatch(/Seed: 7/);
    expect(text).toMatch(/Party: Hero/);
    expect(text).toMatch(/#1\s+Move north/);
    // The moved line carries the tile's type and layout (kind · exits [· stair …]).
    expect(text).toMatch(/→ moved to area \d+ \(level 1\) — (chamber|tunnel|the Gateway|Deep Pool|Viper Pit|Tomb of Kings|Great Hall) · exits [NESW ]/);
  });

  it("names a picked-up treasure in the log by reconstructing the pre-move state", () => {
    // Find a seed whose first move south lands the (100 kg-carrying) Ogre in a treasure chamber.
    const PICKS_OGRE = [2];
    let seed = -1, tid = -1;
    for (let s = 1; s < 4000 && seed < 0; s++) {
      const r = reduce(newGame(s, PICKS_OGRE), { type: "move", dir: 3 });
      if (r.state.phase === "pickup" && r.state.treasures.length > 0) { seed = s; tid = r.state.treasures[0]!; }
    }
    expect(seed).toBeGreaterThan(0); // sanity: such a seed exists

    // Record the move + the pickup, exactly as the DB would.
    const script: GameAction[] = [{ type: "move", dir: 3 }, { type: "takeTreasure", ti: 0, mi: 0 }];
    let st = newGame(seed, PICKS_OGRE);
    const moves: GameLog["moves"] = [];
    let seq = 0;
    for (const action of script) { const r = reduce(st, action); moves.push({ seq: seq++, action, events: r.events }); st = r.state; }
    const log: GameLog = { game: { code: "OGRE", seed, picks: PICKS_OGRE, color: null, status: "active", createdAt: 0 }, moves };

    const treasureName = { 0: "Silver", 1: "Gold", 2: "Gems", 14: "Treasure Chest" }[tid] ?? "?";
    expect(formatLog(log)).toMatch(new RegExp(`Take ${treasureName} → Ogre`));
  });

  it("warns when the game predates initial-condition logging (no seed)", () => {
    const text = formatLog(sampleLog({ seed: null, picks: null }));
    expect(text).toMatch(/predates.*logging/i);
    expect(text).toMatch(/Seed: unavailable/);
  });
});

describe("machineLog", () => {
  it("is versioned JSON whose actions replay to reproduce the game", () => {
    const log = sampleLog();
    const parsed = JSON.parse(machineLog(log));
    expect(parsed.version).toBe(1);
    expect(parsed.game.seed).toBe(SEED);
    expect(parsed.moves).toHaveLength(log.moves.length);
    // The machine log is self-contained: its actions + seed/picks reconstruct every frame.
    const frames = replay(parsed.game.seed, parsed.game.picks, parsed.moves.map((m: { action: GameAction }) => m.action));
    expect(frames).toHaveLength(log.moves.length + 1);
  });
});

describe("downloadLog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("downloads a .json machine log with the game code in the filename", () => {
    const created: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((b: Blob | MediaSource) => { created.push(b as Blob); return "blob:mock"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let downloadName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloadName = this.download; });

    downloadLog(sampleLog(), "machine");
    expect(downloadName).toBe("ABCD-log.json");
    expect(created).toHaveLength(1);
    expect(created[0]!.type).toBe("application/json");
  });

  it("downloads a .txt human log", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let downloadName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloadName = this.download; });

    downloadLog(sampleLog(), "human");
    expect(downloadName).toBe("ABCD-log.txt");
  });
});
