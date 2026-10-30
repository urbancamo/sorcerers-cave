import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { driveStrangers } from "./strangerDriver";
import { fightView, matchModifiers, matchStrength } from "./revisedRound";
import type { GameState, PartyMember } from "./state";

// Peter's 2026-10-21 impressions, R4 (and Mark's play-test): the revised fight screen shows chips for what is in each total. The chips must
// add up to the totals exactly, on both sides, whatever the line-up, or they would explain a number that is not the one on screen.
const SWORD = 3, STAFF = 9, RING = 10, EYE = 13, AXE = 17, SHIELD = 20;
const PARTY_IDS = [0, 1, 4, 5, 6, 7, 8, 11 /* never: a Sorcerer is not a recruit, but the arithmetic does not care */].slice(0, 7);
const STRANGER_IDS = [2, 3, 9, 11, 14, 15, 18];   // Ogre, Troll, Spectre, Sorcerer, Apprentice, Demon, Witch (a magic-only foe, a Sorcerer, casters)

/** A small deterministic generator, so a failing line-up can be named by its seed. */
const rng = (seed: number) => { let x = seed * 2654435761 % 4294967296; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; };

const lineup = (seed: number): GameState => {
  const r = rng(seed), pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
  const gear = () => [SWORD, STAFF, RING, AXE, SHIELD].filter(() => r() < 0.3);
  const member = (): PartyMember => ({
    creatureId: pick(PARTY_IDS), status: 0, dragonKills: r() < 0.2 ? 1 + Math.floor(r() * 2) : 0, treasure: [...gear(), ...(r() < 0.15 ? [EYE] : [])],
    ...(r() < 0.15 ? { fsBonus: 2 } : {}), ...(r() < 0.15 ? { potionActive: true } : {}),
  });
  const party = [member(), member(), member(), member()];
  const strangers = [pick(STRANGER_IDS), pick(STRANGER_IDS), pick(STRANGER_IDS), pick(STRANGER_IDS)];
  let s = driveStrangers(reduce(makeState({ phase: "encounter", strangers, treasures: r() < 0.1 ? [EYE] : [], party, seed, level: 1 + Math.floor(r() * 4), variants: { combatRevision: true, extensionKit: true } }), { type: "attack" }).state).state;
  s.fight!.gear = strangers.map(() => gear());
  s.fight!.surprise = pick([-1, 0, 1]);
  s.fight!.round = pick([1, 2]);
  if (r() < 0.2) s.lotusOnSorcerer = true;
  const rev = s.fight!.rev!;
  rev.attacker = pick(["party", "strangers"] as const);
  delete rev.bonus;
  rev.matches = [{ pf: [0, 1].slice(0, 1 + Math.floor(r() * 2)), pb: r() < 0.5 ? [2] : [], sf: [0, 1].slice(0, 1 + Math.floor(r() * 2)), sb: r() < 0.5 ? [2] : [] }];
  return s;
};

describe("matchModifiers", () => {
  it("itemises each side's total exactly, and the die bonuses, over many line-ups", () => {
    let checked = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const s = lineup(seed), m = s.fight!.rev!.matches[0]!;
      const total = matchStrength(s, m), bd = matchModifiers(s, m), view = fightView(s);
      const sum = (side: "party" | "strangers", roll: boolean) => bd.chips.filter((c) => c.side === side && c.roll === roll).reduce((a, c) => a + c.value, 0);
      const note = `seed ${seed}`;
      expect(bd.partyBase + sum("party", false), note).toBe(total.party);
      expect(bd.strangerBase + sum("strangers", false), note).toBe(total.strangers);
      expect(sum("party", true), note).toBe(view.partyDieBonus);
      expect(sum("strangers", true), note).toBe(view.strangerDieBonus);
      for (const c of bd.chips) seen.add(c.label.split(" · ")[0]!.replace(/ ×\d+/, ""));
      checked++;
    }
    expect(checked).toBe(400);
    // the sweep must actually reach every kind of chip, or agreeing totals prove little
    for (const kind of ["Magic Sword", "Magic Axe", "Magic Staff", "Magic Shield", "Magic", "Behind", "Dragon-slayer", "Elixir", "Strength Potion", "The Ring", "Surprise", "Eye of God — magic & artefacts nullified"]) {
      expect([...seen], kind).toContain(kind);
    }
  });

  it("names the sword, the staff and a caster behind the line (Mark's play-test)", () => {
    const man: PartyMember = { creatureId: 5, status: 0, dragonKills: 0, treasure: [SWORD] };
    const priest: PartyMember = { creatureId: 4, status: 0, dragonKills: 0, treasure: [STAFF] };
    const s = driveStrangers(reduce(makeState({ phase: "encounter", strangers: [2], treasures: [], party: [man, priest, { ...man, treasure: [] }], variants: { combatRevision: true } }), { type: "attack" }).state).state;
    const bd = matchModifiers(s, { pf: [0], pb: [1], sf: [0], sb: [] });
    expect(bd.chips.filter((c) => !c.roll).map((c) => `${c.side}|${c.label}|${c.value}`)).toEqual([
      "party|Magic Sword · Man|1", "party|Behind · Priest|2", "party|Magic Staff · Priest|1",
    ]);
    expect(bd.partyBase + 1 + 2 + 1).toBe(matchStrength(s, { pf: [0], pb: [1], sf: [0], sb: [] }).party);
  });

  it("says so when the Eye of God has switched magic and artefacts off", () => {
    const man: PartyMember = { creatureId: 5, status: 0, dragonKills: 0, treasure: [SWORD, EYE] };
    const s = driveStrangers(reduce(makeState({ phase: "encounter", strangers: [2], treasures: [], party: [man, { ...man, treasure: [] }], variants: { combatRevision: true } }), { type: "attack" }).state).state;
    const bd = matchModifiers(s, { pf: [0], pb: [], sf: [0], sb: [] });
    expect(bd.chips.some((c) => c.side === "both" && /Eye of God/.test(c.label))).toBe(true);
    expect(bd.chips.some((c) => /Magic Sword/.test(c.label))).toBe(false);
  });
});
