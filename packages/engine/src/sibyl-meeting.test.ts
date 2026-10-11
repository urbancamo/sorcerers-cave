import { describe, it, expect } from "vitest";
import { makeState } from "./testkit";
import { enterChamber } from "./chamber";
import { reactionRoll, forcedReactionRoll } from "./reaction";
import { C_SIBYL, SIBYL_CODE, sibylWaiting } from "./sibyl";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { packCoord } from "./coords";
import { newGame } from "./setup";
import { buildMpGame, areaInteractionMask } from "./multi";

const man = () => ({ creatureId: 5, status: 0 as const, dragonKills: 0, treasure: [] });

describe("Sibyl placement (SC-SIB-2)", () => {
  it("reloads a parked Sibyl into the parked-awake slot, never into the strangers", () => {
    const s = makeState();
    s.areas[0]!.visited = true;
    s.areas[0]!.contents = [SIBYL_CODE, 100 + 5];
    enterChamber(s);
    expect(s.strangers).toEqual([5]);
    expect(s.lulled).toEqual([C_SIBYL]);
  });

  it("a freshly drawn Sibyl goes to the same slot", () => {
    const s = makeState({ smallPack: [SIBYL_CODE], smallIdx: 0 });
    enterChamber(s); // the Gateway: level 1 draws one card
    expect(s.strangers).toEqual([]);
    expect(s.lulled).toEqual([C_SIBYL]);
  });

  it("is not petrified by a Gallery (she arrives un-statued like the Spectre and Sorcerer)", () => {
    const s = makeState({ smallPack: [SIBYL_CODE], smallIdx: 0 });
    // SPECIAL_GALLERY (10) << 7 | NESW + chamber (31) — the same card encoding the kit tests use.
    s.areas[0]!.card = (10 << 7) | 31;
    enterChamber(s);
    expect(s.statues ?? []).toEqual([]);
    expect(s.lulled).toEqual([C_SIBYL]);
  });
});

describe("sibylWaiting (SC-SIB-4)", () => {
  it("is true only when she is here, unmet, and no other stranger remains", () => {
    expect(sibylWaiting(makeState({ lulled: [C_SIBYL] }))).toBe(true);
    expect(sibylWaiting(makeState({ lulled: [C_SIBYL], strangers: [5] }))).toBe(false);
    expect(sibylWaiting(makeState({ lulled: [C_SIBYL], sibylMet: true }))).toBe(false);
    expect(sibylWaiting(makeState({ lulled: [10] }))).toBe(false); // a lulled Dragon is not her
    expect(sibylWaiting(makeState())).toBe(false);
  });
});

describe("Sibyl reaction band (SC-SIB-3)", () => {
  it("with the leader overridden: 1-4 indifferent, 5-6 friendly, never hostile", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const r = reactionRoll(makeState({ party: [man()], seed }), undefined, C_SIBYL); // no charisma: roll = die
      expect(r.outcome).not.toBe("hostile");
      expect(r.outcome).toBe(r.roll <= 4 ? "indifferent" : "friendly");
      seen.add(r.outcome);
    }
    expect(seen).toEqual(new Set(["indifferent", "friendly"]));
  });

  it("a curse can never push her hostile (hostileMax 0)", () => {
    for (let seed = 1; seed <= 100; seed++) {
      expect(reactionRoll(makeState({ party: [man()], seed, curses: 5 }), undefined, C_SIBYL).outcome).not.toBe("hostile");
    }
  });

  it("forcedReactionRoll yields a display roll inside the requested band for her", () => {
    const s = makeState({ party: [man()] });
    expect(forcedReactionRoll(s, "indifferent", C_SIBYL)).toBe(1);
    expect(forcedReactionRoll(s, "friendly", C_SIBYL)).toBe(5);
  });

  it("without an override the leader is still the strongest stranger (unchanged)", () => {
    const r = reactionRoll(makeState({ strangers: [3], party: [man()], seed: 1 }));
    expect(r.outcome).toBe("indifferent"); // Troll, raw 4 at seed 1 (see gap-encounters.test.ts)
  });
});

