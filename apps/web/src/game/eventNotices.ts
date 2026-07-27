import {
  CREATURES, ALL_TREASURES,
  HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP, HAZARD_DESERTION,
  SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_WHIRLPOOL,
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

const name = (cid: number): string => CREATURES[cid]?.name ?? "a creature";
const treasureName = (tid: number): string => ALL_TREASURES[tid]?.name ?? "an item";
const itemList = (ids: number[]): string => ids.map(treasureName).join(", ");
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
const DIR_WORD: Record<number, string> = { 1: "north", 2: "east", 3: "south", 4: "west", 5: "up the stair", 6: "down the stair" };
// The Bell Rope's 2-3 "toll" band uses the design's exact foreboding wording (US-03 Feedback).
const BELL_TOLL_TEXT = "A bell tolls once, far above — and is answered by silence. Something, somewhere, now knows you are here.";

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
        out.push({
          text: e.special === SPECIAL_VIPER_PIT
            ? "The party reaches the edge of the Viper Pit."
            : e.special === SPECIAL_DEEP_POOL
              ? "The party reaches the edge of the Deep Pool."
              : e.special === SPECIAL_WHIRLPOOL
                ? "Dark water churns here — crossing the shallows risks the pull of the whirlpool."
                : "The party reaches a special area.",
          tone: "neutral",
        });
        break;
      case "itemsSpilled":
        out.push({ text: `${name(e.creatureId)}'s carried items spill onto the floor.`, tone: "neutral" });
        break;
      // Dice-overlay events (rollView.ts / FightSurface.tsx) already narrate their own outcome —
      // a text notice here would duplicate that dedicated UI, so these are handled-silence.
      case "moved": // reflected directly by the area/map display; nothing to narrate
      case "drewChamber": // the chamber-draw display (engineAdapter's `ev.chamber`)
      case "gameOver": // GameOverScreen / rollView's `over`/`wipedOut` messaging
      case "reaction": // rollView.reactionView's single-die overlay
      case "pacified": // folded into reactionView's "Indifferent again…" message
      case "strangersJoined": // folded into reactionView's "…they join your party!" message
      case "fightStarted": // FightSurface's surprise banner reads state.fight.surprise directly
      case "combatRoll": // rollView.combatView's party-vs-enemy dice overlay
      case "fightWon": // folded into combatView's "Victory" message
      case "strangerKilled": // folded into combatView's "N foe(s) down" message
      case "casualtyChosen": // rollView.casualtyView's single-die overlay
      case "chestOpened": // rollView.chestView's single-die overlay
      case "rubyTaken": // folded into combatView's "guardian statue" overlay message
      case "statueAroused": // folded into combatView's "guardian statue" overlay message
      case "medusaGaze": // rollView.medusaView's die-per-member overlay
      case "viperPit": // rollView.viperView's die-per-member overlay (see `hasViper` above)
      case "trapSprung": // the move-result trap indicator / confirm modal
      case "trapAvoided": // the move-result trap indicator / confirm modal
        break;
      case "crossedSpecial":
        // The Viper Pit crossing is shown by its dice overlay; only the Deep Pool needs a notice.
        if (e.special === SPECIAL_DEEP_POOL) out.push({ text: "The party wades through the Deep Pool…", tone: "neutral" });
        break;
      case "memberDied":
        if (!hasViper) out.push({ text: `${name(e.creatureId)} is slain!`, tone: "bad" });
        break;
      case "deadEnd":
        // A retreat that hit a dead end — the party is bounced straight back into the fight, so say so
        // explicitly (otherwise it's not obvious the chosen exit was blocked).
        out.push({
          text: `The way ${DIR_WORD[e.dir] ?? "out"} is a dead end — the party can't escape and must fight another round.`,
          tone: "bad",
        });
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
        out.push({ text: "The Magic Carpet whisks the party to a new area.", tone: "neutral" });
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
      case "unicornGuards":
        out.push({ text: `A unicorn joins the party to guard ${name(e.creatureId)}.`, tone: "good" });
        break;
      case "unicornDeparted":
        out.push({ text: `The unicorn departs from ${name(e.creatureId)}.`, tone: "neutral" });
        break;
      case "chasmDescend":
        out.push({ text: "The party climbs down into the chasm.", tone: "neutral" });
        break;
      case "whirlpoolRoll":
        out.push(
          e.dragged
            ? { text: "The whirlpool drags the whole party under!", tone: "bad" }
            : { text: "The party wades the shallows safely.", tone: "good" },
        );
        break;
      case "wellDraw":
        out.push({ text: "The bucket rises from the dark…", tone: "neutral" });
        break;
      case "bellRoll":
        if (e.outcome === "vanish") {
          out.push({ text: `The rope yanks ${name(e.creatureId)} upward. They are never seen again.`, tone: "bad" });
        } else if (e.outcome === "toll") {
          out.push({ text: BELL_TOLL_TEXT, tone: "neutral" });
        } else {
          out.push({ text: "The bell's echo shakes something loose — two cards are drawn. The party cannot withdraw this turn.", tone: "neutral" });
        }
        break;
      case "galleryStone":
        out.push({ text: "The strangers here are stone — silent, waiting.", tone: "neutral" });
        break;
      case "staffWake":
        out.push({ text: "The Magic Staff blazes — every stone figure in the gallery cracks and stirs!", tone: "neutral" });
        break;
      case "lairStash":
        out.push({ text: "The harpies' hoard glitters among the bones — the stolen artifacts are here.", tone: "good" });
        break;
      case "cryptParked":
        out.push({ text: "A sealed crypt squats in the corner of this chamber.", tone: "neutral" });
        break;
      case "cryptRoll":
        out.push(
          e.outcome === "trap"
            ? { text: "The floor gives way! The party plunges into darkness.", tone: "bad" }
            : { text: "Within the crypt: gems!", tone: "good" },
        );
        break;
      case "desertionRoll":
        // Individual rolls are shown via the per-ally dice lanes (Task 16's DiceRoll overlay); the
        // "party holds together" summary (design US-09 Feedback) is appended once, below, after every
        // event has been scanned — it needs to know whether ANY ally in the whole batch deserted.
        // `items` itemizes exactly what leaves with a deserter (design Feedback "taking [treasure
        // list]"); an empty list reads as a plain, no-loot departure rather than a dropped clause.
        out.push(
          e.deserted
            ? { text: `${name(e.creatureId)} slips away into the dark, taking ${e.items.length ? itemList(e.items) : "nothing"}.`, tone: "bad" }
            : { text: `${name(e.creatureId)} wavers… but stays.`, tone: "neutral" },
        );
        break;
      case "wolfUnmoved":
        out.push({ text: "The Wolf is unmoved.", tone: "neutral" });
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
  // silence.
  const desertionRolls = events.filter((e): e is Extract<GameEvent, { type: "desertionRoll" }> => e.type === "desertionRoll");
  const hadDesertionActivity = desertionRolls.length > 0 || events.some((e) => e.type === "wolfUnmoved");
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
