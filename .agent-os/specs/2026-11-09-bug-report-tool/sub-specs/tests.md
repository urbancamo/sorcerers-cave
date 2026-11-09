# Tests Specification

This is the tests coverage details for the spec detailed in @.agent-os/specs/2026-11-09-bug-report-tool/spec.md

> Created: 2026-11-09
> Version: 1.0.0

## Test Coverage

### Unit Tests

**`buildIssue` (pure helper in `convex/bugReport.ts` or `convex/bugReportIssue.ts`)**
- Title is `[bug-report] ` + first line, truncated at 80 characters; Test Mode adds the `[test-mode] ` prefix.
- Labels: always `bug-report`; `test-mode` only when `testMode`; the right `category:*` label.
- `@name` in player text is neutralised (zero-width space) and backticks cannot close the fenced block.
- `contact` never appears in the body.
- The log `<details>` block is included when the body fits and omitted, with a note, when it would exceed 60,000 characters.
- Context table shows game code, level, turn, area, variants and build from the server data.

**Retry policy helper**
- 5xx, 429 and network errors give the backoff 1, 5, 30 minutes, 2 hours; `Retry-After` overrides when larger.
- 401/403/404/422 are permanent; missing token is permanent with `'not configured'`.
- No retry after 5 attempts.

### Integration Tests (`convex-test`, `fetch` mocked)

**`bugReport.submit`**
- Unauthenticated call is rejected.
- Valid report stores a `pending` row and schedules `createIssue`.
- `description` under 10 or over 5000 characters, over-long `contact`, and control characters are rejected.
- A `gameId` owned by another user is rejected; a missing game is rejected.
- `testMode` and `code` are taken from the game row, ignoring anything a client might send.
- The sixth report within an hour is rejected; a report after the hour passes (fake timers) is accepted.
- A report without `gameId` is accepted.

**`bugReport.createIssue`**
- On a 201 response the row becomes `created` with `issueNumber` and `issueUrl`.
- Request carries `Authorization: Bearer <token>`, the GitHub headers, and the expected `title`, `labels`, `body`.
- Test Mode game gives the `test-mode` label; a normal game does not.
- 503 then 201 on retry ends `created` with `attempts: 2`.
- 422 ends `failed` with no retry; `lastError` contains the status and message and not the token.
- Missing `GITHUB_ISSUES_TOKEN` ends `failed` with `'not configured'` and makes no `fetch` call.
- A row already `created` makes no `fetch` call (no duplicate issue).

### Component Tests (Vitest + Testing Library)

**`TitleBar`**
- The bug icon is present with `testMode` false and with `testMode` true; the `T` icon remains test-mode only.
- Clicking it calls `onBug`; it is not disabled during a fight.

**`BugReportModal`**
- Submit is disabled until the description is at least 10 characters.
- A successful submit shows the reference and game code; failure keeps the typed text and shows the error.
- The privacy note and the Help button are present.
- Closing it dispatches no game action.

**`GameScreen`**
- Opening and closing the modal leaves the engine state and dice queue unchanged.

### Manual drift test

`src/manual/manual.test.ts` and `help.test.tsx` stay green with the new `bug-report` topic and its `screens` tag.

### Manual checks (add to `docs/validation/manual-test-checklist.md`)

- Real submission from a Test Mode game against the real repository creates a labelled issue (then close it).
- Submission with the GitHub token removed still confirms to the player and leaves a `failed` row.

## Mocking Requirements

- **GitHub API:** stub global `fetch` in the Convex action tests; assert on URL, headers and JSON body, and return scripted status sequences for the retry cases.
- **Time:** use fake timers for the rate-limit window and `convex-test`'s scheduler helpers for retry scheduling.
- **Convex env:** set `GITHUB_ISSUES_TOKEN` and `GITHUB_ISSUES_REPO` per test with `process.env`.
- **Browser info:** stub `navigator.userAgent` and `window.innerWidth/innerHeight` in the modal tests.
