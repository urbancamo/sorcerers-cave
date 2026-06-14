import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { AssetManifest } from "@sorcerers-cave/assets";
import { AREA_CARDS, decodeArea, newGame, reduce, legalActions, type GameState, type GameAction } from "@sorcerers-cave/engine";
import { parseManifest, resolveTile, normExits, type Topology } from "./manifest";

// Load the real served tile set (not a fixture): orientation correctness depends on the
// actual manifest matching the real area-card deck.
const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(here, "../../../../docs/assets/manifest.json"), "utf8"),
) as AssetManifest;
const { tiles } = parseManifest(manifest);

// engine special int -> manifest special key (mirrors projection.ts)
const SPECIAL: (string | null)[] = [null, "gateway", "deep-pool", "viper-pit", "tomb-of-kings", "great-hall"];

/** Decode an area-card value into the topology resolveTile needs (same as projectArea). */
function topologyOf(card: number): Topology {
  const d = decodeArea(card);
  const exits = normExits((d.n ? "N" : "") + (d.e ? "E" : "") + (d.s ? "S" : "") + (d.w ? "W" : ""));
  return { exits, stairUp: d.stairUp, stairDown: d.stairDown, special: SPECIAL[d.special] ?? null, isChamber: d.chamber };
}

/** A tile is correctly oriented only if it resolves at rot 0 — any rotation distorts a
 *  landscape tile in a landscape cell (the "tile rendered 90° clockwise" bug). */
function nonZeroRotation(card: number): string | null {
  const t = topologyOf(card);
  const r = resolveTile(t, tiles);
  if (!r) return `${JSON.stringify(t)} -> NO TILE`;
  if (r.rot !== 0) return `${JSON.stringify(t)} -> ${r.tileId} rot ${r.rot}`;
  return null;
}

const GATEWAY_INDEX = 21;
const STAIR_UP_BIT = 32;

describe("tile orientation (every area card renders un-rotated)", () => {
  it("resolves every area card — and its level-1 form — to a tile at rot 0", () => {
    const rotated: string[] = [];
    AREA_CARDS.forEach((card, i) => {
      // On level 1 a drawn tile has its stair-up pruned; the gateway keeps its native form.
      const variants = i === GATEWAY_INDEX ? [card] : [card, card & ~STAIR_UP_BIT];
      for (const v of variants) {
        const bad = nonZeroRotation(v);
        if (bad && !rotated.includes(`card ${i}: ${bad}`)) rotated.push(`card ${i}: ${bad}`);
      }
    });
    expect(rotated).toEqual([]);
  });

  it("walks the maze and every placed tile is rendered without rotation", () => {
    let state: GameState = newGame(7, [5, 6]); // Man + Woman
    const bad = new Set<string>();
    const checkAll = (s: GameState) => {
      for (const a of s.areas) {
        const b = nonZeroRotation(a.card);
        if (b) bad.add(b);
      }
    };
    checkAll(state);

    // Explore laterally (no descending — descent is a separate concern); escape any
    // encounter/pickup so the walk keeps drawing fresh tiles.
    for (let step = 0; step < 600 && bad.size === 0; step++) {
      const acts = legalActions(state);
      if (state.phase !== "explore") {
        const escape = acts.find(
          (a) => a.type === "withdraw" || a.type === "leaveTreasure" || a.type === "retreat",
        );
        if (!escape) break;
        state = reduce(state, escape).state;
        continue;
      }
      const moves = acts.filter((a): a is Extract<GameAction, { type: "move" }> => a.type === "move" && a.dir >= 1 && a.dir <= 4);
      if (moves.length === 0) break;
      state = reduce(state, moves[step % moves.length]!).state;
      checkAll(state);
    }
    expect([...bad]).toEqual([]);
  });
});
