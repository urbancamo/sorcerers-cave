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
    const out = eventNotices([{ type: "deadEnd", dir: 1 }]);
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

  it("reports the Chasm descent (US-02) and Whirlpool crossing roll (US-05)", () => {
    expect(eventNotices([{ type: "chasmDescend" }])[0]!.text).toMatch(/climbs down into the chasm/i);
    const dragged = eventNotices([{ type: "whirlpoolRoll", roll: 1, dragged: true }])[0]!;
    expect(dragged.text).toMatch(/drags the whole party under/i);
    expect(dragged.tone).toBe("bad");
    const safe = eventNotices([{ type: "whirlpoolRoll", roll: 5, dragged: false }])[0]!;
    expect(safe.text).toMatch(/wades the shallows safely/i);
    expect(safe.tone).toBe("good");
  });

  it("reports the Well's draw (US-07) and the Bell Rope's three bands (US-03)", () => {
    expect(eventNotices([{ type: "wellDraw" }])[0]!.text).toMatch(/bucket rises/i);

    const vanish = eventNotices([{ type: "bellRoll", roll: 1, outcome: "vanish", creatureId: 0 }])[0]!;
    expect(vanish.text).toMatch(/rope yanks .* upward/i);
    expect(vanish.text).toMatch(/never seen again/i);
    expect(vanish.tone).toBe("bad");

    const toll = eventNotices([{ type: "bellRoll", roll: 2, outcome: "toll", creatureId: 0 }])[0]!;
    expect(toll.text).toMatch(/bell tolls once/i);
    expect(toll.text).toMatch(/now knows you are here/i);

    const stir = eventNotices([{ type: "bellRoll", roll: 5, outcome: "stir", creatureId: 0 }])[0]!;
    expect(stir.text).toMatch(/two cards are drawn/i);
    expect(stir.text).toMatch(/cannot withdraw this turn/i);
  });

  it("reports the Gallery's stone arrival, the Staff's group wake, and the Lair's stash landing (US-04/US-06)", () => {
    const stone = eventNotices([{ type: "galleryStone", creatureIds: [5] }])[0]!;
    expect(stone.text).toMatch(/strangers here are stone/i);

    const wake = eventNotices([{ type: "staffWake", creatureIds: [5, 5] }])[0]!;
    expect(wake.text).toMatch(/magic staff blazes/i);
    expect(wake.text).toMatch(/cracks and stirs/i);

    const stash = eventNotices([{ type: "lairStash", treasureIds: [1] }])[0]!;
    expect(stash.text).toMatch(/harpies' hoard glitters/i);
    expect(stash.tone).toBe("good");
  });

  it("reports the Crypt's park notice and its two roll outcomes verbatim (US-08)", () => {
    const parked = eventNotices([{ type: "cryptParked" }])[0]!;
    expect(parked.text).toBe("A sealed crypt squats in the corner of this chamber.");

    const trap = eventNotices([{ type: "cryptRoll", roll: 1, outcome: "trap" }])[0]!;
    expect(trap.text).toBe("The floor gives way! The party plunges into darkness.");
    expect(trap.tone).toBe("bad");

    const find = eventNotices([{ type: "cryptRoll", roll: 5, outcome: "find" }])[0]!;
    expect(find.text).toBe("Within the crypt: gems!");
    expect(find.tone).toBe("good");
  });

  it("reports Desertion's per-ally lines with the itemized loot, the Wolf's skip notice, and derives the all-stay summary (US-09/US-18)", () => {
    const deserted = eventNotices([{ type: "desertionRoll", creatureId: 5, roll: 1, deserted: true, items: [1, 3] }])[0]!;
    expect(deserted.text).toMatch(/slips away into the dark/i);
    expect(deserted.text).toMatch(/taking Gold, Magic Sword/); // itemized, by name (design "taking [treasure list]")
    expect(deserted.tone).toBe("bad");

    const emptyHanded = eventNotices([{ type: "desertionRoll", creatureId: 5, roll: 1, deserted: true, items: [] }])[0]!;
    expect(emptyHanded.text).toMatch(/taking nothing/); // no phantom list when there was nothing to take

    const stayed = eventNotices([{ type: "desertionRoll", creatureId: 6, roll: 4, deserted: false, items: [1] }])[0]!;
    expect(stayed.text).toMatch(/wavers… but stays/);
    expect(stayed.text).not.toMatch(/Gold/); // a staying ally's items are never mentioned

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

  it("reports Quarrel's duel, its loser/tie outcomes, and its too-few-combatants fizzle (US-11)", () => {
    const duel = eventNotices([{ type: "quarrel", aId: 0, bId: 5, aRoll: 2, bRoll: 5, loserId: 0 }]);
    expect(duel[0]!.text).toMatch(/tempers flare/i);
    expect(duel[1]!.text).toMatch(/falls to/i);
    expect(duel[1]!.tone).toBe("bad");

    const tie = eventNotices([{ type: "quarrel", aId: 0, bId: 5, aRoll: 4, bRoll: 4, loserId: null }]);
    expect(tie[1]!.text).toBe("They are pulled apart, fuming but unhurt.");
    expect(tie[1]!.tone).toBe("good");

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

  it("reports the Demon's own kill line verbatim, but stays silent for an ordinary stranger (fix round, US-13)", () => {
    const demonKilled = eventNotices([{ type: "strangerKilled", creatureId: 15 }]);
    expect(demonKilled).toHaveLength(1);
    expect(demonKilled[0]!.text).toBe("The Demon collapses into ash.");

    // An ordinary foe (e.g. a Troll) stays folded into combatView's generic "N foe(s) down".
    expect(eventNotices([{ type: "strangerKilled", creatureId: 3 }])).toHaveLength(0);
  });

  it("noticeTone prefers bad, then good, then neutral", () => {
    expect(noticeTone([{ text: "", tone: "neutral" }, { text: "", tone: "good" }, { text: "", tone: "bad" }])).toBe("bad");
    expect(noticeTone([{ text: "", tone: "neutral" }, { text: "", tone: "good" }])).toBe("good");
    expect(noticeTone([{ text: "", tone: "neutral" }])).toBe("neutral");
  });
});
