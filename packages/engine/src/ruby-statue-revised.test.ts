import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { driveStrangers } from "./strangerDriver";
import { playRevisedFight } from "./headless";
import { matchStrength } from "./revisedRound";
import { ALL_CREATURES, C_STATUE } from "./data/creatures";
import type { GameState, PartyMember, RevMatch } from "./state";

// Peter, 13-NOV-2026 (GitHub #59): in the revised combat the Lost Ruby is no longer a one-member wrestle. Reaching for it brings the Statue
// (strength 8, a physical foe: party magic adds nothing) down on the whole party, with no surprise. A win destroys it and frees the Ruby; a
// retreat leaves it aroused, and it strikes any party that comes back, with no retreat and no surprise.
const HERO = 0, MAN = 5, WIZARD = 8, GIANT = 12, EYE = 13;
const member = (creatureId: number, treasure: number[] = [], dragonKills = 0): PartyMember => ({ creatureId, status: 0, dragonKills, treasure });
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };
const pickup = (party: PartyMember[], over: Partial<GameState> = {}): GameState =>
  makeState({ phase: "pickup", areas: [{ ...area }], treasures: [11], party, seed: 5, variants: { combatRevision: true, statueFight: true }, ...over });

describe("the Lost Ruby's Statue in the revised combat", () => {
  it("is a creature of strength 8 with no magic of its own to count", () => {
    expect(ALL_CREATURES[C_STATUE]).toMatchObject({ name: "Lost Ruby Statue", fs: 8, mp: 0 });
  });

  it("starts a fight against the Statue when a member reaches for the Ruby, with no surprise and no wrestle roll", () => {
    const r = reduce(pickup([member(HERO), member(MAN)]), { type: "takeTreasure", ti: 0, mi: 1 });
    expect(r.state.phase).toBe("fight");
    expect(r.state.strangers).toEqual([C_STATUE]);
    expect(r.state.fight!.surprise).toBe(0);
    expect(r.state.fight!.statue).toEqual({ taker: 1 });
    expect(r.events).toContainEqual({ type: "statueAttacks", returning: false });
    expect(r.events.some((e) => e.type === "combatRoll")).toBe(false);
    expect(r.state.treasures).toEqual([11]);   // still on the floor until the Statue falls
  });

  it("is the attacker, so the party defends", () => {
    const r = reduce(pickup([member(HERO)]), { type: "takeTreasure", ti: 0, mi: 0 });
    expect(r.state.fight!.rev!.attacker).toBe("strangers");
  });

  it("does nothing if the party leaves the Ruby alone", () => {
    const s = pickup([member(HERO)]);
    expect(s.phase).toBe("pickup");
    expect(legalActions(s).some((a) => a.type === "takeTreasure")).toBe(true);
    const r = reduce(s, { type: "leaveTreasure" });
    expect(r.state.phase).not.toBe("fight");
    expect(r.state.rubyFreed).toBeUndefined();
  });

  it("is still stilled by the Eye: the Ruby is taken with no fight, once someone makes the attempt", () => {
    const r = reduce(pickup([member(HERO, [EYE])]), { type: "takeTreasure", ti: 0, mi: 0 });
    expect(r.state.phase).not.toBe("fight");
    expect(r.events).toContainEqual({ type: "statuePowerless" });
    expect(r.state.party[0]!.treasure).toContain(11);
    expect(r.state.rubyFreed).toBe(true);
  });

  it("keeps the one-member wrestle for a game started without the statueFight variant", () => {
    const r = reduce(pickup([member(GIANT, [], 6)], { variants: { combatRevision: true } }), { type: "takeTreasure", ti: 0, mi: 0 });
    expect(r.events.some((e) => e.type === "combatRoll")).toBe(true);
    expect(r.state.fight).toBeNull();
  });

  it("keeps the classic one-wrestler roll when the revised combat is off", () => {
    const r = reduce(pickup([member(GIANT, [], 6)], { variants: undefined }), { type: "takeTreasure", ti: 0, mi: 0 });
    expect(r.events.some((e) => e.type === "combatRoll")).toBe(true);
    expect(r.state.fight).toBeNull();
  });

  it("is fought like any physical foe: a Wizard counts its full effective strength in front, and lends its magic from behind (Peter)", () => {
    const base = reduce(pickup([member(WIZARD), member(HERO)]), { type: "takeTreasure", ti: 0, mi: 0 }).state;
    const front: RevMatch = { pf: [0], pb: [], sf: [0], sb: [] };
    const behind: RevMatch = { pf: [1], pb: [0], sf: [0], sb: [] };
    expect(matchStrength(base, front).party).toBe(7);        // a Wizard in front: fighting strength 2 + magic 5
    expect(matchStrength(base, behind).party).toBe(10);      // a Hero (5) in front, the Wizard's magic (5) behind
    expect(matchStrength(base, front).strangers).toBe(8);
  });

  it("frees the Ruby and gives it to the member who reached for it when the Statue is beaten", () => {
    let won = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const start = reduce(pickup([member(GIANT, [], 6), member(GIANT, [], 6), member(GIANT, [], 6)], { seed }), { type: "takeTreasure", ti: 0, mi: 2 }).state;
      const played = playRevisedFight(driveStrangers(start).state);
      if (played.state.phase === "gameOver") continue;
      won++;
      expect(played.state.rubyFreed).toBe(true);
      expect(played.state.statueAroused).toBeUndefined();
      expect(played.events.some((e) => e.type === "statueDestroyed")).toBe(true);
      expect(played.state.party[2]!.treasure).toContain(11);
      expect(played.state.treasures).not.toContain(11);
    }
    expect(won).toBeGreaterThan(0);
  });

  it("leaves the Statue aroused, guarding the Ruby, when the party retreats", () => {
    const chamber = { ...area, card: 15 | 16 };   // every exit open
    const s0 = reduce(pickup([member(MAN), member(MAN)], { areas: [chamber], largePack: Array(6).fill(15 | 16), largeIdx: 0, smallPack: [], smallIdx: 0 }), { type: "takeTreasure", ti: 0, mi: 0 }).state;
    const s = structuredClone(s0);
    s.fight!.round = 2;   // retreat opens after the first round
    const r = [0, 1, 2, 3].map((dir) => reduce(s, { type: "retreat", dir })).find((o) => o.state.partyArea !== 0)!;
    expect(r).toBeDefined();
    expect(r.state.statueAroused).toBe(0);
    expect(r.state.rubyFreed).toBeUndefined();
    expect(r.state.areas[0]!.contents).toContain(211);   // the Ruby stays on the floor
    expect(r.state.areas[0]!.contents).not.toContain(100 + C_STATUE);   // the Statue is never parked as a stranger
  });

  it("strikes a returning party on entry, with no retreat and no surprise", () => {
    const a = { ...area, card: 2 | 16, contents: [211] };   // a chamber (bit 16) with an exit east
    const s = makeState({
      areas: [a, { ...area, card: 8, coord: packCoord(1, 51, 50) }], partyArea: 1, prev: 0, level: 1, party: [member(MAN), member(MAN)],
      statueAroused: 0, seed: 3, variants: { combatRevision: true, statueFight: true },
    });
    const r = reduce(s, { type: "move", dir: 4 });   // walk back west into the Ruby's chamber
    expect(r.state.partyArea).toBe(0);
    {
      expect(r.state.phase).toBe("fight");
      expect(r.state.fight!.statue!.noRetreat).toBe(true);
      expect(r.state.fight!.surprise).toBe(0);
      expect(r.events).toContainEqual({ type: "statueAttacks", returning: true });
      const next = structuredClone(r.state);
      next.fight!.round = 3;
      expect(legalActions(next).some((x) => x.type === "retreat")).toBe(false);
      expect(reduce(next, { type: "retreat", dir: 2 }).events).toContainEqual({ type: "blocked" });
    }
  });
});
