import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { carriedWeight } from "./pickup";
import { chestBearers, chestGroups, dropSharedChest, dropSharedChestsForFight, settleSharedChests } from "./chest";
import type { GameState, PartyMember } from "./state";
import type { GameAction } from "./actions";

// Sharing the Treasure Chest: two or more members carry it between them, in 25 kg shares (the lightest treasure) summing to 100 kg.
// docs/requirements/sharing-the-treasure-chest-load/plan.md
const HERO = 0, OGRE = 2, TROLL = 3, GIANT = 12, TROLL_FS = 4;
const m = (creatureId: number, extra: Partial<PartyMember> = {}): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [], ...extra });
const room = (contents: number[] = []) => ({ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents, flags: 0, indiffCount: 0 });
// Party: 0 Hero (75 kg), 1 Giant (150), 2 Ogre (100), 3 Troll (75).
const party = () => [m(HERO), m(GIANT), m(OGRE), m(TROLL)];
const pickup = (over: Partial<GameState> = {}) => makeState({ phase: "pickup", party: party(), treasures: [14], areas: [room()], ...over });
const share = (s: GameState, shares: { mi: number; kg: number }[], source: { floor: number } | { member: number } | { chest: number } = { floor: 0 }) =>
  reduce(s, { type: "setChestShares", source, shares } as GameAction);
const blocked = (r: { events: { type: string }[] }) => r.events.some((e) => e.type === "blocked");

describe("setChestShares: sharing a chest from the pickup floor", () => {
  it("a 50/50 split between the Giant and the Ogre: both bear 50 kg and the floor is empty", () => {
    const { state, events } = share(pickup(), [{ mi: 1, kg: 50 }, { mi: 2, kg: 50 }]);
    expect(state.treasures).toEqual([]);
    expect(state.party[1]!.chestShares).toEqual([{ chest: 1, kg: 50 }]);
    expect(state.party[2]!.chestShares).toEqual([{ chest: 1, kg: 50 }]);
    expect(state.party[1]!.treasure).toEqual([]); // a shared chest is in no treasure list
    expect(carriedWeight(state.party[1]!)).toBe(50);
    expect(events).toContainEqual({ type: "chestShared", bearers: [{ creatureId: GIANT, kg: 50 }, { creatureId: OGRE, kg: 50 }] });
  });

  it("three or four bearers: 25/25/50 and 25 x 4", () => {
    expect(share(pickup(), [{ mi: 0, kg: 25 }, { mi: 1, kg: 25 }, { mi: 2, kg: 50 }]).state.party.map((p) => carriedWeight(p))).toEqual([25, 25, 50, 0]);
    expect(share(pickup(), [0, 1, 2, 3].map((mi) => ({ mi, kg: 25 }))).state.party.map((p) => carriedWeight(p))).toEqual([25, 25, 25, 25]);
  });

  it("a share adds to what the member already carries, and the capacity is respected", () => {
    const s = pickup({ party: [m(HERO, { treasure: [0, 1] }), m(GIANT), m(OGRE), m(TROLL)] }); // the Hero already bears 50 of 75 kg
    expect(blocked(share(s, [{ mi: 0, kg: 50 }, { mi: 1, kg: 50 }]))).toBe(true);          // 50 + 50 > 75
    expect(share(s, [{ mi: 0, kg: 25 }, { mi: 1, kg: 75 }]).state.party[0]!.chestShares).toEqual([{ chest: 1, kg: 25 }]); // 50 + 25 = 75
  });

  it("refuses a bad split and changes nothing", () => {
    const s = pickup();
    for (const shares of [
      [{ mi: 1, kg: 30 }, { mi: 2, kg: 70 }],            // not a multiple of 25
      [{ mi: 1, kg: 50 }, { mi: 2, kg: 25 }],            // 75 of 100
      [{ mi: 1, kg: 75 }, { mi: 2, kg: 50 }],            // 125
      [{ mi: 1, kg: 100 }, { mi: 2, kg: 0 }],            // below the 25 kg minimum
      [{ mi: 1, kg: 50 }, { mi: 1, kg: 50 }],            // the same bearer twice
      [{ mi: 0, kg: 50 }, { mi: 1, kg: 50 }],            // the Hero (75 kg) takes 50: fine here, so this one is legal
      [{ mi: 0, kg: 100 }],                              // one carrier over capacity
      [{ mi: 9, kg: 50 }, { mi: 1, kg: 50 }],            // no such member
      [],                                                // nobody
    ]) {
      const r = share(s, shares);
      const legal = shares.length > 1 && shares.every((x) => x.mi < 4) && shares.reduce((a, x) => a + x.kg, 0) === 100 && shares.every((x) => x.kg >= 25 && x.kg % 25 === 0) && new Set(shares.map((x) => x.mi)).size === shares.length;
      expect(blocked(r)).toBe(!legal);
      if (!legal) expect(r.state).toBe(s);
    }
  });

  it("a dead or stone member cannot bear a share", () => {
    const s = pickup({ party: [m(HERO), m(GIANT, { status: 3 }), m(OGRE), m(TROLL)] });
    expect(blocked(share(s, [{ mi: 1, kg: 50 }, { mi: 2, kg: 50 }]))).toBe(true);
    expect(blocked(share(pickup({ party: [m(HERO), m(GIANT, { status: 2 }), m(OGRE), m(TROLL)] }), [{ mi: 1, kg: 50 }, { mi: 2, kg: 50 }]))).toBe(true);
  });

  it("not in a fight, nor after the game, and only a chest that is really on the floor", () => {
    expect(blocked(share(pickup({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 } }), [{ mi: 1, kg: 50 }, { mi: 2, kg: 50 }]))).toBe(true);
    expect(blocked(share(pickup({ phase: "gameOver" }), [{ mi: 1, kg: 50 }, { mi: 2, kg: 50 }]))).toBe(true);
    expect(blocked(share(pickup({ treasures: [0] }), [{ mi: 1, kg: 50 }, { mi: 2, kg: 50 }]))).toBe(true);
  });

  it("one carrier with all 100 kg is an ordinary chest, as before", () => {
    const { state, events } = share(pickup(), [{ mi: 1, kg: 100 }]);
    expect(state.party[1]!.treasure).toEqual([14]);
    expect(state.party[1]!.chestShares).toBeUndefined();
    expect(events).toEqual([]);
  });
});

