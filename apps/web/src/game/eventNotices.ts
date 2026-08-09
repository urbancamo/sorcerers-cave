import {
  ALL_CREATURES, ALL_TREASURES,
  HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP, HAZARD_DESERTION,
  HAZARD_HARPIES, HAZARD_QUARREL, HAZARD_SPELL,
  SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_WHIRLPOOL, SPECIAL_CHASM,
  DIR_DOWN,
  type GameEvent,
} from "@sorcerers-cave/engine";

// Exhaustiveness guard for the switch in eventNotices(): if a new GameEvent member is added
// without a case below, TypeScript reports `x` as not assignable to `never` here — a compile
// error, not a silently-dropped event (docs/requirements/extension-kit/2026-07-26-engine-integration-design.md §1.5).
const assertNever = (x: never): void => {};

export type Tone = "good" | "bad" | "neutral";
export interface Notice {
  text: string;
  tone: Tone;
}

// ALL_CREATURES (not the base-only CREATURES, carry-forward from Task 15): any creatureId here can
// be a kit id (14-20) — a kit ally naming itself in bellRoll/quarrel/demonSlew/elixirDrunk/etc., or a
// kit stranger/statue in Holy Water's/Scroll's notices. Byte-identical for ids 0-13.
const name = (cid: number): string => ALL_CREATURES[cid]?.name ?? "a creature";
const allName = name; // former base/kit split retired — every site now goes through the same widened lookup
const treasureName = (tid: number): string => ALL_TREASURES[tid]?.name ?? "an item";
const itemList = (ids: number[]): string => ids.map(treasureName).join(", ");
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
const DIR_WORD: Record<number, string> = { 1: "north", 2: "east", 3: "south", 4: "west", 5: "up the stair", 6: "down the stair" };
// US-04 Feedback, verbatim — shared by the `lairStash` and `harpiesSteal` cases (ordering fix, T9 minor).
const LAIR_STASH_TEXT: Notice = { text: "The harpies' hoard glitters among the bones — the stolen artifacts are here.", tone: "good" };

/** A short notice for a fired hazard's effect. Mutiny and Trap are surfaced elsewhere
 *  (the `mutinied` event and the trap confirm modal), so they produce nothing here. */
function hazardNotice(hz: number): Notice | null {
  switch (hz) {
    case HAZARD_EARTHQUAKE: return { text: "An earthquake! The area behind you collapses.", tone: "bad" };
    case HAZARD_MEDUSA: return { text: "Medusa's gaze sweeps the party — the unlucky are turned to stone.", tone: "bad" };
    case HAZARD_GHOULS: return { text: "Ghouls fall upon the party!", tone: "bad" };
    case HAZARD_MUTINY: return null; // see the `mutinied` event
    case HAZARD_TRAP: return null;   // see trapSprung / trapAvoided (confirm modal)
    case HAZARD_DESERTION: return null; // see the per-ally `desertionRoll` / `wolfUnmoved` events
    case HAZARD_HARPIES: return null; // see `harpiesSteal` / `harpiesLurk`
    case HAZARD_QUARREL: return null; // see the `quarrel` event
    case HAZARD_SPELL: return null; // see `spellRemap` (covers both the remap and the fizzle)
    default: return { text: "A hazard strikes!", tone: "bad" };
  }
}

/**
 * Human-readable notices for events that otherwise produce no feedback (gap analysis #4):
 * special-area crossings and their casualties, hazards, Deep-Pool treasure, mutiny, and the
 * artifact / special-area effect outcomes. Events that already have dedicated UI — reaction &
 * combat rolls, chamber draws, the trap modal, the chest overlay, game-over — are intentionally
 * skipped so nothing is double-reported.
 */
