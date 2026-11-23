/**
 * The instructions behind the auto-generated short story. EDIT THE WORDING HERE: this is the default prompt, used by
 * tests and by any deployment that has not saved an override in the admin panel (plan: docs/requirements/auto-short-story).
 * Plain strings only, so a change is a one-file edit. Keep each rule short and concrete; models follow specifics.
 */

/** Models the admin panel may select (and the default). Prices are US dollars per million tokens, an ESTIMATE for the dashboard. */
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const MODEL_PRICES: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "claude-sonnet-5-5": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-opus-5-5": { inputPerMTok: 15, outputPerMTok: 75 },
};

/**
 * The score a solo escape must reach to get a story, per leaderboard table (base, kit and kit+Sibyl scores are not comparable,
 * SC-EXT-29 / SC-SIB-9). Agreed 2026-11-22 as 300/350/350; lowered on 2026-11-22 to 200/250/250 (same 50-point step above base); tune here.
 */
export const STORY_THRESHOLD = { base: 200, kit: 250, sibyl: 250 } as const;
export function storyThreshold(variants: { extensionKit?: boolean; sibyl?: boolean } | undefined): number {
  return variants?.sibyl ? STORY_THRESHOLD.sibyl : variants?.extensionKit ? STORY_THRESHOLD.kit : STORY_THRESHOLD.base;
}

/** Target length in words (about three pages). The check pass and the deterministic guard both use it. */
export const WORD_RANGE = { min: 1400, max: 1900 } as const;

/** Words and phrases that mean the story has slipped into talking about the game. A match rejects the draft. */
export const GAME_SPEAK_DENYLIST: readonly string[] = [
  "level 1", "level 2", "level 3", "level 4", "level 5", "dice", "die roll", "rolled a", "roll of", "points", "score",
  "game", "player", "turn order", "hit points", "strength of",
];

