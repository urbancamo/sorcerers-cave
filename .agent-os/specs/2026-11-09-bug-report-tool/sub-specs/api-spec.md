# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2026-11-09-bug-report-tool/spec.md

> Created: 2026-11-09
> Version: 1.0.0

## Endpoints

### `bugReport.submit` (public mutation)

**Purpose:** Validate and store a report, then schedule the GitHub issue.
**Parameters:**
- `gameId?: Id<'games'>`
- `description: string` (trimmed, 10-5000 chars)
- `expected?: string` (<= 2000)
- `category: 'rules' | 'display' | 'crash' | 'other'`
- `contact?: string` (<= 200)
- `client: { userAgent: string (<= 400), viewport: string (<= 30), build: string (<= 40) }`

**Behaviour:**
1. Require `getAuthUserId(ctx)`; otherwise throw.
2. Validate lengths after trimming; reject control characters other than newline and tab.
3. If `gameId` is given, load the game; if missing or `ownerId` differs, throw (same IDOR rule as `game.log`). Read `code` and `testMode` (from `game.state.testMode`) from it.
4. Count this user's reports in the last hour via `by_owner_and_created`; if 5 or more, throw `ConvexError` "Too many reports; please try again later."
5. Insert the row with `status: 'pending'`, `attempts: 0`.
6. `ctx.scheduler.runAfter(0, internal.bugReport.createIssue, { id })`.

**Response:** `{ ref: string, code: string | null }` where `ref` is the report id (shown to the player).
**Errors:** unauthenticated; validation failure; not the game's owner; rate limit exceeded. The mutation never fails because of GitHub.

### `bugReport.createIssue` (internal action)

**Purpose:** Build and POST the GitHub issue, record the result.
**Parameters:** `{ id: Id<'bugReports'> }`
**Flow:** `runQuery(getForIssue)` -> build title/labels/body -> `fetch` to GitHub -> `runMutation(markCreated | markFailed)`.
**Idempotence:** if the row is already `created`, return without calling GitHub, so a duplicate scheduler run cannot create two issues.
**Errors:** handled internally and written to the row (see technical spec); the action does not throw to the scheduler except on bugs.

### `bugReport.getForIssue` (internal query)

**Parameters:** `{ id }`
**Returns:** the report, plus `{ game: { code, status, level, turn, area, color, variants, testMode } | null, log: <game.log shape> | null }`. Shares its log-building helper with `game.log`.

### `bugReport.markCreated` / `bugReport.markFailed` (internal mutations)

`markCreated({ id, issueNumber, issueUrl })` sets `status: 'created'`. `markFailed({ id, error, retryInMs? })` increments `attempts`, stores `lastError`, and either schedules `createIssue` again (`retryInMs` set and attempts < 5) or sets `status: 'failed'`.

## GitHub API used

`POST /repos/urbancamo/sorcerers-cave/issues` with `{ title, body, labels }`. Success is `201` with `number` and `html_url`. No other GitHub endpoint is called.

## Integration with features

`GameScreen` calls `useMutation(api.bugReport.submit)` from `BugReportModal`. There is no query for report status in v1; the modal shows the reference returned by `submit`. No HTTP route is added to `convex/http.ts`.