const hero = () => ({ creatureId: 0, status: 0 as const, dragonKills: 0, treasure: [] });
const tile = (contents: number[] = []) =>
  ({ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents, flags: 0, indiffCount: 0 });

/** An encounter with the Sibyl as the only thing here (the Man's party has no charisma). */
const sibylEncounter = (over: Parameters<typeof makeState>[0] = {}) =>
  makeState({ phase: "encounter", party: [man()], strangers: [], lulled: [C_SIBYL], areas: [tile()], ...over });

describe("meeting the Sibyl (SC-SIB-4/5)", () => {
  it("a lone, unmet Sibyl offers only withdraw and test — no attack", () => {
    expect(legalActions(sibylEncounter()).map((a) => a.type)).toEqual(["withdraw", "test"]);
  });

  it("test: a friendly result sets the party flag — no new member — and clears the chamber", () => {
    const { state, events } = reduce(sibylEncounter({ testMode: true, testNextReaction: "friendly" }), { type: "test" });
    expect(state.hasSibyl).toBe(true);
    expect(state.sibylMet).toBe(true);
    expect(state.party).toHaveLength(1);
    expect(state.lulled ?? []).not.toContain(C_SIBYL);
    expect(events).toContainEqual({ type: "sibylJoins" });
    expect(events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "friendly" }));
    expect(state.phase).toBe("explore");
  });

  it("test: an indifferent result leaves her parked in the chamber and she is never tested again", () => {
    const { state, events } = reduce(sibylEncounter({ testMode: true, testNextReaction: "indifferent" }), { type: "test" });
    expect(state.hasSibyl).toBeUndefined();
    expect(state.sibylMet).toBe(true);
    expect(events).toContainEqual({ type: "sibylDeclines" });
    expect(state.areas[0]!.contents).toContain(SIBYL_CODE); // parked in place
    expect(state.phase).toBe("explore");
    const back = structuredClone(state);
    enterChamber(back); // re-entering reloads her…
    expect(sibylWaiting(back)).toBe(false); // …but she is not offered again
  });

  it("her test does not touch the indifference streak or pacify the area", () => {
    const { state } = reduce(sibylEncounter({ testMode: true, testNextReaction: "indifferent" }), { type: "test" });
    expect(state.indiffStreak ?? 0).toBe(0);
    expect(state.pacifiedAreas ?? []).toEqual([]);
  });

  it("a real roll consumes the seed and banding comes from her row (never hostile)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const { state, events } = reduce(sibylEncounter({ seed }), { type: "test" });
      const r = events.find((e) => e.type === "reaction") as { outcome: string };
      expect(r.outcome).not.toBe("hostile");
      expect(state.seed).not.toBe(seed);
      seen.add(r.outcome);
    }
    expect(seen.size).toBe(2);
  });

  it("test is blocked outside an encounter", () => {
    expect(reduce(sibylEncounter({ phase: "explore" }), { type: "test" }).events).toEqual([{ type: "blocked" }]);
  });

  it("pickup follows her test: treasure found with her is unguarded", () => {
    const { state } = reduce(sibylEncounter({ treasures: [1], testMode: true, testNextReaction: "friendly" }), { type: "test" });
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([1]);
    expect(state.hasSibyl).toBe(true);
  });

  it("she is tested last: with a Man here, his group is tested first and the phase stays an encounter", () => {
    const s = sibylEncounter({ strangers: [5], testMode: true, testNextReaction: "friendly" });
    expect(legalActions(s).map((a) => a.type)).toContain("attack"); // real strangers are still here
    const first = reduce(s, { type: "test" });
    expect(first.state.party).toHaveLength(2); // the Man joined
    expect(first.state.hasSibyl).toBeUndefined(); // she was NOT part of that roll
    expect(first.state.phase).toBe("encounter");
    expect(sibylWaiting(first.state)).toBe(true);
    const second = reduce({ ...first.state, testNextReaction: "friendly" }, { type: "test" });
    expect(second.state.hasSibyl).toBe(true);
    expect(second.state.phase).toBe("explore");
  });

  it("withdraw parks her in the chamber (her card is not lost)", () => {
    const s = sibylEncounter({
      partyArea: 1, prev: 0,
      areas: [tile(), { ...tile(), coord: packCoord(1, 50, 51) }],
    });
    const { state } = reduce(s, { type: "withdraw" });
    expect(state.areas[1]!.contents).toContain(SIBYL_CODE);
  });
});

