# Server Configuration

This lists every environment variable that changes this app's behavior at the deployment level —
as opposed to a per-game choice a player makes in the UI (party selection, the Extension Kit
toggle, party colour, etc.). All of these live on the **Convex deployment** itself (function
runtime environment), never in a project file — set and read with `npx convex env ...` from
`apps/web`, exactly like `CONVEX_DEPLOYMENT`/`VITE_CONVEX_URL` but never committed, and never a
`VITE_`-prefixed name (a `VITE_` var is bundled into the client and readable in browser devtools —
the opposite of what a server-only option needs).

Local dev and production are **independent deployments** with independent values — set locally by
default, add `--prod` to target production. See the root [`README.md`](../README.md#deployment-vercel--convex)
for how the two deployments relate.

## `FORCED_REDRAW_ENABLED`

Turns on the **Dead End rule** ("forced redraw", `docs/specs/engine-spec.md` §6.3.2): when the tile
a party is standing on has no doorway or stairway left that it could still try (no backtracking —
only that tile counts), the area card that just made the last dead end is reshuffled into the
pack and a new one drawn, until a way opens. Off by default — today's behaviour (a fully boxed-in
tunnel can soft-lock, SC-6.3-1) is unchanged unless this is set.

It is **never player-selectable and never sent by the client** — unlike the Extension Kit, which a
player chooses in the party screen, this flag changes scoring difficulty, so a tampered client
request must not be able to switch it on for one run. It's folded into a new game's `variants`
entirely server-side, in `convex/game.ts`'s `newGame`/`startTestGame` handlers; the client-facing
`variants` argument has no key for it at all. Unlike the Extension Kit, a game recorded with it on
is **not** split into its own leaderboard table — `convex/highScores.ts`'s `list` still records
`forcedRedraw` on each row for informational purposes, but doesn't filter by it, since this is a
deployment-level flag expected to be set once and never flipped back in production, rather than a
per-game player choice like the kit toggle. Flipping it locally will produce a brief mix of
before/after scores in the same table — harmless in dev, and moot in production once it's set for
good.

```bash
cd apps/web
npx convex env set FORCED_REDRAW_ENABLED 1        # local dev
npx convex env set FORCED_REDRAW_ENABLED 1 --prod # production
```

Check what's set, and disable:

```bash
npx convex env get FORCED_REDRAW_ENABLED [--prod]
npx convex env remove FORCED_REDRAW_ENABLED [--prod]
```

Any value other than the literal string `1` (including unset) is treated as off. Toggling this only
affects games *created* after the change — an in-progress game keeps whatever value it was created
with (`variants` is immutable for the life of a game).

## `SORCERER_TELEPORT_ENABLED`

Turns on **the Sorcerer's terms** (`docs/specs/engine-spec.md` SC-12-21 to SC-12-23): after the party defeats the
Sorcerer it may spare his life on condition that he teleport the party, and the treasure in the chamber, to any
area already discovered — a map of the cave is shown to pick from, and an effect plays as the party is carried
away. Without it (or with it switched off) a defeated Sorcerer is simply slain at the killing blow, as before.
Sparing him forfeits the 30-point bounty and lifts no curse. Solo games only.

Like `FORCED_REDRAW_ENABLED` it is **never player-selectable and never sent by the client**; it is folded into a
new game's `variants` in `convex/game.ts`. Off by default, and a game keeps the value it was created with, so games
already in progress and every recording replay exactly as before.

```bash
cd apps/web
npx convex env set SORCERER_TELEPORT_ENABLED 1        # local dev
npx convex env set SORCERER_TELEPORT_ENABLED 1 --prod # production
npx convex env remove SORCERER_TELEPORT_ENABLED [--prod]
```

Any value other than the literal string `1` (including unset) is treated as off.

## `REVISED_COMBAT_ENABLED`

