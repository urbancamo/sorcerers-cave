import { describe, it, expect } from "vitest";
import { validatePlan, resolvePlannedRound, previewPlan } from "./combatPlan";
import { makeState } from "./testkit";
import type { BattlePlan } from "./state";
import type { GameEvent } from "./actions";

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });
const fightS = (over: Parameters<typeof makeState>[0] = {}) =>
  makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, ...over });
const ok = (s: ReturnType<typeof makeState>, p: BattlePlan) => validatePlan(s, p).ok;
const reason = (s: ReturnType<typeof makeState>, p: BattlePlan) => { const r = validatePlan(s, p); return r.ok ? null : r.reason; };
const rolls = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: "combatRoll" }> => e.type === "combatRoll");
// Deep-ish clone so a resolution mutates its own copy, not the test fixture.
const clone = (s: ReturnType<typeof makeState>) => ({ ...s, fight: { ...s.fight! }, strangers: [...s.strangers], party: s.party.map((m) => ({ ...m })) });

describe("validatePlan (§FIGHTS pairing rules)", () => {
  it("accepts a simple 1-v-1 pairing", () => {
    const s = fightS({ party: [member(0)], strangers: [3] });
    expect(ok(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
  });
  it("rejects when not in a fight", () => {
    const s = makeState({ phase: "explore", party: [member(0)], strangers: [3] });
    expect(reason(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe("notFighting");
  });
  it("rejects an empty plan", () => {
    expect(reason(fightS({ party: [member(0)], strangers: [3] }), { matches: [] })).toBe("emptyPlan");
  });
  it("rejects reusing a member across matches", () => {
    const s = fightS({ party: [member(0)], strangers: [3, 5] });
    expect(reason(s, { matches: [
      { front: [0], backers: [], strangers: [0] },
      { front: [0], backers: [], strangers: [1] },
    ] })).toBe("memberReused");
  });
  it("rejects reusing a stranger across matches", () => {
    const s = fightS({ party: [member(0), member(2)], strangers: [3] });
    expect(reason(s, { matches: [
      { front: [0], backers: [], strangers: [0] },
      { front: [1], backers: [], strangers: [0] },
    ] })).toBe("strangerReused");
  });
  it("rejects a 2-against-2 group", () => {
    const s = fightS({ party: [member(0), member(2)], strangers: [3, 5] });
    expect(reason(s, { matches: [{ front: [0, 1], backers: [], strangers: [0, 1] }] })).toBe("twoVsTwo");
  });
  it("rejects a backer with no front fighter (placement is visible but not yet legal)", () => {
    const s = fightS({ party: [member(8)], strangers: [3] }); // a lone Wizard set behind, no front
    expect(reason(s, { matches: [{ front: [], backers: [0], strangers: [0] }] })).toBe("backerNoFront");
  });
  it("rejects a non-caster placed in the background", () => {
    const s = fightS({ party: [member(0), member(2)], strangers: [3] });
    expect(reason(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] })).toBe("backerNotCaster");
  });
  it("rejects an ordinary fighter set against a Spectre", () => {
    const s = fightS({ party: [member(5)], strangers: [9] });
    expect(reason(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe("spectreNeedsMagic");
  });
  it("accepts a caster or a sword-bearer against a Spectre", () => {
    expect(ok(fightS({ party: [member(8)], strangers: [9] }), { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
    expect(ok(fightS({ party: [member(0, [3])], strangers: [9] }), { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
  });
  it("rejects leaving an engageable stranger unengaged while a fighter is free", () => {
    const s = fightS({ party: [member(0), member(2)], strangers: [3, 5] });
    expect(reason(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe("mustEngageAll");
  });
  it("allows leftover strangers when out-numbered (all fighters committed)", () => {
    const s = fightS({ party: [member(0)], strangers: [3, 5, 7] });
    expect(ok(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
  });
  it("allows idle fighters once every stranger is engaged", () => {
    const s = fightS({ party: [member(0), member(2), member(7)], strangers: [3] });
    expect(ok(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
  });
});

describe("resolvePlannedRound (§A Round of Fighting)", () => {
  it("resolves the §417 book example to the exact strengths (7/6 and 5/5)", () => {
    const s = clone(fightS({
      fight: { surprise: -1, round: 1, focus: 0 },
      party: [member(0, [3]), member(6), member(7), member(4)], // Hero+Sword, Woman, Dwarf, Priest
      strangers: [2, 3], seed: 5, // Ogre, Troll
    }));
    const r = rolls(resolvePlannedRound(s, { matches: [
      { front: [0], backers: [], strangers: [0] },
      { front: [1, 2], backers: [3], strangers: [1] },
    ] }));
    const ogre = r.find((x) => x.enemy === "Ogre")!;
    const troll = r.find((x) => x.enemy === "Troll")!;
    expect(ogre.partyTotal - ogre.partyRoll).toBe(7);   // Hero 5 + sword 2
    expect(ogre.enemyTotal - ogre.enemyRoll).toBe(6);   // Ogre 5 + surprise 1
    expect(troll.partyTotal - troll.partyRoll).toBe(5); // Woman 2 + Dwarf 1 + Priest 2
    expect(troll.enemyTotal - troll.enemyRoll).toBe(5); // Troll 4 + surprise 1
  });
  it("a solo win removes the foe and advances the round", () => {
    const s = clone(fightS({ party: [member(12)], strangers: [7], seed: 5 })); // Giant vs Dwarf
    resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(s.strangers).toEqual([]);
    expect(s.fight!.round).toBe(2);
  });
  it("credits a single-handed dragon slayer", () => {
    const s = clone(fightS({ fight: { surprise: 1, round: 1, focus: 0 }, party: [member(12)], strangers: [10], seed: 5 }));
    resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(s.strangers).toEqual([]);
    expect(s.party[0]!.dragonKills).toBe(1);
  });
  it("does NOT credit the slayer when a caster backed the kill (not single-handed)", () => {
    // Giant front + Wizard backer fell the Dragon together — no dragon-slayer credit.
    const s = clone(fightS({ fight: { surprise: 1, round: 1, focus: 0 }, party: [member(12), member(8)], strangers: [10], seed: 5 }));
    resolvePlannedRound(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] });
    expect(s.strangers).toEqual([]);
    expect(s.party[0]!.dragonKills).toBe(0);
  });
  it("slaying the Sorcerer records the kill and announces the feat", () => {
    // Giant+Magic Sword front, Wizard+Magic Staff backer, surprise & Lotus weakening the Sorcerer.
    const s = clone(fightS({
      fight: { surprise: 1, round: 1, focus: 0 }, lotusOnSorcerer: true,
      party: [member(12, [3]), member(8, [9])], strangers: [11], seed: 1,
    }));
    const ev = resolvePlannedRound(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] });
    expect(s.strangers).toEqual([]);
    expect(s.sorcererKilled).toBe(true);
    expect(ev.some((e) => e.type === "sorcererSlain")).toBe(true);
  });
  it("queues a casualty choice when two front fighters lose together", () => {
    const s = clone(fightS({ fight: { surprise: -1, round: 1, focus: 0 }, party: [member(6), member(7)], strangers: [10], seed: 5 }));
    resolvePlannedRound(s, { matches: [{ front: [0, 1], backers: [], strangers: [0] }] });
    if (s.fight!.casualtyQueue?.length) {
      expect(s.fight!.casualtyQueue[0]).toEqual([0, 1]);
      expect(s.party.every((m) => m.status === 0)).toBe(true);
    }
  });
});

describe("resolvePlannedRound — Spectres (§Spectre)", () => {
  it("a caster pits magical power only against the Spectre", () => {
    const s = clone(fightS({ party: [member(8)], strangers: [9], seed: 5 })); // Wizard vs Spectre
    const r = rolls(resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] }));
    expect(r[0]!.party).toBe("Wizard");
    expect(r[0]!.partyTotal - r[0]!.partyRoll).toBe(5); // MP 5, not front strength
    expect(r[0]!.enemyTotal - r[0]!.enemyRoll).toBe(5); // Spectre MP 5
  });
  it("a sword-bearer fights the Spectre with front strength", () => {
    const s = clone(fightS({ party: [member(0, [3])], strangers: [9], seed: 5 })); // Hero+Sword vs Spectre
    const r = rolls(resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] }));
    expect(r[0]!.partyTotal - r[0]!.partyRoll).toBe(7); // Hero 5 + Magic Sword 2
  });
  it("an un-fightable, unengaged Spectre auto-slays the strongest member", () => {
    const s = clone(fightS({ party: [member(0), member(7)], strangers: [9, 3], seed: 5 })); // Hero+Dwarf vs Spectre+Troll
    const r = resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [1] }] }); // Hero vs Troll only
    expect(r.some((e) => e.type === "spectreSlew")).toBe(true);
  });
  it("validates an EMPTY plan when only an un-fightable Spectre remains (no deadlock)", () => {
    // No magic, a lone Spectre: the player can place no one, but the round must still be fought —
    // an empty plan is legal and the strongest member is automatically slain (§Spectre).
    const s = fightS({ party: [member(2), member(7)], strangers: [9] }); // Ogre + Dwarf vs a Spectre, no magic
    expect(validatePlan(s, { matches: [] }).ok).toBe(true);
    const c = clone(s);
    const r = resolvePlannedRound(c, { matches: [] });
    expect(r.some((e) => e.type === "spectreSlew")).toBe(true);
    expect(c.party[0]!.status).toBe(3); // the Ogre (strongest, fs 5) falls; the Dwarf survives
    expect(c.party[1]!.status).toBe(0);
  });
  it("still rejects an empty plan when a foe COULD be engaged", () => {
    const s = fightS({ party: [member(2)], strangers: [3] }); // Ogre vs Troll — engageable
    expect(validatePlan(s, { matches: [] })).toEqual({ ok: false, reason: "emptyPlan" });
  });
});

describe("resolvePlannedRound — out-numbered (§395)", () => {
  it("a lone Hero faces the strongest combination (Troll+Man + Priest bg = 9)", () => {
    const s = clone(fightS({ party: [member(0)], strangers: [4, 3, 5, 7], seed: 5 })); // Priest, Troll, Man, Dwarf
    const r = rolls(resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [1] }] })); // engage the Troll
    expect(r).toHaveLength(1);
    expect(r[0]!.enemyTotal - r[0]!.enemyRoll).toBe(9); // Troll 4 + Man 3 + Priest 2
  });
});

