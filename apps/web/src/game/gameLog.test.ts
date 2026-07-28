import { describe, it, expect, vi, afterEach } from "vitest";
import { newGame, reduce, replay, HAZARD_DESERTION, type GameAction, type GameEvent, type GameState } from "@sorcerers-cave/engine";
import { actionLabel, describeEvent, eventCode, formatLog, machineLog, downloadLog, logReport, type GameLog } from "./gameLog";

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

/** Drive a real game through `script` and package it as a log (as the DB would record it). */
function drive(script: GameAction[], over: Partial<GameLog["game"]> = {}): GameLog {
  let s = newGame(SEED, PICKS);
  const moves: GameLog["moves"] = [];
  let seq = 0;
  for (const action of script) {
    const r = reduce(s, action);
    moves.push({ seq: seq++, action, events: r.events });
    s = r.state;
  }
  return { game: { code: "ABCD", seed: SEED, picks: PICKS, color: "green", status: "finished", createdAt: 0, ...over }, moves };
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

  it("names the six extension-kit special areas (carry-forward, Task 16)", () => {
    // A chamber (bit16) card whose special nibble (bits 7-10, SC-EXT-1 width) is the given code.
    const cardFor = (special: number) => 16 | (special << 7);
    const namesOf = [
      [6, "the Chasm"], [7, "the Bell Rope"], [8, "the Lair"],
      [9, "the Whirlpool"], [10, "the Gallery"], [11, "the Well"],
    ] as const;
    for (const [special, tileName] of namesOf) {
      const state = { areas: [{ card: cardFor(special) }] } as unknown as GameState;
      expect(describeEvent({ type: "moved", area: 0, level: 1 }, state)).toContain(tileName);
    }
  });
});