describe("re-splitting and consolidating a chest", () => {
  const shared = () => share(pickup(), [{ mi: 1, kg: 50 }, { mi: 2, kg: 50 }]).state;

  it("a chest one member carries whole can be shared out", () => {
    const s = pickup({ treasures: [], party: [m(HERO), m(GIANT, { treasure: [14] }), m(OGRE), m(TROLL)] });
    const r = share(s, [{ mi: 1, kg: 75 }, { mi: 2, kg: 25 }], { member: 1 });
    expect(r.state.party[1]!.treasure).toEqual([]);
    expect(chestBearers(r.state, 1)).toEqual([{ mi: 1, kg: 75 }, { mi: 2, kg: 25 }]);
  });

  it("an existing group re-splits keeping its id, checked against what each bearer carries apart from the chest", () => {
    const r = share(shared(), [{ mi: 1, kg: 25 }, { mi: 2, kg: 75 }], { chest: 1 });
    expect(chestBearers(r.state, 1)).toEqual([{ mi: 1, kg: 25 }, { mi: 2, kg: 75 }]);
    expect(chestGroups(r.state)).toEqual([1]);
    expect(blocked(share(shared(), [{ mi: 3, kg: 100 }], { chest: 1 }))).toBe(true); // the Troll cannot take 100 alone
  });

  it("handing it all to one carrier makes it a plain chest again", () => {
    const r = share(shared(), [{ mi: 1, kg: 100 }], { chest: 1 });
    expect(r.state.party[1]!.treasure).toEqual([14]);
    expect(chestGroups(r.state)).toEqual([]);
  });

  it("two chests get distinct groups", () => {
    const a = share(pickup({ treasures: [14, 14] }), [{ mi: 1, kg: 50 }, { mi: 2, kg: 50 }]).state;
    const b = share(a, [{ mi: 0, kg: 50 }, { mi: 3, kg: 50 }]).state;
    expect(chestGroups(b)).toEqual([1, 2]);
    expect(carriedWeight(b.party[1]!)).toBe(50);
  });
});

