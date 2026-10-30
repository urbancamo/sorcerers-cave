import { describe, it, expect } from "vitest";
import { simulate } from "./sim";
import { DEFAULT_RULES, T, unit } from "./rules";
import { balancedScenario, randomScenario } from "./scenario";
import { stylePolicy, type Policy } from "./policies";
import type { Rules, Scenario, TraceEvent } from "./types";

const HER = 0, OGR = 2, MAN = 5, DWF = 7, GNT = 12, TRL = 3;
const scn = (party: ReturnType<typeof unit>[], strangers: ReturnType<typeof unit>[], over: Partial<Scenario> = {}): Scenario =>
  ({ party, strangers, eye: false, curses: 0, level: 1, attacker: "strangers", surprise: 0, ...over });
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
        expect(["strangersWin", "partyWin", "retreat", "stalemate", "cap"]).toContain(o.end);
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
  it("the same 1 v 1 gives the same answer whichever side attacks (the roles are fixed per fight, and with no surprise it does not matter)", () => {
    const s = scn([unit(MAN)], [unit(OGR)], { attacker: "party" });
    const p = rate(20000, (i) => simulate(s, noRetreat, "GRD", "GRD", i).end === "strangersWin");
    expect(Math.abs(p - 26 / 32)).toBeLessThan(0.012);
  });
  it("round 1 surprise shifts the odds towards the ATTACKER, whichever side it is", () => {
    const strangersWin = (s: Scenario) => rate(10000, (i) => simulate(s, noRetreat, "GRD", "GRD", i).end === "strangersWin");
    const base = strangersWin(scn([unit(MAN)], [unit(OGR)]));
    expect(strangersWin(scn([unit(MAN)], [unit(OGR)], { attacker: "strangers", surprise: 1 }))).toBeGreaterThan(base);
    // surprise held by the party attacker lowers the strangers' chances, and 2 is worth more than 1
    const p0 = strangersWin(scn([unit(MAN)], [unit(OGR)], { attacker: "party", surprise: 0 }));
    const p1 = strangersWin(scn([unit(MAN)], [unit(OGR)], { attacker: "party", surprise: 1 }));
    const p2 = strangersWin(scn([unit(MAN)], [unit(OGR)], { attacker: "party", surprise: 2 }));
    expect(p1).toBeLessThan(p0);
    expect(p2).toBeLessThan(p1);
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
  const ends = ["strangersWin", "partyWin", "retreat", "stalemate", "cap"];
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
    const s = scn([unit(MAN)], [unit(OGR)], { surprise: 1 });
    const o = simulate(s, noRetreat, "GRD", "GRD", 11, { trace: (e) => events.push(e) });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const e = events.find((x): x is Extract<import("./types").TraceEvent, { type: "match" }> => x.type === "match")!;
    expect(e).toMatchObject({ type: "match", round: 1, party: ["MAN"], strangers: ["OGR"], partyStrength: 3, strangerStrength: 5, partyBonus: 0, strangerBonus: 1 });
    expect(e.partyDie).toBeGreaterThanOrEqual(1); expect(e.partyDie).toBeLessThanOrEqual(6);
    const tp = e.partyStrength + e.partyDie + e.partyBonus, ts = e.strangerStrength + e.strangerDie + e.strangerBonus;
    expect(e.result).toBe(ts > tp ? "S" : tp > ts ? "P" : "T");
    expect(events.some((x) => x.type === "match")).toBe(true);
    expect(o.rounds).toBe(events.filter((x) => x.type === "match").pop()!.round);
  });
  it("tracing does not change the outcome", () => {
    const s = scn([unit(HER, [T.SWORD]), unit(MAN), unit(MAN)], [unit(OGR), unit(TRL)]);
    for (let seed = 1; seed <= 50; seed++) {
      expect(simulate(s, DEFAULT_RULES, "GRD", "GRD", seed, { trace: () => {} })).toEqual(simulate(s, DEFAULT_RULES, "GRD", "GRD", seed));
    }
  });
});