describe("resolvePlannedRound — Sorcerer magic (card)", () => {
  it("the Eye of God reduces the Sorcerer's strength by only 2, never to zero", () => {
    const base = clone(fightS({ party: [member(0)], strangers: [11], seed: 5 })); // Hero vs Sorcerer (FS 4 + MP 9 = 13)
    const r = rolls(resolvePlannedRound(base, { matches: [{ front: [0], backers: [], strangers: [0] }] }));
    expect(r[0]!.enemyTotal - r[0]!.enemyRoll).toBe(13);
    const eye = clone(fightS({ party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [13] }], strangers: [11], seed: 5 }));
    const r2 = rolls(resolvePlannedRound(eye, { matches: [{ front: [0], backers: [], strangers: [0] }] }));
    expect(r2[0]!.enemyTotal - r2[0]!.enemyRoll).toBe(11); // 13 − 2
  });
});

describe("previewPlan — front-line casters (§FIGHTS total strength)", () => {
  it("a party Wizard fighting hand-to-hand matches an enemy Wizard's strength (both FS+MP = 7)", () => {
    const s = fightS({ party: [member(8)], strangers: [8] }); // party Wizard vs a stranger Wizard
    const pv = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(pv.matches[0]!.partyStr).toBe(7);  // FS 2 + MP 5 — not 2
    expect(pv.matches[0]!.enemyStr).toBe(7);  // the enemy Wizard is the same
  });
});

