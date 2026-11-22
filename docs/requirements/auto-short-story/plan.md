# Auto short story: plan

Companion to `requirements.md`: investigate automatically generating a short story for a stored high-score game above
a threshold, offered as a downloadable PDF against the high-score entry. It builds on `docs/requirements/short-story/`
(`plan.md`, `story-draft.md`, `editor-notes.md`, `story.md`), where B002's story was written by hand from a replay.

## 1. What we found

- **The entry exists already.** `highScores.save` (`apps/web/convex/highScores.ts`) records an *escaped solo* game once
  (idempotent per game), recomputes the score server-side, and refuses test-mode and non-standard-stranger-level games.
  Wiped-out, abandoned and multiplayer-only rows are not saved by this path, so "above a threshold" only needs a score test.
- **The replay data is public and complete.** `highScores.log({id})` returns the game's seed, picks, variants and every
  action with its events. `highScores.stats({id})` already derives depth, rounds, kills, members lost and so on.
- **A readable digest mostly exists.** `apps/web/src/game/gameLog.ts` has `describeEvent`, `actionLabel` and `formatLog`
  (the downloadable narrative `.txt`). They run in the browser, not in Convex, but they are pure functions and can be
  moved or shared.
- **The entry's UI has a natural home.** `ScoreDetail` in `apps/web/src/game/HighScores.tsx` already has a downloads row
  (narrative `.txt`, printer `.log`, replay by code). A "Short story (PDF)" button goes there.
- **Missing pieces.** There is no Anthropic SDK, no `ANTHROPIC_API_KEY` and no PDF library in the repo. All three are new.
- **The hand-written story shows the risk.** The first draft of B002's story had six facts wrong against the run
  (`editor-notes.md` section 1). An unsupervised generator will do the same unless it is constrained and checked.

## 2. Design

### 2.1 Trigger and threshold

- `highScores.save` schedules a generation (`ctx.scheduler.runAfter(0, internal.stories.generate, { id })`) when the
  saved score is at or above a threshold. The save returns immediately; the story never blocks it.
- The threshold is a constant per table, because base, kit and kit+Sibyl scores are not comparable (SC-EXT-29, SC-SIB-9).
  **Agreed by Mark:** base 300, kit 350, kit+Sibyl 350 (from the stored top-25 lists, base runs 253-380). One
  `STORY_THRESHOLD` map, so they can be tuned without a schema change.
- **Decided: no backfill.** Only scores saved after release get a story. A single internal "regenerate one score" action
  stays, for retrying a failed row.
- **Decided: no multiplayer.** Solo escapes only; the story button is never offered on a multiplayer entry.

### 2.2 Storage

A new table, not columns on `highScores` (those rows already hold the full `state` blob):

```
stories: defineTable({
  highScoreId: v.id("highScores"),
  status: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
  title: v.optional(v.string()),
  text: v.optional(v.string()),        // markdown: paragraphs and "---" scene breaks
  words: v.optional(v.number()),
  model: v.optional(v.string()),
  digestHash: v.optional(v.string()),  // so a re-run on the same replay can be skipped
  error: v.optional(v.string()),       // short, operator-facing; never shown verbatim to players
  createdAt: v.number(),
}).index("by_highScore", ["highScoreId"])
```

`stories.forScore({id})` is a public query (like `highScores.log`: a recorded score is already published) returning
`{ status, title }` for the button and `{ title, text }` for the PDF. Status makes the UI honest: no button, "being
written…", or ready.

### 2.3 The digest (the accuracy control)

Reuse the method of `short-story/plan.md` section 2: replay the run and extract the facts the story must respect.
A pure function `storyDigest(log)` returns a compact, structured record, not prose:

- cave facts: starting party (picks), depth reached, turns, areas, the exit count and who carried what at the exit;
- **the arc**, as an ordered list of beats with the level they happened on: first recruit and the roll, artefact choices
  taken and left, falls and level changes, hostile encounters and who won, mutinies and the repair, joins (with roll and
  tests), losses (who, to what), special areas crossed and how (Viper Pit, Deep Pool, Whirlpool, Chasm, Earthquake),
  the Sorcerer, the Ruby, Medusa, Dragon, chest outcomes (including the new four-bag loot), curses, the Ring and Talisman;
- a short **"what is dull"** list (repeated walking, withdrawals) so the model compresses it rather than narrating it.

The digest is built in the same module that already turns events into sentences, so wording stays in one place. The
beat list is capped (about 40 beats) by ranking interactions the way the hand run did (distinct kinds of event over raw
count), keeping the arc: an opening, a first loss or betrayal, a set piece, a quiet climax, an exit.

### 2.4 The generation (two passes, as the hand edit)

**The prompt is editable in two places, with one rule for which wins.**
- **In source (the default):** every instruction lives in one file, `apps/web/convex/storyPrompt.ts`, as plain exported
  strings (`WRITER_SYSTEM`, `EDITOR_SYSTEM`, the word-count range, the denylist, the default model) with a comment block
  explaining each part. A test pins that they exist and are non-empty. Tests and a fresh deployment use these.
