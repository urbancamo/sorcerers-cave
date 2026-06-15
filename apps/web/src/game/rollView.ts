import { CREATURES, type GameEvent } from "@sorcerers-cave/engine";
import type { Lane } from "./DiceRoll";

export type Tone = "good" | "bad" | "neutral";
export type RollView = { title: string; lanes: Lane[]; message: string; tone: Tone };

/** Turn a reaction event (+ any join) into a single-die overlay. */
function reactionView(reaction: Extract<GameEvent, { type: "reaction" }>, joined: number): RollView {
  const message =
    reaction.outcome === "friendly"
      ? joined > 0
        ? "Friendly — they join your party!"
        : "Friendly — but they keep their distance."
      : reaction.outcome === "indifferent"
        ? "Indifferent — they pay you no heed."
        : "Hostile — they ready for a fight!";
  const tone: Tone =
    reaction.outcome === "friendly" ? "good" : reaction.outcome === "hostile" ? "bad" : "neutral";
  return { title: "Reaction roll", lanes: [{ enemy: { value: reaction.roll } }], message, tone };
}

/** Turn a fight round's combat rolls into a party-vs-enemy overlay with both dice side by side. */
function combatView(events: GameEvent[]): RollView | null {
  const rolls = events.filter((e): e is Extract<GameEvent, { type: "combatRoll" }> => e.type === "combatRoll");
  if (rolls.length === 0) return null;
  const lanes: Lane[] = rolls.map((r) => ({
    party: { name: r.party, value: r.partyRoll, total: r.partyTotal, outcome: r.result === "partyWon" ? "win" : r.result === "enemyWon" ? "lose" : "tie" },
    enemy: { name: r.enemy, value: r.enemyRoll, total: r.enemyTotal, outcome: r.result === "enemyWon" ? "win" : r.result === "partyWon" ? "lose" : "tie" },
  }));

  const over = events.some((e) => e.type === "gameOver");
  const won = events.some((e) => e.type === "fightWon");
  const rubyTaken = events.some((e) => e.type === "rubyTaken");
  const statue = events.some((e) => e.type === "statueAroused"); // Lost-Ruby statue fight
  const killed = events.filter((e) => e.type === "strangerKilled").length;
  // Count party losses from the round's MATCH RESULTS, not just memberDied events: when a two-member
  // group loses a match the death is deferred to a casualty choice (no memberDied is emitted yet), so
  // counting events alone reported 0 even though a roll was lost. Each enemy-won match costs exactly
  // one member (immediate or pending); a Spectre may slay one outside the matches, and The Ring can
  // avert a death.
  const enemyWon = rolls.filter((r) => r.result === "enemyWon").length;
  const spectreSlew = events.filter((e) => e.type === "spectreSlew").length;
  const prevented = events.filter((e) => e.type === "deathPrevented").length;
  const lost = Math.max(0, enemyWon + spectreSlew - prevented);

  // The Lost Ruby is guarded by a strength-8 statue (§16) — give that fight its own copy.
  if (rubyTaken || statue) {
    const message = rubyTaken
      ? "You wrest the Lost Ruby from the statue!"
      : over
        ? "The statue strikes — the party is slain…"
        : "The statue strikes your champion down!";
    return { title: "The guardian statue", lanes, message, tone: rubyTaken ? "good" : "bad" };
  }

  const message = over
    ? "The party is slain…"
    : won
      ? "Victory — the foes have fallen!"
      : `Round resolved — ${killed} foe(s) down, ${lost} of yours lost.`;
  const tone: Tone = over || lost > 0 ? "bad" : killed > 0 ? "good" : "neutral";
  return { title: "Combat round", lanes, message, tone };
}

/** Turn an opened Treasure Chest (a d6) into a single-die overlay — otherwise its
 *  curse / Spectre / loot outcome is invisible. */
function chestView(events: GameEvent[]): RollView | null {
  const chest = events.find((e): e is Extract<GameEvent, { type: "chestOpened" }> => e.type === "chestOpened");
  if (!chest) return null;
  const OUTCOME: Record<number, { message: string; tone: Tone }> = {
    1: { message: "A curse! −30 points at scoring.", tone: "bad" },
    2: { message: "A Spectre bursts from the chest — defend yourselves!", tone: "bad" },
    3: { message: "Only sand — nothing of value.", tone: "neutral" },
    4: { message: "Silver! +20 points.", tone: "good" },
    5: { message: "Gold! +40 points.", tone: "good" },
    6: { message: "Gems! +80 points.", tone: "good" },
  };
  const o = OUTCOME[chest.result] ?? { message: "The chest creaks open.", tone: "neutral" as Tone };
  return { title: "The Treasure Chest", lanes: [{ enemy: { value: chest.result } }], message: o.message, tone: o.tone };
}

/** Turn a decided casualty (a 2-member match loss) into a single-die overlay showing the d6 and
 *  whether the player's preference was honoured. */
function casualtyView(events: GameEvent[]): RollView | null {
  const c = events.find((e): e is Extract<GameEvent, { type: "casualtyChosen" }> => e.type === "casualtyChosen");
  if (!c) return null;
  const who = CREATURES[c.creatureId]?.name ?? "A companion";
  return {
    title: "Who falls",
    lanes: [{ enemy: { value: c.roll } }],
    message: `${who} falls — ${c.gotPreference ? "as you chose." : "fate decided otherwise."}`,
    tone: "bad",
  };
}

/** Build the dice overlay (if any) for the events an action produced — reaction, chest, casualty, else combat. */
export function rollFromEvents(events: GameEvent[]): RollView | null {
  const reaction = events.find((e): e is Extract<GameEvent, { type: "reaction" }> => e.type === "reaction");
  if (reaction) {
    const joined = events.find((e): e is Extract<GameEvent, { type: "strangersJoined" }> => e.type === "strangersJoined")?.count ?? 0;
    return reactionView(reaction, joined);
  }
  return chestView(events) ?? casualtyView(events) ?? combatView(events);
}
