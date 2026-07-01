import { describe, it, expect } from "vitest";
import { viperCrossing } from "./special";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { rollDie } from "./rng";
import { packCoord } from "./coords";
import { SPECIAL_VIPER_PIT } from "./data/areaCards";
import { GS_PLAYING, GS_DEAD, type GameState, type PartyMember } from "./state";

// Ids used throughout (spec §3.2): Hero=0, Woman=6, Unicorn=13; the Eye of God is treasure id 13.
const HERO = 0;
const WOMAN = 6;
const UNICORN = 13;
const EYE = 13;
const DIR_E = 2;

const member = (creatureId: number, treasure: number[] = []): PartyMember => ({
  creatureId,
  status: 0,
  dragonKills: 0,
  treasure,
});

// A Viper-Pit tile with an east doorway: card = (SPECIAL_VIPER_PIT << 7) | E-exit(2).
const VIPER_PIT_CARD = (SPECIAL_VIPER_PIT << 7) | 2;
// A plain tunnel with only a west doorway (bit 8): connects back when the party moves east,
// carries no chamber bit (16) and no special, so resolveArea just returns to explore.
const PLAIN_WEST_TUNNEL = 8;

/** Living members die in the pit on a d6 of 1 or 2 (§10.1). Sweep seeds until the die that will be
 *  rolled for `memberIndex` (rolls are taken in party order, living-only) comes up <= 2. */
function seedForFatalRoll(livingBeforeTarget: number, start = 1): number {
  for (let seed = start; seed < 100000; seed++) {
    let s = seed;
    // Advance past the rolls for members ahead of the target in party order.
    for (let i = 0; i < livingBeforeTarget; i++) s = rollDie(s).seed;
    if (rollDie(s).value <= 2) return seed;
  }
  throw new Error("no fatal seed found");
}

/** A viper-pit GameState: the party stands on tile 0 (a viper pit) and can step east onto a fresh
 *  plain tunnel, which is drawn from the large pack — that step triggers the crossing (reduce.ts:283). */
function viperPitState(over: Partial<GameState>): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    areas: [
      { card: VIPER_PIT_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
    ],
    partyArea: 0,
    prev: 0,
    largePack: [PLAIN_WEST_TUNNEL],
    largeIdx: 0,
    ...over,
  });
}

describe("Viper Pit — Eye of God lost with its bearer (spec §10.1 / §Eye of God)", () => {
  it("SC-10.1-4: the Eye of God lost with its bearer in the Viper Pit curses the party (viperCrossing)", () => {
    // Hero (idx 0) bears the Eye; a Woman follows. Force the bearer's die to be fatal (<= 2).
    const seed = seedForFatalRoll(0);
    const s = makeState({ party: [member(HERO, [EYE]), member(WOMAN)], seed, curses: 0 });
    const events = viperCrossing(s);

    expect(s.party[0]!.status).toBe(3); // the bearer fell into the pit
    expect(s.curses).toBe(1); // losing the Eye with its bearer curses the party
    expect(events).toContainEqual({ type: "eyeForsaken" });
    expect(events).toContainEqual({ type: "memberDied", creatureId: HERO });
    expect(s.party[1]!.status).toBe(0); // the Woman survives, so the party lives on
  });

  it("SC-10.1-4: the same curse fires when the crossing is driven through reduce (a move out of the pit)", () => {
    const seed = seedForFatalRoll(0);
    const s = viperPitState({ party: [member(HERO, [EYE]), member(WOMAN)], seed, curses: 0 });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(events).toContainEqual({ type: "crossedSpecial", special: SPECIAL_VIPER_PIT });
    expect(state.curses).toBe(1);
    expect(events).toContainEqual({ type: "eyeForsaken" });
    expect(state.party[0]!.status).toBe(3);
  });
});

describe("Viper Pit — a total wipe ends the game (spec §10.1)", () => {
  it("SC-10.1-8: a single-member party that falls in the pit ends the game (gameOver, GS_DEAD)", () => {
    const seed = seedForFatalRoll(0);
    const s = viperPitState({ party: [member(HERO)], seed });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.party[0]!.status).toBe(3); // the sole member fell into the pit
    expect(state.gs).toBe(GS_DEAD);
    expect(state.phase).toBe("gameOver");
    expect(events).toContainEqual({ type: "gameOver", gs: GS_DEAD });
  });
});

describe("Reactions — a womanless Unicorn pacifies the area (spec §10.4)", () => {
  it("SC-10.4-5: a friendly Unicorn with no Woman in the party does not join; the area is pacified with an unicornGuards event", () => {
    // A Unicorn always reacts friendly (hostileMax/indiffMax = 0). With no Woman present it declines
    // to join and guards the area, pacifying it for this party (reduce.ts:461-468).
    const s = makeState({
      phase: "encounter",
      party: [member(HERO)], // no Woman / W-Hero, so the Unicorn will not join
      strangers: [UNICORN],
      partyArea: 0,
      indiffStreak: 0,
    });
    const { state, events } = reduce(s, { type: "test" });

    expect(state.party.some((m) => m.creatureId === UNICORN)).toBe(false); // it did not join
    expect(events).toContainEqual({ type: "unicornGuards", creatureId: UNICORN });
    expect(state.pacifiedAreas).toContain(0);
    // persistAndExplore parks the guarding Unicorn onto the tile (as 100+id) and clears the working set.
    expect(state.strangers).toEqual([]);
    expect(state.areas[0]!.contents).toContain(100 + UNICORN); // the Unicorn stays behind guarding
    expect(state.phase).toBe("explore"); // the party moves on
  });
});