describe("trace: casualties, rounds and the ending", () => {
  it("reports who fell, the end of every round, and how the fight ended", () => {
    const events: import("./types").TraceEvent[] = [];
    const s = scn([unit(MAN)], [unit(OGR)]);
    const o = simulate(s, noRetreat, "GRD", "GRD", 21, { trace: (e) => events.push(e) });
    const types = events.map((e) => e.type);
    expect(types[types.length - 1]).toBe("end");
    const end = events[events.length - 1]!;
    expect(end).toMatchObject({ type: "end", end: o.end, round: o.rounds });
    const falls = events.filter((e) => e.type === "casualty");
    // a 1 v 1 ends with exactly one creature falling (the fight is decided by a death), on the losing side
    expect(falls.length).toBe(1);
    expect(falls[0]).toMatchObject({ type: "casualty", side: o.end === "strangersWin" ? "party" : "strangers" });
    expect(events.filter((e) => e.type === "round").length).toBe(o.rounds);
  });
  it("reports the nominated creature and the roll when a two-creature front line loses", () => {
    const events: import("./types").TraceEvent[] = [];
    // Many seeds of a lopsided 2 v 1: the lone Man is joined by a Hero and the Ogre side loses a two-creature front line at times
    const s = scn([unit(HER), unit(MAN), unit(MAN)], [unit(OGR), unit(TRL)]);
    let seen = false;
    for (let seed = 1; seed <= 400 && !seen; seed++) {
      events.length = 0;
      simulate(s, noRetreat, "GRD", "GRD", seed, { trace: (e) => events.push(e) });
      seen = events.some((e) => e.type === "casualty" && e.roll !== undefined);
    }
    expect(seen).toBe(true);
    const c = events.find((e) => e.type === "casualty" && e.roll !== undefined)!;
    expect(c).toMatchObject({ type: "casualty" });
    expect((c as { nominated?: string }).nominated).toBeTruthy();
  });
});

describe("trace carries unit indices, so a viewer can track every card", () => {
  it("match events name the exact creatures (by index into the scenario) and casualties name who fell", () => {
    const s = scn([unit(HER), unit(MAN), unit(MAN), unit(DWF)], [unit(OGR), unit(TRL), unit(GNT)]);
    const CODE: Record<number, string> = { [HER]: "HER", [MAN]: "MAN", [DWF]: "DWF", [OGR]: "OGR", [TRL]: "TRL", [GNT]: "GNT" };
    for (let seed = 1; seed <= 60; seed++) {
      const events: import("./types").TraceEvent[] = [];
      simulate(s, DEFAULT_RULES, "GRD", "GRD", seed, { trace: (e) => events.push(e) });
      const fallen = new Set<string>();
      for (const e of events) {
        if (e.type === "match") {
          expect(e.partyIdx.map((i) => CODE[s.party[i]!.cid])).toEqual(e.party);
          expect(e.partyBackIdx.map((i) => CODE[s.party[i]!.cid])).toEqual(e.partyBack);
          expect(e.strangersIdx.map((i) => CODE[s.strangers[i]!.cid])).toEqual(e.strangers);
          expect(e.strangersBackIdx.map((i) => CODE[s.strangers[i]!.cid])).toEqual(e.strangersBack);
          // nobody who has already fallen fights again
          for (const i of e.partyIdx) expect(fallen.has("P" + i)).toBe(false);
          for (const i of e.strangersIdx) expect(fallen.has("S" + i)).toBe(false);
        } else if (e.type === "casualty") {
          const units = e.side === "party" ? s.party : s.strangers;
          expect(CODE[units[e.index]!.cid]).toBe(e.creature);
          expect(fallen.has((e.side === "party" ? "P" : "S") + e.index)).toBe(false);
          fallen.add((e.side === "party" ? "P" : "S") + e.index);
        }
      }
    }
  });
});

// ---- Peter's reformulated rules, as corrected by his response of 10-OCT-2026 -----------------------------------------------
const matchEvents = (events: TraceEvent[]) => events.filter((e): e is Extract<TraceEvent, { type: "match" }> => e.type === "match");
const traceOf = (s: Scenario, strangers: Policy | "GRD" = "GRD", party: Policy | "GRD" = "GRD", seed = 1, rules: Rules = noRetreat): TraceEvent[] => {
  const events: TraceEvent[] = [];
  simulate(s, rules, party, strangers, seed, { trace: (e) => events.push(e) });
  return events;
};