export function eventNotices(events: GameEvent[]): Notice[] {
  // The Viper Pit crossing has its own die-per-member overlay (see rollView), which shows the crossing
  // and any fatal falls — so suppress the duplicate text notices for it.
  const hasViper = events.some((e) => e.type === "viperPit");
  const out: Notice[] = [];
  for (const e of events) {
    switch (e.type) {
      case "blocked":
        // Generic no-op guard (wrong phase, invalid target, …) fired by many actions across both
        // single-player and multiplayer dispatch — previously silent everywhere it wasn't
        // preempted client-side, so give it a plain fallback notice.
        out.push({ text: "Nothing happens.", tone: "neutral" });
        break;
      case "planRejected":
        // The client pre-validates battle plans (FightSurface), but the engine is authoritative —
        // a plan it rejects reached the player as nothing but a log line until now.
        out.push({ text: `The battle plan is rejected: ${e.reason}`, tone: "bad" });
        break;
      case "enteredSpecial":
        // Special-areas revision (2026-08-08): the Chasm now gets its own telegraph too, matching
        // its three siblings — it previously fell through to the generic fallback text below.
        out.push({
          text: e.special === SPECIAL_VIPER_PIT
            ? "The party reaches the edge of the Viper Pit."
            : e.special === SPECIAL_DEEP_POOL
              ? "The party reaches the edge of the Deep Pool."
              : e.special === SPECIAL_WHIRLPOOL
                ? "Dark water churns here — crossing the shallows risks the pull of the whirlpool."
                : e.special === SPECIAL_CHASM
                  ? "The floor drops away into a yawning chasm here."
                  : "The party reaches a special area.",
          tone: "neutral",
        });
        break;
      case "itemsSpilled":
        out.push({ text: `${name(e.creatureId)}'s carried items spill onto the floor.`, tone: "neutral" });
        break;
      case "reaction": {
        // `certain` (bug fix 2026-08-02): set only when the leader's hostileMax/indiffMax make
        // `outcome` the same regardless of the roll — currently only the Unicorn (always
        // friendly), so this only ever needs the join/guard split, mirroring rollView.ts's
        // reactionView exactly. A non-certain reaction stays silent — rollView.ts's own single-die
        // overlay already covers it (see the silent group below).
        if (!e.certain) break;
        const joined = events.find((ev) => ev.type === "strangersJoined")?.count ?? 0;
        const guarded = events.some((ev) => ev.type === "unicornGuards");
        out.push({
          text: joined > 0
            ? "Friendly — they join your party!"
            : guarded
              ? "Friendly — but it stays to guard the chamber."
              : "Friendly — they join your party!",
          tone: "good",
        });
        break;
      }
      // Dice-overlay events (rollView.ts / FightSurface.tsx) already narrate their own outcome —
      // a text notice here would duplicate that dedicated UI, so these are handled-silence.
      case "moved": // reflected directly by the area/map display; nothing to narrate
      case "drewChamber": // the chamber-draw display (engineAdapter's `ev.chamber`)
      case "gameOver": // GameOverScreen / rollView's `over`/`wipedOut` messaging
      case "pacified": // folded into reactionView's "Indifferent again…" message
      case "strangersJoined": // folded into reactionView's "…they join your party!" message
      case "fightStarted": // FightSurface's surprise banner reads state.fight.surprise directly
      case "combatRoll": // rollView.combatView's party-vs-enemy dice overlay
      case "fightWon": // folded into combatView's "Victory" message
      case "casualtyChosen": // rollView.casualtyView's single-die overlay
      case "chestOpened": // rollView.chestView's single-die overlay
      case "rubyTaken": // folded into combatView's "guardian statue" overlay message
      case "statueAroused": // folded into combatView's "guardian statue" overlay message
      case "medusaGaze": // rollView.medusaView's die-per-member overlay
      case "viperPit": // rollView.viperView's die-per-member overlay (see `hasViper` above)
      case "trapSprung": // the move-result trap indicator / confirm modal
      case "trapAvoided": // the move-result trap indicator / confirm modal
      // Test Mode (§Test Mode): the TestControlsPanel already shows the armed override directly —
      // nothing to narrate here.
      case "testAreaQueued":
      case "testChamberQueued":
      case "testReactionQueued":
      case "testOverridesCleared":
        break;
      case "strangerKilled":
        // Folded into combatView's "N foe(s) down" message for every ordinary foe — EXCEPT the
        // Demon (creature 15), which gets its own design-verbatim kill line (US-13 Feedback:
        // "The Demon collapses into ash.") the generic dice overlay doesn't carry.
        if (e.creatureId === 15) out.push({ text: "The Demon collapses into ash.", tone: "good" });
        break;
      case "crossedSpecial":
        // The Viper Pit crossing is shown by its dice overlay; only the Deep Pool needs a notice.
        if (e.special === SPECIAL_DEEP_POOL) out.push({ text: "The party wades through the Deep Pool…", tone: "neutral" });
        break;
      case "memberDied":
        if (!hasViper) out.push({ text: `${name(e.creatureId)} is slain!`, tone: "bad" });
        break;
      case "deadEnd":
        // Two flavors (e.retreat, SC-4-42): a fight retreat that hit a dead end bounces the party
        // straight back into the fight — say so explicitly, it changes what the player must do.
        // A plain exploration step into a dead end stays SILENT (handled-silence): the canvas
        // already shows the party didn't move, and a notice on every bumped wall is noise.
        if (e.retreat) {
          out.push({ text: `The way ${DIR_WORD[e.dir] ?? "out"} is a dead end — the party can't escape and must fight another round.`, tone: "bad" });
        }
        break;
      case "spectreSlew":
        out.push({ text: `A Spectre's touch slays ${name(e.creatureId)}!`, tone: "bad" });
        break;
      case "memberRevived":
        out.push({ text: `The Magic Staff frees ${name(e.creatureId)} from stone — they rejoin the party.`, tone: "good" });
        break;
      case "petrifiedOut":
        out.push({ text: "No party members have been left alive by Medusa's gaze.", tone: "bad" });
        break;
      case "eyeForsaken":
        out.push({ text: "The Eye of God leaves its bearer — a curse settles on the party (−1 to every roll).", tone: "bad" });
        break;
      case "hazardFired": {
        const n = hazardNotice(e.hazard);
        if (n) out.push(n);
        break;
      }
      case "treasureDropped":
        out.push({ text: `${plural(e.count, "heavy treasure")} sinks into the Deep Pool — reclaim it on the way back.`, tone: "bad" });
        break;
      case "heavyDownForFight":
        out.push({ text: `${plural(e.count, "heavy treasure")} cast down for the fight — it lies on the floor until the issue is decided.`, tone: "neutral" });
        break;
      case "treasureReclaimed":
        out.push({ text: `You recover ${plural(e.count, "treasure")} from the Deep Pool.`, tone: "good" });
        break;
      case "mutinied":
        out.push({
          text: `${plural(e.deserters.length, "ally")} desert the party` +
            (e.treasures.length ? `, dropping ${plural(e.treasures.length, "item")}` : "") + "!",
          tone: "bad",
        });
        break;
      // Balm (6) and Staff (9) emit only a generic artifactUsed; the others have a companion
      // event (carpetUsed / secretDoorRevealed / …) handled below, so they're skipped here.
      case "artifactUsed":
        if (e.artifact === 6) out.push({ text: "The Healing Balm restores a fallen companion to life.", tone: "good" });
        else if (e.artifact === 9) out.push({ text: "The Magic Staff frees a companion from stone.", tone: "good" });
        break;
      case "carpetUsed":
        out.push({ text: "The Magic Carpet whisks the party to a new area, and is left behind.", tone: "neutral" });
        break;
      case "secretDoorRevealed":
        out.push({ text: `A secret stairway is revealed ${e.dir === DIR_DOWN ? "below" : "above"}.`, tone: "good" });
        break;
      case "dragonsLulled":
        out.push({ text: `The Charmed Flute lulls ${plural(e.count, "dragon")} to sleep.`, tone: "good" });
        break;
      case "vipersLulled":
        out.push({ text: "The Charmed Flute lulls the vipers — the party crosses unharmed.", tone: "good" });
        break;
      case "wardedOff":
        out.push({ text: `The Talisman wards off ${name(e.creatureId)}.`, tone: "good" });
        break;
      case "ghoulsWarded":
        out.push({ text: "The party's Talisman wards off the Ghouls — they slink away unfought.", tone: "good" });
        break;
      case "medusaAverted":
        out.push({ text: "Medusa's gaze sweeps the party — but the Wizard's Magic Staff turns it aside; no one is stoned.", tone: "good" });
        break;
      case "medusaLooms":
        out.push({ text: "Medusa looms before her gaze can land — throw the Lotus Dust at her, or proceed and brave it.", tone: "neutral" });
        break;
      case "medusaSlept":
        out.push({ text: "The Lotus Dust settles over Medusa — she sleeps for two of your turns.", tone: "good" });
        break;
      case "medusaAsleep":
        out.push({ text: "Medusa slumbers on under the Lotus Dust — her gaze never lifts.", tone: "good" });
        break;
      case "droppedRetaken":
        out.push({ text: `Your fighters reclaim ${plural(e.count, "treasure")} they set down for the fight.`, tone: "good" });
        break;
      case "sorcererSlain":
        out.push({
          text: "🏆 The Sorcerer falls! You have vanquished the master of the cave — a feat few adventurers ever achieve. Congratulations, hero! (+30 to your final score)",
          tone: "good",
        });
        break;
      case "annihilated":
        out.push({ text: `The Eye of God annihilates ${name(e.creatureId)}!`, tone: "good" });
        break;
      case "statuePowerless":
        out.push({ text: "The guardian statue stands powerless before you.", tone: "good" });
        break;
      case "deathPrevented":
        out.push({ text: `The Ring renders ${name(e.creatureId)} invincible — the blow fails!`, tone: "good" });
        break;
      // `unicornGuards` (bug fix 2026-08-02): only ever fires alongside a `reaction` event, which
      // — now that every Unicorn reaction carries `certain: true` — already narrates the guard
      // outcome above ("Friendly — but it stays to guard the chamber."); a second notice here
      // would double up.
      case "unicornGuards":
        break;
      case "unicornDeparted":
        out.push({ text: `The unicorn departs from ${name(e.creatureId)}.`, tone: "neutral" });
        break;
      case "chasmDescend":
        out.push({ text: "The party climbs down into the chasm.", tone: "neutral" });
        break;
      case "whirlpoolRoll": // rollView's single-die overlay (Task 16) — dragged/safe message + tone
        break;
      case "wellDraw":
        out.push({ text: "The bucket rises from the dark…", tone: "neutral" });
        break;
      case "bellRoll": // rollView's single-die overlay (Task 16) — vanish/toll/stir message + tone
        break;
      case "galleryStone":
        // UX ruling (T7 minor): when a Staff-Wizard's `staffWake` fires in this SAME batch (first
        // entry into a Gallery already carrying the Staff — `enterChamber` then `wakeGalleryStatues`,
        // reduce.ts), the statues never actually stay stone long enough to narrate — skip this line
        // so the beat reads as one event ("the Staff blazes…"), not "stone… then immediately awake".
        if (!events.some((ev) => ev.type === "staffWake")) {
          out.push({ text: "The strangers here are stone — silent, waiting.", tone: "neutral" });
        }
        break;
      case "staffWake":
        out.push({ text: "The Magic Staff blazes — every stone figure in the gallery cracks and stirs!", tone: "neutral" });
        break;
      case "lairStash":
        // Ordering fix (T9 minor): when Harpies deliver straight to an already-placed Lair,
        // `stashOrDeliver` (chamber.ts) emits `lairStash` BEFORE `harpiesSteal` in the hazard's own
        // event batch — pushing this text in natural iteration order would read "the hoard glitters"
        // ahead of "Harpies swoop!", backwards (the theft should read first). When a companion
        // `harpiesSteal` fires in the SAME batch, its own case (below) pushes this exact line itself,
        // right after the theft text, so skip it here to avoid a duplicate in the wrong order. Fires
        // normally when the Lair is entered/placed independently of a theft (design US-04).
        if (!events.some((ev) => ev.type === "harpiesSteal")) {
          out.push(LAIR_STASH_TEXT);
        }
        break;
      case "pendingDropDelivered":
        // Special-areas revision (2026-08-08, SC-10.5-16): treasure dropped into a Chasm/Whirlpool
        // above has fallen through to land here — mirrors the Lair's own delivery notice above.
        out.push({ text: `Something has fallen through from above — ${itemList(e.treasureIds)} lie here.`, tone: "neutral" });
        break;
      case "cryptParked":
        out.push({ text: "A sealed crypt squats in the corner of this chamber.", tone: "neutral" });
        break;
      case "cryptRoll": // rollView's single-die overlay (Task 16) — trap/find message + tone
        break;
      case "desertionRoll":
        // Individual rolls are shown via the per-ally dice LANES (rollView's desertionView, Task 16)
        // — one lane per ally, no per-roll text notice here. The "party holds together" summary
        // (design US-09 Feedback) is still derived below, after every event has been scanned — it
        // needs to know whether ANY ally in the whole batch deserted, straight from `events` (not
        // from `out`), so silencing this case's own text doesn't affect it.
        break;
      case "wolfUnmoved":
        out.push({ text: "The Wolf is unmoved.", tone: "neutral" });
        break;
      case "harpiesSteal": {
        // "Toward their lair" vs "toward a lair you have not yet found" (design US-10 Feedback)
        // turns on whether the Lair is already on the map — inferred from a companion `lairStash`
        // in this SAME batch (`stashOrDeliver`, chamber.ts, emits it exactly when it delivers
        // straight to a placed Lair) rather than a redundant field on this event.
        const lairStashed = events.find((ev): ev is Extract<GameEvent, { type: "lairStash" }> => ev.type === "lairStash");
        out.push({
          text: `Harpies swoop! They snatch ${itemList(e.treasureIds)} and wheel away toward ${lairStashed ? "their lair" : "a lair you have not yet found"}.`,
          tone: "bad",
        });
        // Ordering fix (T9 minor, see the `lairStash` case above): the delivery line belongs right
        // after the theft line, not wherever `lairStash` happens to sit in the raw event order.
        if (lairStashed) out.push(LAIR_STASH_TEXT);
        if (e.cursed) out.push({ text: "The Eye of God is torn away — its curse descends upon you.", tone: "bad" });
        break;
      }
      case "harpiesLurk":
        out.push({ text: "Harpies circle overhead, eyeing your baggage.", tone: "neutral" });
        break;
      case "quarrel": // rollView's side-by-side dice overlay (Task 16) — "flare"/loser-or-tie message
        break;
      case "quarrelFizzled":
        out.push({ text: "Tempers flare, but there's no one left to settle it with — the moment passes.", tone: "neutral" });
        break;
      case "spellRemap":
        out.push(
          e.fizzled
            ? { text: "A spell crackles through the cave… and finds nothing to grip.", tone: "neutral" }
            : { text: "A spell takes hold — the tunnel behind you folds in on itself and is elsewhere. Its secret doors are gone.", tone: "bad" },
        );
        break;
      case "thiefPalmed":
        out.push({ text: `The Thief palms the ${treasureName(e.tid)}.`, tone: "good" });
        break;
      case "apprenticeTurned":
        out.push({ text: "The Apprentice's eyes go cold.", tone: "bad" });
        break;
      case "apprenticeStaysBehind":
        out.push({ text: "The Apprentice melts back into the dark.", tone: "neutral" });
        break;
      case "demonSpawned":
        out.push({ text: "Something vast and wrong now waits on your back-trail.", tone: "bad" });
        break;
      case "demonDispersed":
        out.push({ text: "The Demon claws at fallen rock, finds no purchase in the ruined dark, and disperses.", tone: "neutral" });
        break;
      case "demonUnfolds":
        out.push({ text: "The Demon unfolds from the shadows.", tone: "bad" });
        break;
      case "demonSlew":
        out.push({ text: `The Demon's malice claims ${name(e.creatureId)}!`, tone: "bad" });
        break;
      case "elixirDrunk":
        // rollView's single-die overlay (Task 16) — death/nothing/strength message + tone, verbatim
        // per design US-19 Feedback. `deathPrevented`/`eyeForsaken`/`itemsSpilled` (the ordinary death
        // machinery) still fire alongside this on the death band, each with their OWN notice, exactly
        // as any other "killing die-roll" site (e.g. Quarrel) — only this event's own text moved.
        break;
      // Holy Water's four outcomes (design US-20 Feedback, verbatim per mode, SC-EXT-24).
      case "holyWaterRevived":
        out.push({ text: `The stone sloughs away — ${allName(e.creatureId)} breathes again.`, tone: "good" });
        break;
      case "holyWaterStatueWoke":
        out.push({ text: `The stone cracks — the ${allName(e.creatureId)} stirs!`, tone: "neutral" });
        break;
      case "holyWaterMedusaDestroyed":
        out.push({ text: "The water sears the Medusa into mist.", tone: "good" });
        break;
      case "holyWaterFoeDestroyed":
        out.push({ text: `The water sears the ${allName(e.creatureId)} into mist.`, tone: "good" });
        break;
      case "holyWaterWeakened":
        out.push({ text: `The ${allName(e.creatureId)} recoils, diminished.`, tone: "good" });
        break;
      case "shieldWarded":
        // Design US-23 Feedback, verbatim per mode (SC-EXT-27) — fires only for a round the ward
        // actually bit, one notice per stranger it turned aside.
        out.push(
          e.mode === "weaken"
            ? { text: `The Shield dims the ${allName(e.creatureId)}'s power (−2).`, tone: "good" }
            : { text: `The Magic Shield turns the ${allName(e.creatureId)}'s power aside.`, tone: "good" },
        );
        break;
      // Bug fix 2026-08-09 (SC-EXT-40, card text): "the shield-bearer may match himself against a
      // spectre or demon, and the spectre or demon is simply ignored for that round" — fires INSTEAD
      // of a combatRoll for that match; no dice were rolled and neither side was harmed.
      case "shieldStalemate":
        out.push({ text: `The Magic Shield holds ${e.creatureIds.map(allName).join(", ")} at bay — neither side can land a blow this round.`, tone: "neutral" });
        break;
      case "scrollRead": {
        // Design US-21 Feedback, verbatim — handling the empty-destroyed (an all-magical group) and
        // empty-survivors (nothing left standing) edge cases sensibly rather than rendering a blank
        // clause. The standing curse notice always follows — the Scroll curses on every legal use.
        let text = "The words burn the air.";
        text += e.destroyed.length
          ? ` ${e.destroyed.map(allName).join(", ")} crumble to dust.`
          : " Nothing here is mundane enough to crumble.";
        if (e.survivors.length) text += ` The survivors — ${e.survivors.map(allName).join(", ")} — laugh.`;
        out.push({ text, tone: e.destroyed.length ? "good" : "neutral" });
        out.push({ text: "A curse settles on the party.", tone: "bad" });
        break;
      }
      case "islandJump":
        // Precise Locations (SC-10.5, house rule): narrates the jump itself; the mechanical outcome
        // (a Viper Pit fall or a Deep Pool treasure drop) is reported by the SAME viperPit/
        // treasureDropped events an ordinary crossing already emits, handled above.
        out.push({
          text: e.special === SPECIAL_VIPER_PIT
            ? "The party leaps for the island in the middle of the pit."
            : "The party swims for the island in the middle of the pool.",
          tone: "neutral",
        });
        break;
      default:
        assertNever(e);
        break;
    }
  }
  // Desertion's "everyone stayed" summary (design US-09 Feedback: "The party holds together.") isn't
  // its own engine event — it's derived here from the batch of `desertionRoll`/`wolfUnmoved` events
  // the hazard emits (one per ally rolled or skipped): fires whenever Desertion had at least one
  // ally to consider and none of them actually left — including an all-Wolf-ally roster, which rolls
  // nothing at all (every ally is skipped) but should still read as "the party holds together", not
  // silence. Review fix (Task 10, SC-EXT-18): `wolfUnmoved` is now ALSO emitted by Medusa's petrify
  // loop and Mutiny's desertion, whose own skip must NOT count as Desertion activity — a Medusa turn
  // with a Wolf ally would otherwise wrongly append this line, and a Mutiny batch with one Wolf
  // immune and another ally actually deserting would show it alongside the `mutinied` notice,
  // contradicting it. Gated on `hazard === HAZARD_DESERTION` (the `wolfUnmoved` event's discriminant)
  // so only Desertion's own skips (and rolls) ever feed this summary.
  const desertionRolls = events.filter((e): e is Extract<GameEvent, { type: "desertionRoll" }> => e.type === "desertionRoll");
  const desertionWolfSkips = events.filter((e): e is Extract<GameEvent, { type: "wolfUnmoved" }> =>
    e.type === "wolfUnmoved" && e.hazard === HAZARD_DESERTION);
  const hadDesertionActivity = desertionRolls.length > 0 || desertionWolfSkips.length > 0;
  if (hadDesertionActivity && !desertionRolls.some((e) => e.deserted)) {
    out.push({ text: "The party holds together.", tone: "good" });
  }
  return out;
}

/** The strongest tone in a set of notices (bad ▸ good ▸ neutral) — for tinting a combined view. */
export function noticeTone(notices: Notice[]): Tone {
  if (notices.some((n) => n.tone === "bad")) return "bad";
  if (notices.some((n) => n.tone === "good")) return "good";
  return "neutral";
}
