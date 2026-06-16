import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AssetManifest } from "@sorcerers-cave/assets";
import { newGame, packCoord as pc, type GameState, type PlacedArea } from "@sorcerers-cave/engine";
import { parseManifest } from "../data/manifest";
import { createCaveAdapter } from "./engineAdapter";
import type { ArtTables } from "./projection";

let art: ArtTables;
beforeAll(() => {
  const m = JSON.parse(readFileSync(resolve(process.cwd(), "../../docs/assets/manifest.json"), "utf8")) as AssetManifest;
  art = parseManifest(m);
});

describe("createCaveAdapter — read surface", () => {
  it("exposes the gateway as current with startLevel 1", () => {
    const eng = createCaveAdapter(newGame(1, [0]), art);
    expect(eng.startLevel).toBe(1);
    expect(eng.current.special).toBe("gateway");
    expect(eng.current.party).toBe(true);
    expect(eng.areas.length).toBe(1);
    expect(eng.placed.get("1,50,50")?.special).toBe("gateway");
  });

  it("state() snapshots HUD fields", () => {
    const eng = createCaveAdapter(newGame(1, [0]), art);
    const s = eng.state();
    expect(s.level).toBe(1);
    expect(s.turn).toBe(1);
    expect(s.placed).toBe(1);
    expect(s.deckLeft).toBe(60);          // 60-card large pack, none drawn
    expect(s.deckTotal).toBe(60);         // full deck size (for the "N / total" indicator)
    expect(s.current.special).toBe("gateway");
  });

  it("openMoves offers the gateway's four lateral frontiers as undrawn, plus the Cave exit", () => {
    const eng = createCaveAdapter(newGame(1, [0]), art);
    const moves = eng.openMoves();
    // gateway 175: NESW lateral frontiers + the level-1 stair-up surfaced as the "U" exit.
    expect(moves.map((m) => m.dir).sort()).toEqual(["E", "N", "S", "U", "W"]);
    expect(moves.filter((m) => m.dir !== "U").every((m) => m.kind === "undrawn")).toBe(true);
    expect(moves.find((m) => m.dir === "U")?.kind).toBe("exit");
    expect(moves.find((m) => m.dir === "N")?.target).toEqual({ level: 1, col: 50, row: 49 });
    expect(eng.canExit()).toBe(true);
  });
});

// Minimal explore-phase GameState for deterministic move tests.
function mkState(areas: PlacedArea[], partyArea: number, over: Partial<GameState> = {}): GameState {
  return {
    gs: 0, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
    areas, partyArea, level: 1, prev: partyArea, prev2: partyArea,
    party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }],
    largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0,
    strangers: [], treasures: [], hazards: [], seed: 1, fight: null, ...over,
  };
}
const mkArea = (card: number, level: number, col: number, row: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card, coord: pc(level, col, row), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0, ...over });

describe("current-tile floor merges the working set with dropped contents", () => {
  it("shows treasure dropped onto the current chamber even while a pickup working set is active", () => {
    // Chamber (card 31) is the party's tile: working set holds Gold (id 1); a Treasure Chest (id 14)
    // was just dropped here (parked on contents). Both must appear on the floor.
    const A = mkArea(31, 1, 50, 50, { visited: true, contents: [200 + 14] });
    const eng = createCaveAdapter(mkState([A], 0, { phase: "pickup", treasures: [1] }), art);
    expect(eng.current.treasure.length).toBe(2);
    expect(eng.current.treasure.some((c) => c.entityId === "14")).toBe(true); // the dropped chest
    expect(eng.current.treasure.some((c) => c.entityId === "1")).toBe(true);  // the working-set gold
  });

  it("shows a dropped item on the current tile at rest (empty working set)", () => {
    const A = mkArea(31, 1, 50, 50, { visited: true, contents: [200 + 14] });
    const eng = createCaveAdapter(mkState([A], 0), art); // explore, empty working set
    expect(eng.current.treasure.some((c) => c.entityId === "14")).toBe(true);
  });
});