**On by default** (since 2026-11-13); set it to `0` to turn it off. It is **the revised combat** (`variants.combatRevision`; Peter's reformulated fighting rules, `docs/rules/fighting-rules-reformulated-20261014.md`,
engine spec SC-9.7-1 to SC-9.7-17, SC-7.2-21, SC-EXT-42). A fight is no longer one battle plan: it is played round by round on a
formation screen. The defender deploys, the attacker pairs its free creatures against that front line, either side may then send
extra creatures into a match, and the matches are fought; a tied or unwinnable match persists into the next round, and the fight ends
when no match can be decided. It also changes the Scroll (a choice offered to an attacking party, not a one-off artefact use; new games, stamped `variants.scrollAnytime`, GitHub #80, let it be read at any decision before the dice with no "Begin the fight" step, older games keep that step), and a doorway walked out of a chamber whose Dragon the Flute put to sleep does not count as used (stamped `variants.sleepUnseen`, GitHub #94, so coming back by it still earns surprise; older games count it), and in a Quarrel a Magic Shield bearer nullifies the other fighter's magic (stamped `variants.quarrelShield`, GitHub #91; older games keep the old duel), and a Unicorn in a mixed group is approached apart (stamped `variants.unicornApart`, GitHub #83: with a Woman in the party it joins at once when the others test indifferent and stays out of a fight against them, joining when it is won; older games keep it with the group), the chest
Spectre (one round only), the Ghouls (a stranger party of their own) and the Apprentice (she turns only if you stay after the
Sorcerer's death), and the Lost Ruby's Statue (`variants.statueFight`, stamped on new games with it, GitHub #59: reaching for the Ruby
brings the Statue down on the whole party, SC-11-52 to SC-11-55; a game started without the stamp keeps the old single-roll resolution).
Solo games only. Without it (or with it switched off) fights are played exactly as before.

Like `FORCED_REDRAW_ENABLED` it is **never player-selectable and never sent by the client**; it is folded into a new game's
`variants` in `convex/game.ts`. A game keeps the value it was created with. Games played with it **can** be recorded on the leaderboard. The strangers' side is played by the level named by
`STRANGER_STRATEGY` (`standard` when unset).

```bash
cd apps/web
npx convex env set REVISED_COMBAT_ENABLED 0        # turn it off, local dev (back to the old battle plan)
npx convex env set REVISED_COMBAT_ENABLED 0 --prod # turn it off, production
npx convex env remove REVISED_COMBAT_ENABLED [--prod]   # back to the default (on)
```

Only the literal string `0` turns it off; unset, `1` or anything else leaves it on.

## `TRAP_RULES_ENABLED`

Turns on **standing traps and the Dwarf's deliberate fall** (spec
`.agent-os/specs/2026-10-11-dwarf-deliberate-trap-fall/`): a trap "continues in effect" — it stays in its
chamber after it fires or is avoided, so a later re-entry meets it again — and each Dwarf can guide the party
past one trap, so a party with n Dwarves can pass n traps in a chamber. Without it (or with it switched off) a trap is one-shot and a Dwarf always avoids it, as
before. Later tasks in the same spec add the Dwarf's choice popup, surprise for a deliberate fall, and the fall
when a Dwarf-guided party loses its Dwarf. Solo games only for now.

Like `FORCED_REDRAW_ENABLED` it is **never player-selectable and never sent by the client**; it is folded into a
new game's `variants` in `convex/game.ts`. Off by default, and a game keeps the value it was created with, so games
already in progress and every recording replay exactly as before.

```bash
cd apps/web
npx convex env set TRAP_RULES_ENABLED 1        # local dev
npx convex env set TRAP_RULES_ENABLED 1 --prod # production
npx convex env remove TRAP_RULES_ENABLED [--prod]
```

Any value other than the literal string `1` (including unset) is treated as off.

## `STRANGER_STRATEGY`

Selects the **strangers' strategy** for new solo games (pluggable stranger combat spec, stages 1 and 2:
`docs/requirements/combat/2026-10-11-pluggable-stranger-combat.md`). Today the only decision the strangers make is who
bears which fight artefact, so the registered strategies are `standard` (Peter's default loadout) and `smart` (an exact-evaluation loadout
that the lab found no better than `standard`); setting `standard` changes nothing a player can see; it exists so the plumbing (a pending decision, a checked and logged `strangersAssignArtefacts`
action, a fallback to `standard`) is exercised in a real deployment before there is a second strategy to choose.

