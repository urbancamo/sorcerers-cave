import { describe, it, expect } from "vitest";
import {
  DEFAULT_RULES, T, unit, matchStrength, outcomeCounts, partyDieBonus, strangerDieBonus, casualtyVictim, invincible, isStalemate,
} from "./rules";
import type { Ctx } from "./types";

// creature ids (data/creatures.ts): 0 Hero 1 Woman-Hero 2 Ogre 3 Troll 4 Priest 5 Man 6 Woman 7 Dwarf 8 Wizard 11 Sorcerer 14 Apprentice
const HER = 0, OGR = 2, PRI = 4, MAN = 5, DWF = 7, WIZ = 8, SOR = 11;
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ eye: false, curses: 0, level: 1, attacker: "strangers", surprise: 0, rules: DEFAULT_RULES, ...over });
const view = (pf: ReturnType<typeof unit>[], sf: ReturnType<typeof unit>[], pb: ReturnType<typeof unit>[] = [], sb: ReturnType<typeof unit>[] = []) => ({ pf, pb, sf, sb });

describe("matchStrength", () => {
  it("adds the Sword bonus for a Hero (+2) and nothing for an Ogre", () => {
    const s = matchStrength(view([unit(HER, [T.SWORD])], [unit(OGR)]), ctx());
    expect(s).toEqual({ party: 7, strangers: 5 });
  });
  it("a caster in the front line fights with its total strength (fighting + magic)", () => {
    expect(matchStrength(view([unit(WIZ)], [unit(OGR)]), ctx()).party).toBe(7);
  });
  it("a background caster adds its magical power to the front fighter", () => {
    expect(matchStrength(view([unit(MAN)], [unit(OGR)], [unit(WIZ)]), ctx()).party).toBe(3 + 5);
  });
  it("the Eye of God switches off magic and artefacts for both sides", () => {
    const s = matchStrength(view([unit(WIZ), unit(HER, [T.SWORD])], [unit(OGR)]), ctx({ eye: true }));
    expect(s.party).toBe(2 + 5); // Wizard fs 2 only, Hero fs 5 without the Sword
  });
  it("the Staff adds 2 to a Wizard and, by default, 2 to a Priest (the card); 1 when the Priest +1 rule is chosen", () => {
    const front = [unit(MAN)], foe = [unit(OGR)];
    expect(matchStrength(view(front, foe, [unit(WIZ, [T.STAFF])]), ctx()).party).toBe(3 + 5 + 2);
    expect(matchStrength(view(front, foe, [unit(PRI, [T.STAFF])]), ctx()).party).toBe(3 + 2 + 2);
    const r1 = { ...DEFAULT_RULES, staffPriest: 1 as const };
    expect(matchStrength(view(front, foe, [unit(PRI, [T.STAFF])]), ctx({ rules: r1 })).party).toBe(3 + 2 + 1);
  });
  it("a party Shield bearer nullifies a stranger's magic, but the Sorcerer only loses 2", () => {
    const shield = [unit(HER, [T.SHIELD])];
    expect(matchStrength(view(shield, [unit(WIZ)]), ctx()).strangers).toBe(2);
    expect(matchStrength(view(shield, [unit(SOR)]), ctx()).strangers).toBe(4 + (9 - 2));
  });
  it("a stranger's Shield nullifies the party's magic in that match, front and background", () => {
    const s = matchStrength(view([unit(WIZ)], [unit(MAN, [T.SHIELD])], [unit(PRI)]), ctx());
    expect(s.party).toBe(2); // Wizard fighting strength only; the Priest backer adds nothing
  });
  it("a party Shield also wards stranger casters backing the match (the card text), unless the rule is off", () => {
    const shield = [unit(HER, [T.SHIELD])];
    expect(matchStrength(view(shield, [unit(OGR)], [], [unit(WIZ)]), ctx()).strangers).toBe(5);
    const off = { ...DEFAULT_RULES, shieldWardsBackers: false };
    expect(matchStrength(view(shield, [unit(OGR)], [], [unit(WIZ)]), ctx({ rules: off })).strangers).toBe(5 + 5);
  });
  it("counts dragon kills, the Elixir bonus and a Strength Potion for a party fighter", () => {
    const u = unit(MAN); u.dragonKills = 1; u.fsBonus = 2; u.potion = true;
    expect(matchStrength(view([u], [unit(OGR)]), ctx()).party).toBe(3 + 1 + 2 + 2);
  });
});

