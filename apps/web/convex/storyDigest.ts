import {
  ALL_TREASURES, CREATURES, HAZARD_NAMES, scoreGame,
  SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_CHASM, SPECIAL_WHIRLPOOL, SPECIAL_TOMB, SPECIAL_GREAT_HALL, SPECIAL_BELL_ROPE,
  SPECIAL_LAIR, SPECIAL_GALLERY, SPECIAL_WELL, SPECIAL_GATEWAY,
  type GameEvent, type ReplayFrame,
} from "@sorcerers-cave/engine";
import { deepestLevel } from "./highScores";

/**
 * The facts of a finished game, reduced to what a short story must respect. The story writer is given ONLY this
 * (never the raw log), so it can invent names, motives and dialogue but has nothing to contradict. Pure: replay
 * frames in, plain data out. Wording is deliberately plain English: no dice, levels-as-rules or point jargon beyond
 * the numbers the story may want (depth, the count at the exit).
 */
export interface StoryBeat {
  /** Position in the run (action number), so the order is unambiguous. */
  n: number;
  /** The cave level the party was on (1 is the top, by the entrance). */
  level: number;
  /** How much the beat matters to a story: 3 = a turning point, 2 = a notable scene, 1 = colour. */
  weight: 1 | 2 | 3;
  text: string;
}

export interface StoryDigest {
  startingParty: string[];
  outcome: {
    score: number;
    turns: number;
    deepestLevel: number;
    roomsMapped: number;
    membersLost: number;
    /** Who was lost along the way, and how ("a Dwarf (turned to stone)"). */
    lost: string[];
    /** How many chamber visits were left out because the party had passed an identical one before. */
    repeatedChambers: number;
    /** Who walked out and what the notable ones carried. */
    exitParty: string[];
    exitCount: number;
  };
  beats: StoryBeat[];
}

const MAX_BEATS = 60;

const SPECIAL_NAMES: Record<number, string> = {
  [SPECIAL_GATEWAY]: "a gateway", [SPECIAL_DEEP_POOL]: "a deep pool", [SPECIAL_VIPER_PIT]: "a pit of vipers", [SPECIAL_TOMB]: "a tomb",
  [SPECIAL_GREAT_HALL]: "a great hall", [SPECIAL_CHASM]: "a chasm", [SPECIAL_BELL_ROPE]: "a bell rope", [SPECIAL_LAIR]: "a lair",
  [SPECIAL_WHIRLPOOL]: "a whirlpool", [SPECIAL_GALLERY]: "a gallery of statues", [SPECIAL_WELL]: "a well",
};

const creature = (id: number): string => CREATURES[id]?.name ?? "someone";
const treasure = (id: number): string => ALL_TREASURES.find((t) => t.id === id)?.name ?? "a treasure";
const list = (xs: string[]): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const article = (w: string): string => (/^[AEIOU]/.test(w) ? "an" : "a");
const counted = (names: string[]): string => {
  const n = new Map<string, number>();
  for (const x of names) n.set(x, (n.get(x) ?? 0) + 1);
  return list([...n].map(([k, c]) => (c > 1 ? `${c} ${k}s` : `${article(k)} ${k}`)));
};