The value is a strategy id. Unset, or an id nothing is registered under, ⇒ not stamped ⇒ the loadout is applied exactly as
before. It is folded into a new game's `variants.strangerLevel` in `convex/game.ts`; it is **never client-settable**, and a
client can never send a stranger decision (`applyAction` and the multiplayer `act` reject any action type starting
`strangers`). A game keeps the value it was created with. Solo games only.

```bash
cd apps/web
npx convex env set STRANGER_STRATEGY standard        # local dev
npx convex env set STRANGER_STRATEGY standard --prod # production
npx convex env remove STRANGER_STRATEGY [--prod]
```

### External levels: `ext-easy`, `ext-hard`, `EXTERNAL_STRATEGY_URL`, `EXTERNAL_STRATEGY_SECRET`

`STRANGER_STRATEGY` may also name an **external level** (`ext-easy`, `ext-hard`): the strangers' decision is then made by an
endpoint you run, outside the game server (stage 6 of the same spec; plan in
`docs/requirements/combat/2026-10-13-stage-6-external-strategy-plan.md`). The fight waits on it. Each level has its own
thinking time (`ext-easy` 1.5 s, `ext-hard` 6 s); if the endpoint is slow, fails, or answers illegally, `standard` decides instead
and the substitution is logged with its reason.

| Variable | Meaning |
|---|---|
| `EXTERNAL_STRATEGY_URL` | The endpoint. Unset ⇒ every external decision falls back to `standard` at once ("endpoint not configured"). |
| `EXTERNAL_STRATEGY_SECRET` | Sent as `Authorization: Bearer <secret>`. Never logged and never sent to the client. |

The endpoint is sent `POST` JSON `{ version: 1, requestId, strategyId, strategyVersion, kind, context }` (`kind` is `loadout`, `deploy`,
`engage`, `redeploy` or `casualty`; `context` is only what a human opponent could see) and must answer `{ version: 1, decision }`.

Games against any level other than `standard` are **not eligible for the leaderboard** (`highScores.save` refuses them).

```bash
cd apps/web
npx convex env set STRANGER_STRATEGY ext-easy
npx convex env set EXTERNAL_STRATEGY_URL https://your-endpoint.example/decide
npx convex env set EXTERNAL_STRATEGY_SECRET <secret>
```

**How a level is doing.** Each decision asked of an endpoint is logged with the level asked (`strategyId`) and how long it took
(`latencyMs`, including the wait before a timeout fallback). To see a level's fallback rate, the reasons and p50/p95 latency over its
newest 5000 decisions:

```bash
cd apps/web
npx convex run strangerDecision:report '{"strategyId":"ext-easy"}'
```

## Admin accounts and Test Mode access

Test Mode used to be unlocked by a `TEST_MODE_SECRET` env var and a `?test=` URL. It is now gated by the `TEST` role on a
signed-in admin account (`SYSTEM` implies every role). **`TEST_MODE_SECRET` is no longer read: remove it from each
deployment** (`npx convex env remove TEST_MODE_SECRET`, add `--prod` for production).

Admin accounts are created from the CLI only (public sign-up is closed), then sign in at `/login`:

```bash
cd apps/web
npx convex run admin:seedUser '{"username":"alice","password":"<a-long-password>","roles":["SYSTEM"]}'          # local dev
npx convex run admin:seedUser '{"username":"alice","password":"<a-long-password>","roles":["TEST"]}' --prod     # production
npx convex run admin:setPassword '{"username":"alice","password":"<new-password>"}'                             # change a password
```

Roles are `SYSTEM`, `USER`, `ANALYTICS`, `STORIES`, `TEST` (`STORIES` views and edits the Stories tab only; `ANALYTICS` can view it). Re-running `seedUser` with a different role list updates the roles.
See [`TEST-MODE.md`](TEST-MODE.md) for using Test Mode.

## `CONVEX_SITE_URL`

Read by `convex/auth.config.ts` for the auth provider's domain. **Auto-injected by Convex into every
deployment's function runtime** — this is not something you set yourself; it's listed here only so
it isn't mistaken for a missing option if you go looking for it in `npx convex env list`.

## Auth signing keys (`JWT_PRIVATE_KEY`, `JWKS`)