describe("dropping, opening and losing a bearer", () => {
  const shared = (over: Partial<GameState> = {}) => ({ ...share(pickup(), [{ mi: 1, kg: 50 }, { mi: 2, kg: 50 }]).state, ...over });

  it("dropChest in a pickup puts the whole chest back on the floor", () => {
    const { state } = reduce(shared(), { type: "dropChest", chest: 1 });
    expect(state.treasures).toEqual([14]);
    expect(chestGroups(state)).toEqual([]);
    expect(carriedWeight(state.party[1]!)).toBe(0);
  });

  it("dropChest at rest on an unguarded tile offers it straight back, like any drop there", () => {
    const { state } = reduce(shared({ phase: "explore", treasures: [] }), { type: "dropChest", chest: 1 });
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([14]);
    expect(chestGroups(state)).toEqual([]);
  });

  it("openChest opens a chest borne by several, consuming every share", () => {
    const s = shared({ phase: "explore", treasures: [] });
    const { state, events } = reduce(s, { type: "openChest" });
    expect(events.some((e) => e.type === "chestOpened")).toBe(true);
    expect(chestGroups(state)).toEqual([]);
  });

  it("a bearer who falls takes the whole chest down: it is dropped, to be picked up again", () => {
    const s = shared();
    s.party[2]!.status = 3; // the Ogre is dead
    const { state, events } = reduce(s, { type: "leaveTreasure" });
    expect(events).toContainEqual({ type: "chestDropped" });
    expect(chestGroups(state)).toEqual([]);
    expect(state.party[1]!.chestShares).toBeUndefined(); // the Giant is relieved of his share too
  });

  it("a bearer who turns to stone or is removed also drops it", () => {
    const stone = shared(); stone.party[1]!.status = 2;
    expect(chestGroups(settleOf(stone))).toEqual([]);
    const gone = shared(); gone.party.splice(2, 1); // the Ogre left the party
    expect(chestGroups(settleOf(gone))).toEqual([]);
    expect(gone.treasures.length + gone.areas[0]!.contents.length).toBeGreaterThan(0);
  });

  it("a healthy group is left alone", () => {
    const s = shared();
    const { state, events } = reduce(s, { type: "leaveTreasure" });
    expect(events.some((e) => e.type === "chestDropped")).toBe(false);
    expect(chestGroups(state)).toEqual([1]);
  });
});

function settleOf(s: GameState): GameState { settleSharedChests(s); return s; }

