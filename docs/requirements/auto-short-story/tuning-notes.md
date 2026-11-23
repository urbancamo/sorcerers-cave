# Prompt tuning notes (2026-11-22)

Step 7 of the plan: write stories for five stored games of different shapes, read them against their records, and tune.
Games (all still replay to an escape): B025 (base, lone priest, two lost), B013 (base, 331 turns, no losses), K011 (kit, three
turned to stone), K006 (kit, 19 at the exit) and S012 (kit + Sibyl, 544-turn run, 12 walk out). Real API calls, about $2.87 in
total over four rounds (about $0.18 a story; a fact-check retry costs about $0.2 more).

## Digest bugs found (fixed, tested)

- **Kit and Sibyl creatures were named "someone".** `storyDigest.ts` looked names up in `CREATURES` (base only); the kit and Sibyl
  creatures (ids 14+) are only in `ALL_CREATURES`. Every kit/Sibyl story was affected ("Starting party: someone").
- **A long game's cap dropped joinings.** Joinings had weight 2 and the 60-beat cap keeps the earliest among equals, so late
  joinings vanished; the writer then met members at the exit that nobody had joined, and the editor (rightly) failed the story as
  "unsupported facts". Joinings are now weight 3, like losses; a test pins this on S012.

## Prompt changes (writer and editor)

| Finding | Change |
|---|---|
| Invented departures (someone "walks off", is "left behind") that the record does not contain; the editor let them through | Members only join, die, turn to stone or walk out; the writer is told so and the editor lists a departure as unsupported |
| A paragraph per room: the middle of the story was a procession of chambers | Dwell on three or four events, tell six or eight in a sentence or two, leave out the rest; similar rooms collapse into one sentence |
| Item names ("Lost Ruby", "Eye of God", lists of what each person carries) read like an inventory | At most three or four objects, in plain words, no capitalised record names |
| Every story ended with the hero counting the survivors at the cave mouth; two were titled "The Count" | No tally ending, no "The Count" title, each story its own closing image |
| "the second level" / "fourth level" in the prose | Floors, never levels |

After the changes: the next round passed the fact-check on all five (S012 after the digest fix), with none of the above patterns.

## Notes for later

- The source defaults are still "version 0", so existing version-0 stories are not "older" for the Rewrites tab's older-prompt
  scope. To refresh one (such as the first real story), rewrite it by game code or choose "Every story". Saving the prompt in the
  admin makes version 1 and then "older" works as intended.
- Still to watch: the length (1,400 to 1,650 words, inside the range but under the three pages the prompt aims for), and the
  editor's strictness on invented causes (it caught one real invention, and one false alarm on S012 caused by the digest bug).

## Digest rework (2026-11-22, branch digest-improvements)

Found by reading the digest of a 320-point kit game. Changes in `storyDigest.ts`:

- **Cap 60 to 150.** The writer prompt already tells it to choose three or four events to dwell on, so the digest keeps nearly everything; the old cap dropped beats by weight and cut the middle of long games.
- **Floors, not levels.** Beats sit under `Floor N` headings shown when the floor changes, the route is stated up front, and "level" no longer appears (the prompt forbids numbered levels).
- **Meetings are one beat.** Chamber, reaction and joining merge ("A chamber with a Lion holding Magic Sword: friendly. A Lion joined the party."); a run of reaction rolls keeps the last.
- **Mutiny.** Deserters are named; members who come back are reported as having come back, not as new recruits. The roster shift a mutiny causes no longer risks a false "turned to stone" beat.
- **Artefacts taken** get a beat ("The Eye of God was taken."); kit hazards are named (`ALL_HAZARD_NAMES`); an identical chamber twice in a row is one beat.
- Not done: weights are not shown to the writer (joinings are weight 3 for correctness, so they would mislead as "turning points").

The five-game prompt comparison has NOT been re-run against this digest yet (costs about $2-3).

## Voice per story and a planning pass (2026-11-22, branch digest-improvements)

From a second opinion on the craft of the prompts (selection, a spine, varied voice, a planner separate from the writer).

