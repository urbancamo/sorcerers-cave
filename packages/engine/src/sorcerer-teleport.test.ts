import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { SPECIAL_WHIRLPOOL, SPECIAL_DEEP_POOL } from "./data/areaCards";
import { teleportDestinations } from "./sorcerer";
import { AF_DESTROYED, type GameState, type PartyMember, type PlacedArea } from "./state";
import type { GameAction, GameEvent } from "./actions";

/**
 * The Sorcerer's terms (§The Sorcerer, `variants.sorcererTeleport`): a player who defeats the Sorcerer and his
 * companions may spare him on condition that he transports the party, and the treasure in the chamber, to any
 * area already discovered. The option is taken straight after the fight; otherwise he is slain as before.
 */

const member = (creatureId: number, treasure: number[] = [], status: 0 | 1 = 0): PartyMember => ({ creatureId, status, dragonKills: 0, treasure });
const area = (card: number, level: number, x: number, y: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card, coord: packCoord(level, x, y), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });

const PLAIN_CHAMBER = 31;     // four doorways, a chamber
const TUNNEL_W = 8;           // a tunnel with a west doorway only
const WHIRLPOOL = (SPECIAL_WHIRLPOOL << 7) | 31;
const DEEP_POOL = (SPECIAL_DEEP_POOL << 7) | 31;
const SORCERER = 11, APPRENTICE = 14;
const SLAY_PLAN: GameAction = { type: "resolveRound", matches: [{ front: [0], backers: [1], strangers: [0] }] };

// Giant with the Magic Sword, backed by a Wizard with the Staff, against a Lotus-weakened Sorcerer: seed 1 wins.
function fightingTheSorcerer(over: Partial<GameState> = {}, variant = true): GameState {
  return makeState({
    phase: "fight", fight: { surprise: 1, round: 1, focus: 0 }, lotusOnSorcerer: true, seed: 1,
    party: [member(12, [3]), member(8, [9])], strangers: [SORCERER], treasures: [20, 21],
    areas: [
      area(PLAIN_CHAMBER, 1, 50, 50),                       // 0: where the fight is
      area(TUNNEL_W, 1, 51, 50),                            // 1: a tunnel
      area(PLAIN_CHAMBER, 2, 50, 50),                       // 2: a chamber on level 2
      area(PLAIN_CHAMBER, 1, 49, 50, { faceUp: false }),    // 3: not discovered
      area(WHIRLPOOL, 1, 50, 49),                           // 4: nowhere to land
      area(PLAIN_CHAMBER, 1, 50, 51, { flags: AF_DESTROYED }), // 5: collapsed
      area(DEEP_POOL, 1, 52, 50),                           // 6: nowhere to land
    ],
    ...(variant ? { variants: { sorcererTeleport: true } } : {}),
    ...over,
  });
}
const won = (over: Partial<GameState> = {}) => reduce(fightingTheSorcerer(over), SLAY_PLAN);
const types = (events: GameEvent[]) => events.map((e) => e.type);

