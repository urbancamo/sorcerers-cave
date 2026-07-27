import {
  ALL_CREATURES, ALL_TREASURES, replay, decodeArea, scoreBreakdown,
  SPECIAL_GATEWAY, SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_TOMB, SPECIAL_GREAT_HALL,
  SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL,
  HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP,
  HAZARD_DESERTION, HAZARD_HARPIES, HAZARD_QUARREL, HAZARD_SPELL,
  GS_ESCAPED, GS_DEAD, GS_QUIT,
  type GameAction, type GameEvent, type GameState,
} from "@sorcerers-cave/engine";

/** The shape returned by the `game.log` Convex query: initial conditions + the ordered move records.
 *  Self-contained — `replay(game.seed, game.picks, moves.map(m => m.action), game.variants)` rebuilds
 *  the whole game (SC-EXT-29: `variants` is what makes a kit-on game's decks reconstruct exactly). */
export interface GameLog {
  game: {
    code: string | null;
    seed: number | null;
    picks: number[] | null;
    color: string | null;
    status: string;
    createdAt: number;
    // Extension kit (SC-EXT-29, design US-01): absent/undefined ⇒ kit-off, same as an old,
    // pre-kit game (backward compat — a code without the flag always decodes kit-off).
    variants?: { extensionKit?: boolean };
  };
  moves: { seq: number; action: GameAction; events: GameEvent[] }[];
}

const CURRENT_VERSION = 1;

const DIR_WORD: Record<number, string> = { 1: "north", 2: "east", 3: "south", 4: "west", 5: "up the stair", 6: "down the stair" };
const dir = (d: number) => DIR_WORD[d] ?? `dir ${d}`;
// ALL_CREATURES/ALL_TREASURES (not the base-only tables, SC-EXT-29): a kit-on game's log can name a
// kit id (14-21) in any action/event — the base tables would render "creature 18"/"treasure 19" in
// the downloadable log instead of "Witch"/"Scroll" (review fix, Task 16). Byte-identical for base
// ids (0-13/0-14), which both tables share verbatim.
const creature = (id: number) => ALL_CREATURES[id]?.name ?? `creature ${id}`;
const treasure = (id: number) => ALL_TREASURES[id]?.name ?? `treasure ${id}`;

/** Name the strangers vs fighters in a fight round, using the state the round was fought from. */
function matchups(matches: readonly { front: number[]; backers: number[]; strangers: number[] }[], state: GameState | null): string {
  if (!state) return `${matches.length} matchup${matches.length === 1 ? "" : "s"}`;
  return matches
    .map((m) => {
      const ours = [...m.front, ...m.backers].map((i) => (state.party[i] ? creature(state.party[i]!.creatureId) : `#${i}`)).join(", ");
      const foes = m.strangers.map((s) => (state.strangers[s] != null ? creature(state.strangers[s]!) : `#${s}`)).join(", ");
      return `${ours || "—"} vs ${foes || "—"}`;
    })
    .join("; ");
}

/** A short human label for one player action. When the state the action was applied to is supplied,
 *  index-based references (a treasure slot, a party member) are resolved to their actual type name —
 *  "Take Gold → Hero" rather than "Take item #0 → member #1". */
export function actionLabel(a: GameAction, state?: GameState | null): string {
  const s = state ?? null;
  const member = (i: number) => (s?.party[i] ? creature(s.party[i]!.creatureId) : `member #${i}`);
  const held = (mi: number, idx: number) => { const t = s?.party[mi]?.treasure[idx]; return t != null ? treasure(t) : `item #${idx}`; };
  const inChamber = (ti: number) => { const t = s?.treasures[ti]; return t != null ? treasure(t) : `item #${ti}`; };
  switch (a.type) {
    case "move": return `Move ${dir(a.dir)}`;
    case "retreat": return `Retreat ${dir(a.dir)}`;
    case "quit": return "Quit the game";
    case "exitCave": return "Exit the cave";
    case "withdraw": return "Withdraw from the chamber";
    case "test": return "Test the strangers' reaction";
    case "attack": return "Attack the strangers";
    case "resolveRound": return `Resolve a fight round: ${matchups(a.matches, s)}`;
    case "chooseCasualty": return `Let ${member(a.idx)} fall`;
    case "takeTreasure": return `Take ${inChamber(a.ti)} → ${member(a.mi)}`;
    case "leaveTreasure": return "Leave the treasure";
    case "retakeDropped": return "Retake dropped treasure";
    case "moveTreasure": return `Give ${held(a.from, a.idx)} from ${member(a.from)} to ${member(a.to)}`;
    case "dropTreasure": return `Drop ${held(a.mi, a.idx)} (${member(a.mi)})`;
    case "setBorne": return `${a.borne ? "Bear" : "Stow"} ${held(a.mi, a.idx)} (${member(a.mi)})`;
    case "useArtifact": {
      // Lotus Dust (5) targets a stranger — or, untargeted in the Medusa pause, Medusa herself;
      // every other artefact targets a party member.
      if (a.artifact === 5 && a.target === undefined) return "Use Lotus Dust on Medusa";
      const target = a.target === undefined ? ""
        : a.artifact === 5 ? ` on ${s?.strangers[a.target] != null ? creature(s.strangers[a.target]!) : `#${a.target}`}`
        : ` on ${member(a.target)}`;
      return `Use ${treasure(a.artifact)}${target}` + (a.dir !== undefined ? ` (${dir(a.dir)})` : "");
    }
    case "proceed": return "Proceed — brave Medusa's gaze";
    case "openChest": return "Open the treasure chest";
    case "descendChasm": return "Descend the chasm";
    case "drawFromWell": return "Draw from the well";
    case "pullBellRope": return `Pull the bell rope → ${member(a.mi)}`;
    default: return (a as { type: string }).type;
  }
}