describe("fights never contain her (SC-SIB-6)", () => {
  it("a fight never contains her, and she is met after the fight is won", () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const s = makeState({ phase: "encounter", party: [hero()], strangers: [7], lulled: [C_SIBYL], areas: [tile()], seed });
      const fighting = reduce(s, { type: "attack" }).state;
      expect(fighting.strangers).toEqual([7]); // only the Dwarf
      expect(fighting.lulled).toEqual([C_SIBYL]); // she stands aside
      const r = reduce(fighting, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
      if (!r.events.some((e) => e.type === "fightWon")) continue; // the Dwarf got lucky: try another seed
      found = true;
      expect(r.state.phase).toBe("encounter");
      expect(sibylWaiting(r.state)).toBe(true);
      expect(legalActions(r.state).map((a) => a.type)).toEqual(["withdraw", "test"]);
    }
    expect(found).toBe(true);
  });
});

describe("pacified chambers (SC-SIB-6)", () => {
  it("a chamber whose only parked card is the Sibyl offers no attack and blocks a forged one", () => {
    const s = makeState({ phase: "explore", pacifiedAreas: [0], areas: [tile([SIBYL_CODE])] });
    expect(legalActions(s).some((a) => a.type === "attack")).toBe(false);
    expect(reduce(s, { type: "attack" }).events).toEqual([{ type: "blocked" }]);
  });

  it("attacking real guards steps the parked Sibyl aside instead of into the fight", () => {
    const s = makeState({ phase: "explore", party: [hero()], pacifiedAreas: [0], areas: [tile([107, SIBYL_CODE, 201])] });
    expect(legalActions(s).some((a) => a.type === "attack")).toBe(true);
    const { state } = reduce(s, { type: "attack" });
    expect(state.strangers).toEqual([7]); // the Dwarf only
    expect(state.lulled).toEqual([C_SIBYL]);
    expect(state.treasures).toEqual([1]);
    expect(state.areas[0]!.contents).not.toContain(SIBYL_CODE); // now live, not double-parked
  });
});

describe("Test Mode can script the Sibyl (SC-SIB-1)", () => {
  const testGame = (variants?: { extensionKit?: boolean; sibyl?: boolean }) => newGame(1, [0], variants, true);

  it("testSetChamber accepts her on a Sibyl game (kit off), and the next chamber really holds her", () => {
    const { state, events } = reduce(testGame({ sibyl: true }), { type: "testSetChamber", strangers: [C_SIBYL], treasures: [], hazards: [] });
    expect(events).toEqual([{ type: "testChamberQueued", strangers: [C_SIBYL], treasures: [], hazards: [] }]);
    expect(state.testNextChamber).toEqual({ strangers: [C_SIBYL], treasures: [], hazards: [] });
    const s = structuredClone(state);
    enterChamber(s); // the Gateway is unvisited: the scripted chamber replaces the draw
    expect(s.lulled).toEqual([C_SIBYL]);
    expect(s.strangers).toEqual([]);
  });

  it("accepts her alongside kit creatures on a kit + Sibyl game", () => {
    const { events } = reduce(testGame({ extensionKit: true, sibyl: true }), { type: "testSetChamber", strangers: [18, C_SIBYL], treasures: [], hazards: [] });
    expect(events[0]).toMatchObject({ type: "testChamberQueued" });
  });

  it("blocks her when the game does not carry the Sibyl variant, kit or no kit", () => {
    for (const variants of [undefined, { extensionKit: true }]) {
      const { events } = reduce(testGame(variants), { type: "testSetChamber", strangers: [C_SIBYL], treasures: [], hazards: [] });
      expect(events).toEqual([{ type: "blocked" }]);
    }
  });

  it("still blocks kit-only creatures on a Sibyl-only game", () => {
    const { events } = reduce(testGame({ sibyl: true }), { type: "testSetChamber", strangers: [18], treasures: [], hazards: [] });
    expect(events).toEqual([{ type: "blocked" }]);
  });
});