- **In the admin panel (an override):** a SYSTEM user can edit the writer and editor prompts, the model and the word
  range, and save them as a new **prompt version** (section 2.7). The newest saved version is the active one; if none
  exists, the source default is used (version `source`). Reverting is selecting an older version, which saves it as a
  new one. Every story and every model call records the version it used.

An `internalAction` calls the Claude API (`@anthropic-ai/sdk`, key in a Convex env var, model in a second env var so it
can change without a deploy):

1. **Write.** System prompt carries the craft rules from `short-story/plan.md` sections 3 and 6 and `editor-notes.md`
   sections 2-3 (a want and a lack, cost, theme said once, concrete nouns, no game-speak, no stacked recruit lists,
   1,500-1,800 words, opening line that promises and a last image that keeps it). The user message is the digest only.
   The model may invent names, motives and dialogue (the run has none) but must not contradict or add events.
2. **Check and edit.** A second call gets the digest and the draft and returns the final text plus a JSON list of any
   statement it could not support from the digest. Any unsupported fact is either fixed in that pass or, after one
   retry, the story is stored `failed`. This is the automated version of the fact-check table in `editor-notes.md`.
3. Cheap deterministic guards before storing: word count in range, no leaked game-speak (a small denylist such as
   "level 4", "roll", "points", "game"), no markdown beyond paragraphs and `---`, a title present.

Cost is small and bounded: a digest of a few thousand tokens in and about 2,500 tokens of story out, twice, per qualifying
game, and only on first save. `digestHash` makes a retry free.

### 2.5 Names and safety

- The player's chosen name (`name`, up to 40 characters) is **data, never instruction**: it is not put in the prompt as
  text the model could follow. It may appear only in the PDF byline, added by our code.
- The prompt asks for a story without real-world persons, brands or slurs, and the second pass checks it. Story text is
  stored and shown only on that entry, never indexed or shared elsewhere.
- Failure is silent for the player: the entry simply has no story button. The error is kept on the row for the operator.

### 2.6 The PDF

- Generated **in the browser on click** from the stored text, so the server stores text (a few KB), not files, and
  there is nothing to host. Library: `jspdf`, lazy-loaded with a dynamic import (the build already warns about chunk
  size) and a serif font embedded for body text; to be confirmed against current maintenance before adding (best
  practice: check recent commits and downloads). Fallback if it proves awkward: a print stylesheet and `window.print()`,
  at the cost of not being a true download.
- Layout: title, byline ("Told from the run of *name*, score N, game code XXXX"), body in a readable serif at about
  11 pt with scene breaks as a centred rule, page numbers, a small footer naming the game. About three pages.
- Button in `ScoreDetail`'s downloads row, beside the log downloads, with the three states from 2.2. The Help manual
  (`apps/web/src/manual`, the scoring topic) gets a sentence saying high-scoring games get a short story.

### 2.7 Admin: prompt versions, rewrites and the dashboard (added 2026-11-22)

All of this sits in the existing admin panel (roles `SYSTEM`, `ANALYTICS`, `TEST`, PR #61; `gameStats` already feeds
the Game Analytics tab) as a new **Stories** tab. **Viewing** needs `ANALYTICS`; **editing the prompt, rewriting and
the budget switches** need `SYSTEM`, because they spend money. Every query and mutation uses `requireRole`.

**New tables**
- `storyPrompts`: `version` (number, increasing), `writer`, `editor`, `model`, `minWords`, `maxWords`, `note`,
  `createdBy`, `createdAt`. Append-only; the active one is the highest `version`.
- `storyRuns`: one row per model call (write pass, check pass), so cost and failures are measured, not guessed:
  `storyId`, `highScoreId`, `pass` (`write` | `check`), `promptVersion`, `model`, `inputTokens`, `outputTokens`,
  `costUsd` (computed at write time from a price table in `storyPrompt.ts`, marked as an estimate), `durationMs`,
  `status` (`ok` | `rejected` | `error`), `reason`, `trigger` (`save` | `rewrite` | `retry`), `createdAt`.
  Indexes by `createdAt` and by `storyId`.
- `storySettings` (single doc): `paused` (stop all generation), `dailyCapUsd`, `monthlyCapUsd`. Generation checks
  the settings and the running day and month totals from `storyRuns` before every call, and fails the row with the
  reason "cap reached" rather than spending.
- `stories` gains `promptVersion`, `previousText` (one-step undo after a rewrite) and `attempts`.

**Rewrites after a prompt change** (SYSTEM only)
- A **Rewrite** panel offers a scope: all stories, those written with an older prompt version, failed ones, or one score
  (by game code). It shows the count and an **estimated cost** (count times the recent average cost per story) and
  needs a typed confirmation, because it is bulk and spends money.
- Execution is a queue, not a loop: the mutation marks the chosen stories `pending` with `trigger: rewrite` and
  schedules batches (for example 5 at a time, spaced out) through `ctx.scheduler`. It honours the pause switch and the
  caps, so a rewrite can be stopped mid-way, and progress is visible live on the dashboard.
- A rewrite keeps the old text in `previousText` until it succeeds; a failed rewrite leaves the old story in place,
  so the player's download never disappears.