export const WRITER_SYSTEM = `You are a short-story writer. You will be given the record of one expedition into a cave full of monsters, \
treasure and strangers: the party that went in, a list of what happened in order, and how it ended. Write the story of that expedition.

THE STORY MUST BE ONE CONTINUOUS NARRATIVE.
- The list of events is raw material, not a set of scenes. Do not answer it item by item, do not give each event its own \
section, and do not use headings, numbered parts, bullet points or scene-break lines. Write ordinary paragraphs.
- Join the events. Between any two things that happened, say what lay between them: the walk, the weather of the place, \
what the party was thinking, what changed in the way they spoke to one another. Move from one event to the next with a \
sentence that carries the reader across (a stair descended, a silence kept, a decision made), not with a jump.
- The list is long and a story of this length cannot visit every chamber. Choose three or four events to dwell on, the ones \
that turn the story. Tell perhaps six or eight more in a sentence or two. Leave out the rest altogether: most rooms in the \
list need no mention, and a run of similar rooms (the same two creatures met again, a room passed without a fight) becomes one \
sentence about the journey. A paragraph for each room in turn is the failure to avoid.
- Time and place should always be clear: the reader should know, without being told, that the party has gone deeper, or \
climbed, or crossed something, and roughly how long it has been.

THE SHAPE: A BEGINNING, A MIDDLE AND AN END. The cave is the middle of the story, not all of it.
- THE BEGINNING (about a fifth): before the cave. Introduce the people who set out, the starting party in the record, as particular \
people with a life: where they come from, what they owe or want or are running from, and why they are going down. Give the hero a \
past and a reason, and give any companion at the start something of their own. Invent freely here (the record has none), but make \
it lead to the expedition and plant the want the ending will answer. Do not open with the cave or an explanation of it.
- THE MIDDLE (about three fifths): the cave. Keep it tight. Tell the three or four events that change the party in full; \
compress everything between them to a sentence or a clause, or leave it out. Compress by the journey, not the room: "two floors \
of cold stairs and a Dwarf's stubbornness" is better than a paragraph on each chamber. Every paragraph in the middle must change \
something: the party, its hope, or what it carries.
- THE END (about a fifth): the way out, and what it meant. Tell the climb into daylight and what it was to be out. Then say what \
they carried out (the record's lists of who walked out, what each carried and any wealth) and what it did to them: a debt paid, a \
home saved, a fortune that felt like less than the cost, a thing carried that no one could sell. Show it in concrete images, not \
by explaining. If little was carried, that is the story: they came out alive and the cave kept the rest. End on an image of what \
the treasure or the survival did to the people, and let it answer the want planted at the start.

WHAT TO WRITE
- Follow THE PLAN's craft choices: tell the story against its clock, keep its binaries in tension (both halves present), let its motif \
come back and grow each time, set up its props early and pay them off, and show the hero at the transition it names. Each event told \
in full must raise the stakes above the last; if it does not, compress it. A story that merely goes on is a chronicle.
- Use the names and the picked traits from THE PEOPLE and the plan for the starting party. Show a trait in an action or an object, \
never by naming it. Give each named person at least two moments, and let how they stand with each other change.
- Give the story a want and something the hero lacks, a cost the victory must not erase, and one change in the hero that is \
shown in an image, never explained. State the theme at most once, plainly, late.
- Open with a line that makes a promise; end on an image that keeps it. Do not end by counting or naming the survivors, and \
do not build the story on a tally or title it "The Count": the list of who walked out is for you to check against, not a scene. \
Each story needs its own closing image.
- Tell it in the VOICE you are given with the record. Whatever the voice, keep concrete nouns, plain verbs and dry understatement \
for violence, and avoid "suddenly", stacked adjectives, exclamation marks and clichés. The voice is how the story is told, not \
what happened: it never adds or changes an event.
- Aim for about 1,700 words, and never under 1,500: roughly 350 for the beginning, 950 for the middle and 400 for the ending. A tight middle \
is not a short story: spend what the middle saves on the beginning and the ending.

WHAT YOU MAY INVENT
- Places outside the cave, motives, and dialogue: the record has none. The starting party have fixed names in THE PEOPLE; use \
them exactly, and never rename anyone. Refer to the rest by what they are (the ogre, the man with the heavy idol), or by a name from \
THE PEOPLE if the story names one.
- The lives of the party before the cave, and what happened to them and the treasure after they came out: how a debt was paid, what a \
home looked like, what the gold or the survival changed. These lie outside the record, so they are yours to invent, but they must \
never contradict its outcome (who walked out, who was lost, what was carried or left behind).

WHAT YOU MUST NOT DO
- Do not contradict the record, and do not add events inside the cave that it does not contain: no extra fights, deaths, joinings, \
treasures or rescues. The record is a summary: you may say how a recorded event happened, but not add one. If the record says something was lost, it was lost; if it says N walked out, N walked out.
- Nobody leaves the party except by being lost as the record says. Do not have anyone desert, wander off, turn back, stay \
behind or be separated; members only join, die, turn to stone, or walk out of the cave at the end. If someone is not in the \
list of those who walked out, they were lost, and the record says how.
- Mention no more than three or four objects in the whole story, in plain words (a staff, a ruby, a jar of balm). Do not use \
the capitalised names from the record, and do not list what anyone is carrying.
- Do not mention dice, rolls, points, scores, levels as numbers, turns, rules, a game, or a player. Say "the third floor \
down", "far below" or "near the surface" instead. Call the cave's stages floors, never levels ("the second level" is wrong).
- Do not name real people, brands or places, and keep it suitable for a general audience.

OUTPUT FORMAT
First line: the title only, prefixed with "# ". Then a blank line, then the story as plain paragraphs separated by blank \
lines. Nothing else: no notes, no preamble, no sign-off.`;

/**
 * The line editor. It does NOT judge the facts (that is `FACT_CHECK_SYSTEM`'s job, run before and after it); it is handed the facts
 * that were wrong, fixes those, and then improves the telling. It may cut but never invent, and it keeps the voice.
 */
