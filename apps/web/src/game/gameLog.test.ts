import { describe, it, expect, vi, afterEach } from "vitest";
import { newGame, reduce, replay, type GameAction, type GameEvent } from "@sorcerers-cave/engine";
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
    expect(actionLabel({ type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] })).toMatch(/1 matchup/);
    expect(actionLabel({ type: "exitCave" })).toBe("Exit the cave");
  });
});

describe("describeEvent", () => {
  it("describes mapped events and falls back to the raw type for anything unmapped", () => {
    expect(describeEvent({ type: "moved", area: 1, level: 1 })).toMatch(/area 1 \(level 1\)/);
    expect(describeEvent({ type: "reaction", outcome: "hostile", roll: 3 })).toMatch(/hostile.*3/);
    // Unknown event type → raw fallback (nothing is silently dropped).
    expect(describeEvent({ type: "somethingNew" } as unknown as GameEvent)).toBe("somethingNew");
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
    expect(text).toMatch(/→ moved to area/);
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
