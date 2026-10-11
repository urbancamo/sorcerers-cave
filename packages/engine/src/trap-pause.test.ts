import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { rollDie } from "./rng";
import { HAZARD_TRAP, HAZARD_MEDUSA } from "./data/hazards";
import { SPECIAL_WELL } from "./data/areaCards";
import { GS_DEAD, type GameState, type PartyMember } from "./state";

/**
 * The Dwarf's choice at a trap (`variants.trapRules`, spec 2026-10-11-dwarf-deliberate-trap-fall, Task 2):
 * a party with a Dwarf that meets exactly one trap pauses in phase `trap` and chooses `avoidTrap` (guided
 * past) or `fallThroughTrap`. Modelled on the Medusa pause, including the Well/Bell extra-draw contract.
 */

const MAN = 5;
const DWARF = 7;
const DRAGON_STRANGER = 110; // parked stranger code (100 + creature 10)
const TRAP = 300 + HAZARD_TRAP;
const ON = { trapRules: true };
const member = (creatureId: number, treasure: number[] = []): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure });

// A (exit E) → B, a visited W-door chamber holding `contents`. `largePack` has a corridor to fall onto.
function enteringB(contents: number[], party: PartyMember[], over: Partial<GameState> = {}): GameState {
  const A = { card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
  const B = { card: 8 | 16, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents, flags: 0, indiffCount: 0 };
  return makeState({ variants: ON, party, areas: [A, B], partyArea: 0, prev: 0, prev2: 0, level: 1, largePack: [5], largeIdx: 0, ...over });
}
const enter = (s: GameState) => reduce(s, { type: "move", dir: 2 });

describe("trap pause — opening", () => {
  it("a Dwarf party meeting one trap pauses: trapLooms, no fall, no trapAvoided yet", () => {
    const { state, events } = enter(enteringB([TRAP], [member(DWARF)]));
    expect(state.phase).toBe("trap");
    expect(state.trapPause).toEqual({ freshEntry: false, announceLull: false });
    expect(events).toContainEqual({ type: "trapLooms" });
    expect(events.some((e) => e.type === "trapAvoided" || e.type === "trapSprung")).toBe(false);
    expect(state.level).toBe(1);
  });

  it("legalActions in phase trap is exactly avoidTrap and fallThroughTrap", () => {
    const { state } = enter(enteringB([TRAP], [member(DWARF)]));
    expect(legalActions(state)).toEqual([{ type: "avoidTrap" }, { type: "fallThroughTrap" }]);
  });

  it("flag off: the Dwarf is guided past at once, with no pause", () => {
    const { state, events } = enter(enteringB([TRAP], [member(DWARF)], { variants: undefined }));
    expect(state.phase).not.toBe("trap");
    expect(events).toContainEqual({ type: "trapAvoided" });
  });

  it("two traps: no pause, the party falls", () => {
    const { state, events } = enter(enteringB([TRAP, TRAP], [member(DWARF)]));
    expect(state.phase).not.toBe("trap");
    expect(events).toContainEqual({ type: "trapSprung", level: 2, deliberate: true });
  });

  it("no Dwarf: no pause, the party falls", () => {
    const { events } = enter(enteringB([TRAP], [member(MAN)]));
    expect(events).toContainEqual({ type: "trapSprung", level: 2, deliberate: true });
  });
});

describe("trap pause — blocked outside the pause", () => {
  it("avoidTrap and fallThroughTrap are blocked in every other phase", () => {
    const s = makeState({ variants: ON });
    expect(reduce(s, { type: "avoidTrap" }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "fallThroughTrap" }).events).toEqual([{ type: "blocked" }]);
  });
});