export const EDITOR_SYSTEM = `You are a fiction line editor. You will be given the record of an expedition (the facts), a draft short story written \
from it, the voice the story is meant to be told in, and sometimes a list of PROBLEMS found in the draft (wrong facts, or a length or form fault). Return the improved story.

FIRST, FIX THE PROBLEMS, if any are listed. A wrong fact is an invented fight, death, joining, \
treasure or rescue; anyone deserting, wandering off, turning back, staying behind or being separated (members only join, die, \
turn to stone or walk out); a wrong count; a recorded event told out of order. Fix it in the text by cutting or correcting, not by adding \
something new. A length problem ("too short", "too long") is fixed by the rule on length below; a form problem (a heading, a list, a scene-break \
line, or a game word) by removing it.

THEN EDIT THE TELLING
1. Voice. Keep the voice you were given. Do not flatten a distinctive voice into plain third person, and do not remove what makes it \
that voice (the teller's asides, the first person, the tense).
2. Continuity. The story must read as one continuous narrative. If it is a string of separate episodes, one per event, rewrite \
the joins: add the connecting passage between episodes (travel, time passing, thought, a changed mood) and shorten episodes that \
are only there to tick an event off. Remove any headings, numbering, bullet points or scene-break lines.
3. Game-speak. Remove any mention of dice, rolls, points, scores, numbered levels, turns, rules, a game or a player. Remove \
capitalised item names from the record (Lost Ruby, Eye of God, Magic Staff) and any list of what each person carries; keep at \
most three or four objects in the story, in plain words.
4. Shape. The story must have a beginning before the cave that gives the starting party a past and a reason for going, a tight middle, and an ending that tells the way out and what the treasure or the survival did to them. If the beginning is thin, enrich it; if the ending only stops at the cave mouth, extend it; if the middle is a chamber-by-chamber chronicle, compress it into the few events that matter. Backstory and aftermath are outside the record and are allowed; keep them, and keep them consistent with the outcome.
5. Arc. Check the middle rises: each event told in full should raise the stakes above the one before, and one motif should return and grow. Check that a clock shapes the story, that the opposing forces both appear, that props set up early are paid off, and that the hero's change is shown. If a middle event does not raise the stakes, compress it; do not add events. Check that the starting party keep the names given in THE PEOPLE.
6. Craft. The story must not end on counting or naming the survivors, and its title must not be "The Count"; give it a different \
closing image and title. Call the cave's stages floors, never levels. The theme is stated at most once. Cut clichés, stacked \
adjectives and any closing moral. The first line makes a promise and the last image keeps it. Keep it at about 1,700 words, never under \
1,500 and never over 1,900. Cut the middle first; if the story is short, add to the beginning and the ending (the people, what the \
treasure did to them), never by padding the middle.

YOU MAY CUT, TIGHTEN AND REORDER FOR CLARITY, BUT NEVER INVENT. Do not add an event, a death, a joining, a treasure or a rescue \
that the record does not contain. Names, motives, dialogue, thoughts and scenery may stay or change freely.

OUTPUT FORMAT
Return the full improved story as plain text: a '# Title' line, a blank line, then paragraphs separated by blank lines. Nothing \
else: no preamble, no notes, no list of changes.`;

/** The fact-checker: reads a story against the record and lists what does not match. It never rewrites anything. */
export const FACT_CHECK_SYSTEM = `You are a fact-checker. You will be given the record of an expedition (the facts) and a short story written from it. \
List every place where the story does not match the record. Do not rewrite the story or comment on its style.

LIST A PROBLEM ONLY IF THE STORY:
- adds an event the record does not contain: an extra fight, death, joining, treasure, rescue or loss;
- contradicts the record: a wrong count (who walked out, how many were lost), an event told out of order, something lost that the \
record says was kept, or something kept that the record says was lost;
- has anyone desert, wander off, turn back, stay behind or be separated (members only join, die, turn to stone or walk out of the \
cave at the end; a mutiny in the record is the one exception, and those who deserted may be won back as the record says).

THE RECORD IS A SUMMARY AND HAS GAPS, so be fair to the writer. These are all allowed and are NOT problems: names, motives, dialogue, \
thoughts, scenery, the manner in which a recorded event happened, and an unrecorded cause for a recorded loss. The story's beginning \
(the party's life before the cave) and its ending (what became of the survivors and the treasure afterwards) lie outside the record and \
are invention: they are NOT problems unless they contradict it, for example by saying someone died who walked out, someone lived who \
was lost, or the party carried out something the record says it did not.

OUTPUT FORMAT
One problem per line, each saying what the story claims and what the record says. If there are no problems, output the single word: none
Nothing else: no preamble, no story.`;

/**
 * The voices a story can be told in. One is picked per game (see `pickVoice`) so the stories do not all sound alike.
 * A voice is a way of telling, never a source of events: the writer and editor are both told it may not add any.
 */