describe("defeating the Sorcerer with the teleport option on", () => {
  it("does not slay him at the killing blow: the party must decide first", () => {
    const { state, events } = won();
    expect(state.phase).toBe("sorcerer");
    expect(state.sorcererKilled).toBe(false);
    expect(state.fight).toBeNull();
    expect(types(events)).toContain("sorcererFelled");
    expect(types(events)).not.toContain("sorcererSlain");
    expect(types(events)).toContain("fightWon");
  });

  it("offers slaying him, or sparing him for any discovered area that has a floor to land on", () => {
    const { state } = won();
    const acts = legalActions(state);
    expect(acts[0]).toEqual({ type: "slaySorcerer" });
    expect(acts.slice(1)).toEqual([{ type: "spareSorcerer", area: 1 }, { type: "spareSorcerer", area: 2 }]);
    expect(teleportDestinations(state)).toEqual([1, 2]); // not here, face down, Whirlpool, collapsed, Deep Pool
  });

  it("slaying him is the old ending: the +30, the curse lift, then the spoils", () => {
    const { state } = won();
    const r = reduce(state, { type: "slaySorcerer" });
    expect(r.state.sorcererKilled).toBe(true);
    expect(types(r.events)).toEqual(["sorcererSlain"]);
    expect(r.state.phase).toBe("pickup");
    expect(r.state.treasures).toEqual([20, 21]);
  });

  it("slaying him with no spoils sends the party back to exploring", () => {
    const { state } = won({ treasures: [] });
    expect(reduce(state, { type: "slaySorcerer" }).state.phase).toBe("explore");
  });

  it("sparing him teleports the party, and the chamber's treasure, to the chosen area", () => {
    const { state } = won();
    const r = reduce(state, { type: "spareSorcerer", area: 2 });
    expect(r.state.sorcererKilled).toBe(false);
    expect(r.state.partyArea).toBe(2);
    expect(r.state.level).toBe(2);
    expect(types(r.events).slice(0, 2)).toEqual(["sorcererSpared", "partyTeleported"]);
    expect(r.events[1]).toEqual({ type: "partyTeleported", from: 0, to: 2, level: 2, treasureIds: [20, 21] });
    // arriving in an empty chamber: the treasure is on the floor to be picked up
    expect(r.state.phase).toBe("pickup");
    expect(r.state.treasures).toEqual([20, 21]);
    expect(r.state.party).toHaveLength(2);
  });

  it("the Sorcerer stays behind in the chamber, and the party cannot withdraw to it", () => {
    const { state } = won();
    const r = reduce(state, { type: "spareSorcerer", area: 2 });
    expect(r.state.areas[0]!.contents).toContain(100 + SORCERER);
    expect(r.state.fellThroughTrap).toBe(true);
  });

  it("arriving at a tunnel leaves the treasure on its floor too", () => {
    const { state } = won();
    const r = reduce(state, { type: "spareSorcerer", area: 1 });
    expect(r.state.partyArea).toBe(1);
    expect(r.state.phase).toBe("pickup");
    expect(r.state.treasures).toEqual([20, 21]);
  });

  it("with no treasure the party simply arrives, ready to explore", () => {
    const { state } = won({ treasures: [] });
    const r = reduce(state, { type: "spareSorcerer", area: 1 });
    expect(r.state.phase).toBe("explore");
    expect(r.state.areas[1]!.contents).toEqual([]);
  });

  it("walks into whatever waits at the destination", () => {
    const s = fightingTheSorcerer();
    s.areas[2]!.contents = [100 + 3]; // a Troll parked in the chamber on level 2
    const { state } = reduce(s, SLAY_PLAN);
    const r = reduce(state, { type: "spareSorcerer", area: 2 });
    expect(r.state.phase).toBe("encounter");
    expect(r.state.strangers).toEqual([3]);
    // the carried treasure joins the floor of that chamber
    expect(r.state.treasures).toEqual(expect.arrayContaining([20, 21]));
  });

  it("the Sorcerer is waiting if the party comes back", () => {
    const { state } = won();
    const r = reduce(state, { type: "spareSorcerer", area: 1 });
    expect(r.state.areas[0]!.contents.filter((c) => c === 100 + SORCERER)).toHaveLength(1);
  });

  it("does not lift a curse or score the bonus", () => {
    const { state } = won({ curses: 2 });
    const r = reduce(state, { type: "spareSorcerer", area: 2 });
    expect(r.state.curses).toBe(2);
    expect(r.state.sorcererKilled).toBe(false);
  });

  it("refuses an area that is here, undiscovered, collapsed or has nowhere to land", () => {
    const { state } = won();
    for (const area of [0, 3, 4, 5, 6, 99, -1]) {
      const r = reduce(state, { type: "spareSorcerer", area });
      expect(r.events).toEqual([{ type: "blocked" }]);
      expect(r.state).toBe(state);
    }
  });

  it("refuses both choices outside the Sorcerer's terms", () => {
    const s = makeState({ variants: { sorcererTeleport: true } });
    expect(reduce(s, { type: "slaySorcerer" }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "spareSorcerer", area: 0 }).events).toEqual([{ type: "blocked" }]);
  });

  it("leaves the sleeping behind with the Sorcerer", () => {
    const { state } = won({ sleeping: [3] });
    const r = reduce(state, { type: "spareSorcerer", area: 2 });
    expect(r.state.areas[0]!.contents).toEqual(expect.arrayContaining([400 + 3, 100 + SORCERER]));
    expect(r.state.sleeping).toEqual([]);
  });
});

describe("the other ways a fight against the Sorcerer ends", () => {
  it("the Eye of God forbids sparing him: he is slain at the killing blow", () => {
    const { state, events } = won({ treasures: [13] }); // the Eye lies on the floor of the chamber
    expect(state.sorcererKilled).toBe(true);
    expect(types(events)).toContain("sorcererSlain");
    expect(types(events)).not.toContain("sorcererFelled");
    expect(state.phase).toBe("pickup");
  });

  it("without the variant he is slain at the killing blow, exactly as before", () => {
    const { state, events } = reduce(fightingTheSorcerer({}, false), SLAY_PLAN);
    expect(state.sorcererKilled).toBe(true);
    expect(types(events)).toContain("sorcererSlain");
    expect(types(events)).not.toContain("sorcererFelled");
    expect(state.phase).toBe("pickup");
  });

  it("a turncoat Apprentice, once he is slain, must be fought", () => {
    const { state } = won({ party: [member(12, [3]), member(8, [9]), member(APPRENTICE, [], 1)] });
    const r = reduce(state, { type: "slaySorcerer" });
    expect(types(r.events)).toContain("sorcererSlain");
    expect(r.state.strangers).toEqual([APPRENTICE]);
    expect(r.state.phase).toBe("fight");
  });

  it("but an Apprentice stays loyal if he is spared", () => {
    const { state } = won({ party: [member(12, [3]), member(8, [9]), member(APPRENTICE, [], 1)] });
    const r = reduce(state, { type: "spareSorcerer", area: 2 });
    expect(r.state.party).toHaveLength(3);
    expect(r.state.strangers).toEqual([]);
  });

  it("is slain after all if the party is then wiped out", () => {
    // He fell in an earlier round; a Dragon now kills the lone Dwarf (seed 5).
    const s = fightingTheSorcerer({ party: [member(7)], strangers: [10], seed: 5, treasures: [] });
    s.fight = { surprise: 0, round: 2, focus: 0, sorcererFelled: true };
    const r = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(r.state.phase).toBe("gameOver");
    expect(r.state.sorcererKilled).toBe(true);
    expect(types(r.events)).toContain("sorcererSlain");
  });

  it("is slain after all if the party retreats from the rest of his companions", () => {
    const s = fightingTheSorcerer({ party: [member(12)], strangers: [3], treasures: [] });
    s.fight = { surprise: 0, round: 2, focus: 0, sorcererFelled: true };
    const r = reduce(s, { type: "retreat", dir: 2 }); // east, into the tunnel
    expect(r.state.partyArea).toBe(1);
    expect(r.state.sorcererKilled).toBe(true);
    expect(types(r.events)).toContain("sorcererSlain");
  });
});
