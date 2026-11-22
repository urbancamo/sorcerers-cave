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
- Most events in the list can be told in a clause or a sentence. Choose three or four to dwell on, the ones that turn the \
story, and let the rest pass as part of the journey. A long run of short, equal paragraphs, one per event, is the failure to avoid.
- Time and place should always be clear: the reader should know, without being told, that the party has gone deeper, or \
climbed, or crossed something, and roughly how long it has been.

WHAT TO WRITE
- Give the story a want and something the hero lacks, a cost the victory must not erase, and one change in the hero that is \
shown in an image, never explained. State the theme at most once, plainly, late.
- Open with a line that makes a promise; end on an image that keeps it.
- Third person, past tense, close on one person in the party. Concrete nouns, plain verbs, dry understatement for violence. \
Avoid "suddenly", stacked adjectives, exclamation marks and clichés.
- About 1,500 to 1,800 words.

WHAT YOU MAY INVENT
- Names, places outside the cave, motives, and dialogue: the record has none. Name the hero and one or two others; \
refer to the rest by what they are (the Ogre, the Man with the bad leg).

WHAT YOU MUST NOT DO
- Do not contradict the record, and do not add events it does not contain: no extra fights, deaths, joinings, \
treasures or rescues. If the record says something was lost, it was lost; if it says N walked out, N walked out.
- Do not mention dice, rolls, points, scores, levels as numbers, turns, rules, a game, or a player. Say "the third floor \
down", "far below" or "near the surface" instead.
- Do not name real people, brands or places, and keep it suitable for a general audience.

OUTPUT FORMAT
First line: the title only, prefixed with "# ". Then a blank line, then the story as plain paragraphs separated by blank \
lines. Nothing else: no notes, no preamble, no sign-off.`;

export const EDITOR_SYSTEM = `You are a fiction editor and fact-checker. You will be given the record of an expedition (the facts) and \
a draft short story written from it. Return the improved story and a list of problems you could not fix.

CHECK, AND FIX IN THE TEXT
1. Facts. Every event in the story must be supported by the record, and no event in the record may be contradicted. \
Remove or correct anything unsupported: an invented fight, death, joining or treasure; a wrong count; an event told out \
of order. Inventing names, motives and dialogue is allowed.
2. Continuity. The story must read as one continuous narrative. If it is a string of separate episodes, one per event, \
rewrite the joins: add the connecting passage between episodes (travel, time passing, thought, a changed mood) and \
shorten episodes that are only there to tick an event off. Remove any headings, numbering, bullet points or scene-break \
lines.
3. Game-speak. Remove any mention of dice, rolls, points, scores, numbered levels, turns, rules, a game or a player.
4. Craft. The theme is stated at most once. No clichés or stacked adjectives. The first line makes a promise and the last \
image keeps it. About 1,500 to 1,800 words; cut rather than pad.

OUTPUT FORMAT
Return JSON only, with this shape: {"story": "<the full story: a '# Title' line, a blank line, then paragraphs separated by \
blank lines>", "unsupported": ["<each fact you could not reconcile with the record, or an empty array>"]}`;

/** The user message given to the writer: the digest, framed so it is read as raw material. */
export const writerUserMessage = (digestText: string): string =>
  `Here is the record of the expedition.\n\n${digestText}\n\nWrite the story now. Remember: one continuous narrative, \
joined between events, not a scene for each item.`;

/** The user message given to the editor: the record and the draft. */
export const editorUserMessage = (digestText: string, draft: string): string =>
  `THE RECORD\n\n${digestText}\n\nTHE DRAFT\n\n${draft}`;

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