Required by `@convex-dev/auth` for anonymous-session and admin password-session signing. Each deployment (local dev and prod)
needs its **own** keypair — never share the local dev keys with production. See the root
[`README.md`](../README.md#deployment-vercel--convex) ("Auth keys on prod") for how to generate and
set a fresh keypair; there's nothing project-specific to configure beyond following Convex's own
`@convex-dev/auth` setup for a new deployment.

## Multiplayer mode is a site option, not an environment variable

Multiplayer is **not** an environment option any more: whether the welcome page offers it is the **Multiplayer mode** switch on the
admin panel's System tab (default OFF), stored in Convex (`systemSettings`). See [`ADMIN.md`](ADMIN.md). The old `VITE_MULTIPLAYER`
build flag is gone and has no effect.

## `GITHUB_ISSUES_TOKEN` and `GITHUB_ISSUES_REPO`

Turn on **GitHub issue creation for bug reports** (spec `.agent-os/specs/2026-11-09-bug-report-tool`). The bug icon in the
title bar always saves a report in Convex (`bugReports`); when the token is set, `convex/bugReport.ts` also files it as an issue,
labelled `bug-report`, a `category:*` label, and `test-mode` for a Test Mode game. Without the token the report is kept with
`status: failed` and `lastError: 'not configured'`, and nothing is sent to GitHub.

- `GITHUB_ISSUES_TOKEN` — a fine-grained personal access token for the one repository, with **Issues: read and write** and
  nothing else. It lives only on the Convex deployment (never a `VITE_` variable) and is never logged or stored in an error.
- `GITHUB_ISSUES_REPO` — `owner/name`; defaults to `urbancamo/sorcerers-cave`.

Bug reports can carry a **screenshot** of the game window (native resolution JPEG, attached by default, the player can untick it).
It is uploaded to Convex file storage (`bugReport.generateUploadUrl`, image files up to 10 MB) and the issue body links to
that storage URL, so no extra GitHub permission is needed. The URL is public to anyone holding the link; the file stays in
Convex storage with the report row (`bugReports.screenshotId`).

Labels to create once in the repository: `bug-report`, `test-mode`, `category:rules`, `category:display`, `category:crash`,
`category:other`.

```bash
cd apps/web
npx convex env set GITHUB_ISSUES_TOKEN <token>          # local dev
npx convex env set GITHUB_ISSUES_TOKEN <token> --prod   # production
```

Local dev and production currently share one Convex backend, so a report filed while testing lands in the real repository too.
File test reports from a Test Mode game (labelled `test-mode`) and close them afterwards.

## Rate limits (admin System tab)

Anonymous sign-in is free, so what a player can do is limited by counters (`convex/rateLimits.ts`), and the figures are set in the
admin panel: **System tab → Rate limits** (SYSTEM role). A change takes effect on the next use and needs no deploy. A limit left at its
default is not stored, so a later change to a default in the code reaches it.

| Limit | Scope | Default |
|-------|-------|---------|
| Start a solo game (`newGame`) | player | 40 per hour |
| Create a multiplayer game (`createMultiplayer`) | player | 10 per hour |
| Join by code (`joinAttempt`; a wrong code counts) | player | 30 per 10 minutes |
| Chat messages (`chatUser`) | player | 20 per minute |
| Chat messages in one game (`chatGame`) | game | 300 per hour |
| High-score names checked (`highScoreName`) | player | 30 per hour |
| Party names checked (`partyNameCheck`) | player | 30 per hour |
| Bug reports (`bugReportUser`) | player | 5 per hour |
| Bug reports (`bugReportSite`) | whole site | 30 per hour |
| Screenshot uploads (`uploadUser`, `uploadSite`) | player, site | 10 / 100 per hour |

- Counting is in fixed windows (the count restarts when the window has passed), so a burst across a boundary can reach twice the figure.
- A refused use is not counted. The player sees "Too many … Please try again in about N seconds/minutes" in the place they acted.
- Bounds: 1 to 100000 uses, a period of 10 seconds to 7 days. Out-of-range values are refused when saving.
- Counters are cleared hourly by a cron (`crons.ts`), once they are more than 8 days old.
- Not limited here: anonymous sign-in itself (it is Convex Auth's own endpoint; limit it at the edge if it is abused) and password
  sign-in (Convex Auth limits failed attempts itself).

## Names are screened (`ANTHROPIC_API_KEY`, `NAME_CHECK_MODEL`)

The name a player enters for the public high-score table is checked before the score is recorded (`convex/nameCheck.ts`,
`highScores.submit`; `highScores.save` is internal, so nothing skips the check). Multiplayer **party names** get the same check
(`convex/nameScreen.ts`) in `multiplayer.createMultiplayer`, `joinByCode` and `setPartyName`, which are actions that screen the name and
then call internal mutations (`createGameRow`, `joinSeat`, `renamePartyRow`). A join is screened only once it would otherwise succeed
(not for a wrong code, a full or started game, a taken name or colour, or a rejoin). Chat messages are free text and are **not** screened.

- **Local check, always on:** a web address, email address or phone number is refused, with no model call.
- **Claude check, when `ANTHROPIC_API_KEY` is set** (the same key the short stories use): a small model answers `{"ok":true}` or
  `{"ok":false}`. Anything else, an error or an 8-second timeout is "try again" and records nothing. The default model is
  `claude-haiku-5-5`; override it with `npx convex env set NAME_CHECK_MODEL <model>` (add `--prod`).
- **With no key set, only the local check runs**, so a deployment without a key still saves scores but does not screen for offensive
  words. Set the key on the production deployment for the full check.
- A refused name returns the player to the entry form with the reason. At most 10 names are tried per game (`MAX_NAME_ATTEMPTS`); each
  tried name is one short model call.
- Chat is not screened.
- **Fixing a name that got through:** admin panel, **Names** tab (SYSTEM role). It lists the latest 100 high-score entries and the
  party names in the latest multiplayer games, with a filter. **Edit** sets a new name and **Clear** replaces it with `Anonymous` (a
  party becomes `Party`, or `Party 2`… if that is taken). A party rename reaches its seat, the game's own copy, that party's chat lines
  and its leaderboard entry; "joined" lines already written and the full game record kept with a high score are left as they were. An
  admin's own text is not screened. Every change is kept in the `nameAudit` table (the tab's **Changes** list) with the old and new name.

## Short stories (auto-generated)

High-scoring solo escapes get a short story written by Claude (plan: `docs/requirements/auto-short-story/plan.md`).

- **Off until a key is set.** Generation runs only when the Convex env var `ANTHROPIC_API_KEY` exists. Deploying the code spends nothing
  by itself; with no key, `highScores.save` queues nothing.
  Set it with `npx convex env set ANTHROPIC_API_KEY <key>` (add `--prod` for the production deployment).
- **Threshold** per leaderboard table, in `convex/storyPrompt.ts` (`STORY_THRESHOLD`): base 200, Extension Kit 250, kit + Sibyl 250 (their scores are not comparable with base, SC-EXT-29 / SC-SIB-9). Solo only. A lower threshold means more stories and more spend.
- **Prompt**: the default instructions, model, word range and price table are in `convex/storyPrompt.ts`, and the default story bible in `convex/storyBible.ts`; an admin-saved prompt version overrides them. A version holds the planner, writer, fact-check and editor prompts, the voices (`id: instruction` per line) and the story bible (sections of `Name: entry` lines), all editable on the Stories tab's Prompt page by the Stories role. A version saved before the planner, fact-check, voices and bible were editable uses the source defaults for them.
- **Spend controls**: the `storySettings` document holds a `paused` switch and daily/monthly caps in US dollars; a call is refused once a cap is reached.
- **Admin panel, Stories tab** (ANALYTICS or STORIES views it; STORIES edits, but only SYSTEM can raise or remove a spending cap): dashboard of stories, calls, spend and failures; pause and caps;
  the prompt editor (each save is a new version, and a trial on one real game costs about one story and stores nothing); and bulk
  rewrites (choose a scope, check the count and estimate, type REWRITE). A rewrite runs in the background, can be stopped, halts by
  itself on a pause or cap, and a failed rewrite keeps the old story. Existing stories keep their prompt version until rewritten.
- **Retry one entry by hand**: `npx convex run storyGen:generate '{"highScoreId":"<id>","trigger":"retry"}'`.
