import { CREATURES, TREASURES, replay, type GameAction, type GameEvent, type GameState } from "@sorcerers-cave/engine";

/** The shape returned by the `game.log` Convex query: initial conditions + the ordered move records.
 *  Self-contained — `replay(game.seed, game.picks, moves.map(m => m.action))` rebuilds the whole game. */
export interface GameLog {
  game: {
    code: string | null;
    seed: number | null;
    picks: number[] | null;
    color: string | null;
    status: string;
    createdAt: number;
  };
  moves: { seq: number; action: GameAction; events: GameEvent[] }[];
}

const CURRENT_VERSION = 1;

const DIR_WORD: Record<number, string> = { 1: "north", 2: "east", 3: "south", 4: "west", 5: "up the stair", 6: "down the stair" };
const dir = (d: number) => DIR_WORD[d] ?? `dir ${d}`;
const creature = (id: number) => CREATURES[id]?.name ?? `creature ${id}`;
const treasure = (id: number) => TREASURES[id]?.name ?? `treasure ${id}`;

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
    case "useArtifact": {
      // Lotus Dust (5) targets a stranger; every other artefact targets a party member.
      const target = a.target === undefined ? ""
        : a.artifact === 5 ? ` on ${s?.strangers[a.target] != null ? creature(s.strangers[a.target]!) : `#${a.target}`}`
        : ` on ${member(a.target)}`;
      return `Use ${treasure(a.artifact)}${target}` + (a.dir !== undefined ? ` (${dir(a.dir)})` : "");
    }
    case "openChest": return "Open the treasure chest";
    default: return (a as { type: string }).type;
  }
}

/** A short human description of one game event. Every event type is covered; anything unmapped falls
 *  back to its raw `type` so the log never silently drops a consequence (it is a debugging record). */
export function describeEvent(e: GameEvent): string {
  switch (e.type) {
    case "moved": return `moved to area ${e.area} (level ${e.level})`;
    case "deadEnd": return `dead end to the ${dir(e.dir)} — bounced back`;
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
    case "treasureReclaimed": return `recovered ${e.count} treasure from the pool`;
    case "artifactUsed": return `used ${treasure(e.artifact)}`;
    case "chestOpened": return `opened the treasure chest (rolled ${e.result})`;
    case "rubyTaken": return "the Lost Ruby was wrested from the statue";
    case "statueAroused": return "the guardian statue struck";
    case "wardedOff": return `the Talisman warded off ${creature(e.creatureId)}`;
    case "ghoulsWarded": return "the Talisman warded off the Ghouls";
    case "medusaAverted": return "the Magic Staff turned Medusa's gaze aside";
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
    default: return (e as { type: string }).type;
  }
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
    "",
  ];
  if (game.seed == null || game.picks == null) {
    lines.push("⚠ This game predates initial-condition logging — it cannot be replayed from scratch.", "");
  }
  // Reconstruct the state BEFORE each move (frame i = state after i actions = before action i) so an
  // action's treasure/member indices resolve to their type names. Only possible for replayable games.
  const frames = game.seed != null && game.picks != null
    ? replay(game.seed, game.picks, moves.map((m) => m.action))
    : null;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]!;
    lines.push(`#${m.seq + 1}  ${actionLabel(m.action, frames?.[i]?.state ?? null)}`);
    for (const ev of m.events) lines.push(`      → ${describeEvent(ev)}`);
  }
  return lines.join("\n") + "\n";
}

/** Render the machine-readable log (for the .json download / offline replay). A superset of the query
 *  result, tagged with a format version so the shape can evolve. */
export function machineLog(log: GameLog): string {
  return JSON.stringify({ version: CURRENT_VERSION, game: log.game, moves: log.moves }, null, 2);
}

/** Trigger a client-side file download of the log in the requested format. */
export function downloadLog(log: GameLog, kind: "human" | "machine"): void {
  const base = log.game.code ?? "game";
  const { text, ext, mime } = kind === "machine"
    ? { text: machineLog(log), ext: "json", mime: "application/json" }
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