export function storyDigest(frames: readonly ReplayFrame[]): StoryDigest {
  const first = frames[0]!.state, last = frames[frames.length - 1]!.state;
  const beats: StoryBeat[] = [];
  let level = 1;
  let here: { strangers: string[]; treasures: string[]; hazards: string[] } = { strangers: [], treasures: [], hazards: [] };
  let fight: { foes: string[]; killed: string[]; start: number } | null = null;
  let prevParty = first.party.map((m) => m.status);

  const add = (n: number, weight: 1 | 2 | 3, text: string) => beats.push({ n, level, weight, text });

  for (const f of frames) {
    for (const e of f.events as GameEvent[]) {
      switch (e.type) {
        case "moved":
          if (e.level !== level) {
            add(f.seq, 2, e.level > level ? `The party went down to level ${e.level}.` : `The party climbed up to level ${e.level}.`);
            level = e.level;
          }
          break;
        case "trapSprung":
          add(f.seq, 3, `A trap sprang and the party fell to level ${e.level}${e.guideLost ? ", losing the guide who knew the way" : ""}.`);
          level = e.level;
          break;
        case "partyTeleported": level = e.level; add(f.seq, 2, `The party was carried to level ${e.level}.`); break;
        case "drewChamber": {
          here = { strangers: e.strangers.map(creature), treasures: e.treasures.map(treasure), hazards: e.hazards.map((h) => HAZARD_NAMES[h] ?? "a hazard") };
          const bits = [
            here.strangers.length ? `with ${counted(here.strangers)}` : "",
            here.treasures.length ? `holding ${list(here.treasures)}` : "",
            here.hazards.length ? `and a danger (${list(here.hazards.map((h) => h.toLowerCase()))})` : "",
          ].filter(Boolean);
          if (bits.length) add(f.seq, here.strangers.length || here.hazards.length ? 2 : 1, `A chamber ${bits.join(" ")}.`);
          break;
        }
        case "enteredSpecial": add(f.seq, 2, `The party came to ${SPECIAL_NAMES[e.special] ?? "a strange place"}.`); break;
        case "crossedSpecial": add(f.seq, 2, `They crossed ${SPECIAL_NAMES[e.special] ?? "it"}.`); break;
        case "reaction":
          add(f.seq, e.outcome === "friendly" ? 2 : 1, `Their reaction${here.strangers.length ? ` (${counted(here.strangers)})` : ""}: ${e.outcome}.`);
          break;
        case "fightStarted": fight = { foes: here.strangers.slice(), killed: [], start: f.seq }; break;
        case "strangerKilled": fight?.killed.push(creature(e.creatureId)); if (!fight) add(f.seq, 1, `A ${creature(e.creatureId)} was killed.`); break;
        case "fightWon":
          if (fight) {
            add(fight.start, 2, `A fight against ${counted(fight.foes) || "strangers"} was won${fight.killed.length ? ` (${counted(fight.killed)} slain)` : ""}.`);
            fight = null;
          }
          break;
        case "mutinied": add(f.seq, 3, `A mutiny: ${counted(e.deserters.map(() => "member"))} deserted and dropped what they carried.`); break;
        case "desertionRoll": if (e.deserted) add(f.seq, 3, `${creature(e.creatureId)} deserted the party.`); break;
        case "eyeForsaken": add(f.seq, 2, "The Eye of God was left behind."); break;
        case "viperPit": case "vipersLulled": add(f.seq, 3, e.type === "vipersLulled" ? "The vipers were lulled to sleep (with the Charmed Flute) and the party crossed." : "The party faced the vipers."); break;
        case "medusaGaze": add(f.seq, 2, "Medusa's gaze fell on the party."); break;
        case "medusaAverted": add(f.seq, 3, e.by === "eye" ? "Medusa's gaze was turned aside by the Eye of God." : "Medusa's gaze was turned aside."); break;
        case "ghoulsAttack": add(f.seq, 2, `${e.count} ghouls attacked.`); break;
        case "artifactUsed": add(f.seq, 1, `The party used the ${treasure(e.artifact)}.`); break;
        case "carpetUsed": add(f.seq, 2, "The Magic Carpet carried the party up a stair."); break;
        case "chestOpened":
          add(f.seq, 2, e.result === 1 ? "A treasure chest was opened: a curse fell." : e.result === 2 ? "A treasure chest was opened: a Spectre burst out." : e.result === 3 ? "A treasure chest was opened: only sand." : `A treasure chest was opened: it held ${["Silver", "Gold", "Gems"][e.result - 4]}.`);
          break;
        case "sorcererSlain": add(f.seq, 3, "The Sorcerer was slain."); break;
        case "rubyTaken": add(f.seq, 3, "The Lost Ruby was taken."); break;
        case "statueAroused": add(f.seq, 2, "The statue guarding the Ruby came alive and was wrestled."); break;
        case "dragonSlain": add(f.seq, 3, `A Dragon was slain by ${creature(e.creatureId)}.`); break;
        case "leaderChosen": add(f.seq, 1, `${creature(e.creatureId)} became the party's leader.`); break;
        case "unicornJoins": add(f.seq, 3, "A Unicorn joined the party."); break;
        case "sibylJoins": add(f.seq, 3, "The Sibyl joined the party."); break;
        default: break;
      }
    }
    // Losses come from the roster, not the events: it names exactly who was turned to stone or killed, however it happened.
    // What the frame itself says about how a loss came about, so the writer need not guess.
    const evs = f.events as GameEvent[];
    const cause = evs.some((e) => e.type === "medusaGaze") ? " by Medusa's gaze"
      : evs.some((e) => e.type === "viperPit") ? " in the pit of vipers"
      : fight || evs.some((e) => e.type === "fightStarted" || e.type === "strangerKilled" || e.type === "fightWon") ? ` in the fight against ${counted(here.strangers) || "strangers"}`
      : "";
    const joined: string[] = [];
    f.state.party.forEach((m, i) => {
      const before = prevParty[i];
      if (before === undefined) { joined.push(creature(m.creatureId)); return; } // appended to the roster: a new member
      if (before < 2 && m.status >= 2) add(f.seq, 3, `${creature(m.creatureId)} ${m.status === 2 ? "was turned to stone" : "was killed"}${cause}.`);
      else if (before === 2 && m.status < 2) add(f.seq, 3, `${creature(m.creatureId)} was brought back from stone.`);
    });
    if (joined.length) add(f.seq, 2, `${counted(joined)} joined the party.`);
    prevParty = f.state.party.map((m) => m.status);
  }

  // Passing the same room again is common; say it once, not eight times. Only the plainest repeats (weight 1) are dropped.
  const seen = new Set<string>();
  let repeated = 0;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i]!;
    if (b.weight === 1 && /^A chamber/.test(b.text)) {
      if (seen.has(b.text)) { beats.splice(i--, 1); repeated++; } else seen.add(b.text);
    }
  }

  // A fight's beat is stamped with the action it began on, so it can be emitted after later beats: put the run in order first
  // (Array.sort is stable, so beats from one action keep their emitted order).
  beats.sort((x, y) => x.n - y.n);

  // Keep the arc: the heaviest beats (earliest first among equals), restoring story order.
  const kept = beats.length <= MAX_BEATS
    ? beats
    : [...beats.keys()]
      .sort((a, b) => beats[b]!.weight - beats[a]!.weight || a - b)
      .slice(0, MAX_BEATS)
      .sort((a, b) => a - b)
      .map((i) => beats[i]!);

  const alive = last.party.filter((m) => m.status === 0 || m.status === 1); // 0 original, 1 ally; 2 stone and 3 dead are lost
  return {
    startingParty: first.party.map((m) => creature(m.creatureId)),
    outcome: {
      score: scoreGame(last),
      turns: last.turn,
      deepestLevel: deepestLevel(last),
      roomsMapped: last.areas.length,
      membersLost: last.party.filter((m) => m.status >= 2).length,
      // Only those still lost at the end: a member turned to stone and later restored is not lost.
      lost: last.party.filter((m) => m.status >= 2).map((m) => `${article(creature(m.creatureId))} ${creature(m.creatureId)} (${m.status === 2 ? "turned to stone" : "killed"})`),
      repeatedChambers: repeated,
      exitParty: alive.map((m) => creature(m.creatureId) + (m.treasure.some((t) => t >= 3) ? ` (carrying ${list(m.treasure.filter((t) => t >= 3).map(treasure))})` : "")),
      exitCount: alive.length,
    },
    beats: kept,
  };
}

/** The digest as the plain text the writer is given. */
export function digestText(d: StoryDigest): string {
  return [
    `Starting party: ${list(d.startingParty)}.`,
    `Outcome: escaped the cave with ${d.outcome.exitCount} living members; deepest level reached ${d.outcome.deepestLevel}; ${d.outcome.membersLost} lost along the way${d.outcome.lost.length ? ` (${d.outcome.lost.join(", ")})` : ""}.`,
    `At the exit: ${d.outcome.exitParty.join("; ")}.`,
    ...(d.outcome.repeatedChambers ? [`The party passed through some rooms more than once (${d.outcome.repeatedChambers} repeat visits are left out below).`] : []),
    "",
    "What happened, in order:",
    ...d.beats.map((b, i) => `${i + 1}. [level ${b.level}] ${b.text}`),
  ].join("\n");
}