describe("avoidTrap", () => {
  it("emits trapAvoided and settles to encounter when strangers are present", () => {
    const paused = enter(enteringB([TRAP, DRAGON_STRANGER], [member(DWARF)])).state;
    const { state, events } = reduce(paused, { type: "avoidTrap" });
    expect(events).toContainEqual({ type: "trapAvoided" });
    expect(state.trapPause).toBeUndefined();
    expect(state.phase).toBe("encounter");
    expect(state.level).toBe(1);
    expect(state.areas[state.partyArea]!.contents.filter((c) => c === TRAP)).toHaveLength(1); // the trap stands
  });

  it("settles to explore when the chamber is empty", () => {
    const paused = enter(enteringB([TRAP], [member(DWARF)])).state;
    expect(reduce(paused, { type: "avoidTrap" }).state.phase).toBe("explore");
  });

  it("settles to pickup when only treasure lies here", () => {
    const paused = enter(enteringB([TRAP, 203], [member(DWARF)])).state;
    expect(reduce(paused, { type: "avoidTrap" }).state.phase).toBe("pickup");
  });
});

describe("fallThroughTrap", () => {
  it("drops the party one level, leaves strangers behind and keeps the trap standing", () => {
    const paused = enter(enteringB([TRAP, DRAGON_STRANGER], [member(DWARF)])).state;
    const { state, events } = reduce(paused, { type: "fallThroughTrap" });
    expect(events).toContainEqual({ type: "trapSprung", level: 2, deliberate: true });
    expect(state.trapPause).toBeUndefined();
    expect(state.level).toBe(2);
    expect(state.fellThroughTrap).toBe(true);
    const above = state.areas[1]!;
    expect(above.contents).toContain(DRAGON_STRANGER);
    expect(above.contents.filter((c) => c === TRAP)).toHaveLength(1);
  });

  it("withdraw and retreat stay blocked after the fall", () => {
    const paused = enter(enteringB([TRAP], [member(DWARF)])).state;
    const { state } = reduce(paused, { type: "fallThroughTrap" });
    expect(reduce(state, { type: "withdraw" }).events).toEqual([{ type: "blocked" }]);
  });
});

describe("ordering with other hazards", () => {
  it("Medusa's pause comes first; resolving it then opens the trap pause", () => {
    const LOTUS = 5;
    const s = enteringB([TRAP, 300 + HAZARD_MEDUSA], [member(DWARF), member(MAN, [LOTUS])]);
    const medusa = enter(s).state;
    expect(medusa.phase).toBe("medusa");
    const { state } = reduce(medusa, { type: "useArtifact", artifact: LOTUS });
    expect(state.phase).toBe("trap");
  });

  it("a party wiped out by an earlier hazard never opens the pause", () => {
    // Sweep seeds until Medusa's d6 for the lone Dwarf is a 1-2 (stone) — the whole party is petrified.
    let seed = 1;
    while (rollDie(seed).value > 2) seed++;
    const s = enteringB([TRAP, 300 + HAZARD_MEDUSA], [member(DWARF)], { seed });
    const { state } = enter(s);
    expect(state.gs).toBe(GS_DEAD);
    expect(state.phase).toBe("gameOver");
    expect(state.trapPause).toBeUndefined();
  });
});

describe("Well/Bell extra draw (SC-4-16)", () => {
  const WELL = (SPECIAL_WELL << 7) | 31;
  function atWell(): GameState {
    return makeState({
      variants: ON,
      party: [member(DWARF)],
      areas: [{ card: WELL, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      partyArea: 0, prev: 0, prev2: 0, level: 1,
      phase: "encounter", strangers: [10], surpriseReady: true,
      smallPack: [TRAP], smallIdx: 0,
    });
  }

  it("a drawn trap opens the pause and carries the earned surprise through to avoidTrap", () => {
    const { state } = reduce(atWell(), { type: "drawFromWell" });
    expect(state.phase).toBe("trap");
    expect(state.trapPause).toEqual({ freshEntry: false, announceLull: true, extraDraw: { hadSurprise: true } });
    const after = reduce(state, { type: "avoidTrap" }).state;
    expect(after.phase).toBe("encounter");
    expect(after.surpriseReady).toBe(true); // not clobbered by the resumed tail
  });

  it("choosing to fall from the extra draw drops the party", () => {
    const paused = reduce(atWell(), { type: "drawFromWell" }).state;
    const { state, events } = reduce(paused, { type: "fallThroughTrap" });
    expect(events).toContainEqual({ type: "trapSprung", level: 2, deliberate: true });
    expect(state.level).toBe(2);
  });
});