const SPECIAL_NAME: Record<number, string> = {
  [SPECIAL_GATEWAY]: "the Gateway",
  [SPECIAL_DEEP_POOL]: "Deep Pool",
  [SPECIAL_VIPER_PIT]: "Viper Pit",
  [SPECIAL_TOMB]: "Tomb of Kings",
  [SPECIAL_GREAT_HALL]: "Great Hall",
  // Extension kit (design Part 2 US-02..07) — the six kit special areas (carry-forward, Task 16).
  [SPECIAL_CHASM]: "the Chasm",
  [SPECIAL_BELL_ROPE]: "the Bell Rope",
  [SPECIAL_LAIR]: "the Lair",
  [SPECIAL_WHIRLPOOL]: "the Whirlpool",
  [SPECIAL_GALLERY]: "the Gallery",
  [SPECIAL_WELL]: "the Well",
};

/** Human description of a tile's type and layout from its card value: kind (special / chamber / tunnel),
 *  exits (N E S W), and any staircases — e.g. "chamber · exits N E S W · stair down". */
export function describeTile(card: number): string {
  const d = decodeArea(card);
  const parts = [SPECIAL_NAME[d.special] ?? (d.chamber ? "chamber" : "tunnel")];
  const exits = [d.n && "N", d.e && "E", d.s && "S", d.w && "W"].filter(Boolean).join(" ");
  parts.push(exits ? `exits ${exits}` : "no exits");
  const stairs = [d.stairUp && "up", d.stairDown && "down"].filter(Boolean).join(" & ");
  if (stairs) parts.push(`stair ${stairs}`);
  return parts.join(" · ");
}

/** A short human description of one game event. Every event type is covered; anything unmapped falls
 *  back to its raw `type` so the log never silently drops a consequence (it is a debugging record).
 *  `state` is the state AFTER the event's action — used to describe the tile a `moved` event landed on. */
export function describeEvent(e: GameEvent, state?: GameState | null): string {
  switch (e.type) {
    case "moved": {
      const card = state?.areas[e.area]?.card;
      return `moved to area ${e.area} (level ${e.level})` + (card != null ? ` — ${describeTile(card)}` : "");
    }
    case "deadEnd": return e.retreat ? `dead end to the ${dir(e.dir)} — bounced back into the fight` : `dead end to the ${dir(e.dir)}`;
    case "blocked": return "action blocked (no effect)";
    case "planRejected": return `battle plan rejected (${e.reason})`;
    case "drewChamber": {
      const parts: string[] = [];
      if (e.strangers.length) parts.push(`strangers ${e.strangers.map(creature).join(", ")}`);
      if (e.treasures.length) parts.push(`treasure ${e.treasures.map(treasure).join(", ")}`);
      if (e.hazards.length) parts.push(`hazards ${e.hazards.length}`);
      return `drew a chamber` + (parts.length ? `: ${parts.join("; ")}` : " (empty)");
    }
    case "enteredSpecial": return `entered a special area (type ${e.special})`;
    case "gameOver": return `game over (outcome ${e.gs})`;
    case "hazardFired": return `hazard fired (${e.hazard})`;
    case "mutinied": return `mutiny — ${e.deserters.length} deserted, ${e.treasures.length} item(s) dropped`;
    case "medusaGaze": return `Medusa's gaze — ${e.rolls.filter((r) => r.petrified).length} petrified`;
    case "viperPit": return `viper pit crossing — ${e.rolls.filter((r) => r.died).length} fell`;
    case "eyeForsaken": return "the Eye of God was forsaken — the party is cursed";
    case "petrifiedOut": return "the whole party was turned to stone";
    case "trapSprung": return `trap sprung — fell to level ${e.level}`;
    case "trapAvoided": return "a dwarf guided the party past a trap";
    case "memberDied": return `${creature(e.creatureId)} was slain`;
    case "strangerKilled": return `${creature(e.creatureId)} (stranger) was slain`;
    case "sorcererSlain": return "the Sorcerer was slain (+30)";
    case "spectreSlew": return `a Spectre slew ${creature(e.creatureId)}`;
    case "memberRevived": return `${creature(e.creatureId)} was freed from stone`;
    case "reaction": return `reaction: ${e.outcome} (rolled ${e.roll})`;
    case "pacified": return "the chamber is now permanently indifferent to the party";
    case "strangersJoined": return `${e.count} stranger(s) joined the party`;
    case "fightStarted": return `a fight begins (surprise ${e.surprise})`;
    case "combatRoll": return `${e.party} (${e.partyTotal}) vs ${e.enemy} (${e.enemyTotal}) → ${e.result}`;
    case "fightWon": return "the party won the fight";
    case "casualtyChosen": return `${creature(e.creatureId)} fell (rolled ${e.roll}${e.gotPreference ? ", choice honoured" : ""})`;
    case "crossedSpecial": return `crossed a special area (type ${e.special})`;
    case "treasureDropped": return `${e.count} heavy treasure sank into the pool`;
    case "heavyDownForFight": return `${e.count} heavy treasure cast down for the fight`;
    case "treasureReclaimed": return `recovered ${e.count} treasure from the pool`;
    case "artifactUsed": return `used ${treasure(e.artifact)}`;
    case "chestOpened": return `opened the treasure chest (rolled ${e.result})`;
    case "rubyTaken": return "the Lost Ruby was wrested from the statue";
    case "statueAroused": return "the guardian statue struck";
    case "wardedOff": return `the Talisman warded off ${creature(e.creatureId)}`;
    case "ghoulsWarded": return "the Talisman warded off the Ghouls";
    case "medusaAverted": return "the Magic Staff turned Medusa's gaze aside";
    case "medusaLooms": return "Medusa looms — throw the Lotus Dust, or proceed";
    case "medusaSlept": return "the Lotus Dust put Medusa to sleep (two turns)";
    case "medusaAsleep": return "Medusa slept on — no gaze";
    case "droppedRetaken": return `reclaimed ${e.count} dropped treasure`;
    case "annihilated": return `the Eye of God annihilated ${creature(e.creatureId)}`;
    case "statuePowerless": return "the guardian statue stood powerless";
    case "deathPrevented": return `the Ring made ${creature(e.creatureId)} invincible`;
    case "unicornGuards": return `a unicorn guards ${creature(e.creatureId)}`;
    case "unicornDeparted": return `the unicorn departed from ${creature(e.creatureId)}`;
    case "carpetUsed": return `the Magic Carpet moved the party ${dir(e.dir)}`;
    case "dragonsLulled": return `the Charmed Flute lulled ${e.count} dragon(s)`;
    case "vipersLulled": return "the Charmed Flute lulled the vipers";
    case "secretDoorRevealed": return `a secret stairway was revealed (${dir(e.dir)})`;
    case "itemsSpilled": return `${creature(e.creatureId)}'s carried items spilled to the floor: ${e.items.map(treasure).join(", ")}`;
    case "chasmDescend": return "the party climbed down into the chasm";
    case "whirlpoolRoll": return `whirlpool crossing (rolled ${e.roll}) — ${e.dragged ? "dragged the party down" : "safe"}`;
    case "wellDraw": return "drew a card from the well";
    case "bellRoll": return `bell rope (rolled ${e.roll}) — ${e.outcome} (${creature(e.creatureId)})`;
    // Extension kit (review fix, Task 16): the remaining kit events — galleryStone through
    // shieldWarded — previously fell through to the raw `default` type string below (e.g.
    // "cryptRoll") rather than a readable line. Terse log-register, matching the style already
    // established above (verbatim UI notice text lives in eventNotices.ts, not here).
    case "galleryStone": return `the Gallery petrified ${e.creatureIds.length} creature(s): ${e.creatureIds.map(creature).join(", ")}`;
    case "staffWake": return `the Magic Staff woke ${e.creatureIds.length} Gallery statue(s): ${e.creatureIds.map(creature).join(", ")}`;
    case "lairStash": return `the Lair holds ${e.treasureIds.length} stashed item(s): ${e.treasureIds.map(treasure).join(", ")}`;
    case "cryptParked": return "a sealed crypt is parked in this chamber";
    case "cryptRoll": return `crypt roll (rolled ${e.roll}) — ${e.outcome === "trap" ? "a trap sprang" : "gems found"}`;
    case "desertionRoll": return `desertion roll (rolled ${e.roll}) — ${creature(e.creatureId)} ` +
      (e.deserted ? `vanished${e.items.length ? `, taking ${e.items.map(treasure).join(", ")}` : ""}` : "held firm");
    case "wolfUnmoved": return `the Wolf is unmoved (hazard ${e.hazard})`;
    case "harpiesSteal": return `Harpies stole ${e.treasureIds.length} item(s): ${e.treasureIds.map(treasure).join(", ")}` + (e.cursed ? " — the party is cursed" : "");
    case "harpiesLurk": return "Harpies lurk, empty-handed";
    case "quarrel": return `quarrel: ${creature(e.aId)} (${e.aRoll}) vs ${creature(e.bId)} (${e.bRoll}) — ` +
      (e.loserId != null ? `${creature(e.loserId)} lost` : "a tie, no harm");
    case "quarrelFizzled": return "a quarrel fizzled — too few eligible combatants";
    case "spellRemap": return e.fizzled ? "the Spell fizzled — no eligible tile to remap" : "the Spell remapped a tile";
    case "thiefPalmed": return `the Thief palmed ${treasure(e.tid)}`;
    case "apprenticeTurned": return `${e.count} Apprentice(s) turned when the Sorcerer fell` + (e.items.length ? `, dropping ${e.items.map(treasure).join(", ")}` : "");
    case "apprenticeStaysBehind": return `${e.count} Apprentice(s) stayed behind in the cave`;
    case "demonSpawned": return "a Demon materialized";
    case "demonDispersed": return "the Demon's area was destroyed — it dispersed";
    case "demonUnfolds": return "the Demon unfolds — a forced hostile encounter";
    case "demonSlew": return `the Demon slew ${creature(e.creatureId)}`;
    case "elixirDrunk": return `${creature(e.creatureId)} drank the Elixir (rolled ${e.roll}) — ${e.outcome}`;
    case "holyWaterRevived": return `Holy Water revived ${creature(e.creatureId)} from stone`;
    case "holyWaterStatueWoke": return `Holy Water woke a stone ${creature(e.creatureId)}`;
    case "holyWaterMedusaDestroyed": return "Holy Water destroyed Medusa's lurking marker";
    case "holyWaterFoeDestroyed": return `Holy Water destroyed ${creature(e.creatureId)}`;
    case "holyWaterWeakened": return `Holy Water weakened ${creature(e.creatureId)}`;
    case "scrollRead": return `the Scroll was read — destroyed ${e.destroyed.length ? e.destroyed.map(creature).join(", ") : "none"}, ${e.survivors.length} magical survivor(s), a curse settles on the party`;
    case "shieldWarded": return `the Magic Shield warded off ${creature(e.creatureId)} (${e.mode})`;
    default: return (e as { type: string }).type;
  }
}