describe("die bonuses", () => {
  it("the party's Ring gives +1, each curse -1, and the Eye cancels the Ring", () => {
    const ring = [unit(MAN, [T.RING]), unit(HER)];
    expect(partyDieBonus(ring, ctx(), 2)).toBe(1);
    expect(partyDieBonus(ring, ctx({ curses: 2 }), 2)).toBe(-1);
    expect(partyDieBonus(ring, ctx({ eye: true }), 2)).toBe(0);
  });
  it("a dead bearer no longer gives the party the Ring bonus", () => {
    const bearer = unit(MAN, [T.RING]); bearer.alive = false;
    expect(partyDieBonus([bearer, unit(HER)], ctx(), 2)).toBe(0);
  });
  it("the strangers get +1 for a Ring, and the surprise bonus only when they attack, in round 1 only", () => {
    const s = [unit(OGR, [T.RING]), unit(DWF)];
    expect(strangerDieBonus(s, ctx({ attacker: "strangers", surprise: 1 }), 1)).toBe(2);
    expect(strangerDieBonus(s, ctx({ attacker: "strangers", surprise: 1 }), 2)).toBe(1);
    expect(strangerDieBonus(s, ctx({ attacker: "party", surprise: 2 }), 1)).toBe(1);   // the party attacked: the strangers get none
  });
  it("the party gets the surprise bonus (0, 1 or 2) only when it attacks, in round 1 only (reformulated rules, Determining Surprise Attack)", () => {
    const p = [unit(MAN), unit(HER)];
    expect(partyDieBonus(p, ctx({ attacker: "party", surprise: 2 }), 1)).toBe(2);
    expect(partyDieBonus(p, ctx({ attacker: "party", surprise: 2 }), 2)).toBe(0);
    expect(partyDieBonus(p, ctx({ attacker: "strangers", surprise: 1 }), 1)).toBe(0);   // the strangers attacked: the party gets none
    expect(partyDieBonus(p, ctx({ attacker: "party", surprise: 1, curses: 1 }), 1)).toBe(0);   // surprise +1, one curse -1
  });
});

describe("outcomeCounts (the 36 dice outcomes)", () => {
  it("Ogre (5) against Man (3): 26 wins, 4 ties, 6 losses", () => {
    expect(outcomeCounts(5, 3)).toEqual({ win: 26, tie: 4, lose: 6 });
  });
  it("Ogre (5) against Hero with the Sword (7): 6 wins, 4 ties, 26 losses", () => {
    expect(outcomeCounts(5, 7)).toEqual({ win: 6, tie: 4, lose: 26 });
  });
  it("a gap beyond 5 decides the match in advance", () => {
    expect(outcomeCounts(12, 1)).toEqual({ win: 36, tie: 0, lose: 0 });
    expect(outcomeCounts(1, 7)).toEqual({ win: 0, tie: 0, lose: 36 });
  });
  it("reproduces the worked example in the training spec: pairing B scores 28/36 + 0", () => {
    const b1 = outcomeCounts(5, 3), b2 = outcomeCounts(1, 7);
    expect((b1.win + 0.5 * b1.tie + b2.win + 0.5 * b2.tie) / 36).toBeCloseTo(28 / 36, 10);
  });
});

describe("casualtyVictim (a two-creature front line loses; one rule for both sides, Peter Q7)", () => {
  it("the nominated creature dies on 4-6, the other on 1-3 (high roll = success)", () => {
    expect(casualtyVictim(0, 1, 4, 0)).toBe(0);
    expect(casualtyVictim(0, 1, 6, 0)).toBe(0);
    expect(casualtyVictim(0, 1, 3, 0)).toBe(1);
  });
  it("a Ring adds 1 to the roll, and 7 counts as 6", () => {
    expect(casualtyVictim(0, 1, 3, 1)).toBe(0);
    expect(casualtyVictim(0, 1, 6, 1)).toBe(0);
  });
});

describe("isStalemate (Peter Q3: neither side can beat the other on any roll)", () => {
  const front = (...us: ReturnType<typeof unit>[]) => ({ pf: us, pb: [], sf: [], sb: [] });
  it("his example: a Dwarf wearing the Ring on level 4 cannot die and cannot out-roll the Apprentice", () => {
    const dwarf = unit(DWF, [T.RING]);
    const m = front(dwarf);
    // Dwarf 1 + die + Ring 1 reaches at most 8; the Apprentice (2 + 7) is at least 10. The Apprentice can win but cannot kill.
    expect(isStalemate({ party: 1, strangers: 9 }, 1, 0, m, ctx({ level: 4 }))).toBe(true);
  });
  it("the same match on level 3 is not a stalemate: the Dwarf can die", () => {
    expect(isStalemate({ party: 1, strangers: 9 }, 1, 0, front(unit(DWF, [T.RING])), ctx({ level: 3 }))).toBe(false);
  });
  it("an ordinary mismatch is not a stalemate: the stronger side can win and kill", () => {
    expect(isStalemate({ party: 1, strangers: 9 }, 0, 0, front(unit(DWF)), ctx({ level: 4 }))).toBe(false);
  });
  it("level matches, and gaps of 5 or less, are never stalemates", () => {
    expect(isStalemate({ party: 5, strangers: 5 }, 0, 0, front(unit(MAN)), ctx())).toBe(false);
    expect(isStalemate({ party: 5, strangers: 10 }, 0, 0, front(unit(MAN)), ctx())).toBe(false);
  });
  it("a Ring bearer is only safe if EVERY creature in the front line is invulnerable", () => {
    const m = front(unit(DWF, [T.RING]), unit(MAN));
    expect(isStalemate({ party: 4, strangers: 20 }, 1, 0, m, ctx({ level: 4 }))).toBe(false);
  });
});

describe("invincible (the Ring, level 4 and deeper)", () => {
  it("needs the Ring, level 4+, and no Eye", () => {
    const u = unit(MAN, [T.RING]);
    expect(invincible(u, ctx({ level: 3 }))).toBe(false);
    expect(invincible(u, ctx({ level: 4 }))).toBe(true);
    expect(invincible(u, ctx({ level: 4, eye: true }))).toBe(false);
    expect(invincible(unit(MAN), ctx({ level: 4 }))).toBe(false);
  });
});