describe("review fixes: pacified chambers, PvP and dropped treasure (SC-SIB-4/6)", () => {
  it("the third indifferent test pacifies the guards and then offers the Sibyl (she is not stranded with them)", () => {
    const s = makeState({
      phase: "encounter", party: [man()], strangers: [7], lulled: [C_SIBYL], treasures: [1], areas: [tile()],
      indiffStreak: 2, testMode: true, testNextReaction: "indifferent",
    });
    const { state } = reduce(s, { type: "test" });
    expect(state.pacifiedAreas).toContain(0);
    expect(state.phase).toBe("encounter");
    expect(sibylWaiting(state)).toBe(true);
    expect(legalActions(state).map((a) => a.type)).toEqual(["withdraw", "test"]);
    expect(state.areas[0]!.contents).toEqual(expect.arrayContaining([107, 201])); // the guards and their treasure stay parked
    expect(state.areas[0]!.contents).not.toContain(SIBYL_CODE); // she is live, not parked
    const met = reduce({ ...state, testNextReaction: "friendly" }, { type: "test" });
    expect(met.state.hasSibyl).toBe(true);
    expect(met.state.phase).toBe("explore");
    expect(met.state.areas[0]!.contents).toEqual(expect.arrayContaining([107, 201]));
  });

  it("re-entering a pacified chamber that holds only a parked Sibyl (its guards long gone) offers her", () => {
    const s = makeState({
      phase: "encounter", partyArea: 1, prev: 0, party: [man()], strangers: [5], pacifiedAreas: [0],
      areas: [tile([SIBYL_CODE]), { ...tile(), coord: packCoord(1, 50, 51) }],
    });
    const { state } = reduce(s, { type: "withdraw" });
    expect(state.partyArea).toBe(0);
    expect(state.phase).toBe("encounter");
    expect(sibylWaiting(state)).toBe(true);
  });

  it("a Sibyl already met (parked, indifferent) does not reopen an encounter in a pacified chamber", () => {
    const s = makeState({
      phase: "encounter", partyArea: 1, prev: 0, party: [man()], strangers: [5], pacifiedAreas: [0], sibylMet: true,
      areas: [tile([SIBYL_CODE]), { ...tile(), coord: packCoord(1, 50, 51) }],
    });
    expect(reduce(s, { type: "withdraw" }).state.phase).toBe("explore");
  });

  it("a parked Sibyl does not block PvP in her chamber: she guards nothing", () => {
    const seats = [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }];
    const mp = buildMpGame(3, seats, { sibyl: true });
    mp.cave.areas[0]!.contents = [SIBYL_CODE];
    expect(areaInteractionMask(mp, 0).reason).not.toBe("clear the strangers first");
    mp.cave.areas[0]!.contents = [SIBYL_CODE, 100 + 5];
    expect(areaInteractionMask(mp, 0).reason).toBe("clear the strangers first"); // a real stranger still does
  });

  it("an item dropped beside a parked Sibyl is offered back for pickup (she is no guard)", () => {
    const s = makeState({ phase: "explore", party: [{ ...man(), treasure: [1] }], areas: [tile([SIBYL_CODE])] });
    const { state } = reduce(s, { type: "dropTreasure", mi: 0, idx: 0 });
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([1]);
  });
});
