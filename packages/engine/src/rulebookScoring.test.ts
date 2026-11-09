import { describe, expect, it } from "vitest";
import { scoreGame } from "./score";
import { makeState } from "./testkit";
import { GS_DEAD, GS_ESCAPED, type PartyMember } from "./state";

// Engine rules validation, pilot: "Ending and scoring the game" (Consolidated Rules V2): "Players whose parties succeed in leaving the Cave
// receive points for all the cards they hold. Dragon-slayers count 10 points extra for each dragon killed. A party which has killed the
// Sorcerer receives a bonus of 30 points. A player whose party is under a curse deducts 30 from his score."
const HERO = 0, DWARF = 7, SILVER = 0, GOLD = 1;
const member = (creatureId: number, treasure: number[] = [], extra: Partial<PartyMember> = {}): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure, ...extra });
const escaped = (party: PartyMember[], over = {}) => makeState({ gs: GS_ESCAPED, phase: "gameOver", party, ...over });

describe("rulebook scoring", () => {
  it("RC-SC-1 a party that leaves the Cave scores the points of every creature and treasure card it holds (Hero 10, Dwarf 2, Silver 5, Gold 10)", () => {
    expect(scoreGame(escaped([member(HERO, [GOLD]), member(DWARF, [SILVER])]))).toBe(10 + 10 + 2 + 5);
  });

  it("RC-SC-2 a party that does not leave the Cave scores nothing", () => {
    expect(scoreGame(makeState({ gs: GS_DEAD, phase: "gameOver", party: [member(HERO, [GOLD])] }))).toBe(0);
  });

  it("RC-SC-3 dead and petrified members, and what they carried, score nothing", () => {
    expect(scoreGame(escaped([member(HERO), member(DWARF, [GOLD], { status: 3 }), member(DWARF, [GOLD], { status: 2 })]))).toBe(10);
  });

  it("RC-SC-4 killing the Sorcerer is worth 30 points", () => {
    expect(scoreGame(escaped([member(HERO)], { sorcererKilled: true }))).toBe(10 + 30);
  });

  it("RC-SC-5 a party under a curse deducts 30 (once, however many curses)", () => {
    expect(scoreGame(escaped([member(HERO, [GOLD, GOLD, GOLD])], { curses: 2 }))).toBe(10 + 30 - 30);
  });

  it("RC-SC-6 [R-20] a dragon-slayer counts 10 points EXTRA for each dragon killed", () => {
    expect(scoreGame(escaped([member(DWARF, [], { dragonKills: 1 })]))).toBe(2 + 10);
    expect(scoreGame(escaped([member(DWARF, [], { dragonKills: 2 })]))).toBe(2 + 20);
  });
});