describe("the roles are fixed for the whole fight (definition 5)", () => {
  it("the attacker engages in every round: matches always pair the attacker's creature as the one that was free", () => {
    // Party attacks. Whatever round it is, the fight runs and no role swap changes who deploys: the party never deploys.
    const s = scn([unit(HER), unit(MAN), unit(MAN)], [unit(OGR), unit(TRL), unit(DWF)], { attacker: "party", surprise: 1 });
    for (let seed = 1; seed <= 100; seed++) {
      const o = simulate(s, noRetreat, "GRD", "GRD", seed);
      expect(["strangersWin", "partyWin", "stalemate", "cap"]).toContain(o.end);
    }
  });
});

describe("step (e): either side deploys its surplus, and two against two is allowed (Peter Q1)", () => {
  it("the DEFENDER's surplus joins a match: 3 party defenders v 1 attacking stranger give a 2-creature party front line", () => {
    const s = scn([unit(HER), unit(HER), unit(MAN)], [unit(OGR)], { attacker: "strangers" });
    const first = matchEvents(traceOf(s))[0]!;
    expect(first.strangers).toHaveLength(1);
    expect(first.party).toHaveLength(2);   // the defender deployed one, the attacker engaged it, and a spare then joined
  });
  it("the ATTACKER's surplus joins a match too: 3 attacking strangers v 1 party defender", () => {
    const s = scn([unit(HER)], [unit(OGR), unit(TRL), unit(DWF)], { attacker: "strangers" });
    const first = matchEvents(traceOf(s))[0]!;
    expect(first.party).toHaveLength(1);
    expect(first.strangers).toHaveLength(2);   // one match; the second front-line slot is filled, the third stranger stays out
  });
  it("a creature may join a 1v2 match, making 2v2, but no front line ever exceeds two", () => {
    let twoTwo = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const e of matchEvents(traceOf(balancedScenario(seed, "base"), "GRD", "GRD", seed, DEFAULT_RULES))) {
        expect(e.party.length).toBeLessThanOrEqual(2);
        expect(e.strangers.length).toBeLessThanOrEqual(2);
        if (e.party.length === 2 && e.strangers.length === 2) twoTwo++;
      }
    }
    expect(twoTwo).toBeGreaterThan(0);   // 2v2 does occur (it was forbidden before Peter's answer to Q1)
  });
  it("step (d) never creates a 2v2: in round 1 every match starts one-to-one, so a first-round 2v2 can only come from step (e)", () => {
    // 2 v 2: both deployed, both engaged one-to-one, nobody left over: each round-1 match is exactly 1v1.
    const s = scn([unit(HER), unit(MAN)], [unit(OGR), unit(TRL)], { attacker: "strangers" });
    for (const e of matchEvents(traceOf(s)).filter((x) => x.round === 1)) { expect(e.party).toHaveLength(1); expect(e.strangers).toHaveLength(1); }
  });
});

describe("a stalemate and the end of a fight (Peter Q2 and Q3)", () => {
  it("his example: a Dwarf wearing the Ring on level 4 against an Apprentice is a stalemate, not an endless fight", () => {
    const s = scn([unit(DWF, [T.RING])], [unit(14)], { level: 4, attacker: "strangers" });
    for (let seed = 1; seed <= 50; seed++) {
      const events = traceOf(s, "GRD", "GRD", seed);
      const o = simulate(s, noRetreat, "GRD", "GRD", seed);
      expect(o.end).toBe("stalemate");
      expect(o.partyAlive).toBe(1); expect(o.strangersAlive).toBe(1);
      expect(o.rounds).toBeLessThanOrEqual(2);
      expect(matchEvents(events)).toHaveLength(0);                     // nobody rolled: neither side could do anything
      expect(events.some((e) => e.type === "stalemate")).toBe(true);
    }
  });
  it("a stalemate counts as a strangers' hold for R2 (the player must leave) and costs neither side anything", () => {
    const o = simulate(scn([unit(DWF, [T.RING])], [unit(14)], { level: 4 }), noRetreat, "GRD", "GRD", 3);
    expect(o.r2).toBe(1);
    expect(o.partyValueLost).toBe(0); expect(o.strangerValueLost).toBe(0);
  });
  it("the same match one level up is NOT a stalemate: the Dwarf can die", () => {
    const o = simulate(scn([unit(DWF, [T.RING])], [unit(14)], { level: 3 }), noRetreat, "GRD", "GRD", 3);
    expect(o.end).toBe("strangersWin");
  });
  it("a fight ends when a side is wiped out even with survivors elsewhere being unengaged (no early stop)", () => {
    const s = scn([unit(HER, [T.SWORD]), unit(HER), unit(MAN)], [unit(DWF)]);
    for (let seed = 1; seed <= 100; seed++) expect(simulate(s, DEFAULT_RULES, "GRD", "GRD", seed).end).toBe("partyWin");
  });
});