- **Voice.** `STORY_VOICES` in `storyPrompt.ts` (close third, bard, letter, clerk, fable, rear-guard, present tense, wake). `pickVoice(highScoreId)` is a stable hash, so a rewrite of the same game keeps its voice. The voice is in the user messages of the planner, the writer and the editor (the editor is told to keep it), and the writer prompt's fixed "third person, past tense" line now defers to it. A voice never adds events.
- **Planner.** `PLANNER_SYSTEM`: a first call that reads the digest and returns a beat sheet (HERO, OBSTACLE, TURN, COST, DWELL ON, IN PASSING, LEAVE OUT, CLOSING IMAGE, TITLE IDEA). The writer drafts from it; the editor still checks against the record, not the plan. If the planner call fails the story is written without a plan. Recorded as a `plan` run, so the admin cost tile shows plan/write/check.
- The planner prompt lives in code, not in the admin's prompt versions, and uses the saved prompt's model.
- Not yet done: splitting the editor into a fact-check and a line edit; a story bible; exemplar stories. NOT yet compared on the five stored games (about $3 with the extra call).

## The editor split (2026-11-22, branch digest-improvements)

One editor was fact-checking, fixing continuity, stripping game-speak and doing craft in a single call, which tends to make it cautious and flatten the prose.

- **Fact-check** (`FACT_CHECK_SYSTEM`, in code): reads the story against the record and lists problems, one per line, or `none`. It never rewrites. It is lenient about names, motives, dialogue and scenery, and strict about added events, wrong counts and anyone leaving the party.
- **Line edit** (`EDITOR_SYSTEM`, the admin-editable "editor prompt"): given the record, the voice, any fact problems and the draft, it fixes the problems by cutting or correcting, then improves the telling. It may cut, never invent, and must keep the voice. Returns only the story. An old-format reply with an `=== UNSUPPORTED ===` tail is tolerated.
- **Flow:** plan, write, check, edit, check (the final text is always fact-checked, since an edit can add a fact); one more edit and check if problems remain; then the deterministic guard. Up to seven calls; a clean run is five, about $0.25 a story (was about $0.10).
- Runs are recorded by pass: plan, write, check, edit.
- Still to do: a story bible and exemplar stories (both need input on how the cave should sound). Nothing here has been compared on the five stored games yet.

## The story bible (2026-11-22, branch digest-improvements)

`apps/web/convex/storyBible.ts`: a header (the cave and how to use the entries) plus fiction-facing entries for every creature, artefact and a set of places and perils. No statistics or rules. `bibleFor(digestText)` gives the model only the entries whose names appear in that game's digest (about 1,200 words for a big party), to the planner and the writer, not to the fact-checker or the line editor.

- Each entry is colour for an event the record contains, never a source of events (the header says so). Artefact entries say what to call the object in plain words, which keeps the "no capitalised names" rule.
- The digest's own names are handled: "W-Hero" is told to be written as "the heroine"; Hero is not matched inside W-Hero; plurals ("2 Dwarfs") match; the Ruby's statue is only matched by "statue guarding the Ruby", not the Gallery's statues.
- A test checks that every creature and artefact in the engine has an entry, so a new kit creature cannot be added without lore.
- Also fixed in the digest: "an Unicorn" is now "a Unicorn".
- The wording is a first draft meant to be edited; it lives in code, not in the admin panel.

## Everything editable in the admin panel (2026-11-22, branch digest-improvements)

The planner prompt, fact-check prompt, voices and story bible are now part of a saved prompt version, edited on the Stories tab's Prompt page alongside the writer and editor prompts (same versioning, same "try this prompt first", same Stories role).

- Voices are text, one `id: instruction` per line. The bible is text in sections (`## header`, `## creatures`, `## artefacts`, `## places`), one `Name: entry` per line; a place is `keyword | keyword: entry` (whole-word, case-insensitive). `renderBible` / `parseBible` and `renderVoices` / `parseVoices` convert between the text and the defaults in code.
- Saving is validated: a malformed line, an unknown section, a missing header, a creature or artefact name the game does not have (it could never match), a duplicate voice id, an empty prompt.
- Versions saved before this have none of the four new fields and use today's source defaults for them (the admin shows those defaults when such a version is loaded). New fields are optional in the save call, so older callers still work.

