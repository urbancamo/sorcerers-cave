import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AssetManifest } from "@sorcerers-cave/assets";
import { newGame } from "@sorcerers-cave/engine";
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
    expect(s.current.special).toBe("gateway");
  });

  it("openMoves offers the gateway's four lateral frontiers as undrawn", () => {
    const eng = createCaveAdapter(newGame(1, [0]), art);
    const moves = eng.openMoves();
    expect(moves.map((m) => m.dir).sort()).toEqual(["E", "N", "S", "W"]); // gateway 175: NESW, stairUp=escape (excluded), no down
    expect(moves.every((m) => m.kind === "undrawn")).toBe(true);
    expect(moves.find((m) => m.dir === "N")?.target).toEqual({ level: 1, col: 50, row: 49 });
  });
});
