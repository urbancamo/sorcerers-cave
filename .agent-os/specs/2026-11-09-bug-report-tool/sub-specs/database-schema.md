# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2026-11-09-bug-report-tool/spec.md

> Created: 2026-11-09
> Version: 1.0.0

## Changes

One new table, `bugReports`, added to `apps/web/convex/schema.ts`. No existing table changes, so no migration or backfill.

```ts
bugReports: defineTable({
  ownerId: v.id('users'),
  // The game the report was filed from. Optional: a report can be filed without one.
  gameId: v.optional(v.id('games')),
  // Denormalised at submit time so the row stays readable if the game is later removed.
  code: v.optional(v.string()),
  testMode: v.boolean(),
  description: v.string(),
  expected: v.optional(v.string()),
  category: v.union(
    v.literal('rules'),
    v.literal('display'),
    v.literal('crash'),
    v.literal('other'),
  ),
  contact: v.optional(v.string()),
  client: v.object({
    userAgent: v.string(),
    viewport: v.string(),
    build: v.string(),
  }),
  // pending: waiting for (or retrying) the GitHub call; created: issue exists; failed: gave up.
  status: v.union(v.literal('pending'), v.literal('created'), v.literal('failed')),
  attempts: v.number(),
  issueNumber: v.optional(v.number()),
  issueUrl: v.optional(v.string()),
  lastError: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_owner_and_created', ['ownerId', 'createdAt'])
  .index('by_status', ['status']),
```

## Specifications

- `by_owner_and_created` serves the rate limit: count rows for `ownerId` with `createdAt` in the last hour.
- `by_status` lets a future admin job re-run `failed` rows after the token is fixed.
- `testMode` is read from the persisted game state at submit time (the same server-authoritative source `game.log` uses), never from an argument.
- Existing code style note: string literals in this file follow the neighbouring schema code; match whatever quoting `schema.ts` already uses when editing it.

## Rationale

- Storing before calling GitHub makes the row the durable record and gives retries something to act on.
- `lastError` and `attempts` make a stuck report diagnosable from the Convex dashboard.
- `contact` stays in Convex only; the issue is public.
- No game log is copied into the row: the log is read from `gameEvents` when the issue is built, avoiding a large duplicate document.
