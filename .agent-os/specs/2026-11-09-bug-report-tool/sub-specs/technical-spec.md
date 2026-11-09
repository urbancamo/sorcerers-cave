# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2026-11-09-bug-report-tool/spec.md

> Created: 2026-11-09
> Version: 1.0.0

## Technical Requirements

### Web UI (`apps/web`)

- `src/game/shell/TitleBar.tsx`: add a `bug` entry to `GLYPHS` (a bug outline in the same 24px stroke style as the others) and an `onBug` prop. Render `<IconButton id="bug" label="Report a bug" …/>` in the right-hand group, between Help and Fullscreen, **not** gated on `testMode`. Add a `BRIEF.bug` tooltip ("report something that looks wrong, with this game attached"). `active` is the modal's open state.
- `src/game/BugReportModal.tsx` (new), modelled on `GameLogModal`/`SaveGameModal`. Fields: description (required, 10-5000 chars), expected behaviour (optional, <= 2000), category (select: Rules, Display, Crash/stuck, Other), contact (optional, <= 200, stored but never put in the issue). A short note states what is sent (the game's moves, game code and browser details) and that the issue is public. Submit is disabled while empty/too short/in flight; success shows the reference and game code; failure of the mutation shows an error and keeps the form text.
- `src/game/GameScreen.tsx`: `bugOpen` state beside `testOpen`; pass `onBug`. The modal is rendered at the same level as the other modals so it works during a fight, a dice roll and the game-over screen. Opening it dispatches nothing and must not trigger `useCaveGame` side effects.
- Client details sent with the report: `navigator.userAgent`, `window.innerWidth x innerHeight`, and the build id (`import.meta.env.VITE_BUILD_ID`, falling back to `'dev'`; the Vite config injects the git short SHA at build time).
- Styles: reuse `scv-tb-btn` and the existing modal classes; no new design tokens.
- Manual: add a topic `bug-report` in `src/manual/play.ts` (brief, `screens` tagged for the game screen) covering what the report contains and that issues are public; add a `HelpButton` in the modal. The drift test must stay green.

### Convex (`apps/web/convex`)

Read `convex/_generated/ai/guidelines.md` before writing any of this. All functions use argument validators; `submit` is the only public function; everything that touches GitHub or other users' data is `internal*`.

- `bugReport.ts`:
  - `submit` (mutation): see `api-spec.md`.
  - `createIssue` (internalAction): loads the report, builds the issue, calls GitHub, records the outcome.
  - `getForIssue` (internalQuery): returns the report, the game row (state summary, variants, testMode) and the game log (reusing the same shaping as `game.log`, factored into a shared helper rather than copied).
  - `markCreated` / `markFailed` (internalMutation): write the outcome and schedule retries.
- Authentication: `getAuthUserId(ctx)` must be non-null (Anonymous auth gives every player an id). Unauthenticated calls throw.
- Game context is **derived server-side** from `gameId`: the caller must own the game (same IDOR guard as `game.log`). The client never sends turn, level, area, variants or test-mode status. A report with no `gameId` is allowed (stored without context).
- Rate limit: at most 5 reports per user per rolling hour, counted via the `by_owner_and_created` index. Over the limit throws a `ConvexError` the modal shows verbatim. No new dependency.

### GitHub issue creation

- Request: `POST https://api.github.com/repos/${GITHUB_ISSUES_REPO}/issues` with `Authorization: Bearer ${GITHUB_ISSUES_TOKEN}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and a `User-Agent: sorcerers-cave-bug-reporter` header. `fetch` only, no SDK.
- Env (Convex deployment, never `VITE_`): `GITHUB_ISSUES_TOKEN` (fine-grained PAT, this repository only, **Issues: read and write** and nothing else) and `GITHUB_ISSUES_REPO` (default `urbancamo/sorcerers-cave`). Documented in `apps/web/OPTIONS.md`. With no token the action records `failed` with `lastError: 'not configured'` and does not retry; the report stays in Convex.
- Title: `[bug-report] <first line of description, max 80 chars>`; `[test-mode] ` is prepended for Test Mode games.
- Labels: `bug-report`; `test-mode` when the persisted game state has `testMode`; one of `category:rules`, `category:display`, `category:crash`, `category:other`. The labels are created once by hand in the repository (listed in `OPTIONS.md`) so colours and descriptions are controlled.
- Body (Markdown, in this order): player description and expected behaviour, each as a quoted block; a context table (game code, status, level, turn, area, party colour, variants, test-mode, build, user agent, viewport, report ref); "How to reproduce: replay game `XXXX` (shared replay by code)"; and, when it fits, a `<details>` block holding the log JSON. The log is omitted (with a one-line note) if the whole body would exceed 60,000 characters (GitHub's limit is 65,536).
- Player text is untrusted: it is placed inside blockquotes, backticks are backslash-escaped, and every `@` is followed by a zero-width space so nobody is notified. `contact` is never included.
- Success: HTTP 201; store `issueNumber` and `issueUrl`, status `created`.
- Failure handling: 5xx, 429 and network errors are transient: schedule `createIssue` again with backoff (1, 5, 30 minutes, then 2 hours), up to 5 attempts, honouring `Retry-After` when present. 401/403/404/422 are permanent: status `failed`, no retry. `lastError` stores the HTTP status and GitHub's message (never the token).

## Approach Options

**Option A: Convex row first, then a scheduled action to GitHub** (Selected)
- Pros: the report is durable before GitHub is contacted; the player never waits on GitHub; retries are simple; the token stays server-side; rate limiting and validation sit in one place.
- Cons: two functions and a status field instead of one call.

**Option B: Create the issue inline from a single action**
- Pros: fewer moving parts.
- Cons: a GitHub outage loses the report or blocks the player; no retry record.

**Option C: Download a file for the player to send**
- Pros: no backend.
- Cons: most reports would never arrive.

**Rationale:** A is the only option that cannot lose a report and keeps the credential off the client.

## External Dependencies

None added. GitHub is reached with the built-in `fetch` from a Convex action. The existing `@convex-dev/auth` Anonymous identity is reused as the per-user rate-limit key.

## Security and Privacy

- Token only in Convex env; never logged, never returned to the client, never in `lastError`.
- A public repository makes the issue and its game code public; the modal says so. Anyone with the code can already replay a game (`replayByCode` is deliberately shareable), so no new exposure is created by the code itself.
- Spam: authenticated users only, 5 per hour, bounded field lengths; a flood is further bounded by the per-user limit rather than a global switch. Revoking the token disables issue creation without affecting storage.

## Dev and Prod

Dev and prod share one Convex backend (see the single-backend note), so every report, including local test runs, lands in `urbancamo/sorcerers-cave`. Test Mode games are labelled `test-mode`. Developer testing of the real GitHub call should use a Test Mode game and the label to filter or bulk-close.