// --- Score summary (shared by the .txt and .log downloads) ---------------------------------------
// The final score is derived by replaying the log to its last frame and scoring that state (§Scoring),
// so it always matches what the leaderboard would record. A total is only a *valid, recordable* score
// when the party escaped the cave — a wiped, abandoned, or still-running game shows its tally but can
// never be banked. Games that predate initial-condition logging can't be replayed, so no total is shown.

const STATUS_WORD: Record<number, string> = { 2: "petrified", 3: "fallen" };

/** Terminal game-state → the score's validity verdict (only an escaped party earns a recordable score). */
function scoreValidity(gs: number): { valid: boolean; reason: string } {
  switch (gs) {
    case GS_ESCAPED: return { valid: true, reason: "the party escaped the cave" };
    case GS_DEAD: return { valid: false, reason: "the party was wiped out" };
    case GS_QUIT: return { valid: false, reason: "the expedition was abandoned in the cave" };
    default: return { valid: false, reason: "the game is not yet finished" };
  }
}

/** The readable score breakdown appended to the .txt log. */
function scoreLinesHuman(state: GameState | null): string[] {
  const out = ["", "── Score ──"];
  if (!state) {
    out.push("Unavailable — this game predates initial-condition logging and cannot be replayed.");
    return out;
  }
  const b = scoreBreakdown(state);
  for (const m of b.members) {
    if (m.counts) out.push(`  ${m.name}${m.dragonDoubled ? " (dragon-slayer ×2)" : ""} — ${m.creaturePoints}`);
    else out.push(`  ${m.name} (${STATUS_WORD[m.status] ?? "lost"}) — scored nothing`);
    for (const t of m.treasures) {
      out.push(`      ${t.name}${t.kind === "artifact" ? " (artifact)" : ""} — ${m.counts ? t.points : 0}`);
    }
  }
  if (b.sorcererBonus) out.push(`  Sorcerer slain — +${b.sorcererBonus}`);
  if (b.bonusScore) out.push(`  Treasure Chest loot — +${b.bonusScore}`);
  if (b.cursePenalty) out.push(`  Curses — −${b.cursePenalty}`);
  out.push(`  Total: ${b.total}`);
  const v = scoreValidity(state.gs);
  out.push(v.valid
    ? `  ✓ Valid final score — ${v.reason} (recordable on the leaderboard).`
    : `  ✗ Not a valid final score — ${v.reason}.`);
  return out;
}