describe("formatLog", () => {
  it("renders a header and one block per move with described consequences", () => {
    const text = formatLog(sampleLog());
    expect(text).toMatch(/The Sorcerer's Cave — Game Log/);
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

describe("logReport (132-col wide-carriage line-printer report)", () => {
  it("never exceeds 132 columns and is 7-bit ASCII, uppercase-only", () => {
    const text = logReport(sampleLog(), "1985-03-14 09:22:07");
    for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(132);
    expect(text).toMatch(/^[\x00-\x7F]*$/);   // pure ASCII (line-printer safe)
    expect(text).not.toMatch(/[a-z]/);        // uppercase throughout
  });

  it("has the banner, column header, END marker and KEY legend", () => {
    const text = logReport(sampleLog());
    expect(text).toMatch(/S O R C E R E R/);        // spaced banner
    expect(text).toMatch(/SEQ  TRN LVL  ARA ACT/);  // column header
    expect(text).toMatch(/E N D   O F   L O G/);    // end marker
    expect(text).toMatch(/KEY  CREATURE  HER=HERO/); // legend decodes the codes
    expect(text).toMatch(/SLV=SILVER/);
  });

  it("encodes actions and tiles with 3-letter codes", () => {
    const text = logReport(sampleLog()); // first action is Move north
    expect(text).toMatch(/\bMOV N\b/);
    expect(text).toMatch(/\b(CHM|TUN|GTW|POL|VPT|TMB|HAL)\b/); // a tile-type code appears
  });

  it("wraps the EVENTS column without splitting a record and keeps rows within 132", () => {
    // A rich, multi-event move (a chamber draw + several combat rolls) forces continuation lines.
    const log: GameLog = {
      game: { code: "WRAP", seed: 1, picks: [0], color: null, status: "active", createdAt: 0 },
      moves: [{
        seq: 0,
        action: { type: "move", dir: 3 },
        events: Array.from({ length: 6 }, (_, k) => ({
          type: "combatRoll" as const, party: "Hero", enemy: "Troll",
          partyRoll: 3, enemyRoll: 2, partyTotal: 7 + k, enemyTotal: 5, result: "partyWon" as const,
        })),
      }],
    };
    const text = logReport(log);
    for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(132);
    expect(text).not.toMatch(/CBT HER \d+ V TRL$/m); // a CBT record is never left dangling at a line end
  });
});

describe("score summary section", () => {
  it("appends a readable Score breakdown, total, and 'valid final score' when the party escaped", () => {
    const text = formatLog(drive([{ type: "exitCave" }])); // Hero exits the gateway → escaped
    expect(text).toMatch(/── Score ──/);
    expect(text).toMatch(/Hero — \d+/);          // the surviving Hero's creature points
    expect(text).toMatch(/Total: \d+/);
    expect(text).toMatch(/✓ Valid final score — the party escaped the cave \(recordable on the leaderboard\)\./);
  });

  it("marks an abandoned game as not a valid final score", () => {
    const text = formatLog(drive([{ type: "quit" }]));
    expect(text).toMatch(/✗ Not a valid final score — the expedition was abandoned in the cave\./);
  });

  it("shows a provisional verdict while the game is unfinished", () => {
    const text = formatLog(drive([])); // no moves → still on the surface, game not over
    expect(text).toMatch(/✗ Not a valid final score — the game is not yet finished\./);
  });

  it("notes the score is unavailable for a game that predates initial-condition logging", () => {
    expect(formatLog(sampleLog({ seed: null, picks: null }))).toMatch(/Score ──\nUnavailable — this game predates/);
    expect(logReport(sampleLog({ seed: null, picks: null }))).toMatch(/SCORE UNAVAILABLE - GAME PREDATES/);
  });

  it("appends a SCORE SUMMARY with TOTAL and STATUS to the printer report, staying ASCII/uppercase/≤132", () => {
    const text = logReport(drive([{ type: "exitCave" }]));
    expect(text).toMatch(/S C O R E   S U M M A R Y/);
    expect(text).toMatch(/^TOTAL SCORE\s+\d+$/m);
    expect(text).toMatch(/^STATUS\s+VALID FINAL SCORE - THE PARTY ESCAPED THE CAVE \(RECORDABLE\)$/m);
    for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(132);
    expect(text).toMatch(/^[\x00-\x7F]*$/); // pure ASCII (line-printer safe)
    expect(text).not.toMatch(/[a-z]/);      // uppercase throughout
  });
});

describe("extension kit (SC-EXT-29, design US-01) — game log", () => {
  it("formatLog's opening records 'Extension kit active' when the game's variants say so", () => {
    const text = formatLog(sampleLog({ variants: { extensionKit: true } }));
    expect(text).toMatch(/Extension kit active/);
  });

  it("formatLog omits the kit line for a kit-off (or pre-kit) game", () => {
    expect(formatLog(sampleLog())).not.toMatch(/Extension kit active/);
    expect(formatLog(sampleLog({ variants: { extensionKit: false } }))).not.toMatch(/Extension kit active/);
  });

  it("logReport's meta line notes KIT ON only for a kit-on game", () => {
    expect(logReport(sampleLog({ variants: { extensionKit: true } }))).toMatch(/KIT ON/);
    expect(logReport(sampleLog())).not.toMatch(/KIT ON/);
  });

  it("threads variants into replay() so a kit-on game's log (with a kit pick) reconstructs without throwing", () => {
    // Witch (18) + Wolf (20) are only a legal party when the kit is on — formatLog must pass
    // `game.variants` into replay() or this game can never be reconstructed to name its moves.
    const seed = 3, picks = [18, 20];
    const script: GameAction[] = [{ type: "move", dir: 1 }];
    let s = newGame(seed, picks, { extensionKit: true });
    const moves: GameLog["moves"] = [];
    let seq = 0;
    for (const action of script) { const r = reduce(s, action); moves.push({ seq: seq++, action, events: r.events }); s = r.state; }
    const log: GameLog = { game: { code: "KWLF", seed, picks, color: null, status: "active", createdAt: 0, variants: { extensionKit: true } }, moves };
    expect(formatLog(log)).toMatch(/Move north/);
    expect(formatLog(log)).toMatch(/Extension kit active/);
    expect(logReport(log)).toMatch(/MOV N/);
  });
});

describe("extension kit event coverage (review fix, Task 16) — gameLog", () => {
  it("names a kit creature/treasure by their real name, not 'creature N'/'treasure N' (SC-EXT-29)", () => {
    // creature()/treasure() (gameLog.ts) previously resolved via the base-only CREATURES/TREASURES
    // tables — a kit id (14-21) fell through to the raw-index fallback in the downloadable log.
    expect(describeEvent({ type: "memberDied", creatureId: 18 })).toBe("Witch was slain"); // kit creature
    expect(describeEvent({ type: "artifactUsed", artifact: 16 })).toBe("used Holy Water"); // kit treasure
  });

  it("describes every kit hazard/roll event instead of falling back to its raw type (SC-EXT-5..28)", () => {
    // One assertion per kit event family so none of them silently reads as a bare type string.
    expect(describeEvent({ type: "galleryStone", creatureIds: [18] })).toMatch(/gallery.*petrif.*witch/i);
    expect(describeEvent({ type: "staffWake", creatureIds: [16] })).toMatch(/staff.*wo.*lion/i);
    expect(describeEvent({ type: "lairStash", treasureIds: [16] })).toMatch(/lair.*holy water/i);
    expect(describeEvent({ type: "cryptParked" })).toMatch(/crypt/i);
    expect(describeEvent({ type: "cryptRoll", roll: 1, outcome: "trap" })).toMatch(/crypt.*rolled 1.*trap/i);
    expect(describeEvent({ type: "cryptRoll", roll: 5, outcome: "find" })).toMatch(/crypt.*rolled 5/i);
    expect(describeEvent({ type: "desertionRoll", creatureId: 19, roll: 1, deserted: true, items: [16] }))
      .toMatch(/thief.*vanish.*holy water/i);
    expect(describeEvent({ type: "desertionRoll", creatureId: 19, roll: 5, deserted: false, items: [] })).toMatch(/thief/i);
    expect(describeEvent({ type: "wolfUnmoved", hazard: HAZARD_DESERTION })).toMatch(/wolf.*unmoved/i);
    expect(describeEvent({ type: "harpiesSteal", treasureIds: [13], cursed: true })).toMatch(/harp.*eye of god.*curs/i);
    expect(describeEvent({ type: "harpiesLurk" })).toMatch(/harp/i);
    expect(describeEvent({ type: "quarrel", aId: 5, bId: 6, aRoll: 4, bRoll: 2, loserId: 6 })).toMatch(/quarrel.*man.*woman.*woman/i);
    expect(describeEvent({ type: "quarrel", aId: 5, bId: 6, aRoll: 3, bRoll: 3, loserId: null })).toMatch(/quarrel.*tie/i);
    expect(describeEvent({ type: "quarrelFizzled" })).toMatch(/quarrel.*fizzl/i);
    expect(describeEvent({ type: "spellRemap", fizzled: false })).toMatch(/spell/i);
    expect(describeEvent({ type: "spellRemap", fizzled: true })).toMatch(/spell.*fizzl/i);
    expect(describeEvent({ type: "demonDispersed" })).toMatch(/demon.*disperse/i);
    expect(describeEvent({ type: "demonUnfolds" })).toMatch(/demon.*unfold/i);
    expect(describeEvent({ type: "demonSlew", creatureId: 5 })).toMatch(/demon slew man/i);
    expect(describeEvent({ type: "elixirDrunk", creatureId: 0, roll: 4, outcome: "strength" })).toMatch(/hero.*elixir.*rolled 4.*strength/i);
    expect(describeEvent({ type: "holyWaterRevived", creatureId: 0 })).toMatch(/holy water.*revive.*hero/i);
    expect(describeEvent({ type: "holyWaterStatueWoke", creatureId: 16 })).toMatch(/holy water.*wo.*lion/i);
    expect(describeEvent({ type: "holyWaterMedusaDestroyed" })).toMatch(/holy water.*medusa/i);
    expect(describeEvent({ type: "holyWaterFoeDestroyed", creatureId: 15 })).toMatch(/holy water.*destroy.*demon/i);
    expect(describeEvent({ type: "holyWaterWeakened", creatureId: 11 })).toMatch(/holy water.*weaken.*sorcerer/i);
  });

  it("describes the remaining kit events found by cross-checking actions.ts (not literally named in the review)", () => {
    expect(describeEvent({ type: "thiefPalmed", tid: 16 })).toMatch(/thief.*palm.*holy water/i);
    expect(describeEvent({ type: "apprenticeTurned", count: 1, items: [16] })).toMatch(/apprentice.*turn.*holy water/i);
    expect(describeEvent({ type: "apprenticeStaysBehind", count: 1 })).toMatch(/apprentice.*stay/i);
    expect(describeEvent({ type: "demonSpawned" })).toMatch(/demon/i);
    expect(describeEvent({ type: "scrollRead", destroyed: [3], survivors: [9] })).toMatch(/scroll.*troll/i);
    expect(describeEvent({ type: "shieldWarded", creatureId: 3, mode: "nullify" })).toMatch(/shield.*ward.*troll/i);
  });

  it("codes every kit event distinctly for the printer report — never the raw 3-letter type-slice", () => {
    // eventCode()'s `default` case slices the raw type to 3 letters — that would silently COLLIDE
    // several kit event types onto the same ambiguous code (e.g. "DEM" for every one of
    // demonSpawned/demonDispersed/demonUnfolds/demonSlew; "HOL" for all five holyWater* events;
    // "HAR" for harpiesSteal/harpiesLurk; "APP" for both apprentice* events). Each kit event must
    // have its OWN real case, so same-prefix siblings stay distinguishable in the hardcopy.
    const kitEvents: GameEvent[] = [
      { type: "galleryStone", creatureIds: [18] }, { type: "staffWake", creatureIds: [16] },
      { type: "lairStash", treasureIds: [16] }, { type: "cryptParked" },
      { type: "cryptRoll", roll: 1, outcome: "trap" }, { type: "desertionRoll", creatureId: 19, roll: 1, deserted: true, items: [] },
      { type: "wolfUnmoved", hazard: HAZARD_DESERTION }, { type: "harpiesSteal", treasureIds: [13], cursed: true },
      { type: "harpiesLurk" }, { type: "quarrel", aId: 5, bId: 6, aRoll: 4, bRoll: 2, loserId: 6 },
      { type: "quarrelFizzled" }, { type: "spellRemap", fizzled: false },
      { type: "demonSpawned" }, { type: "demonDispersed" }, { type: "demonUnfolds" }, { type: "demonSlew", creatureId: 5 },
      { type: "elixirDrunk", creatureId: 0, roll: 4, outcome: "strength" }, { type: "holyWaterRevived", creatureId: 0 },
      { type: "holyWaterStatueWoke", creatureId: 16 }, { type: "holyWaterMedusaDestroyed" },
      { type: "holyWaterFoeDestroyed", creatureId: 15 }, { type: "holyWaterWeakened", creatureId: 11 },
      { type: "thiefPalmed", tid: 16 }, { type: "apprenticeTurned", count: 1, items: [] },
      { type: "apprenticeStaysBehind", count: 1 }, { type: "scrollRead", destroyed: [3], survivors: [9] },
      { type: "shieldWarded", creatureId: 3, mode: "nullify" },
    ];
    const codes = kitEvents.map(eventCode);
    for (const code of codes) {
      expect(code).not.toBeNull();
      expect(code!.length).toBeLessThanOrEqual(80); // sane upper bound — no runaway string
    }
    expect(new Set(codes).size).toBe(codes.length); // every kit event's code is unique
  });

  it("gates the printer report's KEY legend on kit status, preserving kit-off byte-identity", () => {
    // legend() unconditionally listing the kit creature/treasure codes would add new, unreachable
    // content to a KIT-OFF game's report (that deck can never draw a Witch or Holy Water) — same
    // "kit-off byte-identity" rule formatLog's "Extension kit active" line and logReport's own
    // "KIT ON" meta tag already honour.
    const kitOff = logReport(sampleLog());
    expect(kitOff).not.toMatch(/APR=APPRENTICE/);
    expect(kitOff).not.toMatch(/HLY=HOLY WATER/);
    expect(kitOff).toMatch(/KEY  CREATURE  HER=HERO/); // unchanged base legend, still present

    const kitOn = logReport(sampleLog({ variants: { extensionKit: true } }));
    expect(kitOn).toMatch(/APR=APPRENTICE/);
    expect(kitOn).toMatch(/HLY=HOLY WATER/);
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