## Beginning, middle and end (2026-11-22, branch digest-improvements)

Feedback: the starting party needed a backstory, the ending should say how the escape went and what the treasure did to them, and the middle should be tighter, with only the significant events and the rest compressed.

- **Writer prompt:** a "shape" section: a beginning before the cave (about 350 words; the starting party as particular people with a past, a debt or a want), a tight middle (about 950; three or four events in full, everything between compressed by the journey, not the room), and an ending (about 400; the climb into daylight, what they carried out and what it did to them, closing on that image and answering the want from the start). Aim 1,700, never under 1,500.
- **Invention outside the cave is allowed, bounded by the outcome:** the party's life before and what came after (the writer prompt, the editor and the fact-checker all say so). Inside the cave, no added events.
- **Planner:** new parts BEFORE THE CAVE and AFTER THE CAVE. **Editor:** a "shape" check (enrich a thin beginning or ending, compress a chronicle middle; if short, add to the ends, never pad the middle).
- **Digest:** `Silver, gold and gems carried out: ...` (the exit list only named artefacts, the Chest and the Idol, so a rich run and an empty-handed one looked the same).
- **Pipeline:** the first trial with these prompts was rejected for length (1,363 words) because tightening the middle made the whole story short. Length and form faults (too short or long, headings, scene breaks, game words) are now handed back to the editor for one repair edit, like fact problems, instead of discarding the story.

## Craft pass from "A Process of Revision" and the character bundle (2026-11-23, branch digest-improvements)

Source: Antonya Nelson's article (docs/digest-improvements/short-story-a-process-of-revision.md). Ideas taken into the prompts:
a **clock** (what the reader measures time by), **binaries** (opposing forces, both halves present), a **motif that escalates**
(Baldwin's music in "Sonny's Blues"), **props that recur** and pay off, and a protagonist **at a transition**. The planner now has
CLOCK, BINARIES, MOTIF and PROPS parts, DWELL ON is chosen for escalation, and IN PASSING is capped at four (the rest is compressed
into the journey). The writer is told to follow them; the editor gained an "Arc" check and, for the first time, sees the plan.
The fact-checker still sees only the record.

Characters are by class (`convex/storyCharacters.ts`, editable in the admin panel): a general line, names, and pools of habits,
worries, wants and strengths, plus "as an explorer" reasons for the classes that can start a party, and pairings. Code assigns the
names (hash of the high-score id, distinct within a class); the planner picks one or two options for the hero and two or three
others; the writer, editor and planner all see the same named company. Uniqueness between stories is not a goal.

A saved prompt version OVERRIDES these source defaults for the planner, writer and editor. Load the source defaults in the Prompt
tab (or copy the new text in) and save a new version to use them; the characters apply at once to any version that has none.

## Light humour (2026-11-23)

Humour comes from character and understatement, not jokes added on top. Each class has a `quirks` pool (small dry habits under
pressure), offered to the planner with the other pools. The planner has a HUMOUR part: two or three touches, each tied to a record
event, quirk or contrast, none at a death, loss, mutiny or the worst of a fight. The writer keeps to at most four touches (no puns,
winks, slang or mocking the dead); the editor cuts any that break those rules and adds none. The bard, clerk, rear-guard, fable and
close-third voices carry a one-line note on how their humour sounds; the wake, letter and present voices stay sober. To judge it, run
the same game with and without the HUMOUR lines.

## Fears and flaws (2026-11-23)

Each class has a `flaws` pool of phobias and psychological flaws, often ironic for the class (the ogre afraid of mice, the troll afraid
of goats and the dawn, the dwarf afraid of the open sky). The planner picks one for the hero and one or two others (FLAW part); the
writer shows it once or twice as a flinch or a thing avoided, never explained. Safeguards: the feared thing may be real in the
beginning and the aftermath, but inside the cave it is only dread (no new creature or incident is invented), and a flaw never makes
anyone leave the party. The editor has a Flaws check for those rules.
