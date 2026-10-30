import { describe, it, expect } from "vitest";
import { armStrangers, balancedScenario } from "./scenario";
import { compareLoadouts, strategyLoadout } from "./loadoutBench";
import { smartStrategy, standardStrategy, type StrangerStrategy } from "@sorcerers-cave/engine";

describe("scenarios with a loadout strategy", () => {
  it("hand the floor's artefacts out through the strategy, and only legal ones", () => {
    const seen: number[] = [];
    const spy: StrangerStrategy = { ...standardStrategy, id: "spy", assignArtefacts: (c) => { seen.push(c.view.floor.length, c.view.party.length); return standardStrategy.assignArtefacts(c); } };
    let armed = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = balancedScenario(seed, "kit", { strangerOdds: 0.9, loadout: strategyLoadout(spy) });
      armed += s.strangers.filter((u) => u.gear.length > 0).length;
      for (const u of s.strangers) expect(u.gear.length).toBeLessThanOrEqual(5);
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(armed).toBeGreaterThan(0);
    expect(seen.filter((_, i) => i % 2 === 1).every((n) => n > 0)).toBe(true);   // the strategy always sees the party
  });
  it("is deterministic for a seed", () => {
    const o = { strangerOdds: 0.9, loadout: strategyLoadout(smartStrategy) };
    expect(balancedScenario(5, "kit", o)).toEqual(balancedScenario(5, "kit", o));
  });
});

describe("compareLoadouts (paired: same fights, different loadout)", () => {
  it("a strategy against itself is a dead heat", () => {
    const r = compareLoadouts({ a: standardStrategy, b: standardStrategy, scenarios: 80, deck: "kit", strangerOdds: 0.9 });
    expect(r.differed).toBe(0);
    expect(r.diffR3).toBe(0);
  });
  it("reports how often the loadouts differed and a confidence interval, and is reproducible", () => {
    const o = { a: standardStrategy, b: smartStrategy, scenarios: 120, deck: "kit" as const, strangerOdds: 0.9 };
    const r = compareLoadouts(o);
    expect(r.n).toBe(120);
    expect(r.differed).toBeGreaterThan(0);
    expect(r.diffCI).toBeGreaterThan(0);
    expect(compareLoadouts(o)).toEqual(r);
  });
});

describe("deferred loadouts (the pairing)", () => {
  it("one raw fight can be armed two ways without disturbing the party, the dice or the original", () => {
    const raw = balancedScenario(9, "kit", { strangerOdds: 1, deferLoadout: true });
    const before = JSON.stringify(raw);
    expect(raw.strangers.every((u) => u.gear.length === 0)).toBe(true);
    expect(raw.floor?.length ?? 0).toBeGreaterThan(0);
    const a = armStrangers(raw, strategyLoadout(standardStrategy)), b = armStrangers(raw, strategyLoadout(smartStrategy));
    expect(JSON.stringify(raw)).toBe(before);
    expect(a.party).toEqual(b.party);
    expect(a.strangers.length).toBe(b.strangers.length);
    expect(a.floor).toBeUndefined();
  });
});
