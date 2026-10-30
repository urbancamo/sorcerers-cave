import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { driveStrangers } from "./strangerDriver";
import { partyAction } from "./headless";
import { legalActions } from "./selectors";
import { fightView, legalPairs, legalMoves } from "./revisedRound";
import type { GameState, PartyMember } from "./state";

// Bug report 2026-10-22 HOOD (Lotus Dust black screen): removing a stranger mid-fight left the revised round engine's stored stranger
// positions (matches, deployed front line) pointing past the end of `state.strangers`, and the next render threw.
const HERO = 0, OGRE = 2, TROLL = 3, PRIEST = 4, MAN = 5, WOMAN = 6, SPECTRE = 9, DEMON = 15;
const LOTUS = 5, HOLY_WATER = 16;
const member = (creatureId: number, treasure: number[] = []): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure });

/** Every stored stranger position is a real stranger, and nothing that reads them throws. */
const expectConsistent = (s: GameState): void => {
  const rev = s.fight?.rev;
  if (!rev) return;
  const ok = (n: number): boolean => Number.isInteger(n) && n >= 0 && n < s.strangers.length;
  for (const m of rev.matches) { expect(m.sf.length).toBeGreaterThan(0); expect([...m.sf, ...m.sb].every(ok)).toBe(true); }
  expect(rev.deployed.strangers.every(ok)).toBe(true);
  expect(() => { fightView(s); legalPairs(s, "party"); legalMoves(s, "party"); }).not.toThrow();
};

/** Walk a revised fight, and at every party decision throw each artefact the party may use, checking the result stands up. */
const scan = (strangers: number[], party: PartyMember[], artifact: number, seeds = 12): number => {
  let thrown = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let s = driveStrangers(reduce(makeState({ phase: "encounter", strangers, treasures: [], party, seed, variants: { combatRevision: true, extensionKit: true } }), { type: "attack" }).state).state;
    for (let i = 0; i < 30 && s.fight; i++) {
      for (const a of legalActions(s).filter((x) => x.type === "useArtifact" && x.artifact === artifact)) {
        const after = reduce(s, a).state;
        thrown++;
        expectConsistent(after);
      }
      const a = partyAction(s);
      if (!a) break;
      s = driveStrangers(reduce(s, a).state).state;
    }
  }
  return thrown;
};

describe("a stranger removed mid-fight in the revised combat", () => {
  it("Lotus Dust keeps the pairings pointing at real strangers, at every decision", () => {
    expect(scan([OGRE, TROLL, OGRE, TROLL], [member(MAN, [LOTUS]), member(HERO), member(WOMAN)], LOTUS)).toBeGreaterThan(10);
  });

  it("Holy Water destroying a Spectre or Demon does too", () => {
    expect(scan([OGRE, SPECTRE, TROLL, DEMON], [member(PRIEST, [HOLY_WATER]), member(HERO), member(WOMAN)], HOLY_WATER)).toBeGreaterThan(0);
  });

  it("a match whose only front-line stranger sleeps dissolves, freeing its party side", () => {
    let s = driveStrangers(reduce(makeState({ phase: "encounter", strangers: [OGRE, TROLL, OGRE, TROLL], treasures: [], party: [member(MAN, [LOTUS]), member(HERO, [LOTUS]), member(WOMAN, [LOTUS])], variants: { combatRevision: true } }), { type: "attack" }).state).state;
    // play on until the party is asked something with a pairing already standing
    for (let i = 0; i < 30 && s.fight && !(s.fight.pending?.by === "party" && s.fight.rev!.matches.length > 0 && s.strangers.length > 1); i++) { const a = partyAction(s); if (!a) break; s = driveStrangers(reduce(s, a).state).state; }
    expect(s.fight?.rev?.matches.length).toBeGreaterThan(0);
    const m = s.fight!.rev!.matches[0]!;
    const r = reduce(s, { type: "useArtifact", artifact: LOTUS, target: m.sf[0]! });
    const after = r.state;
    expectConsistent(after);
    expect(after.strangers).toHaveLength(s.strangers.length - 1);
    expect(after.fight).not.toBeNull();
    expect(after.fight!.rev!.matches).toHaveLength(m.sf.length > 1 ? s.fight!.rev!.matches.length : s.fight!.rev!.matches.length - 1);
  });
});
