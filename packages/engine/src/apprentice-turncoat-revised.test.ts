import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import type { GameState, PartyMember } from "./state";

// Peter, 14-OCT-2026 (Special Fights, 6): IF a player decides to slay the Sorcerer AND the Apprentice is in the party AND the party
// does not leave the area in its next turn THEN the Apprentice joins any other strangers in the area to surprise-attack the party.
// So in the revised combat the Sorcerer's death no longer turns her on the spot: she stays an ally while the party may still leave, and
// turns only when it chooses to `stay`.
const MAN = 5, OGRE = 2, APPRENTICE = 14, GOLD = 1;
const member = (creatureId: number, treasure: number[] = [], status: 0 | 1 = 0): PartyMember => ({ creatureId, status, dragonKills: 0, treasure });
const A = { card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 }; // exit E

const afterSlaying = (over: Partial<GameState> = {}): GameState => makeState({
  phase: "sorcerer", areas: [{ ...A }], party: [member(MAN), member(APPRENTICE, [GOLD], 1)],
  variants: { combatRevision: true, extensionKit: true }, ...over,
});
const watching = (over: Partial<GameState> = {}): GameState => makeState({
  phase: "explore", areas: [{ ...A, contents: [100 + OGRE] }], party: [member(MAN), member(APPRENTICE, [GOLD], 1)],
  variants: { combatRevision: true, extensionKit: true }, apprenticeWatch: 0, ...over,
});

describe("the revised turncoat Apprentice", () => {
  it("slaying the Sorcerer no longer turns her at once: she stays in the party and the party is told", () => {
    const r = reduce(afterSlaying(), { type: "slaySorcerer" });
    expect(r.state.party.map((m) => m.creatureId)).toEqual([MAN, APPRENTICE]);
    expect(r.state.apprenticeWatch).toBe(0);
    expect(r.events).toContainEqual({ type: "sorcererSlain" });
    expect(r.events).toContainEqual({ type: "apprenticeWaits", count: 1 });
    expect(r.events.some((e) => e.type === "apprenticeTurned")).toBe(false);
  });

  it("sets no watch when there is no Apprentice, and the legacy combat still turns her at once", () => {
    const none = reduce(afterSlaying({ party: [member(MAN)] }), { type: "slaySorcerer" });
    expect(none.state.apprenticeWatch).toBeUndefined();
    const legacy = reduce(afterSlaying({ variants: { extensionKit: true } }), { type: "slaySorcerer" });
    expect(legacy.events.some((e) => e.type === "apprenticeTurned")).toBe(true);
    expect(legacy.state.apprenticeWatch).toBeUndefined();
  });

  it("offers `stay` only while the watch holds and the party is at rest in that area", () => {
    expect(legalActions(watching())).toContainEqual({ type: "stay" });
    expect(legalActions(watching({ apprenticeWatch: undefined }))).not.toContainEqual({ type: "stay" });
    expect(reduce(watching({ apprenticeWatch: undefined }), { type: "stay" }).events).toEqual([{ type: "blocked" }]);
  });

  it("staying turns her: she joins the strangers of the area and they attack with surprise", () => {
    const r = reduce(watching(), { type: "stay" });
    expect(r.state.party.map((m) => m.creatureId)).toEqual([MAN]);
    expect(r.state.apprenticeWatch).toBeUndefined();
    expect(r.state.phase).toBe("fight");
    expect(r.state.fight!.surprise).toBe(-1);
    expect([...r.state.strangers].sort((a, b) => a - b)).toEqual([OGRE, APPRENTICE]);
    expect(r.state.areas[0]!.contents).not.toContain(100 + OGRE);   // the guard was taken into the fight
    expect(r.events).toContainEqual({ type: "apprenticeTurned", count: 1, items: [GOLD] });
    expect(r.events).toContainEqual({ type: "fightStarted", surprise: -1 });
    expect(r.state.treasures).toContain(GOLD);                       // what she carried lies on the floor
  });

  it("leaving ends the watch: she is left behind in the chamber, with what she carried, and nobody attacks", () => {
    const s = watching({ largePack: [8 | 16], largeIdx: 0, smallPack: [], smallIdx: 0 });
    const r = reduce(s, { type: "move", dir: 2 });
    expect(r.state.party.map((m) => m.creatureId)).toEqual([MAN]);
    expect(r.state.apprenticeWatch).toBeUndefined();
    expect(r.state.phase).not.toBe("fight");
    expect(r.events).toContainEqual({ type: "apprenticeParts", count: 1 });
    const left = r.state.areas[0]!.contents;
    expect(left).toContain(100 + APPRENTICE);
    expect(left).toContain(200 + GOLD);
  });

  it("a retreat from a fight that followed the Sorcerer's death counts as leaving: she is left in the chamber", () => {
    const chamber = { ...A, card: 15 | 16, contents: [] as number[] };
    const s = watching({
      phase: "fight", areas: [chamber], strangers: [OGRE], fight: { surprise: 0, round: 2, focus: 0 },
      largePack: Array(6).fill(15 | 16), largeIdx: 0, smallPack: [], smallIdx: 0,
    });
    const out = [0, 1, 2, 3].map((dir) => reduce(s, { type: "retreat", dir })).find((o) => o.state.partyArea !== 0);
    expect(out).toBeDefined();
    expect(out!.state.party.map((m) => m.creatureId)).toEqual([MAN]);
    expect(out!.state.apprenticeWatch).toBeUndefined();
    expect(out!.events).toContainEqual({ type: "apprenticeParts", count: 1 });
    expect(out!.state.areas[0]!.contents).toContain(100 + APPRENTICE);
  });

  it("a Sorcerer felled in a fight and slain by the retreat leaves her where the party fled from", () => {
    const chamber = { ...A, card: 15 | 16, contents: [] as number[] };
    const s = watching({
      phase: "fight", areas: [chamber], strangers: [OGRE], fight: { surprise: 0, round: 2, focus: 0, sorcererFelled: true },
      variants: { combatRevision: true, extensionKit: true, sorcererTeleport: true }, apprenticeWatch: undefined,
      largePack: Array(6).fill(15 | 16), largeIdx: 0, smallPack: [], smallIdx: 0,
    });
    const out = [0, 1, 2, 3].map((dir) => reduce(s, { type: "retreat", dir })).find((o) => o.state.partyArea !== 0);
    expect(out).toBeDefined();
    expect(out!.state.sorcererKilled).toBe(true);
    expect(out!.state.party.map((m) => m.creatureId)).toEqual([MAN]);
    expect(out!.state.areas[0]!.contents).toContain(100 + APPRENTICE);
  });
});