/** Left label + right value on one 132-column line, both forced to uppercase 7-bit ASCII. */
function scoreRow(label: string, value: string): string {
  const l = label.toUpperCase(), r = value.toUpperCase();
  const gap = 132 - l.length - r.length;
  return gap > 0 ? l + " ".repeat(gap) + r : `${l} ${r}`.slice(0, 132);
}

/** The 3-letter-coded score breakdown appended to the .log printer report (decoded by the KEY legend). */
function scoreLinesPrinter(state: GameState | null): string[] {
  const THIN = "-".repeat(132);
  const out = [centre("S C O R E   S U M M A R Y").replace(/\s+$/, ""), THIN];
  if (!state) {
    out.push("SCORE UNAVAILABLE - GAME PREDATES INITIAL-CONDITION LOGGING (CANNOT REPLAY)");
    return out;
  }
  const b = scoreBreakdown(state);
  for (const m of b.members) {
    if (m.counts) out.push(scoreRow(cr3(m.creatureId) + (m.dragonDoubled ? "  DRAGON-SLAYER X2" : ""), String(m.creaturePoints)));
    else out.push(scoreRow(cr3(m.creatureId) + "  " + (STATUS_WORD[m.status] ?? "lost").toUpperCase(), "SCORED NOTHING"));
    for (const t of m.treasures) out.push(scoreRow("    " + tr3(t.id) + (t.kind === "artifact" ? " ARTIFACT" : ""), String(m.counts ? t.points : 0)));
  }
  if (b.sorcererBonus) out.push(scoreRow("SORCERER SLAIN", "+" + b.sorcererBonus));
  if (b.bonusScore) out.push(scoreRow("TREASURE CHEST LOOT", "+" + b.bonusScore));
  if (b.cursePenalty) out.push(scoreRow("CURSES", "-" + b.cursePenalty));
  out.push(THIN, scoreRow("TOTAL SCORE", String(b.total)));
  const v = scoreValidity(state.gs);
  out.push(scoreRow("STATUS", (v.valid ? "VALID FINAL SCORE" : "NOT A VALID SCORE") + " - " + v.reason.toUpperCase() + (v.valid ? " (RECORDABLE)" : "")));
  return out;
}

/** Render the whole log as a human-readable text document (for the .txt download). */
export function formatLog(log: GameLog): string {
  const { game, moves } = log;
  const party = game.picks ? game.picks.map(creature).join(", ") : "unknown (game predates logging)";
  const started = new Date(game.createdAt).toISOString();
  const lines: string[] = [
    "Sorcerer's Cave — Game Log",
    `Code: ${game.code ?? "—"}   ·   Seed: ${game.seed ?? "unavailable"}   ·   Party: ${party}`,
    `Colour: ${game.color ?? "—"}   ·   Started: ${started}   ·   Status: ${game.status}   ·   Moves: ${moves.length}`,
  ];
  // Extension kit (SC-EXT-29, design US-01): the log's opening line records the kit was active —
  // absent for a kit-off game (byte-identical to the log format before the kit existed).
  if (game.variants?.extensionKit) lines.push("Extension kit active");
  lines.push("");
  if (game.seed == null || game.picks == null) {
    lines.push("⚠ This game predates initial-condition logging — it cannot be replayed from scratch.", "");
  }
  // Reconstruct the state BEFORE each move (frame i = state after i actions = before action i) so an
  // action's treasure/member indices resolve to their type names. Only possible for replayable games.
  const frames = game.seed != null && game.picks != null
    ? replay(game.seed, game.picks, moves.map((m) => m.action), game.variants)
    : null;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]!;
    const pre = frames?.[i]?.state ?? null;   // state BEFORE the action (names its treasure/member indices)
    const post = frames?.[i + 1]?.state ?? null; // state AFTER the action (describes the tile a move landed on)
    lines.push(`#${m.seq + 1}  ${actionLabel(m.action, pre)}`);
    for (const ev of m.events) lines.push(`      → ${describeEvent(ev, post)}`);
  }
  // Final score breakdown + validity (from the last replayed frame; null when the game can't be replayed).
  lines.push(...scoreLinesHuman(frames ? frames[frames.length - 1]!.state : null));
  return lines.join("\n") + "\n";
}

// --- Line-printer report (§ era-appropriate 132-column wide-carriage hardcopy) -------------------
// Fixed-width, 7-bit ASCII, UPPERCASE, 3-letter codes. Every column holds the same kind of datum;
// events that overflow the EVENTS column wrap onto continuation lines with the lead columns blank.