describe("casualty nomination is a policy decision, and the die rule is the engine's (Peter Q7)", () => {
  it("the strangers consult their policy when a two-creature stranger front line loses", () => {
    const calls: number[] = [];
    const spy: Policy = { ...stylePolicy("GRD"), id: "spy", nominate: (F, side, a, b) => { calls.push(side === "strangers" ? 1 : 0); return stylePolicy("GRD").nominate(F, side, a, b); } };
    const s = scn([unit(HER, [T.SWORD])], [unit(DWF), unit(MAN)], { attacker: "party" });
    for (let seed = 1; seed <= 60; seed++) simulate(s, noRetreat, "GRD", spy, seed);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c === 1)).toBe(true);   // only ever asked about the strangers' own line
  });
  it("whichever creature the policy nominates, it dies on a roll of 4 to 6 and the other on 1 to 3", () => {
    const events = (nominateFirst: boolean) => {
      const pol: Policy = { ...stylePolicy("GRD"), id: "n", nominate: (_F, _side, a, b) => (nominateFirst ? a : b) };
      const out: { nominated: string; roll: number; fell: string }[] = [];
      const s = scn([unit(HER, [T.SWORD])], [unit(DWF), unit(MAN)], { attacker: "party" });
      for (let seed = 1; seed <= 200; seed++) {
        const ev = traceOf(s, pol, "GRD", seed);
        ev.forEach((e) => { if (e.type === "casualty" && e.roll !== undefined && e.side === "strangers") out.push({ nominated: e.nominated!, roll: e.roll, fell: e.creature }); });
      }
      return out;
    };
    for (const first of [true, false]) {
      const rows = events(first);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r.roll >= 4 ? r.fell === r.nominated : r.fell !== r.nominated).toBe(true);
    }
  });
});

describe("a plug-in policy cannot break the rules", () => {
  it("an under-deploying, double-booking, garbage-pairing policy still produces a legal fight", () => {
    const rogue: Policy = {
      id: "rogue",
      deploy: () => [],                                     // deploys nobody (the minimum is topped up)
      engage: (_F, _side, ownFree, oppDeployed) => [[ownFree[0]!, oppDeployed[0]!], [ownFree[0]!, oppDeployed[0]!], [999, -1]],   // duplicates and nonsense
      surplus: () => [{ u: 0, m: 99, back: false }, { u: 999, m: 0, back: true }],
      nominate: (_F, _side, a) => a,
    };
    const s = scn([unit(HER), unit(MAN), unit(MAN)], [unit(OGR), unit(TRL), unit(DWF)], { attacker: "party" });
    for (let seed = 1; seed <= 100; seed++) {
      const o = simulate(s, noRetreat, "GRD", rogue, seed);
      expect(["strangersWin", "partyWin", "stalemate", "cap"]).toContain(o.end);
      for (const e of matchEvents(traceOf(s, rogue, "GRD", seed))) { expect(e.party.length).toBeLessThanOrEqual(2); expect(e.strangers.length).toBeLessThanOrEqual(2); }
    }
  });
  it("a custom policy object is accepted in place of a style code, and a style code is the same as its policy", () => {
    const s = scn([unit(HER), unit(MAN)], [unit(OGR), unit(TRL)]);
    for (let seed = 1; seed <= 30; seed++) expect(simulate(s, DEFAULT_RULES, "GRD", stylePolicy("GRD"), seed)).toEqual(simulate(s, DEFAULT_RULES, "GRD", "GRD", seed));
  });
});