describe("a fight and the retake of a shared chest", () => {
  const sharedGame = () => share(pickup(), [{ mi: 1, kg: 50 }, { mi: 2, kg: 50 }]).state;

  it("a fighter who bears a share sets the whole chest down, remembered per bearer", () => {
    const s = sharedGame();
    s.areas[0]!.contents = [];
    dropSharedChestsForFight(s, 1, true);
    expect(s.areas[0]!.contents).toEqual([200 + 14]);
    expect(chestGroups(s)).toEqual([]);
    expect(s.fightDrops).toEqual([{ mi: 1, tid: 14, kg: 50, chest: 1 }, { mi: 2, tid: 14, kg: 50, chest: 1 }]);
    dropSharedChestsForFight(s, 2, true); // the second bearer fighting too drops nothing more
    expect(s.areas[0]!.contents).toEqual([200 + 14]);
  });

  it("a classic fight won: the chest is back in the pickup and the retake re-applies the same shares", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, seed: 1, party: party(), strangers: [TROLL], areas: [room()] });
    s.party[1]!.chestShares = [{ chest: 1, kg: 75 }]; s.party[2]!.chestShares = [{ chest: 1, kg: 25 }];
    const won = reduce(s, { type: "resolveRound", matches: [{ front: [1], backers: [], strangers: [0] }] });
    expect(won.events).toContainEqual({ type: "fightWon" });
    expect(won.state.phase).toBe("pickup");
    expect(won.state.treasures).toContain(14);
    expect(chestGroups(won.state)).toEqual([]);
    const back = reduce(won.state, { type: "retakeDropped" });
    expect(back.events).toContainEqual({ type: "droppedRetaken", count: 1 });
    expect(chestBearers(back.state, 1)).toEqual([{ mi: 1, kg: 75 }, { mi: 2, kg: 25 }]); // apportioned as before
    expect(back.state.treasures).not.toContain(14);
    expect(back.state.fightDrops).toEqual([]);
  });

  it("the retake is not offered, and does nothing, if a bearer fell: the chest stays on the floor", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, seed: 1, party: party(), strangers: [TROLL], areas: [room()] });
    s.party[1]!.chestShares = [{ chest: 1, kg: 50 }]; s.party[2]!.chestShares = [{ chest: 1, kg: 50 }];
    const won = reduce(s, { type: "resolveRound", matches: [{ front: [1], backers: [], strangers: [0] }] }).state;
    won.party[2]!.status = 3; // the Ogre did not survive
    expect(blocked(reduce(won, { type: "retakeDropped" }))).toBe(true);
    expect(won.treasures).toContain(14);
  });
});

describe("a shared chest is invisible to games that never share one", () => {
  it("dropSharedChest on a chest nobody bears changes nothing it should not", () => {
    const s = pickup();
    expect(dropSharedChest(s, 99, "working")).toEqual([]);
  });
});

describe("opening a chest tips four bags onto the floor", () => {
  it("for a shared chest, in a pickup the party takes with the normal mechanics, and banks no points", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = makeState({ phase: "explore", party: [m(TROLL, { chestShares: [{ chest: 1, kg: 75 }] }), m(HERO, { chestShares: [{ chest: 1, kg: 25 }] })], areas: [room()], seed });
      const r = reduce(g, { type: "openChest" } as GameAction);
      const roll = (r.events.find((e) => e.type === "chestOpened") as { result: number }).result;
      if (roll < 4) continue;
      expect(r.state.treasures).toEqual(Array(4).fill(roll - 4));
      expect(r.state.phase).toBe("pickup");
      expect(r.state.bonusScore).toBe(0);
      expect(r.state.party.every((p) => !p.chestShares && p.treasure.length === 0)).toBe(true);
      // the freed room lets the bags be taken
      expect(reduce(r.state, { type: "takeTreasure", ti: 0, mi: 0 } as GameAction).events).not.toContainEqual({ type: "blocked" });
      return;
    }
    throw new Error("no loot roll found");
  });
});

describe("a Chest left on the floor comes back when the party makes room (game WQXK)", () => {
  it("dropping at rest re-offers the parked chest along with the dropped treasure", () => {
    const s = makeState({ phase: "explore", areas: [room([200 + 14])], party: [m(1, { treasure: [1, 1] }), m(TROLL, { treasure: [1, 1] })] }); // W-Hero and Troll, full of Gold
    const r = reduce(s, { type: "dropTreasure", mi: 0, idx: 0 });
    expect(r.state.phase).toBe("pickup");
    expect(r.state.treasures.sort()).toEqual([1, 14]);
    expect(r.state.areas[0]!.contents).toEqual([]);
  });

  it("leaves other parked things (a guarded tile keeps its goods)", () => {
    const s = makeState({ phase: "explore", areas: [room([100 + 3, 200 + 14])], party: [m(1, { treasure: [1] })] });
    const r = reduce(s, { type: "dropTreasure", mi: 0, idx: 0 });
    expect(r.state.phase).toBe("explore"); // a guard is still there: the drop parks too
    expect(r.state.areas[0]!.contents).toEqual([103, 214, 201]);
  });
});