- **Dry run:** "Try this prompt on a score" generates a story from the edited, unsaved prompt for any stored game and
  shows it side by side with the current story, without saving. It is the way to tune the prompt before a bulk rewrite.

**Dashboard** (reactive queries over `stories` and `storyRuns`; hand-rolled SVG like the Game Analytics charts)
- Tiles: stories total, ready, pending, failed; generated today and in the last 7 days; success rate; average words;
  average duration; tokens in and out; **estimated spend** today, this month and all time against the caps.
- Charts: stories per day by outcome, cost per day, words histogram, spend by prompt version and by pass, failure
  reasons (guard rejected, check pass found an unsupported fact, API error, cap reached).
- Tables: recent runs (time, game code, trigger, pass, tokens, cost, status, reason) and recent stories with a link
  to read the text; a stories-by-prompt-version breakdown that shows how many still use an older version (the
  natural input to a rewrite).
- Controls: pause or resume generation, set the caps, retry a failed story, remove a story (a takedown).

**Prompt editor**
- Two text areas (writer, editor), model, word range and a note. A diff against the previous version, **Save as new
  version**, the version history with who and when, and a "make this version active again" action. Saving does
  not rewrite anything by itself; the Rewrite panel does, so a prompt change never spends money as a side effect.
- Validation before saving: both prompts non-empty, a sensible word range, a model from an allow-list in source.

## 3. Implementation steps

1. **Digest** (engine-free, pure): `storyDigest(log)` plus tests that replay the stored fixtures
   (`packages/engine/src/fixtures/top-score-games.json`, B002 in particular) and assert the digest matches the facts in
   `short-story/plan.md` section 2. This is the most valuable test: it pins the accuracy control.
2. **Schema and queries:** the `stories` table, `stories.forScore`, and `convex-test` tests (status transitions,
   idempotence, a failed row stays failed until re-run).
3. **Prompt, versions and generation action:** `storyPrompt.ts` (defaults, price table, model allow-list); the
   `storyPrompts`, `storyRuns` and `storySettings` tables; the two-pass call behind an interface so tests use a stub,
   resolving the active prompt version, recording a `storyRuns` row per call and honouring pause and caps;
   deterministic guards with unit tests; retry-once logic; env vars documented in `apps/web/OPTIONS.md`.
4. **Trigger:** schedule from `highScores.save` above the threshold (solo only); the retry-one action.
5. **PDF and UI:** lazy-loaded generator, the `ScoreDetail` button and states, a help-manual sentence, UI tests.
6. **Admin Stories tab:** the dashboard queries and charts, the prompt editor with versions and diff, the dry run, the
   rewrite queue with scope, cost estimate and confirmation, the pause switch and caps, role gating tests, and a
   cap test (a call is refused once the day's cap is reached).
7. **Quality pass on real output:** generate stories for five stored games of different shapes (a short run, a
   kit run, a Sibyl run, one with a chest), read them, tune the prompt (in source, then via the dry run), and record
   the findings the way `editor-notes.md` did. Note: the stored B002 game no longer replays past its chest (the chest
   rule changed), so the digest tests pick games that still replay to their pinned score.
8. **Docs and release:** note the feature in `OPTIONS.md` and the manual. Setting `ANTHROPIC_API_KEY` and the first
   `convex deploy` touch the shared backend, so they are done only with Mark's go-ahead.

## 4. Risks and open decisions

| Item | Question or risk | Leaning |
|---|---|---|
| Threshold | The value per table | agreed: base 300, kit and Sibyl 350, tunable in `STORY_THRESHOLD` |
| Cost control | A bug, or a bulk rewrite, could spend a lot | one row per score (`by_highScore`), status guard, one retry, daily and monthly caps and a pause switch checked before every call, rewrite needs an estimate and typed confirmation |
| Prompt in two places | Source and admin versions could disagree | one rule: newest admin version wins, else the source default; each story records its version; the dashboard shows both |
| Rewrite replaces a good story | A bad prompt could wipe good stories | `previousText` kept until the rewrite succeeds, failed rewrites keep the old text, dry run before a bulk run |
| Cost accuracy | Dashboard spend is an estimate | tokens come from the API response; the price table is in source and labelled an estimate |
| Accuracy | The model invents an event | digest-only input, second-pass check, deterministic guards, fixture-based review |
| Tone drift | Stories read alike | pass a small "shape" hint from the digest (a loss, a betrayal, a quiet climax) and vary names by seed |
| Names | Invented names vs the player's | invented; the player's name appears only in the byline |
| Provider key | Where the key lives | Convex env var, never in the web bundle |
| PDF library | Choice and font | `jspdf`, lazy-loaded; confirm maintenance before adding |
| Multiplayer | Several heroes, one score | decided: out of scope |
| Older entries | Existing high scores | decided: no backfill; new scores only |
| Takedown | A player may dislike a story | an admin "remove story" command; a player-facing option is a later question |

## 5. What this does not change

The engine, the scoring and the leaderboard ranking are untouched, so the engine spec and the pinned search fixtures
need no edit. The player's manual gets one sentence (a new thing a player can see).