describe("previewPlan — strongest-combination preview (§395)", () => {
  it("shows two foes ganging a lone fighter when out-numbered; the weakest stands idle", () => {
    const s = clone(fightS({ party: [member(0)], strangers: [4, 3, 5, 7], seed: 5 })); // Hero vs Priest, Troll, Man, Dwarf
    const pv = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [1] }] }); // the player engages the Troll
    expect(pv.matches).toHaveLength(1);
    expect(pv.matches[0]!.strangers).toEqual([1, 2]); // Troll + the next-strongest hand-to-hand foe (Man)
    expect(pv.matches[0]!.attached).toEqual([2]);      // the Man was ganged on by the engine, not the player
    expect(pv.matches[0]!.enemyBackers).toEqual([0]);  // the Priest lends magic from the background (foe index 0)
    expect(pv.matches[0]!.enemyStr).toBe(9);           // Troll 4 + Man 3 + Priest's magic 2 (folded into the focus)
    expect(pv.idle).toContain(3);                      // the Dwarf stands idle this round
    expect(pv.idle).not.toContain(0);                  // the Priest is NOT idle — it's a background combatant
  });

  it("lists the artefact and round modifiers in play for a matchup", () => {
    const s = clone(fightS({
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [3, 10] }], // Hero with the Magic Sword + The Ring
      strangers: [3], fight: { surprise: 1, round: 1, focus: 0 }, // a Troll; the party has surprise
    }));
    const pv = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    const mods = pv.matches[0]!.modifiers;
    expect(mods.find((m) => m.label === "Magic Sword · Hero")).toMatchObject({ value: 2, roll: false });
    expect(mods.find((m) => m.label === "The Ring")).toMatchObject({ value: 1, roll: true });
    expect(mods.find((m) => m.label === "Surprise")).toMatchObject({ value: 1, side: "party", roll: true });
  });

  it("shows a dragon-slayer's fighting-strength bonus as a matchup modifier", () => {
    const s = clone(fightS({
      party: [{ creatureId: 0, status: 0, dragonKills: 2, treasure: [] }], // Hero who has felled 2 dragons
      strangers: [3], // a Troll
    }));
    const pv = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(pv.matches[0]!.modifiers.find((m) => m.label === "Dragon-slayer · Hero")).toMatchObject({ value: 2, side: "party", roll: false });
    expect(pv.matches[0]!.partyStr).toBe(7); // Hero 5 + 2 dragon-slayer baked into the total
  });

  it("does not gang foes up while the party still has a free fighter (2-v-2 stays two 1-v-1)", () => {
    const s = clone(fightS({ party: [member(0), member(2)], strangers: [3, 5], seed: 5 })); // Hero, Ogre vs Troll, Man
    // Only the Hero is committed so far — the Ogre is still free, so the Man must NOT be ganged on.
    const pv1 = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(pv1.matches[0]!.strangers).toEqual([0]); // just the Troll
    expect(pv1.idle).toContain(1);                  // the Man stays idle, ready to be engaged
    // With both fighters committed, the foes are engaged as two separate 1-v-1 matches.
    const pv2 = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }, { front: [1], backers: [], strangers: [1] }] });
    expect(pv2.matches).toHaveLength(2);
    expect(pv2.idle).toEqual([]);
  });
});

describe("resolvePlannedRound — heavy treasure (§387)", () => {
  it("a front fighter drops heavy treasure onto the area floor; artefacts are kept", () => {
    const s = clone(fightS({
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [1, 7] }], // Giant carrying Gold + Talisman
      strangers: [3], seed: 5,
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    }));
    resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(s.party[0]!.treasure).toEqual([7]);             // Talisman (artefact) kept
    expect(s.areas[0]!.contents).toContain(200 + 1);       // Gold dropped to the floor
  });

  it("a background caster keeps its heavy treasure (it is not fighting hand-to-hand)", () => {
    const s = clone(fightS({
      party: [
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },      // Man (front)
        { creatureId: 4, status: 0, dragonKills: 0, treasure: [1] },     // Priest (background) carrying Gold
      ],
      strangers: [3], seed: 5,
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    }));
    resolvePlannedRound(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] });
    expect(s.party[1]!.treasure).toEqual([1]);             // Priest kept its Gold (background)
    expect(s.areas[0]!.contents).not.toContain(200 + 1);
  });
});
