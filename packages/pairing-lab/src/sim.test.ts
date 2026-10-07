import { describe, it, expect } from "vitest";
import { simulate } from "./sim";
import { DEFAULT_RULES, T, unit } from "./rules";
import { balancedScenario, randomScenario } from "./scenario";
import type { Rules, Scenario } from "./types";

const HER = 0, OGR = 2, MAN = 5, DWF = 7, GNT = 12, TRL = 3;
const scn = (party: ReturnType<typeof unit>[], strangers: ReturnType<typeof unit>[], over: Partial<Scenario> = {}): Scenario =>
  ({ party, strangers, eye: false, curses: 0, level: 1, strangerSurprise: 0, ...over });
const noRetreat: Rules = { ...DEFAULT_RULES, partyRetreatRatio: 0 };
const rate = (n: number, f: (i: number) => boolean) => { let c = 0; for (let i = 1; i <= n; i++) if (f(i)) c++; return c / n; };

describe("simulate", () => {
  it("is deterministic for a seed", () => {
    const s = scn([unit(HER, [T.SWORD]), unit(MAN), unit(MAN)], [unit(OGR), unit(TRL)]);
    for (const seed of [1, 2, 3, 99]) expect(simulate(s, DEFAULT_RULES, "GRD", "GRD", seed)).toEqual(simulate(s, DEFAULT_RULES, "GRD", "GRD", seed));
  });
  it("does not modify the scenario it is given", () => {
    const s = scn([unit(HER), unit(MAN)], [unit(OGR)]);
    const before = JSON.stringify(s);
    simulate(s, DEFAULT_RULES, "GRD", "GRD", 5);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("always terminates and the counts add up", () => {
    const s = scn([unit(HER), unit(MAN), unit(MAN), unit(DWF)], [unit(OGR), unit(TRL), unit(GNT)]);
    for (let seed = 1; seed <= 300; seed++) {
      for (const ps of ["GRD", "CAU", "MAG", "RLG"] as const) {
        const o = simulate(s, DEFAULT_RULES, ps, "GRD", seed);
        expect(["strangersWin", "partyWin", "retreat", "cap"]).toContain(o.end);
        expect(o.partyAlive).toBeGreaterThanOrEqual(0); expect(o.partyAlive).toBeLessThanOrEqual(4);
        expect(o.strangersAlive).toBeGreaterThanOrEqual(0); expect(o.strangersAlive).toBeLessThanOrEqual(3);
        expect(o.rounds).toBeGreaterThanOrEqual(1);
        if (o.end === "strangersWin") expect(o.partyAlive).toBe(0);
        if (o.end === "partyWin") expect(o.strangersAlive).toBe(0);
        for (const r of [o.r1, o.r2, o.r3]) { expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(1); }
      }
    }
  });
  it("1 v 1, Ogre against Man: unresolved ties persist, so the Ogre eventually wins 26/(26+6) = 81.25% of fights", () => {
    const s = scn([unit(MAN)], [unit(OGR)]);
    const p = rate(20000, (i) => simulate(s, noRetreat, "GRD", "GRD", i).end === "strangersWin");
    expect(Math.abs(p - 26 / 32)).toBeLessThan(0.012);
  });
  it("the same 1 v 1 gives the same answer whichever side attacks first", () => {
    const s = scn([unit(MAN)], [unit(OGR)]);
    const flipped: Rules = { ...noRetreat, strangersAttackFirst: false };
    const p = rate(20000, (i) => simulate(s, flipped, "GRD", "GRD", i).end === "strangersWin");
    expect(Math.abs(p - 26 / 32)).toBeLessThan(0.012);
  });
  it("round 1 surprise shifts the odds towards the strangers", () => {
    const base = scn([unit(MAN)], [unit(OGR)]);
    const surprised = scn([unit(MAN)], [unit(OGR)], { strangerSurprise: 1 });
    const a = rate(10000, (i) => simulate(base, noRetreat, "GRD", "GRD", i).end === "strangersWin");
    const b = rate(10000, (i) => simulate(surprised, noRetreat, "GRD", "GRD", i).end === "strangersWin");
    expect(b).toBeGreaterThan(a);
  });
  it("a strong party overwhelms one weak stranger", () => {
    const s = scn([unit(HER, [T.SWORD]), unit(HER), unit(MAN)], [unit(DWF)]);
    const p = rate(2000, (i) => simulate(s, DEFAULT_RULES, "GRD", "GRD", i).end === "partyWin");
    expect(p).toBeGreaterThan(0.995);
  });
  it("an outclassed party retreats when its strength falls below the ratio", () => {
    // a level 4 Ring bearer cannot be killed, so it survives round 1 and then sees it is outmatched
    const s = scn([unit(MAN, [T.RING])], [unit(GNT), unit(GNT), unit(TRL)], { level: 4 });
    const ends = new Set<string>();
    for (let i = 1; i <= 400; i++) ends.add(simulate(s, DEFAULT_RULES, "GRD", "GRD", i).end);
    expect(ends.has("retreat")).toBe(true);
    // and with retreat switched off it never does
    for (let i = 1; i <= 100; i++) expect(simulate(s, { ...DEFAULT_RULES, partyRetreatRatio: 0, maxRounds: 10 }, "GRD", "GRD", i).end).not.toBe("retreat");
  });
  it("the value lost on each side equals the points of the creatures that died", () => {
    const s = scn([unit(HER), unit(MAN)], [unit(OGR), unit(DWF)]);
    for (let i = 1; i <= 200; i++) {
      const o = simulate(s, noRetreat, "GRD", "GRD", i);
      expect(o.partyValueLost).toBeGreaterThanOrEqual(0);
      expect(o.strangerValueLost).toBeGreaterThanOrEqual(0);
      if (o.end === "strangersWin") expect(o.partyValueLost).toBe(10 + 5); // Hero 10 + Man 5 points
      if (o.end === "partyWin") expect(o.strangerValueLost).toBe(5 + 2); // Ogre 5 + Dwarf 2 points
    }
  });
  it("the casualty rule switch runs to completion", () => {
    const s = scn([unit(HER), unit(MAN), unit(MAN)], [unit(OGR), unit(TRL)]);
    const strongest: Rules = { ...DEFAULT_RULES, strangerCasualty: "strongest" };
    for (let i = 1; i <= 100; i++) expect(["strangersWin", "partyWin", "retreat", "cap"]).toContain(simulate(s, strongest, "GRD", "GRD", i).end);
  });
  it("a level 4+ Ring bearer cannot be killed", () => {
    const s = scn([unit(MAN, [T.RING])], [unit(OGR), unit(OGR)], { level: 4 });
    for (let i = 1; i <= 200; i++) {
      const o = simulate(s, { ...DEFAULT_RULES, partyRetreatRatio: 0, maxRounds: 12 }, "GRD", "GRD", i);
      expect(o.end).not.toBe("strangersWin");
      expect(o.partyAlive).toBe(1);
    }
  });
});

describe("simulate with a forced first-round pairing", () => {
  it("uses the supplied pairing in round 1 (strangers attacking) and then plays on normally", () => {
    // Two strangers v a Hero (with Sword) and a Man. Force Ogre v Man, Dwarf v Hero, whatever the default pairing would be.
    const s = scn([unit(HER, [T.SWORD]), unit(MAN)], [unit(OGR), unit(DWF)]);
    let seen: [number, number][] = [];
    const o = simulate(s, noRetreat, "GRD", "GRD", 7, {
      round1Engage: (A, attFree, D, defDep) => {
        const ogre = attFree.find((i) => A[i]!.cid === OGR)!, dwarf = attFree.find((i) => A[i]!.cid === DWF)!;
        const man = defDep.find((i) => D[i]!.cid === MAN)!, hero = defDep.find((i) => D[i]!.cid === HER)!;
        seen = [[ogre, man], [dwarf, hero]];
        return seen;
      },
    });
    expect(seen.length).toBe(2);
    expect(o.rounds).toBeGreaterThanOrEqual(1);
  });
  it("is deterministic with the override, and changes the odds in the expected direction", () => {
    // Pairing B (Ogre v Man, Dwarf v Hero) is much better for the strangers in round 1 than A (Ogre v Hero, Dwarf v Man).
    const s = scn([unit(HER, [T.SWORD]), unit(MAN)], [unit(OGR), unit(DWF)]);
    const pair = (ogreVsMan: boolean) => (A: Parameters<NonNullable<NonNullable<Parameters<typeof simulate>[5]>["round1Engage"]>>[0], attFree: number[], D: typeof A, defDep: number[]): [number, number][] => {
      const ogre = attFree.find((i) => A[i]!.cid === OGR)!, dwarf = attFree.find((i) => A[i]!.cid === DWF)!;
      const man = defDep.find((i) => D[i]!.cid === MAN)!, hero = defDep.find((i) => D[i]!.cid === HER)!;
      return ogreVsMan ? [[ogre, man], [dwarf, hero]] : [[ogre, hero], [dwarf, man]];
    };
    const meanR1 = (b: boolean) => { let t = 0; for (let i = 1; i <= 4000; i++) t += simulate(s, noRetreat, "GRD", "GRD", i, { round1Engage: pair(b) }).r1; return t / 4000; };
    expect(simulate(s, noRetreat, "GRD", "GRD", 3, { round1Engage: pair(true) })).toEqual(simulate(s, noRetreat, "GRD", "GRD", 3, { round1Engage: pair(true) }));
    expect(meanR1(true)).toBeGreaterThan(meanR1(false) + 0.15);   // exact round-1 scores: 0.778/2 vs 0.444/2
  });
});

describe("simulate at the largest sizes", () => {
  const ends = ["strangersWin", "partyWin", "retreat", "cap"];
  it("handles the biggest parties (30 base, 40 kit) and a Mutiny-sized group of 20 strangers", () => {
    const cases: [string, Scenario][] = [
      ["base 4 v 26", randomScenario(1, "base", { strangers: 4, party: 26 })],
      ["base 20 v 14", randomScenario(2, "base", { strangers: 20, party: 14 })],
      ["kit 6 v 34", randomScenario(3, "kit", { strangers: 6, party: 34 })],
      ["kit 20 v 20", randomScenario(4, "kit", { strangers: 20, party: 20 })],
    ];
    for (const [name, s] of cases) {
      for (let seed = 1; seed <= 40; seed++) {
        for (const ps of ["GRD", "CAU", "MAG", "RLG"] as const) {
          const o = simulate(s, DEFAULT_RULES, ps, "GRD", seed);
          expect(ends, name).toContain(o.end);
          expect(o.partyAlive).toBeLessThanOrEqual(s.party.length);
          expect(o.strangersAlive).toBeLessThanOrEqual(s.strangers.length);
          if (o.end === "strangersWin") expect(o.partyAlive).toBe(0);
          if (o.end === "partyWin") expect(o.strangersAlive).toBe(0);
        }
      }
    }
  });
  it("balanced fights of every size run to a decision and give contested results", () => {
    let strangers = 0, party = 0, n = 600;
    for (let seed = 1; seed <= n; seed++) {
      const o = simulate(balancedScenario(seed, "base"), DEFAULT_RULES, "GRD", "GRD", seed);
      expect(ends).toContain(o.end);
      if (o.end === "strangersWin") strangers++; if (o.end === "partyWin") party++;
    }
    expect(strangers).toBeGreaterThan(n * 0.05);   // neither side wins everything
    expect(party).toBeGreaterThan(n * 0.05);
  });
});

describe("round-1 party deployment can be fixed independently of the party's style", () => {
  const deployedInRound1 = (style: "GRD" | "CAU", fixed?: "GRD" | "CAU") => {
    const s = scn([unit(HER), unit(DWF)], [unit(OGR)]);
    let cid = -1;
    simulate(s, noRetreat, style, "GRD", 5, {
      round1PartyStyle: fixed,
      round1Engage: (_A, af, D, defDep) => { cid = D[defDep[0]!]!.cid; return [[af[0]!, defDep[0]!]]; },
    });
    return cid;
  };
  it("a greedy party deploys the Hero, a cautious one the cheaper Dwarf", () => {
    expect(deployedInRound1("GRD")).toBe(HER);
    expect(deployedInRound1("CAU")).toBe(DWF);
  });
  it("round1PartyStyle overrides the style for the round-1 deployment only", () => {
    expect(deployedInRound1("CAU", "GRD")).toBe(HER);
    expect(deployedInRound1("GRD", "CAU")).toBe(DWF);
  });
});

describe("trace hook", () => {
  it("reports every resolved match with its strengths, die bonuses, dice and result", () => {
    const events: import("./types").TraceEvent[] = [];
    const s = scn([unit(MAN)], [unit(OGR)], { strangerSurprise: 1 });
    const o = simulate(s, noRetreat, "GRD", "GRD", 11, { trace: (e) => events.push(e) });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const e = events[0]!;
    expect(e).toMatchObject({ type: "match", round: 1, party: ["MAN"], strangers: ["OGR"], partyStrength: 3, strangerStrength: 5, partyBonus: 0, strangerBonus: 1 });
    expect(e.partyDie).toBeGreaterThanOrEqual(1); expect(e.partyDie).toBeLessThanOrEqual(6);
    const tp = e.partyStrength + e.partyDie + e.partyBonus, ts = e.strangerStrength + e.strangerDie + e.strangerBonus;
    expect(e.result).toBe(ts > tp ? "S" : tp > ts ? "P" : "T");
    expect(events.every((x) => x.type === "match")).toBe(true);
    expect(o.rounds).toBe(events[events.length - 1]!.round);
  });
  it("tracing does not change the outcome", () => {
    const s = scn([unit(HER, [T.SWORD]), unit(MAN), unit(MAN)], [unit(OGR), unit(TRL)]);
    for (let seed = 1; seed <= 50; seed++) {
      expect(simulate(s, DEFAULT_RULES, "GRD", "GRD", seed, { trace: () => {} })).toEqual(simulate(s, DEFAULT_RULES, "GRD", "GRD", seed));
    }
  });
});
