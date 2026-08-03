// ALL_CREATURES/ALL_TREASURES (not the base-only tables): the kit's dice-overlay events can name a
// kit ally/stranger (14-21) — a Bell Rope puller, a Quarrel combatant, a Desertion roll, an Elixir
// drinker. Byte-identical for ids 0-13.
import { TREASURES, ALL_CREATURES, ALL_TREASURES, type GameEvent } from "@sorcerers-cave/engine";
import type { Lane } from "./DiceRoll";

export type Tone = "good" | "bad" | "neutral";
export type RollView = { title: string; lanes: Lane[]; message: string; tone: Tone };

// The Bell Rope's 2-3 "toll" band uses the design's exact foreboding wording (US-03 Feedback).
const BELL_TOLL_TEXT = "A bell tolls once, far above — and is answered by silence. Something, somewhere, now knows you are here.";

/** Turn a reaction event (+ any join) into a single-die overlay. */
function reactionView(reaction: Extract<GameEvent, { type: "reaction" }>, joined: number, pacified: boolean, guarded: boolean): RollView {
  const message =
    reaction.outcome === "friendly"
      ? joined > 0
        ? "Friendly — they join your party!"
        : guarded
          ? "Friendly — but it stays to guard the chamber."
          : "Friendly — they join your party!"
      : reaction.outcome === "indifferent"
        ? pacified
          ? "Indifferent again — they now ignore you for good. Go on your way."
          : "Indifferent — they pay you no heed."
        : "Hostile — they're ready for a fight!";
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
      ? `You wrest the Lost Ruby from the statue! (+${TREASURES[11]!.points} points)`
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
    1: { message: "A curse! A curse card settles on the party — −1 to every roll, and −30 points at scoring.", tone: "bad" },
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
  const who = ALL_CREATURES[c.creatureId]?.name ?? "A companion";
  return {
    title: "Who falls",
    lanes: [{ enemy: { value: c.roll } }],
    message: `${who} falls — ${c.gotPreference ? "as you chose." : "fate decided otherwise."}`,
    tone: "bad",
  };
}

/** Turn Medusa's gaze into a die-per-member overlay (a 1-2 turns that creature to stone). */
function medusaView(events: GameEvent[]): RollView | null {
  const gaze = events.find((e): e is Extract<GameEvent, { type: "medusaGaze" }> => e.type === "medusaGaze");
  if (!gaze) return null;
  const lanes: Lane[] = gaze.rolls.map((r) => ({
    enemy: { name: ALL_CREATURES[r.creatureId]?.name ?? "?", value: r.roll, outcome: r.petrified ? "lose" : "win" },
  }));
  const stoned = gaze.rolls.filter((r) => r.petrified).length;
  const wipedOut = events.some((e) => e.type === "petrifiedOut");
  const message = wipedOut
    ? "Medusa's gaze petrifies the whole party…"
    : stoned > 0 ? `Medusa's gaze — ${stoned} turned to stone.` : "Medusa's gaze — the party averts its eyes!";
  return { title: "Medusa's gaze", lanes, message, tone: stoned > 0 ? "bad" : "good" };
}

/** Turn the Viper Pit crossing into a die-per-member overlay (a roll of 1 is a fatal fall). */
function viperView(events: GameEvent[]): RollView | null {
  const pit = events.find((e): e is Extract<GameEvent, { type: "viperPit" }> => e.type === "viperPit");
  if (!pit) return null;
  const lanes: Lane[] = pit.rolls.map((r) => ({
    enemy: { name: ALL_CREATURES[r.creatureId]?.name ?? "?", value: r.roll, outcome: r.died ? "lose" : "win" },
  }));
  const lost = pit.rolls.filter((r) => r.died).length;
  const wipedOut = events.some((e) => e.type === "gameOver");
  const message = wipedOut
    ? "The vipers take the last of the party…"
    : lost > 0 ? `The vipers strike — ${lost} fall into the pit.` : "The party picks its way across — all safe.";
  return { title: "The Viper Pit", lanes, message, tone: lost > 0 ? "bad" : "good" };
}

/** Turn the Whirlpool's crossing roll into a single-die overlay (design US-05 Feedback, verbatim). */
function whirlpoolView(events: GameEvent[]): RollView | null {
  const w = events.find((e): e is Extract<GameEvent, { type: "whirlpoolRoll" }> => e.type === "whirlpoolRoll");
  if (!w) return null;
  const message = w.dragged ? "The whirlpool drags the whole party under!" : "The party wades the shallows safely.";
  return { title: "The Whirlpool", lanes: [{ enemy: { value: w.roll } }], message, tone: w.dragged ? "bad" : "good" };
}

/** Turn the Bell Rope's roll into a single-die overlay, one message per band (design US-03 Feedback, verbatim). */
function bellRopeView(events: GameEvent[]): RollView | null {
  const b = events.find((e): e is Extract<GameEvent, { type: "bellRoll" }> => e.type === "bellRoll");
  if (!b) return null;
  const puller = ALL_CREATURES[b.creatureId]?.name ?? "A companion";
  const message =
    b.outcome === "vanish" ? `The rope yanks ${puller} upward. They are never seen again.`
      : b.outcome === "toll" ? BELL_TOLL_TEXT
        : "The bell's echo shakes something loose — two cards are drawn. The party cannot withdraw this turn.";
  return { title: "The Bell Rope", lanes: [{ enemy: { value: b.roll } }], message, tone: b.outcome === "vanish" ? "bad" : "neutral" };
}

