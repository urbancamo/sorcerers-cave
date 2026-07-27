import { describe, it, expect } from "vitest";
import {
  SPECIAL_VIPER_PIT, SPECIAL_DEEP_POOL, SPECIAL_WHIRLPOOL,
  HAZARD_MEDUSA, HAZARD_MUTINY, HAZARD_TRAP, HAZARD_EARTHQUAKE, HAZARD_DESERTION,
  DIR_DOWN, DIR_UP,
  type GameEvent,
} from "@sorcerers-cave/engine";
import { eventNotices, noticeTone } from "./eventNotices";

describe("eventNotices exhaustiveness (base hardening)", () => {
  it("surfaces a generic notice for a blocked action (previously silent everywhere)", () => {
    const out = eventNotices([{ type: "blocked" }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.text.length).toBeGreaterThan(0);
  });

  it("surfaces the engine's rejection reason for an illegal battle plan (previously silent)", () => {
    const out = eventNotices([{ type: "planRejected", reason: "unmatched pairing" }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toMatch(/unmatched pairing/i);
    expect(out[0]!.tone).toBe("bad");
  });

  it("announces arrival at a special area (previously silent)", () => {
    expect(eventNotices([{ type: "enteredSpecial", special: SPECIAL_VIPER_PIT }])[0]!.text).toMatch(/viper pit/i);
    expect(eventNotices([{ type: "enteredSpecial", special: SPECIAL_DEEP_POOL }])[0]!.text).toMatch(/deep pool/i);
  });

  it("reports a downed member's items spilling onto the floor (previously silent)", () => {
    const out = eventNotices([{ type: "itemsSpilled", creatureId: 0, items: [1, 2] }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.text.length).toBeGreaterThan(0);
  });

  it("stays silent for the remaining event types, which all have dedicated dice-overlay or banner UI", () => {
    const handled: GameEvent[] = [
      { type: "viperPit", rolls: [{ creatureId: 0, roll: 3, died: false }] },
      { type: "medusaGaze", rolls: [{ creatureId: 0, roll: 3, petrified: false }] },
      { type: "casualtyChosen", creatureId: 0, roll: 4, gotPreference: true },
      { type: "fightWon" },
      { type: "rubyTaken" },
      { type: "statueAroused" },
      { type: "strangerKilled", creatureId: 3 },
      { type: "pacified" },
      { type: "strangersJoined", count: 2 },
      { type: "fightStarted", surprise: 1 },
      { type: "trapAvoided" },
    ];
    expect(eventNotices(handled)).toHaveLength(0);
  });
});

describe("eventNotices", () => {
  it("produces no text notices for a Viper Pit crossing (its dice overlay shows the outcome)", () => {
    const events: GameEvent[] = [
      { type: "crossedSpecial", special: SPECIAL_VIPER_PIT },
      { type: "viperPit", rolls: [{ creatureId: 0, roll: 1, died: true }] },
      { type: "memberDied", creatureId: 0 }, // Hero — shown by the dice, not as a duplicate notice
    ];
    expect(eventNotices(events)).toEqual([]);
  });

  it("reports Deep Pool treasure being dropped and reclaimed", () => {
    expect(eventNotices([{ type: "treasureDropped", count: 2 }])[0]!.text).toMatch(/2 heavy treasures sink/i);
    expect(eventNotices([{ type: "treasureReclaimed", count: 1 }])[0]!).toMatchObject({ tone: "good" });
    expect(eventNotices([{ type: "crossedSpecial", special: SPECIAL_DEEP_POOL }])[0]!.text).toMatch(/deep pool/i);
  });

  it("describes hazards, but defers Mutiny and Trap to their own UI", () => {
    expect(eventNotices([{ type: "hazardFired", hazard: HAZARD_MEDUSA }])[0]!.text).toMatch(/medusa/i);
    expect(eventNotices([{ type: "hazardFired", hazard: HAZARD_EARTHQUAKE }])[0]!.text).toMatch(/earthquake/i);
    expect(eventNotices([{ type: "hazardFired", hazard: HAZARD_MUTINY }])).toHaveLength(0);
    expect(eventNotices([{ type: "hazardFired", hazard: HAZARD_TRAP }])).toHaveLength(0);
  });

  it("reports a mutiny with deserter and dropped-loot counts", () => {
    const n = eventNotices([{ type: "mutinied", deserters: [5, 6], treasures: [1] }]);
    expect(n[0]!.text).toMatch(/2 allys desert/i);
    expect(n[0]!.text).toMatch(/dropping 1 item/i);
    expect(n[0]!.tone).toBe("bad");
  });

  it("reports artifact / special-area effects", () => {
    expect(eventNotices([{ type: "secretDoorRevealed", dir: DIR_DOWN }])[0]!.text).toMatch(/below/i);
    expect(eventNotices([{ type: "secretDoorRevealed", dir: DIR_UP }])[0]!.text).toMatch(/above/i);
    expect(eventNotices([{ type: "dragonsLulled", count: 3 }])[0]!.text).toMatch(/3 dragons/i);
    expect(eventNotices([{ type: "annihilated", creatureId: 9 }])[0]!.text).toMatch(/eye of god/i);
    expect(eventNotices([{ type: "carpetUsed", dir: DIR_DOWN }])[0]!.text).toMatch(/magic carpet/i);
    expect(eventNotices([{ type: "unicornGuards", creatureId: 6 }])[0]!.tone).toBe("good");
  });

  it("reports Balm/Staff via their generic artifactUsed, but not carpet/flute (which have their own events)", () => {
    expect(eventNotices([{ type: "artifactUsed", artifact: 6 }])[0]!.text).toMatch(/healing balm/i);
    expect(eventNotices([{ type: "artifactUsed", artifact: 9 }])[0]!.text).toMatch(/magic staff/i);
    // Carpet emits artifactUsed + carpetUsed; only the carpetUsed line should show (no double).
    expect(eventNotices([{ type: "artifactUsed", artifact: 4 }, { type: "carpetUsed", dir: DIR_DOWN }])).toHaveLength(1);
  });

  it("warns when a retreat hits a dead end and the party is forced back to fight", () => {
    const out = eventNotices([{ type: "deadEnd", dir: 1, retreat: true }]); // this test covers the RETREAT flavor
    expect(out).toHaveLength(1);
    expect(out[0]!.tone).toBe("bad");
    expect(out[0]!.text).toMatch(/dead end/i);
    expect(out[0]!.text).toMatch(/north/i);
    expect(out[0]!.text).toMatch(/fight another round/i);
  });

  it("stays silent for events that already have dedicated UI", () => {
    const handled: GameEvent[] = [
      { type: "reaction", outcome: "hostile", roll: 1 },
      { type: "combatRoll", party: "Hero", enemy: "Troll", partyRoll: 6, enemyRoll: 1, partyTotal: 11, enemyTotal: 5, result: "partyWon" },
      { type: "chestOpened", result: 6 },
      { type: "drewChamber", strangers: [], treasures: [], hazards: [] },
      { type: "trapSprung", level: 2 },
      { type: "moved", area: 1, level: 1 },
      { type: "gameOver", gs: 1 },
    ];
    expect(eventNotices(handled)).toHaveLength(0);
  });

  it("gives a celebratory congratulations when the Sorcerer is slain", () => {
    const out = eventNotices([{ type: "sorcererSlain" }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.tone).toBe("good");
    expect(out[0]!.text).toContain("Sorcerer");
    expect(out[0]!.text).toContain("Congratulations");
  });

  it("announces the Whirlpool's entry telegraph distinctly from Deep Pool / Viper Pit", () => {
    expect(eventNotices([{ type: "enteredSpecial", special: SPECIAL_WHIRLPOOL }])[0]!.text).toMatch(/whirlpool/i);
  });

  it("reports the Chasm descent (US-02); the Whirlpool crossing roll has its own dice overlay (US-05)", () => {
    expect(eventNotices([{ type: "chasmDescend" }])[0]!.text).toMatch(/climbs down into the chasm/i);
    // whirlpoolRoll moved to rollView's single-die overlay (Task 16) — no text notice here.
    expect(eventNotices([{ type: "whirlpoolRoll", roll: 1, dragged: true }])).toHaveLength(0);
    expect(eventNotices([{ type: "whirlpoolRoll", roll: 5, dragged: false }])).toHaveLength(0);
  });

  it("reports the Well's draw (US-07); the Bell Rope's three bands have their own dice overlay (US-03)", () => {
    expect(eventNotices([{ type: "wellDraw" }])[0]!.text).toMatch(/bucket rises/i);
    // bellRoll moved to rollView's single-die overlay (Task 16) — no text notice here.
    expect(eventNotices([{ type: "bellRoll", roll: 1, outcome: "vanish", creatureId: 0 }])).toHaveLength(0);
    expect(eventNotices([{ type: "bellRoll", roll: 2, outcome: "toll", creatureId: 0 }])).toHaveLength(0);
    expect(eventNotices([{ type: "bellRoll", roll: 5, outcome: "stir", creatureId: 0 }])).toHaveLength(0);
  });

  it("reports the Gallery's stone arrival, the Staff's group wake, and the Lair's stash landing (US-04/US-06)", () => {
    const stone = eventNotices([{ type: "galleryStone", creatureIds: [5] }])[0]!;
    expect(stone.text).toMatch(/strangers here are stone/i);

    const wake = eventNotices([{ type: "staffWake", creatureIds: [5, 5] }])[0]!;
    expect(wake.text).toMatch(/magic staff blazes/i);
    expect(wake.text).toMatch(/cracks and stirs/i);

    // UX ruling (T7 minor): a Staff-Wizard's first entry into a Gallery fires BOTH galleryStone and
    // staffWake in the same batch — suppress the stone line so it reads as one beat, not two.
    const bothInOneBeat = eventNotices([
      { type: "galleryStone", creatureIds: [5] },
      { type: "staffWake", creatureIds: [5] },
    ]);
    expect(bothInOneBeat).toHaveLength(1);
    expect(bothInOneBeat[0]!.text).toMatch(/magic staff blazes/i);

    const stash = eventNotices([{ type: "lairStash", treasureIds: [1] }])[0]!;
    expect(stash.text).toMatch(/harpies' hoard glitters/i);
    expect(stash.tone).toBe("good");
  });

  it("reports the Crypt's park notice verbatim; its two roll outcomes have their own dice overlay (US-08)", () => {
    const parked = eventNotices([{ type: "cryptParked" }])[0]!;
    expect(parked.text).toBe("A sealed crypt squats in the corner of this chamber.");

    // cryptRoll moved to rollView's single-die overlay (Task 16) — no text notice here.
    expect(eventNotices([{ type: "cryptRoll", roll: 1, outcome: "trap" }])).toHaveLength(0);
    expect(eventNotices([{ type: "cryptRoll", roll: 5, outcome: "find" }])).toHaveLength(0);
  });

  it("reports Desertion's Wolf-skip notice and derives the all-stay summary; per-ally rolls have their own dice lanes (US-09/US-18)", () => {
    // desertionRoll moved to rollView's per-ally dice lanes (Task 16) — no text notice per roll; a
    // deserting roll alone produces nothing (no "holds together" summary — someone left).
    expect(eventNotices([{ type: "desertionRoll", creatureId: 5, roll: 1, deserted: true, items: [1, 3] }])).toHaveLength(0);
    // A single non-deserting roll alone still triggers the derived "holds together" summary below —
    // that's the ONLY text this event type can still produce.
    expect(eventNotices([{ type: "desertionRoll", creatureId: 6, roll: 4, deserted: false, items: [1] }]))
      .toEqual([{ text: "The party holds together.", tone: "good" }]);

    const wolf = eventNotices([{ type: "wolfUnmoved", hazard: HAZARD_DESERTION }])[0]!;
    expect(wolf.text).toBe("The Wolf is unmoved.");

    // "The party holds together." is derived, not its own event: present whenever Desertion had at
    // least one ally to consider (a roll OR a Wolf skip) and none actually left; absent when the
    // batch is empty, or someone deserted.
    const allStay = eventNotices([
      { type: "desertionRoll", creatureId: 5, roll: 4, deserted: false, items: [] },
      { type: "desertionRoll", creatureId: 6, roll: 5, deserted: false, items: [] },
    ]);
    expect(allStay.some((n) => n.text === "The party holds together.")).toBe(true);

    // An all-Wolf-ally roster rolls nothing at all (every ally is skipped) but still holds together.
    const allWolves = eventNotices([
      { type: "wolfUnmoved", hazard: HAZARD_DESERTION },
      { type: "wolfUnmoved", hazard: HAZARD_DESERTION },
    ]);
    expect(allWolves.some((n) => n.text === "The party holds together.")).toBe(true);

    const oneDeserted = eventNotices([
      { type: "desertionRoll", creatureId: 5, roll: 1, deserted: true, items: [] },
      { type: "desertionRoll", creatureId: 6, roll: 5, deserted: false, items: [] },
    ]);
    expect(oneDeserted.some((n) => n.text === "The party holds together.")).toBe(false);

    expect(eventNotices([]).some((n) => n.text === "The party holds together.")).toBe(false);
  });

  it("does NOT let a Medusa- or Mutiny-sourced wolfUnmoved feed Desertion's 'holds together' summary (review fix, US-18)", () => {
    // A plain Medusa turn with an immune Wolf ally present must not spuriously read as Desertion's
    // "everyone stayed" outcome — nothing was ever at risk of deserting.
    const medusaWithWolf = eventNotices([{ type: "wolfUnmoved", hazard: HAZARD_MEDUSA }]);
    expect(medusaWithWolf.some((n) => n.text === "The party holds together.")).toBe(false);

    // A Mutiny batch where one Wolf ally is immune AND a different ally actually deserts must not
    // show a contradictory "holds together" line alongside the `mutinied` desertion notice.
    const mutinyMixed = eventNotices([
      { type: "wolfUnmoved", hazard: HAZARD_MUTINY },
      { type: "mutinied", deserters: [5], treasures: [1] },
    ]);
    expect(mutinyMixed.some((n) => n.text === "The party holds together.")).toBe(false);

    // A Mutiny batch with ONLY a Wolf immune (nobody else to desert) is likewise not Desertion
    // activity — it must not borrow Desertion's summary line either.
    const mutinyWolfOnly = eventNotices([{ type: "wolfUnmoved", hazard: HAZARD_MUTINY }]);
    expect(mutinyWolfOnly.some((n) => n.text === "The party holds together.")).toBe(false);

    // Desertion's OWN all-Wolf "holds together" behaviour (pinned above, T8) still holds.
    const desertionAllWolves = eventNotices([{ type: "wolfUnmoved", hazard: HAZARD_DESERTION }]);
    expect(desertionAllWolves.some((n) => n.text === "The party holds together.")).toBe(true);
  });

  it("reports Harpies' theft (with lair-known wording), its park lurk, and the Eye-of-God curse line (US-10)", () => {
    const stolenUnknownLair = eventNotices([{ type: "harpiesSteal", treasureIds: [3], cursed: false }]);
    expect(stolenUnknownLair[0]!.text).toMatch(/harpies swoop/i);
    expect(stolenUnknownLair[0]!.text).toMatch(/lair you have not yet found/i);
    expect(stolenUnknownLair).toHaveLength(1); // no curse line when nothing cursed

    // A companion lairStash in the SAME batch (chamber.ts's stashOrDeliver) means the Lair is
    // already on the map — the wording switches accordingly (design US-10 Feedback).
    const stolenKnownLair = eventNotices([
      { type: "harpiesSteal", treasureIds: [3], cursed: false },
      { type: "lairStash", treasureIds: [3] },
    ]);
    expect(stolenKnownLair[0]!.text).toMatch(/toward their lair/i);
    expect(stolenKnownLair[0]!.text).not.toMatch(/have not yet found/i);

    const cursed = eventNotices([{ type: "harpiesSteal", treasureIds: [13], cursed: true }]);
    expect(cursed.some((n) => n.text === "The Eye of God is torn away — its curse descends upon you.")).toBe(true);

    const lurk = eventNotices([{ type: "harpiesLurk" }]);
    expect(lurk[0]!.text).toBe("Harpies circle overhead, eyeing your baggage.");
  });

  it("reports Quarrel's too-few-combatants fizzle; the duel itself has its own dice overlay (US-11)", () => {
    // quarrel moved to rollView's side-by-side dice overlay (Task 16) — no text notice here.
    expect(eventNotices([{ type: "quarrel", aId: 0, bId: 5, aRoll: 2, bRoll: 5, loserId: 0 }])).toHaveLength(0);
    expect(eventNotices([{ type: "quarrel", aId: 0, bId: 5, aRoll: 4, bRoll: 4, loserId: null }])).toHaveLength(0);

    const fizzled = eventNotices([{ type: "quarrelFizzled" }]);
    expect(fizzled).toHaveLength(1);
    expect(fizzled[0]!.tone).toBe("neutral");
  });

  it("reports the Spell's remap and its fizzle verbatim (US-22)", () => {
    const remapped = eventNotices([{ type: "spellRemap", fizzled: false }]);
    expect(remapped[0]!.text).toBe("A spell takes hold — the tunnel behind you folds in on itself and is elsewhere. Its secret doors are gone.");

    const fizzled = eventNotices([{ type: "spellRemap", fizzled: true }]);
    expect(fizzled[0]!.text).toBe("A spell crackles through the cave… and finds nothing to grip.");
  });

  it("reports the Thief's silent lift by item name (US-17)", () => {
    const lifted = eventNotices([{ type: "thiefPalmed", tid: 1 }])[0]!;
    expect(lifted.text).toBe("The Thief palms the Gold.");
    expect(lifted.tone).toBe("good");
  });

  it("reports the Apprentice's Sorcerer-death revert and exit-cave desertion verbatim (US-14)", () => {
    const turned = eventNotices([{ type: "apprenticeTurned", count: 1, items: [] }])[0]!;
    expect(turned.text).toBe("The Apprentice's eyes go cold.");
    expect(turned.tone).toBe("bad");

    const staying = eventNotices([{ type: "apprenticeStaysBehind", count: 1 }])[0]!;
    expect(staying.text).toBe("The Apprentice melts back into the dark.");
  });

  it("reports the Demon's spawn/disperse/ambush notices verbatim (US-13)", () => {
    const spawned = eventNotices([{ type: "demonSpawned" }])[0]!;
    expect(spawned.text).toBe("Something vast and wrong now waits on your back-trail.");

    const dispersed = eventNotices([{ type: "demonDispersed" }])[0]!;
    expect(dispersed.text).toBe("The Demon claws at fallen rock, finds no purchase in the ruined dark, and disperses.");

    const unfolds = eventNotices([{ type: "demonUnfolds" }])[0]!;
    expect(unfolds.text).toBe("The Demon unfolds from the shadows.");

    const slew = eventNotices([{ type: "demonSlew", creatureId: 0 }])[0]!;
    expect(slew.text).toMatch(/Demon/);
    expect(slew.tone).toBe("bad");
  });

  it("stays silent for the Elixir's three outcome bands — its own single-die dice overlay covers them (US-19)", () => {
    // elixirDrunk moved to rollView's single-die overlay (Task 16) — no text notice here.
    expect(eventNotices([{ type: "elixirDrunk", creatureId: 0, roll: 1, outcome: "death" }])).toHaveLength(0);
    expect(eventNotices([{ type: "elixirDrunk", creatureId: 0, roll: 2, outcome: "nothing" }])).toHaveLength(0);
    expect(eventNotices([{ type: "elixirDrunk", creatureId: 0, roll: 6, outcome: "strength" }])).toHaveLength(0);
    // The ordinary death machinery (a companion event on the death band) is unaffected.
    expect(eventNotices([{ type: "itemsSpilled", creatureId: 0, items: [1] }])).toHaveLength(1);
  });

  it("reports Holy Water's four outcomes verbatim, by kit-inclusive creature name where relevant (US-20)", () => {
    const revived = eventNotices([{ type: "holyWaterRevived", creatureId: 5 }])[0]!;
    expect(revived.text).toBe("The stone sloughs away — Man breathes again.");
    expect(revived.tone).toBe("good");

    // Statue-wake and destroy/weaken can name a KIT creature id (14-20), past the base CREATURES
    // table's range — this is exactly what routing through ALL_CREATURES (not the base-only
    // `name()` helper) is for.
    const woke = eventNotices([{ type: "holyWaterStatueWoke", creatureId: 18 }])[0]!; // Witch
    expect(woke.text).toBe("The stone cracks — the Witch stirs!");

    const medusaGone = eventNotices([{ type: "holyWaterMedusaDestroyed" }])[0]!;
    expect(medusaGone.text).toBe("The water sears the Medusa into mist.");

    const demonGone = eventNotices([{ type: "holyWaterFoeDestroyed", creatureId: 15 }])[0]!; // Demon
    expect(demonGone.text).toBe("The water sears the Demon into mist.");

    const weakened = eventNotices([{ type: "holyWaterWeakened", creatureId: 14 }])[0]!; // Apprentice
    expect(weakened.text).toBe("The Apprentice recoils, diminished.");
  });

  it("reports the Scroll's destroy/survivor lines and the standing curse notice, handling empty lists (US-21)", () => {
    const both = eventNotices([{ type: "scrollRead", destroyed: [5], survivors: [9] }]);
    expect(both[0]!.text).toBe("The words burn the air. Man crumble to dust. The survivors — Spectre — laugh.");
    expect(both[1]!.text).toBe("A curse settles on the party.");
    expect(both[1]!.tone).toBe("bad");

    const noSurvivors = eventNotices([{ type: "scrollRead", destroyed: [5, 2], survivors: [] }]);
    expect(noSurvivors[0]!.text).toBe("The words burn the air. Man, Ogre crumble to dust.");

    const noDestroyed = eventNotices([{ type: "scrollRead", destroyed: [], survivors: [9] }]);
    expect(noDestroyed[0]!.text).toBe("The words burn the air. Nothing here is mundane enough to crumble. The survivors — Spectre — laugh.");
    expect(noDestroyed[0]!.tone).toBe("neutral");
  });

  it("reports the Magic Shield's ward notices verbatim, by mode (US-23)", () => {
    const nullified = eventNotices([{ type: "shieldWarded", creatureId: 3, mode: "nullify" }])[0]!; // Troll
    expect(nullified.text).toBe("The Magic Shield turns the Troll's power aside.");
    expect(nullified.tone).toBe("good");

    const weakened = eventNotices([{ type: "shieldWarded", creatureId: 11, mode: "weaken" }])[0]!; // Sorcerer
    expect(weakened.text).toBe("The Shield dims the Sorcerer's power (−2).");
    expect(weakened.tone).toBe("good");
  });

  it("reports the Demon's own kill line verbatim, but stays silent for an ordinary stranger (fix round, US-13)", () => {
    const demonKilled = eventNotices([{ type: "strangerKilled", creatureId: 15 }]);
    expect(demonKilled).toHaveLength(1);
    expect(demonKilled[0]!.text).toBe("The Demon collapses into ash.");

    // An ordinary foe (e.g. a Troll) stays folded into combatView's generic "N foe(s) down".
    expect(eventNotices([{ type: "strangerKilled", creatureId: 3 }])).toHaveLength(0);
  });

  it("names a kit ally by its real name, not 'a creature' (Task 16 carry-forward: name() -> ALL_CREATURES)", () => {
    // The Demon's own kill line can name a kit victim (e.g. a Witch ally).
    expect(eventNotices([{ type: "demonSlew", creatureId: 18 }])[0]!.text).toBe("The Demon's malice claims Witch!");
    // Every other base(name)-driven site is widened the same way — pinned via a representative site
    // (itemsSpilled) rather than re-testing all of them individually.
    expect(eventNotices([{ type: "itemsSpilled", creatureId: 19, items: [] }])[0]!.text).toBe("Thief's carried items spill onto the floor.");
    expect(eventNotices([{ type: "spectreSlew", creatureId: 16 }])[0]!.text).toBe("A Spectre's touch slays Lion!");
  });

  it("noticeTone prefers bad, then good, then neutral", () => {
    expect(noticeTone([{ text: "", tone: "neutral" }, { text: "", tone: "good" }, { text: "", tone: "bad" }])).toBe("bad");
    expect(noticeTone([{ text: "", tone: "neutral" }, { text: "", tone: "good" }])).toBe("good");
    expect(noticeTone([{ text: "", tone: "neutral" }])).toBe("neutral");
  });
});
describe("deadEnd flavors (retreat vs plain move)", () => {
  it("a fight retreat's dead end keeps the bounced-back-into-the-fight wording", () => {
    const out = eventNotices([{ type: "deadEnd", dir: 3, retreat: true } as GameEvent]);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe("The way south is a dead end — the party can't escape and must fight another round.");
  });
  it("a plain exploration dead end is silent — no notice on every bumped wall", () => {
    const out = eventNotices([{ type: "deadEnd", dir: 3 } as GameEvent]);
    expect(out).toHaveLength(0);
  });
});

