# Admin panel: implementation plan

## Context

`docs/requirements/admin-panel/requirements.md` asks for a hidden `/login` (username + password, no recovery), RBAC roles
`SYSTEM`, `USER`, `ANALYTICS`, `TEST`, and an admin panel with role-gated tabs. Only **Game Analytics** and **Testing** are
built now; System and User tabs are shown to the right roles as "coming soon" stubs. Testing replaces the `?test=<UUID>`
Test Mode unlock with the `TEST` role.

Decisions agreed with MSW: **Convex Auth v1 Password provider now, v2 later** (v2 has no usable anonymous sign-in, so it
cannot yet replace the anonymous player sessions; migration tooling is "coming soon"); **roles as a set on `users`, SYSTEM
implies all**; **accounts seeded by a one-off CLI command, public sign-up closed**; **`TEST_MODE_SECRET` removed, TEST role only**.

## 1. Backend: auth and roles (`apps/web/convex/`)

- `schema.ts`: re-declare `users` after `...authTables` with `roles: v.optional(v.array(v.union(literals)))`, keeping the
  library's `email` and `phone` indexes and its field validator (`authTables.users.validator.fields`).
- `auth.ts`: add a `Password` provider alongside `Anonymous`. Custom `profile(params)` returns
  `{ email: <lowercased username> }` (the library keys accounts on `email`; it is a username here, no `@`), and **throws unless
  `params.flow === "signIn"`**. That closes sign-up, and `reset`/`verify` are left unset so recovery flows are dead.
  `profile` never reads roles from params (escalation guard).
- `convex/roles.ts`: `hasRole(user, role)` (SYSTEM implies all), `requireRole(ctx, role)` following the existing
  `getAuthUserId` + "Forbidden" style, and a public `me` query returning `{ roles }` (empty for anonymous/signed-out).
- `convex/admin.ts` `internalAction` **`seedUser({username, password, roles})`** using `createAccount` from
  `@convex-dev/auth/server` (idempotent; `store` is already exported). Run with
  `npx convex run internal.admin:seedUser '{...}'` (add `--prod`). A second internal function rotates a password via
  `modifyAccountCredentials`. No public mutation can write `users`.
- Shared deployment note: codegen/deploy touches the shared backend, so ask before running them.

## 2. Backend: Test Mode re-gating (`convex/game.ts`)

- `startTestGame`: drop the `secret` arg and `TEST_MODE_SECRET` check; require `requireRole(ctx, "TEST")`. Still creates
  with `testMode: true` and lifted party limits.
- `restoreTestScenario`: add the TEST role check (currently any signed-in user can fork by code); keep the
  `state.testMode` check on the source.
- In-game test actions stay gated by the game's persisted `state.testMode` (engine), so they are covered transitively.
- Remove the env var from dev and prod after deploy (`convex env remove TEST_MODE_SECRET`).

## 3. Backend: analytics data (`convex/schema.ts`, `game.ts`, new `analytics.ts`)

Games hold a large inline `state` blob and only `by_owner`/`by_code` indexes, so counting from `games` is unsafe.

- New plain table **`gameStats`**: one row per finished solo game or multiplayer party. Fields: `gameId`, `mode`
  (solo/multi), `outcome` (escaped/dead/quit), `score`, `turn`, `deepestLevel`, `areas`, `dragonKills`, `membersLost`,
  `picks`, `variants`, `testMode`, `players`, `finishedAt`. Indexes `by_finishedAt`, `by_outcome_and_finishedAt`,
  `by_gameId`. Test Mode games are never recorded (so the "include test games" filter in section 5 is dropped; live games still flag them).
- Written where status flips to finished (`applyAction`, `game.ts` ~269-270, using `scoreGame`/`scoreBreakdown`) and in
  multiplayer `recordTerminals` (~564-590), since multi `games.status` never flips. Idempotent on `gameId`.
- **Backfill** internal mutation over existing finished games (follow `highScores.backfillMaxDepth`).
- New index `games.by_status_and_updatedAt` for live games.
- A small `gameStatsTotals` doc (counters updated with each write) for headline totals; distributions come from a bounded
  window (most recent N rows via `by_finishedAt`, `.take`), never `.collect().length`.
- Queries (all `requireRole(ctx, "ANALYTICS")`): `analytics.liveGames` (bounded, by `by_status_and_updatedAt`),
  `analytics.history` (paginated, filter by outcome/mode via the indexes), `analytics.summary` (totals + window aggregates).
- Known limits, stated in the UI: duration is approximate, cause of death is not stored, and `highScores` is a biased
  subset so it is not used.

## 4. Frontend routing and shell (`apps/web/src/`)

- No router exists. In `App.tsx` a path check: `/login` and `/admin*` render `AdminApp`; everything else is unchanged.
  `AdminApp` never mounts `GameScreen` (its effect would sign in anonymously).