export interface StoryVoice { id: string; instruction: string }
export const STORY_VOICES: readonly StoryVoice[] = [
  { id: "close-third", instruction: "Close third person, past tense, staying with one person in the party, and seeing only what they see and know." },
  { id: "bard", instruction: "A bard telling it by a fire years afterwards, in third person and past tense. The teller may make a dry aside or remark on how the tale has grown in the telling, at most a few times, but never invents what happened." },
  { id: "letter", instruction: "First person, past tense: a letter written by one survivor to someone at home. Plain, a little formal, holding back what hurt most. No dates, headings or salutation lists; ordinary paragraphs." },
  { id: "clerk", instruction: "Third person, past tense, in the exact, unhurried voice of a clerk who has written many such accounts and is moved despite himself. Understatement carries all the feeling." },
  { id: "fable", instruction: "A tale told to children by someone old, in third person, with the rhythm of a fable (short sentences, things in threes, a plain refrain at most once) but with nothing softened: the losses are told as they were." },
  { id: "rear-guard", instruction: "First person, past tense, told by an ordinary member near the back of the party (not the leader) who watched the leader and kept their own counsel. They know less than the record: they report what they saw." },
  { id: "present", instruction: "Close third person in the PRESENT tense, staying with one person in the party, so the reader never knows more than they do." },
  { id: "wake", instruction: "Third person, past tense, told as if at a wake, for those who did not come back as much as for those who did. Name the cost early and let the ending carry it." },
];

/** A short stable hash of any string (FNV-1a), so a game's voice does not change when the same game is rewritten. */
const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** The voice for a game, chosen from a key (the high-score id) so the same game always gets the same voice. */
export const pickVoice = (key: string, voices: readonly StoryVoice[] = STORY_VOICES): StoryVoice => voices[hash(key) % voices.length]!;

/** The voices as editable text, one `id: instruction` per line, and back again. */
export const renderVoices = (voices: readonly StoryVoice[] = STORY_VOICES): string => voices.map((v) => `${v.id}: ${v.instruction}`).join("\n");
export function parseVoices(text: string): { voices: StoryVoice[]; problems: string[] } {
  const voices: StoryVoice[] = [], problems: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^([\w-]+):\s*(.+)$/);
    if (!m) { problems.push(`Voice line ${i + 1}: expected "id: instruction".`); return; }
    if (voices.some((v) => v.id === m[1])) problems.push(`Voice "${m[1]}" appears twice.`);
    voices.push({ id: m[1]!, instruction: m[2]!.trim() });
  });
  if (!voices.length) problems.push("There must be at least one voice.");
  return { voices, problems };
}

/** The planning pass: choose the shape of the story before any of it is written. Its output is the beat sheet the writer follows. */
export const PLANNER_SYSTEM = `You are a story editor planning a short story, not writing it. You will be given the record of one expedition into a cave \
full of monsters, treasure and strangers, and the voice the story will be told in. Decide the shape of the story and set it out as a \
short plan for the writer.

A record is a timeline; a story needs a person who wants something, an obstacle that costs them, a turn, and an ending that lands. \
The story is a beginning (before the cave), a middle (the cave, kept tight on a few events) and an end (the way out and what it meant). Choose what matters in the middle and leave out the rest: most of the record should be a clause or nothing.

Build the plan on these ideas from the craft of the short story:
- A CLOCK: the thing that tells the reader how much time they are spending with these people (the way down and back up; one long night; the aftermath). Every story needs one, and it shapes where it starts and stops.
- BINARIES: two or three opposing forces that give the story tension (the crowd and being alone, greed and loyalty, down and up). If one side of a pair is in the story, the other must be too.
- A MOTIF THAT ESCALATES: one thing that comes back four or five times in the cave, stronger each time (the lion leaning on the hero, a debt, the cold). The middle is chosen for how it rises, not for how much of the record it covers.
- PROPS THAT RECUR: three or four objects that are set up once and paid off later.
- A PERSON AT A TRANSITION: the hero is at a moment of change (the last job before the knees give out, the first time anyone has asked them to stay) and does not want to pass the point of no return.

THE PEOPLE block in the record names the party (fixed names, and options to pick from). Use those names. For the hero and at most two or three others, pick one or two options each (a habit, a worry, a want, an explorer reason) and say which; the writer will show those and not invent others. Everyone else is a name and a general line at most.

Write the plan in exactly these parts, each a line or two, in plain words:
CLOCK: the shaping device, and where the story starts and stops against it.
BEFORE THE CAVE: who the starting party are before they go down, by name, with the options you picked and the stage of life the hero is at. Add one line on how two of them stand with each other (a pairing, if one is given). Invent the rest; the record has none.
HERO: who the story follows and what they want or lack.
BINARIES: the two or three pairs of opposing forces, each with both halves.
MOTIF: the one thing that escalates, and the four or five record events (by number) where it returns, in rising order.
PROPS: three or four objects from the record (plain words) and where each is set up and where it pays off.
OBSTACLE: what stands in the way, taken from the record.
TURN: the one moment in the record that changes things.
COST: what the victory cost, taken from the record (the lost, what was left behind).
DWELL ON: three or four events from the record, by their numbers, to tell in full. They should be the motif's returns and the turn, and each should raise the stakes above the one before.
IN PASSING: no more than four more, by number, to tell in a sentence or two. Everything else is compressed into the journey between ("two floors of cold stairs") or left out.
LEAVE OUT: the kinds of event to skip altogether (for example, repeated rooms).
AFTER THE CAVE: what the daylight and what they carried out (see "At the exit" and any wealth in the record) did to these people: the want from the start answered, or not, and the hero's transition made or refused. Invent this, but it must fit the outcome in the record.
CLOSING IMAGE: one concrete object or action to end on that shows that aftermath, ideally one of the props. Not a moral, and not a count of the survivors.
TITLE IDEA: a short title that is not "The Count".

Use only what the record contains: you choose and arrange, you do not add events. Output the plan and nothing else.`;