const CR3_BASE: Record<number, string> = { 0: "HER", 1: "WHR", 2: "OGR", 3: "TRL", 4: "PRI", 5: "MAN", 6: "WMN", 7: "DWF", 8: "WIZ", 9: "SPC", 10: "DRG", 11: "SOR", 12: "GNT", 13: "UNI" };
// Extension kit creature ids 14-20 (review fix, Task 16) — without these, cr3()/NAME3 below fell
// back to "???"/a raw name-slice for nearly every kit event, since kit events mostly name kit
// creatures (a Witch's galleryStone, a Wolf's wolfUnmoved, ...). Kept as a separate table (mirrors
// KIT_CREATURES, data/creatures.ts) so `legend()` can list ONLY the base 14 for a kit-off game's KEY
// block — a kit-off deck can never draw these ids, so listing their codes there would be new,
// unreachable content in the printer report (kit-off byte-identity).
const CR3_KIT: Record<number, string> = { 14: "APR", 15: "DEM", 16: "LIO", 17: "SCH", 18: "WIT", 19: "THF", 20: "WLF" };
const CR3: Record<number, string> = { ...CR3_BASE, ...CR3_KIT };
const TR3_BASE: Record<number, string> = { 0: "SLV", 1: "GLD", 2: "GEM", 3: "SWD", 4: "CPT", 5: "LOT", 6: "BLM", 7: "TAL", 8: "POT", 9: "STF", 10: "RNG", 11: "RBY", 12: "FLT", 13: "EYE", 14: "CHT" };
// Extension kit treasure ids 15-21 (review fix, Task 16) — same rationale as CR3_KIT above.
const TR3_KIT: Record<number, string> = { 15: "ELX", 16: "HLY", 17: "AXE", 18: "IDL", 19: "SCR", 20: "SHD", 21: "CRG" };
const TR3: Record<number, string> = { ...TR3_BASE, ...TR3_KIT };
const cr3 = (id: number) => CR3[id] ?? "???";
const tr3 = (id: number) => TR3[id] ?? "???";
// combatRoll carries creature NAMES, not ids — map them back to the 3-letter code (else first 3 letters).
// ALL_CREATURES (not the base-only table, SC-EXT-29): a kit-on fight's combatRoll can name a kit
// creature (e.g. "Witch") — the base-only table left this to the raw name-slice fallback, which can
// disagree with cr3()'s own kit code above (review fix, Task 16: e.g. "Wolf" sliced to "WOL", not
// the "WLF" cr3(20) uses elsewhere in the SAME report — inconsistent within one hardcopy).
const NAME3: Record<string, string> = Object.fromEntries(ALL_CREATURES.map((c) => [c.name.toUpperCase(), CR3[c.id] ?? c.name.slice(0, 3).toUpperCase()]));
const name3 = (s: string) => (s.toUpperCase() === "GHOULS" ? "GHL" : NAME3[s.toUpperCase()] ?? s.slice(0, 3).toUpperCase());
const DIR1: Record<number, string> = { 1: "N", 2: "E", 3: "S", 4: "W", 5: "U", 6: "D" };
const d1 = (d: number) => DIR1[d] ?? "?";
// Extension kit specials (carry-forward, Task 16): CHM is already the generic "ordinary chamber"
// fallback below, so the Chasm gets its own distinct CSM code.
const TYPE3: Record<number, string> = {
  [SPECIAL_GATEWAY]: "GTW", [SPECIAL_DEEP_POOL]: "POL", [SPECIAL_VIPER_PIT]: "VPT", [SPECIAL_TOMB]: "TMB", [SPECIAL_GREAT_HALL]: "HAL",
  [SPECIAL_CHASM]: "CSM", [SPECIAL_BELL_ROPE]: "BEL", [SPECIAL_LAIR]: "LAR", [SPECIAL_WHIRLPOOL]: "WHP", [SPECIAL_GALLERY]: "GAL", [SPECIAL_WELL]: "WEL",
};
const REACT3: Record<string, string> = { hostile: "HOS", indifferent: "IND", friendly: "FRD" };
const RESULT3: Record<string, string> = { partyWon: "WON", enemyWon: "LOS", tie: "TIE" };
const GS3: Record<number, string> = { 0: "PLY", 1: "ESC", 2: "DED", 3: "QIT" };
const HZ3: Record<number, string> = {
  [HAZARD_EARTHQUAKE]: "ERQ", [HAZARD_MEDUSA]: "MDA", [HAZARD_GHOULS]: "GHL", [HAZARD_MUTINY]: "MUT", [HAZARD_TRAP]: "TRP",
  // Extension kit hazard ids 5-8 (review fix, Task 16) — the generic `hazardFired` event (and the
  // new `wolfUnmoved` case below, whose one non-base source is Desertion) both index this map; a
  // kit-on game could already reach `hazardFired{hazard: 5..8}` and silently print "HAZ ???".
  [HAZARD_DESERTION]: "DES", [HAZARD_HARPIES]: "HRP", [HAZARD_QUARREL]: "QRL", [HAZARD_SPELL]: "RMP",
};

function tileCells(card: number): { typ: string; ext: string; str: string } {
  const d = decodeArea(card);
  return {
    typ: TYPE3[d.special] ?? (d.chamber ? "CHM" : "TUN"),
    ext: (d.n ? "N" : "-") + (d.e ? "E" : "-") + (d.s ? "S" : "-") + (d.w ? "W" : "-"),
    str: (d.stairUp ? "U" : "") + (d.stairDown ? "D" : ""),
  };
}