- `vercel.json`: add an SPA rewrite so `/login` and `/admin` survive refresh and direct visits in production.
- `src/admin/`: `AdminApp.tsx` (reads `me`; not signed in or no roles shows the login form; otherwise the shell),
  `LoginForm.tsx` (username + password via `signIn("password", {flow:"signIn", email, password})`, generic error, no
  sign-up/recovery links), `AdminShell.tsx` (tabs shown only for held roles; System and User are "coming soon" stubs;
  Sign out then navigates to `/` so the anonymous flow re-signs in). Gate on the **server-side role query**, not
  `useConvexAuth`, since anonymous players are authenticated too.
- Own scroll container (`.scv-shell` is 100vh with overflow hidden). Reuse `.scv-hs-tabs`, `.scv-hs-table`, `.scv-panel`,
  `.scv-bug-field` forms, `.scv-primary`/`.scv-ghost`; styles in `styles.css` under `.scv-admin*`, following `DESIGN.md`
  tokens (confirm `--ink` is defined).

## 5. Game Analytics tab

Three sections, a header filter (Solo / Multi / All):
1. **Overview panel**: stat tiles (games played, escape rate, death rate, quit rate, average and median score, average
   deepest level) and hand-rolled inline-SVG charts (no chart library): outcome split (stacked bar), score distribution
   (histogram), games per day (bars), deepest-level reach (funnel), party composition and variant uptake (ranked bars),
   dragon-kill and members-lost distributions. Use the `dataviz` skill for colour and layout, CSS variables for theming.
2. **Live games**: table of in-progress games (code, mode, players, level, turn, last activity), auto-updating via the
   reactive query.
3. **History**: paginated table (date, mode, party, outcome, score, level, turn, variants) with outcome/mode filters and a
   link to the existing replay viewer (`ReplayView`, `replayByCode`) where available.

## 6. Testing tab and removal of `?test=`

- Testing tab (TEST role): start a test game (reuses `PartySelect` with `testMode`) and restore a scenario by code, then
  hand off into `GameScreen`, which keeps `TestControlsPanel` (it needs live game state). Hand-off via a small navigation
  that opens `/` with the test game id/pending action (decide in implementation: a `sessionStorage` handoff or query param
  carrying only a game code, never a secret).
- Remove from the main flow: `getTestSecret()`/`?test=` and the `scv-test-secret` sessionStorage key (`src/game/testMode.ts`
  deleted), the `testSecret` wiring in `GameScreen.tsx` (`wantTestGame`, `onStartTestGame`/`onRestoreTestScenario` props to
  the splash, `testMode` prop to `PartySelect` for normal games), and the test buttons in `SplashScreen.tsx`. A signed-in
  TEST user (via the `me` query) may still see a link to the admin Testing tab.
- Docs updated: `apps/web/OPTIONS.md` (remove the secret section; document seeding and roles), `apps/web/TEST-MODE.md`,
  `docs/testing/search-scenarios.md` (ScenarioBrowser "List" now gated by role).

## 7. Tests

- Convex (`convex-test`): `roles.test.ts` (unauthenticated, anonymous/no role, role present, SYSTEM implies all);
  update `game.test.ts` (~74-83, 567-758) to seed a TEST user instead of `TEST_MODE_SECRET`; `analytics` queries (role
  gating, test games excluded, bounded windows); `gameStats` written once on finish for solo and multi, idempotent;
  backfill. Add a `roles` param to the `asUser` helper. The `profile` sign-up gate is extracted as a pure function and
  unit-tested (convex-test cannot run real password sign-in).
- Web (vitest, mock `convex/react` per file): delete `testMode.test.ts`; update `SplashScreen.test` (96-134),
  `PartySelect.test`, `TestControlsPanel.test`, `ScenarioBrowser.test` (52); new tests for `LoginForm`, `AdminShell` tab
  gating, analytics chart components (pure aggregate helpers).
- Engine: no change, so the engine spec needs no edit. Player manual: no player-visible change (admin is hidden; the
  removal of `?test=` is developer tooling), to be stated in the PR.

## 8. Milestones

1. Auth + roles + seed + Test Mode re-gating (backend and tests); seed an initial SYSTEM account.
2. `/login`, routing, shell, Testing tab, removal of `?test=`, docs.
3. `gameStats` + totals + backfill + queries.
4. Analytics tab UI and charts.
5. Polish, responsive check, docs, PR.

## Verification

- `pnpm --filter web test` and `tsc`; engine tests unchanged and passing.
- After approval to deploy: `npx convex codegen`/deploy to the shared backend, seed one admin per role mix, then in the
  browser: `/login` rejects bad credentials and cannot sign up; ANALYTICS-only user sees only Analytics; TEST-only user sees
  only Testing; SYSTEM sees all; anonymous player at `/` is unaffected; Test Mode no longer unlocks via `?test=`; starting
  a test game from the Testing tab works with the test panel; refresh on `/admin` works in the Vercel preview.
- Analytics: play a solo game to escape/death/quit and a multiplayer party, confirm rows appear once, tiles and charts
  update, live games show then disappear on finish, backfill matches existing history.

## Deferred

- Migration to Convex Auth v2 (once it supports anonymous sessions and ships migration tooling).
- System and User administration tabs; password change/recovery.
