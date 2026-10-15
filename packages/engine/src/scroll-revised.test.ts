import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { driveStrangers } from "./strangerDriver";
import { playRevisedFight } from "./headless";
import { fightView } from "./revisedRound";
import type { GameState, PartyMember } from "./state";

// Peter, 14-OCT-2026 (Step b, "The Scroll Option") and his ring-bearer clarification of 15-OCT-2026: in the revised combat the
// Scroll is a step of each round, open to the attacking player party only. It destroys every stranger without innate magical power
// (a Ring-bearer on level 4+ included: it drops the Ring), or in round 1 may instead add 1 to the surprise bonus. Either way the
// attacker is cursed; the Scroll is not consumed and cannot be used again in the same area.
const HERO = 0, OGRE = 2, TROLL = 3, PRIEST = 4, MAN = 5, DWARF = 7, SIBYL = 21;
const SCROLL = 19, EYE = 13, RING = 10;
const member = (creatureId: number, treasure: number[] = []): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure });

/** A revised fight the party has just started by attacking, with the strangers' preparations done: the party's first decision is next. */
const attacking = (party: PartyMember[], strangers: number[], over: Partial<GameState> = {}): GameState =>
  driveStrangers(reduce(makeState({ phase: "encounter", strangers, treasures: [], party, variants: { combatRevision: true }, ...over }), { type: "attack" }).state).state;

describe("the revised Scroll step", () => {
  it("is offered to the attacking party before round 1, with the surprise option", () => {
    const s = attacking([member(MAN, [SCROLL])], [OGRE]);
    expect(s.fight!.pending).toEqual({ by: "party", kind: "scroll", surprise: true });
  });

  it("destroys every stranger without magic, curses the party, and is not consumed", () => {
    const s = attacking([member(MAN, [SCROLL])], [OGRE, TROLL]);
    const r = reduce(s, { type: "scroll", use: "destroy" });
    expect(r.events).toContainEqual({ type: "scrollRead", destroyed: [OGRE, TROLL], survivors: [] });
    expect(r.state.strangers).toEqual([]);
    expect(r.state.fight).toBeNull();               // nobody left: the party has won
    expect(r.state.curses).toBe(1);
    expect(r.state.party[0]!.treasure).toContain(SCROLL);
  });

  it("leaves a caster standing and the fight goes on against it (in a zero-match round if need be)", () => {
    const s = attacking([member(MAN, [SCROLL]), member(HERO)], [OGRE, PRIEST]);
    const r = reduce(s, { type: "scroll", use: "destroy" });
    expect(r.state.strangers).toEqual([PRIEST]);
    expect(r.state.fight!.pending).toMatchObject({ kind: "deploy" });
    expect(r.state.curses).toBe(1);
  });

  it("never destroys the Sibyl", () => {
    const s = attacking([member(MAN, [SCROLL])], [OGRE, SIBYL], { variants: { combatRevision: true, sibyl: true } });
    const r = reduce(s, { type: "scroll", use: "destroy" });
    expect(r.state.strangers).toEqual([SIBYL]);
  });

  it("destroys a non-magic Ring-bearer on level 4+, who drops the Ring (Peter, 15-OCT-2026)", () => {
    const s = attacking([member(MAN, [SCROLL])], [DWARF, PRIEST], { level: 4 });
    s.fight!.gear = [[RING], []];
    const r = reduce(s, { type: "scroll", use: "destroy" });
    expect(r.state.strangers).toEqual([PRIEST]);
    expect(r.state.treasures).toContain(RING);
  });

  it("in round 1 the attacker may instead add 1 to its surprise bonus, and is cursed all the same", () => {
    const s = attacking([member(MAN, [SCROLL])], [OGRE]);
    const before = fightView(s).partyDieBonus;
    const r = reduce(s, { type: "scroll", use: "surprise" });
    expect(r.state.strangers).toEqual([OGRE]);
    expect(r.state.curses).toBe(1);
    expect(fightView(r.state).partyDieBonus + r.state.curses).toBe(before + 1);   // +1 surprise, set against the one curse just taken
    expect(r.state.fight!.pending).toMatchObject({ kind: "deploy" });
  });

  it("declining costs nothing and is asked again next round for the destroy option only", () => {
    const s = attacking([member(MAN, [SCROLL])], [OGRE]);
    const r = reduce(s, { type: "scroll", use: "decline" });
    expect(r.state.curses).toBe(0);
    expect(r.state.fight!.pending).toMatchObject({ kind: "deploy" });
    expect(reduce(s, { type: "scroll", use: "surprise" }).events[0]).not.toMatchObject({ type: "blocked" });
  });

  it("refuses the surprise option after round 1", () => {
    const s = attacking([member(MAN, [SCROLL])], [OGRE, PRIEST]);
    s.fight!.round = 2;
    s.fight!.pending = { by: "party", kind: "scroll", surprise: false };
    expect(reduce(s, { type: "scroll", use: "surprise" }).events).toContainEqual({ type: "blocked" });
  });

  it("cannot be used again in an area where it has already been used", () => {
    const s = attacking([member(MAN, [SCROLL]), member(HERO)], [OGRE, PRIEST]);
    const used = reduce(s, { type: "scroll", use: "decline" }).state;
    expect(used.scrollAreas).toBeUndefined();
    const burnt = reduce(s, { type: "scroll", use: "destroy" }).state;
    expect(burnt.scrollAreas).toEqual([s.partyArea]);
    const again = attacking([member(MAN, [SCROLL])], [OGRE, PRIEST], { scrollAreas: [0] });
    expect(again.fight!.pending?.kind).not.toBe("scroll");
  });

  it("is not offered to the strangers' attack, without the Scroll, or under the Eye", () => {
    expect(attacking([member(MAN)], [OGRE]).fight!.pending?.kind).not.toBe("scroll");
    expect(attacking([member(MAN, [SCROLL, EYE])], [OGRE]).fight?.pending?.kind).not.toBe("scroll");
    let s = makeState({ phase: "encounter", strangers: [OGRE, TROLL], treasures: [], party: [member(MAN, [SCROLL]), member(HERO)], variants: { combatRevision: true }, testMode: true });
    s = reduce(s, { type: "testForceReaction", outcome: "hostile" }).state;
    s = driveStrangers(reduce(s, { type: "test" }).state).state;
    expect(s.fight!.rev!.attacker).toBe("strangers");
    expect(s.fight!.pending?.kind).not.toBe("scroll");
  });

  it("the old way of reading it is closed while the revised combat is on", () => {
    const s = attacking([member(MAN, [SCROLL])], [OGRE]);
    expect(reduce({ ...s, fight: { ...s.fight!, pending: undefined } }, { type: "useArtifact", artifact: SCROLL }).events).toContainEqual({ type: "blocked" });
  });

  it("a headless fight does not stall on it: the standard party declines", () => {
    const s = attacking([member(MAN, [SCROLL]), member(HERO)], [OGRE, TROLL]);
    expect(["won", "lost"]).toContain(playRevisedFight(s).end);
  });
});