/** Turn the Crypt's roll into a single-die overlay (design US-08 Feedback, verbatim). */
function cryptView(events: GameEvent[]): RollView | null {
  const c = events.find((e): e is Extract<GameEvent, { type: "cryptRoll" }> => e.type === "cryptRoll");
  if (!c) return null;
  const message = c.outcome === "trap" ? "The floor gives way! The party plunges into darkness." : "Within the crypt: gems!";
  return { title: "The Crypt", lanes: [{ enemy: { value: c.roll } }], message, tone: c.outcome === "trap" ? "bad" : "good" };
}

/** Turn Desertion's per-ally rolls into a die-per-ally overlay (design US-09 Feedback) — one lane per
 *  ally actually rolled (Wolves are skipped by the hazard itself, so they never appear here). */
function desertionView(events: GameEvent[]): RollView | null {
  const rolls = events.filter((e): e is Extract<GameEvent, { type: "desertionRoll" }> => e.type === "desertionRoll");
  if (rolls.length === 0) return null;
  const nameOf = (cid: number) => ALL_CREATURES[cid]?.name ?? "A companion";
  const itemsOf = (ids: number[]) => (ids.length ? ids.map((id) => ALL_TREASURES[id]?.name ?? "an item").join(", ") : "nothing");
  const lanes: Lane[] = rolls.map((r) => ({
    enemy: { name: nameOf(r.creatureId), value: r.roll, outcome: r.deserted ? "lose" : "win" },
  }));
  const deserters = rolls.filter((r) => r.deserted);
  const message = deserters.length
    ? deserters.map((r) => `${nameOf(r.creatureId)} slips away into the dark, taking ${itemsOf(r.items)}.`).join(" ")
    : "The party holds together.";
  return { title: "Desertion", lanes, message, tone: deserters.length ? "bad" : "good" };
}

/** Turn Quarrel's one-round mini-fight into a side-by-side dice overlay (design US-11 Feedback,
 *  verbatim) — the two forced combatants' d6s shown against each other, like a combat lane. */
function quarrelView(events: GameEvent[]): RollView | null {
  const q = events.find((e): e is Extract<GameEvent, { type: "quarrel" }> => e.type === "quarrel");
  if (!q) return null;
  const aName = ALL_CREATURES[q.aId]?.name ?? "?";
  const bName = ALL_CREATURES[q.bId]?.name ?? "?";
  const aOutcome = q.loserId === null ? "tie" : q.loserId === q.aId ? "lose" : "win";
  const bOutcome = q.loserId === null ? "tie" : q.loserId === q.bId ? "lose" : "win";
  const lanes: Lane[] = [{
    enemy: { name: aName, value: q.aRoll, outcome: aOutcome },
    party: { name: bName, value: q.bRoll, outcome: bOutcome },
  }];
  const outcome = q.loserId === null
    ? "They are pulled apart, fuming but unhurt."
    : `${ALL_CREATURES[q.loserId]?.name ?? "?"} falls to ${ALL_CREATURES[q.loserId === q.aId ? q.bId : q.aId]?.name ?? "?"}'s fury.`;
  return {
    title: "Quarrel",
    lanes,
    message: `Tempers flare — ${aName} and ${bName} come to blows! ${outcome}`,
    tone: q.loserId === null ? "good" : "bad",
  };
}

/** Turn the Elixir's draught into a single-die overlay, one message per band (design US-19 Feedback,
 *  verbatim). The ordinary death machinery's own notices (deathPrevented/eyeForsaken/itemsSpilled) on
 *  the death band still surface separately via `eventNotices` — only this event's own line lives here. */
function elixirView(events: GameEvent[]): RollView | null {
  const d = events.find((e): e is Extract<GameEvent, { type: "elixirDrunk" }> => e.type === "elixirDrunk");
  if (!d) return null;
  const drinker = ALL_CREATURES[d.creatureId]?.name ?? "A companion";
  const message =
    d.outcome === "death" ? `${drinker} convulses — poison!`
      : d.outcome === "nothing" ? "It tastes of pond water. Nothing happens."
        : `${drinker} feels power settle into their bones. (+2 fs)`;
  const tone: Tone = d.outcome === "death" ? "bad" : d.outcome === "nothing" ? "neutral" : "good";
  return { title: "The Elixir", lanes: [{ enemy: { value: d.roll } }], message, tone };
}

/** Build the dice overlay (if any) for the events an action produced — reaction, chest, casualty,
 *  Medusa, Viper, the extension kit's own roll events, else combat. */
export function rollFromEvents(events: GameEvent[]): RollView | null {
  const reaction = events.find((e): e is Extract<GameEvent, { type: "reaction" }> => e.type === "reaction");
  if (reaction) {
    // `certain` (bug fix 2026-08-02): the leader's hostileMax/indiffMax make `outcome` the same
    // regardless of the roll (currently only the Unicorn) — nothing worth animating a die for.
    // eventNotices.ts covers this with plain text instead, so no dice overlay at all here.
    if (reaction.certain) return null;
    const joined = events.find((e): e is Extract<GameEvent, { type: "strangersJoined" }> => e.type === "strangersJoined")?.count ?? 0;
    const pacified = events.some((e) => e.type === "pacified");
    const guarded = events.some((e) => e.type === "unicornGuards");
    return reactionView(reaction, joined, pacified, guarded);
  }
  return (
    chestView(events) ?? casualtyView(events) ?? medusaView(events) ?? viperView(events)
    ?? whirlpoolView(events) ?? bellRopeView(events) ?? cryptView(events) ?? desertionView(events)
    ?? quarrelView(events) ?? elixirView(events)
    ?? combatView(events)
  );
}