/** 3-letter ACT code + a compact ARG (treasure/member indices resolved to codes via `state`). */
function actionCode(a: GameAction, state: GameState | null): { act: string; arg: string } {
  const mem = (i: number) => (state?.party[i] ? cr3(state.party[i]!.creatureId) : `#${i}`);
  const held = (mi: number, idx: number) => { const t = state?.party[mi]?.treasure[idx]; return t != null ? tr3(t) : `#${idx}`; };
  const inCh = (ti: number) => { const t = state?.treasures[ti]; return t != null ? tr3(t) : `#${ti}`; };
  const foe = (s: number) => (state?.strangers[s] != null ? cr3(state.strangers[s]!) : `#${s}`);
  switch (a.type) {
    case "move": return { act: "MOV", arg: d1(a.dir) };
    case "retreat": return { act: "RET", arg: d1(a.dir) };
    case "exitCave": return { act: "OUT", arg: "" };
    case "withdraw": return { act: "WDR", arg: "" };
    case "test": return { act: "TST", arg: "" };
    case "attack": return { act: "ATK", arg: "" };
    case "quit": return { act: "QIT", arg: "" };
    case "leaveTreasure": return { act: "LVE", arg: "" };
    case "retakeDropped": return { act: "RTK", arg: "" };
    case "openChest": return { act: "OPN", arg: "" };
    case "takeTreasure": return { act: "TAK", arg: `${inCh(a.ti)}>${mem(a.mi)}` };
    case "dropTreasure": return { act: "DRP", arg: `${held(a.mi, a.idx)} ${mem(a.mi)}` };
    case "setBorne": return { act: a.borne ? "BER" : "STW", arg: `${held(a.mi, a.idx)} ${mem(a.mi)}` };
    case "moveTreasure": return { act: "GIV", arg: `${held(a.from, a.idx)} ${mem(a.from)}>${mem(a.to)}` };
    case "chooseCasualty": return { act: "CAS", arg: mem(a.idx) };
    // An untargeted USE of the Lotus Dust (5) is the Medusa-pause throw — shown as LOT>MED.
    case "useArtifact": return { act: "USE", arg: tr3(a.artifact) + (a.target !== undefined ? `>${a.artifact === 5 ? foe(a.target) : mem(a.target)}` : a.artifact === 5 ? ">MED" : "") };
    case "proceed": return { act: "PRO", arg: "" };
    case "resolveRound": return { act: "FGT", arg: a.matches.map((m) => `${[...m.front, ...m.backers].map((i) => (state?.party[i] ? cr3(state.party[i]!.creatureId) : `#${i}`)).join("+") || "-"}>${m.strangers.map(foe).join("+") || "-"}`).join(",") };
    case "descendChasm": return { act: "CHM", arg: "" };
    case "drawFromWell": return { act: "WEL", arg: "" };
    case "pullBellRope": return { act: "BEL", arg: mem(a.mi) };
    default: return { act: (a as { type: string }).type.slice(0, 3).toUpperCase(), arg: "" };
  }
}

/** A terse code for one event. The `moved` event is rendered in the position/tile columns, so it (and
 *  the blocked no-op) return null here. Every other event type maps to a short uppercase code.
 *  Exported for direct unit testing (review fix, Task 16) — same rationale as `describeEvent`. */
export function eventCode(e: GameEvent): string | null {
  switch (e.type) {
    case "moved": case "blocked": return null;
    case "drewChamber": {
      const p: string[] = [];
      if (e.strangers.length) p.push("S:" + e.strangers.map(cr3).join(","));
      if (e.treasures.length) p.push("T:" + e.treasures.map(tr3).join(","));
      if (e.hazards.length) p.push("H:" + e.hazards.length);
      return "DRW" + (p.length ? " " + p.join(" ") : " -");
    }
    case "reaction": return `RCT ${REACT3[e.outcome]} R${e.roll}`;
    case "strangersJoined": return `JOI ${e.count}`;
    case "pacified": return "PAC";
    case "fightStarted": return `FGT SUP${e.surprise}`;
    case "combatRoll": return `CBT ${name3(e.party)} ${e.partyTotal} V ${name3(e.enemy)} ${e.enemyTotal} ${RESULT3[e.result]}`;
    case "fightWon": return "WON";
    case "casualtyChosen": return `CAS ${cr3(e.creatureId)} R${e.roll}`;
    case "memberDied": return `DIE ${cr3(e.creatureId)}`;
    case "strangerKilled": return `KIL ${cr3(e.creatureId)}`;
    case "spectreSlew": return `SLW ${cr3(e.creatureId)}`;
    case "memberRevived": return `RVV ${cr3(e.creatureId)}`;
    case "sorcererSlain": return "SOR SLN";
    case "treasureDropped": return `TDR ${e.count}`;
    case "heavyDownForFight": return `FDR ${e.count}`;
    case "treasureReclaimed": return `TRC ${e.count}`;
    case "droppedRetaken": return `RTK ${e.count}`;
    case "crossedSpecial": return `XSP ${TYPE3[e.special] ?? "???"}`;
    case "enteredSpecial": return `ESP ${TYPE3[e.special] ?? "???"}`;
    case "hazardFired": return `HAZ ${HZ3[e.hazard] ?? "???"}`;
    case "trapSprung": return `TRP L${e.level}`;
    case "trapAvoided": return "TRP AVD";
    case "medusaGaze": return `MED ${e.rolls.filter((r) => r.petrified).length}`;
    case "viperPit": return `VIP ${e.rolls.filter((r) => r.died).length}`;
    case "eyeForsaken": return "EYE FSK";
    case "petrifiedOut": return "PTO";
    case "gameOver": return `END ${GS3[e.gs] ?? "???"}`;
    case "artifactUsed": return `USE ${tr3(e.artifact)}`;
    case "chestOpened": return `CHT R${e.result}`;
    case "rubyTaken": return "RBY GOT";
    case "statueAroused": return "STA HIT";
    case "statuePowerless": return "STA OFF";
    case "deathPrevented": return `SAV ${cr3(e.creatureId)}`;
    case "wardedOff": return `WRD ${cr3(e.creatureId)}`;
    case "ghoulsWarded": return "WRD GHL";
    case "medusaAverted": return "MED AVD";
    case "medusaLooms": return "MED LOM";
    case "medusaSlept": return "MED SLP";
    case "medusaAsleep": return "MED ZZZ";
    case "annihilated": return `ANH ${cr3(e.creatureId)}`;
    case "unicornGuards": return "UNI GRD";
    case "unicornDeparted": return "UNI DEP";
    case "carpetUsed": return `CPT ${d1(e.dir)}`;
    case "dragonsLulled": return `LUL ${e.count}`;
    case "vipersLulled": return "LUL VIP";
    case "secretDoorRevealed": return `SEC ${d1(e.dir)}`;
    case "itemsSpilled": return `SPL ${cr3(e.creatureId)} ${e.items.map(tr3).join(",")}`;
    case "deadEnd": return `DED ${d1(e.dir)}`;
    case "mutinied": return `MUT ${e.deserters.length}`;
    case "planRejected": return "REJ";
    case "chasmDescend": return "CHM DSC";
    case "whirlpoolRoll": return `WHP R${e.roll} ${e.dragged ? "DRG" : "SAF"}`;
    case "wellDraw": return "WEL DRW";
    case "bellRoll": return `BEL R${e.roll} ${e.outcome.slice(0, 3).toUpperCase()}`;
    // Extension kit (review fix, Task 16): the remaining kit events, each given its OWN distinct
    // code — the `default` fallback below slices the raw type to 3 letters, which would silently
    // collide several same-prefix kit types onto one ambiguous code (every demon* event → "DEM",
    // every holyWater* event → "HOL", both apprentice* events → "APP", harpiesSteal/harpiesLurk →
    // "HAR"). See describeEvent above for the human-readable prose equivalent of each.
    case "galleryStone": return `PTR ${e.creatureIds.map(cr3).join(",")}`;
    case "staffWake": return `WAK ${e.creatureIds.map(cr3).join(",")}`;
    case "lairStash": return `LST ${e.treasureIds.map(tr3).join(",")}`;
    case "cryptParked": return "CRP";
    case "cryptRoll": return `CRL R${e.roll} ${e.outcome === "trap" ? "TRP" : "FND"}`;
    case "desertionRoll": return `DSR ${cr3(e.creatureId)} R${e.roll} ${e.deserted ? "VAN" : "HLD"}`;
    case "wolfUnmoved": return `WLF UNM ${HZ3[e.hazard] ?? "???"}`;
    case "harpiesSteal": return `HRP STL ${e.treasureIds.map(tr3).join(",")}` + (e.cursed ? " CRS" : "");
    case "harpiesLurk": return "HRP LRK";
    case "quarrel": return `QRL ${cr3(e.aId)} R${e.aRoll} V ${cr3(e.bId)} R${e.bRoll} ${e.loserId != null ? `LOS ${cr3(e.loserId)}` : "TIE"}`;
    case "quarrelFizzled": return "QRL FIZ";
    case "spellRemap": return e.fizzled ? "RMP FIZ" : "RMP OK";
    case "thiefPalmed": return `PLM ${tr3(e.tid)}`;
    case "apprenticeTurned": return `APR TRN ${e.count}`;
    case "apprenticeStaysBehind": return `APR STY ${e.count}`;
    case "demonSpawned": return "DEM SPN";
    case "demonDispersed": return "DEM DSP";
    case "demonUnfolds": return "DEM UNF";
    case "demonSlew": return `DEM SLW ${cr3(e.creatureId)}`;
    case "elixirDrunk": return `ELX ${cr3(e.creatureId)} R${e.roll} ${e.outcome.slice(0, 3).toUpperCase()}`;
    case "holyWaterRevived": return `HLY RVV ${cr3(e.creatureId)}`;
    case "holyWaterStatueWoke": return `HLY WAK ${cr3(e.creatureId)}`;
    case "holyWaterMedusaDestroyed": return "HLY MED";
    case "holyWaterFoeDestroyed": return `HLY DST ${cr3(e.creatureId)}`;
    case "holyWaterWeakened": return `HLY WKN ${cr3(e.creatureId)}`;
    case "scrollRead": return `SCR ${e.destroyed.length ? e.destroyed.map(cr3).join(",") : "-"} SRV${e.survivors.length}`;
    case "shieldWarded": return `SHW ${cr3(e.creatureId)} ${e.mode === "nullify" ? "NUL" : "WKN"}`;
    default: return (e as { type: string }).type.slice(0, 3).toUpperCase();
  }
}

const padR = (s: string, w: number) => (s.length > w ? s.slice(0, w) : s.padStart(w)); // numbers, right
const padL = (s: string, w: number) => (s.length > w ? s.slice(0, w) : s.padEnd(w));    // codes, left
const centre = (s: string, w = 132) => " ".repeat(Math.max(0, Math.floor((w - s.length) / 2))) + s;

/** Pack whole codes/pairs into lines up to width `w`, joined by two spaces so each record stays intact
 *  (a CBT row is never split mid-record); a single item wider than the column is hard-truncated. */
function packCodes(items: string[], w: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const raw of items) {
    const item = raw.length > w ? raw.slice(0, w) : raw;
    if (line && line.length + 2 + item.length > w) { out.push(line); line = item; }
    else line = line ? `${line}  ${item}` : item;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

/** The KEY / legend block: decode the 3-letter codes so the hardcopy is self-documenting. Creature and
 *  treasure rows are generated from the code maps (kept in sync); the rest is a curated crib.
 *  `kitOn` (review fix, Task 16) gates the kit creature/treasure rows: a kit-off game's deck can
 *  never draw those ids, so listing their codes there would be unreachable, misleading content in
 *  an otherwise byte-identical report (SC-EXT-29 — same "kit-off byte-identity" rule as `formatLog`'s
 *  "Extension kit active" line and `logReport`'s own "KIT ON" meta tag, just applied to the legend). */
function legend(kitOn: boolean): string[] {
  const rows = (label: string, pairs: string[]): string[] => {
    const bodyW = 132 - 5 - 9 - 1; // "KEY  " (5) + label field (9) + a space
    return packCodes(pairs, bodyW).map((ln, i) => "KEY".padEnd(5) + (i === 0 ? label.padEnd(9) : " ".repeat(9)) + " " + ln);
  };
  // ALL_CREATURES/ALL_TREASURES (not the base-only tables): CR3_KIT/TR3_KIT decode via the combined
  // table regardless — the base-only tables would decode a kit row's name back to "?".
  const cr3Rows = kitOn ? CR3 : CR3_BASE;
  const tr3Rows = kitOn ? TR3 : TR3_BASE;
  const creatures = Object.entries(cr3Rows).map(([id, c]) => `${c}=${(ALL_CREATURES[Number(id)]?.name ?? "?").toUpperCase()}`);
  const treasures = Object.entries(tr3Rows).map(([id, c]) => `${c}=${(ALL_TREASURES[Number(id)]?.name ?? "?").toUpperCase()}`);
  return [
    ...rows("CREATURE", creatures),
    ...rows("TREASURE", treasures),
    ...rows("TILE", ["CHM=CHAMBER", "TUN=TUNNEL", "GTW=GATEWAY", "POL=DEEP POOL", "VPT=VIPER PIT", "TMB=TOMB", "HAL=GREAT HALL"]),
    ...rows("TILE COLS", ["EXT: N/E/S/W OPEN, - WALL", "STR: U UP, D DOWN"]),
    ...rows("ACTION", ["MOV=MOVE", "RET=RETREAT", "OUT=EXIT CAVE", "WDR=WITHDRAW", "TST=TEST", "ATK=ATTACK", "FGT=FIGHT ROUND", "TAK=TAKE", "GIV=GIVE", "DRP=DROP", "BER=BEAR", "STW=STOW", "LVE=LEAVE", "RTK=RETAKE", "USE=USE ARTEFACT", "OPN=OPEN CHEST", "CAS=CASUALTY", "PRO=PROCEED (MEDUSA)", "QIT=QUIT"]),
    ...rows("EVENT", ["DRW=DREW (S:STRANGERS T:TREASURE H:HAZARDS)", "RCT=REACTION (HOS/IND/FRD)", "JOI=JOINED", "PAC=PACIFIED", "FGT SUP=FIGHT ON", "CBT=COMBAT (SIDE # V FOE # WON/LOS/TIE)", "WON=PARTY WON", "DIE=MEMBER DIED", "KIL=STRANGER SLAIN", "SLW=SPECTRE SLEW", "CAS=CASUALTY (R# DIE)"]),
    ...rows("EVENT", ["HAZ=HAZARD (GHL/MDA/ERQ/MUT/TRP)", "TRP=TRAP", "ESP/XSP=ENTER/CROSS SPECIAL", "TDR/TRC=POOL DROP/RECOVER", "FDR=FIGHT DROP", "RCL=RECLAIM", "END=GAME OVER (ESC/DED/QIT)", "DED=DEAD END", "SEC=SECRET DOOR", "SPL=ITEMS SPILLED", "ANH=ANNIHILATE", "WRD=WARD OFF", "RVV=REVIVE", "SAV=RING SAVE"]),
  ];
}

/** Render the log as a fixed-width, uppercase, 3-letter-code report for a 132-column wide-carriage
 *  line printer (the .log download). `printed` stamps the header; pass a formatted timestamp. */
export function logReport(log: GameLog, printed = ""): string {
  const { game, moves } = log;
  const W = { seq: 4, trn: 4, lvl: 3, ara: 4, act: 3, arg: 12, typ: 3, ext: 4, str: 3 };
  const lead = W.seq + 1 + W.trn + 1 + W.lvl + 1 + W.ara + 1 + W.act + 1 + W.arg + 1 + W.typ + 1 + W.ext + 1 + W.str + 1;
  const EVT = 132 - lead; // 83 columns for the event codes
  const RULE = "=".repeat(132), THIN = "-".repeat(132);
  const party = (game.picks ?? []).map(cr3).join(" ") || "???";
  // Extension kit (SC-EXT-29): the opening meta line notes KIT ON — omitted (kit-off, byte-identical
  // header) when the game carries no extensionKit flag.
  const kitTag = game.variants?.extensionKit ? "   KIT ON" : "";
  const meta = `GAME ${game.code ?? "----"}   SEED ${game.seed ?? "------"}   PARTY ${party}   MOVES ${moves.length}   PRINTED ${printed || "----------------"}${kitTag}`.toUpperCase();
  const head = [padR("SEQ", W.seq), padR("TRN", W.trn), padR("LVL", W.lvl), padR("ARA", W.ara), padL("ACT", W.act), padL("ARG", W.arg), padL("TYP", W.typ), padL("EXT", W.ext), padL("STR", W.str), "EVENTS"].join(" ");
  const out = [RULE, centre("S O R C E R E R ' S   C A V E").replace(/\s+$/, ""), centre("A D V E N T U R E   L O G").replace(/\s+$/, ""), RULE, padL(meta, 132).replace(/\s+$/, ""), THIN, head, THIN];

  const frames = game.seed != null && game.picks != null ? replay(game.seed, game.picks, moves.map((m) => m.action), game.variants) : null;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]!;
    const post = frames?.[i + 1]?.state ?? null;
    const { act, arg } = actionCode(m.action, frames?.[i]?.state ?? null);
    const moved = m.events.find((e) => e.type === "moved") as Extract<GameEvent, { type: "moved" }> | undefined;
    const card = moved && post ? post.areas[moved.area]?.card : undefined;
    const tile = card != null ? tileCells(card) : { typ: "", ext: "", str: "" };
    const codes = m.events.map(eventCode).filter((c): c is string => c != null);
    const ev = packCodes(codes, EVT);
    const row = [
      padR(String(m.seq + 1), W.seq),
      padR(post ? String(post.turn) : "", W.trn),
      padR(post ? String(post.level) : "", W.lvl),
      padR(post ? String(post.partyArea) : "", W.ara),
      padL(act, W.act), padL(arg, W.arg), padL(tile.typ, W.typ), padL(tile.ext, W.ext), padL(tile.str, W.str),
      ev[0]!,
    ].join(" ");
    out.push(row.replace(/\s+$/, ""));
    for (let k = 1; k < ev.length; k++) out.push(" ".repeat(lead) + ev[k]!);
  }
  out.push(THIN, centre(`* * *   E N D   O F   L O G   -   ${moves.length}   M O V E S   * * *`).replace(/\s+$/, ""), THIN);
  // Final score breakdown + validity (from the last replayed frame; null when the game can't be replayed).
  out.push(...scoreLinesPrinter(frames ? frames[frames.length - 1]!.state : null), THIN);
  out.push(...legend(!!game.variants?.extensionKit), RULE);
  return out.join("\n") + "\n";
}

/** Render the machine-readable log (for the .json download / offline replay). A superset of the query
 *  result, tagged with a format version so the shape can evolve. */
export function machineLog(log: GameLog): string {
  return JSON.stringify({ version: CURRENT_VERSION, game: log.game, moves: log.moves }, null, 2);
}

/** Local "YYYY-MM-DD HH:MM:SS" stamp for the printer report's PRINTED header. */
function printedStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Trigger a client-side file download of the log in the requested format:
 *  human (.txt narrative), machine (.json replayable), or printer (.log 132-col wide-carriage report). */
export function downloadLog(log: GameLog, kind: "human" | "machine" | "printer"): void {
  const base = log.game.code ?? "game";
  const { text, ext, mime } =
    kind === "machine" ? { text: machineLog(log), ext: "json", mime: "application/json" }
    : kind === "printer" ? { text: logReport(log, printedStamp()), ext: "log", mime: "text/plain" }
    : { text: formatLog(log), ext: "txt", mime: "text/plain" };
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}-log.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