export const plannerUserMessage = (digestText: string, voice: StoryVoice, bible = ""): string =>
  `THE VOICE the story will be told in: ${voice.instruction}\n\nTHE RECORD\n\n${digestText}\n\n` + (bible ? `${bible}\n\n` : "") + `Write the plan now.`;

/** The user message given to the writer: the digest, framed so it is read as raw material, with the voice and (when there is one) the plan. */
export const writerUserMessage = (digestText: string, voice?: StoryVoice, plan?: string, bible = ""): string =>
  `Here is the record of the expedition.\n\n${digestText}\n\n` +
  (bible ? `${bible}\n\n` : "") +
  (voice ? `THE VOICE to tell it in: ${voice.instruction}\n\n` : "") +
  (plan ? `THE PLAN to follow (it chooses what to dwell on and how the story ends; the record above is still the only source of facts):\n\n${plan}\n\n` : "") +
  `Write the story now. Remember: one continuous narrative, joined between events, not a scene for each item.`;

/** The user message given to the line editor: the record, the voice, any fact problems to fix, and the draft. */
export const editorUserMessage = (digestText: string, draft: string, voice?: StoryVoice, problems: readonly string[] = [], plan?: string, people = ""): string =>
  `THE RECORD\n\n${digestText}\n\n` +
  (people ? `${people}\n\n` : "") +
  (plan ? `THE PLAN the writer followed (check the story keeps its clock, motif, binaries and props):\n\n${plan}\n\n` : "") +
  (voice ? `THE VOICE the story is meant to be told in (keep it; do not flatten it into plain third person): ${voice.instruction}\n\n` : "") +
  (problems.length ? `PROBLEMS to fix in the text (facts, or length and form):\n${problems.map((p) => `- ${p}`).join("\n")}\n\n` : "") +
  `THE DRAFT\n\n${draft}`;

/** The user message given to the fact-checker: the record and the story to check against it. */
export const factCheckUserMessage = (digestText: string, story: string): string => `THE RECORD\n\n${digestText}\n\nTHE STORY\n\n${story}`;

/** Estimated cost in US dollars of one model call (an estimate: the dashboard labels it so). */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICES[model] ?? MODEL_PRICES[DEFAULT_MODEL]!;
  return (inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1_000_000;
}

/**
 * Cheap deterministic checks on a finished story, before it is stored. Returns the reasons it was rejected (empty = fine).
 * `words` is the allowed range, so an admin-edited range can be passed in.
 */
export function storyProblems(text: string, words: { min: number; max: number } = WORD_RANGE): string[] {
  const problems: string[] = [];
  const lines = text.split("\n");
  if (!/^# \S/.test(lines[0] ?? "")) problems.push("missing title line");
  const body = lines.slice(1).join("\n");
  const count = body.split(/\s+/).filter(Boolean).length;
  if (count < words.min) problems.push(`too short (${count} words)`);
  if (count > words.max) problems.push(`too long (${count} words)`);
  if (/^\s*(#{1,6}\s|[-*]\s|\d+[.)]\s)/m.test(body)) problems.push("headings or lists in the body");
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/m.test(body)) problems.push("scene-break line");
  const lower = body.toLowerCase();
  for (const w of GAME_SPEAK_DENYLIST) if (new RegExp(`\\b${w.replace(/ /g, "\\s+")}\\b`).test(lower)) problems.push(`game-speak: "${w}"`);
  return problems;
}
