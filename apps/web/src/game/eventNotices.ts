import {
  CREATURES,
  HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP,
  SPECIAL_VIPER_PIT, SPECIAL_DEEP_POOL,
  DIR_DOWN,
  type GameEvent,
} from "@sorcerers-cave/engine";

export type Tone = "good" | "bad" | "neutral";
export interface Notice {
  text: string;
  tone: Tone;
}

const name = (cid: number): string => CREATURES[cid]?.name ?? "a creature";
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;

/** A short notice for a fired hazard's effect. Mutiny and Trap are surfaced elsewhere
 *  (the `mutinied` event and the trap confirm modal), so they produce nothing here. */
function hazardNotice(hz: number): Notice | null {
  switch (hz) {
    case HAZARD_EARTHQUAKE: return { text: "An earthquake! The area behind you collapses.", tone: "bad" };
    case HAZARD_MEDUSA: return { text: "Medusa's gaze sweeps the party — the unlucky are turned to stone.", tone: "bad" };
    case HAZARD_GHOULS: return { text: "Ghouls fall upon the party!", tone: "bad" };
    case HAZARD_MUTINY: return null; // see the `mutinied` event
    case HAZARD_TRAP: return null;   // see trapSprung / trapAvoided (confirm modal)
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
  const out: Notice[] = [];
  for (const e of events) {
    switch (e.type) {
      case "crossedSpecial":
        if (e.special === SPECIAL_VIPER_PIT) out.push({ text: "The party edges across the Viper Pit…", tone: "neutral" });
        else if (e.special === SPECIAL_DEEP_POOL) out.push({ text: "The party wades through the Deep Pool…", tone: "neutral" });
        break;
      case "memberDied":
        out.push({ text: `${name(e.creatureId)} is slain!`, tone: "bad" });
        break;
      case "spectreSlew":
        out.push({ text: `A Spectre's touch slays ${name(e.creatureId)}!`, tone: "bad" });
        break;
      case "hazardFired": {
        const n = hazardNotice(e.hazard);
        if (n) out.push(n);
        break;
      }
      case "treasureDropped":
        out.push({ text: `${plural(e.count, "heavy treasure")} sinks into the Deep Pool — reclaim it on the way back.`, tone: "bad" });
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
      case "wardedOff":
        out.push({ text: `The Talisman wards off ${name(e.creatureId)}.`, tone: "good" });
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
      default:
        break;
    }
  }
  return out;
}

/** The strongest tone in a set of notices (bad ▸ good ▸ neutral) — for tinting a combined view. */
export function noticeTone(notices: Notice[]): Tone {
  if (notices.some((n) => n.tone === "bad")) return "bad";
  if (notices.some((n) => n.tone === "good")) return "good";
  return "neutral";
}