describe("tryMove + MoveEvent", () => {
  it("moves into a known adjacent area (no tile drawn)", () => {
    // A: E-exit corridor at (50,50); B: W-exit corridor at (51,50). Moving E lands on B.
    const A = mkArea(2, 1, 50, 50);       // exits "E"
    const B = mkArea(8, 1, 51, 50, { visited: true }); // exits "W"
    const eng = createCaveAdapter(mkState([A, B], 0), art);
    const ev = eng.tryMove("E");
    expect(ev.moved).toBe(true);
    if (ev.moved) {
      expect(ev.dir).toBe("E");
      expect(ev.area.col).toBe(51);
      expect(ev.placed).toBeNull();        // B already existed
      expect(ev.chamber).toBeUndefined();  // B is a tunnel, no cards
    }
    expect(eng.current.col).toBe(51);      // mirror advanced
  });

  it("reports a dead end when the current card has no exit that way", () => {
    const A = mkArea(2, 1, 50, 50);        // only "E"
    const eng = createCaveAdapter(mkState([A], 0), art);
    const ev = eng.tryMove("N");
    expect(ev.moved).toBe(false);
  });

  it("still places the drawn tile (face-down) on a dead-end frontier, without moving", () => {
    const A = mkArea(2, 1, 50, 50);        // exits "E", frontier east is undrawn
    // pack a tile with NO west reverse-door (card 1 = "N" only) → it can't connect → dead end
    const eng = createCaveAdapter(mkState([A], 0, { largePack: [1], largeIdx: 0 }), art);
    const ev = eng.tryMove("E");
    expect(ev.moved).toBe(false);
    if (!ev.moved) {
      expect(ev.deadEnd).toBe(true);
      expect(ev.placed).not.toBeNull();       // the tile is laid down…
      expect(ev.placed!.faceDown).toBe(true); // …face-down (excluded from edge-matching)
      expect(ev.placed!.col).toBe(51);
    }
    expect(eng.areas.length).toBe(2);          // mirror kept the placement (deck consumed)
    expect(eng.current.col).toBe(50);          // party did NOT move
  });

  it("draws a chamber tile on an undrawn frontier and reveals its cards (firstVisit)", () => {
    const A = mkArea(2, 1, 50, 50);        // exits "E", frontier to the east is undrawn
    // pack a chamber tile with a W reverse-door (8 | 16 = 24); small pack yields a Dragon (id 10)
    const eng = createCaveAdapter(mkState([A], 0, { largePack: [8 | 16], smallPack: [100 + 10] }), art);
    const ev = eng.tryMove("E");
    expect(ev.moved).toBe(true);
    if (ev.moved) {
      expect(ev.placed).not.toBeNull();    // a new tile was drawn
      expect(ev.area.type).toBe("chamber");
      expect(ev.chamber?.firstVisit).toBe(true);
      expect(ev.chamber?.draws.some((c) => c.name === "Dragon")).toBe(true);
    }
  });

  it("counts a drawn hazard in the chamber draws even though it fires and clears itself", () => {
    const A = mkArea(2, 1, 50, 50); // exit E
    // Tomb (543 = special Tomb + chamber + NESW) drawn to the east → draws 2 on level 1 (1 + tomb extra).
    // Small pack: a Dragon, then an Earthquake (hazard 2) which fires and removes itself during resolution.
    const eng = createCaveAdapter(mkState([A], 0, { largePack: [543], smallPack: [100 + 10, 300 + 2] }), art);
    const ev = eng.tryMove("E");
    expect(ev.moved).toBe(true);
    if (ev.moved) {
      expect(ev.chamber?.draws.length).toBe(2); // both the surviving card AND the fired hazard are reported
      expect(ev.chamber?.draws.some((c) => c.name === "Dragon")).toBe(true);
      expect(ev.chamber?.draws.some((c) => c.category === "hazard")).toBe(true);
    }
  });

  it("surfaces a sprung trap as ev.trap='sprung' and drops the party a level", () => {
    const A = mkArea(2, 1, 50, 50); // exit E; default party is a Hero (no dwarf)
    // chamber (W reverse-door) to enter, then an NS corridor to fall onto; the chamber draws a trap.
    const eng = createCaveAdapter(mkState([A], 0, { largePack: [8 | 16, 5], smallPack: [300 + 1] }), art);
    const ev = eng.tryMove("E");
    expect(ev.moved).toBe(true);
    if (ev.moved) {
      expect(ev.trap).toBe("sprung");
      expect(ev.fell).toBe(true);
      expect(ev.area.level).toBe(2); // dropped one level
    }
  });

  it("surfaces a dwarf-negated trap as ev.trap='avoided' without falling", () => {
    const A = mkArea(2, 1, 50, 50); // exit E
    const eng = createCaveAdapter(
      mkState([A], 0, { party: [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [] }], largePack: [8 | 16], smallPack: [300 + 1] }),
      art,
    );
    const ev = eng.tryMove("E");
    expect(ev.moved).toBe(true);
    if (ev.moved) {
      expect(ev.trap).toBe("avoided");
      expect(ev.fell).toBeUndefined();
      expect(ev.area.level).toBe(1); // the dwarf guided them past — no fall
    }
  });

  it("forwards the accepted action via opts.onAction", () => {
    const A = mkArea(2, 1, 50, 50);
    const B = mkArea(8, 1, 51, 50, { visited: true });
    const seen: number[] = [];
    const eng = createCaveAdapter(mkState([A, B], 0), art, { onAction: (a) => { if (a.type === "move") seen.push(a.dir); } });
    eng.tryMove("E");
    expect(seen).toEqual([2]); // DIR_E
  });

  it("tags stair descents and never offers moves outside explore", () => {
    // down-stair tile (card 64 = stairDown) at level 1; an undrawn frontier below.
    const A = mkArea(64, 1, 50, 50);
    const eng = createCaveAdapter(mkState([A], 0, { largePack: [0], smallPack: [] }), art);
    const ev = eng.tryMove("D");
    expect(ev.moved).toBe(true);
    if (ev.moved) { expect(ev.descended).toBe("D"); expect(ev.area.level).toBe(2); }
  });
});
