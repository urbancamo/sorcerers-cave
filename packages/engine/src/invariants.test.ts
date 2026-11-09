import { describe, expect, it } from "vitest";
import { checkInvariants } from "./invariants";
import { newGame } from "./index";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { candidateActions, legalParties } from "./goldenSearch";
import type { GameState } from "./state";

// The invariant checker must say nothing about sound states and name every kind of corruption — otherwise the soak that relies on it
// proves nothing. Each case below corrupts one thing in an otherwise sound state.
const sound = () => newGame(7, [4, 7], { extensionKit: true, sibyl: true });
const corrupt = (f: (s: GameState) => void) => { const s = structuredClone(sound()); f(s); return checkInvariants(s); };

describe("invariants: a sound state has no violations", () => {
  it("a new game, for every legal base draft", () => {
    for (const picks of legalParties()) expect(checkInvariants(newGame(3, picks)), picks.join()).toEqual([]);
  });
  it("every state of a short game played by the search's own action generator", () => {
    let s = sound();
    for (let i = 0; i < 300 && s.gs === 0; i++) {
      const acts = candidateActions(s, false, false);
      if (!acts.length) break;
      s = reduce(s, acts[(i * 7) % acts.length]!).state;
      expect(checkInvariants(s), `after ${i + 1} actions`).toEqual([]);
    }
  });
  it("makeState's minimal state", () => { expect(checkInvariants(makeState())).toEqual([]); });
});

describe("invariants: each corruption is named", () => {
  const cases: [string, (s: GameState) => void, RegExp][] = [
    ["a member with an impossible status", (s) => { s.party[0]!.status = 9 as 0; }, /status 9/],
    ["a creature that does not exist", (s) => { s.party[0]!.creatureId = 99; }, /does not exist/],
    ["a treasure that does not exist", (s) => { s.party[0]!.treasure = [77]; }, /treasure 77/],
    ["an item in use that is not carried", (s) => { s.party[0]!.borne = [3]; }, /in use but is not carrying/],
    ["a member carrying more than it can", (s) => { s.party[0]!.treasure = [0, 0, 0, 0, 0, 0, 0, 0]; }, /over its/],
    ["a stone member with no stone area", (s) => { s.party[0]!.status = 2; }, /is stone but not in a valid area/],
    ["a party area that is not on the map", (s) => { s.partyArea = 40; }, /partyArea 40/],
    ["the party on the wrong level", (s) => { s.level = 3; }, /level 3/],
    ["two areas in one cell", (s) => { s.areas.push({ ...s.areas[0]! }); }, /share a map cell/],
    ["a pack cursor past its pack", (s) => { s.smallIdx = s.smallPack.length + 1; }, /smallIdx/],
    ["a treasure in play more often than the pack holds it", (s) => { s.treasures = [10, 10]; }, /appears 2 times/],
    ["a negative curse count", (s) => { s.curses = -1; }, /curses is -1/],
    ["a finished game that is not marked finished", (s) => { s.gs = 2; }, /disagree/],
    ["a live game with everyone dead", (s) => { for (const m of s.party) m.status = 3; }, /no member of the party is alive/],
    ["a fight phase with no fight", (s) => { s.phase = "fight"; s.fight = null; }, /no fight/],
  ];
  it.each(cases)("%s", (_name, f, expected) => {
    expect(corrupt(f).join(" | ")).toMatch(expected);
  });
});
