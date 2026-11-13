# Admin panel

A hidden administration area at `/login` and `/admin`. Nothing on the main screen links to it. It never signs the visitor in
anonymously, so a player who finds the URL sees only a sign-in form.

## Accounts and roles

Sign-in is a username and a password (Convex Auth's Password provider, `convex/auth.ts`). **Public sign-up is closed**:
the provider's `profile` gate refuses every flow except sign-in, and there is no password change or recovery. Accounts are
created from the command line, with the roles they hold:

| Role | Opens |
|---|---|
| `SYSTEM` | everything (implies every other role); System tab (not built yet) |
| `USER` | Users tab |
| `ANALYTICS` | Game Analytics tab |
| `TEST` | Testing tab, and Test Mode in the game |

The first `SYSTEM` account is created from the command line; after that, accounts are added from the Users tab (below).

Roles live on the `users` row and are written only by the internal seed functions in `convex/admin.ts`. Commands, and how to
remove the old `TEST_MODE_SECRET`, are in [`OPTIONS.md`](OPTIONS.md#admin-accounts-and-test-mode-access). Every admin query and
mutation checks the role on the server (`convex/roles.ts`); the tabs hidden in the UI are a convenience, not the protection.

## Users

The Users tab (`USER` role) lists the login accounts, lets you add and delete users, and edit their roles.

- **Add a user:** enter a username (3 to 40 letters, digits, dot, dash or underscore) and tick their roles. The app makes a link of the form
  `/invite/<uuid>`, shown **once**, for you to copy and send. The person opens it and chooses their own password (at least 10 characters);
  nothing is emailed. The link works once and expires after 7 days. Until it is used the user appears under *Waiting for a password*,
  where **New link** replaces the link (the old one stops working) and **Cancel invite** removes it. The login is created when the
  password is set, with the roles chosen at invite time. They then sign in at `/login`.
- **Edit roles:** inline, per user. At least one role is required. You cannot change your own roles.
- **Delete:** two presses. It removes the login, its sessions and refresh tokens, so they cannot sign in again. Their games and recorded
  statistics are kept. You cannot delete yourself.
- **SYSTEM is guarded:** only a `SYSTEM` user can grant or remove `SYSTEM`, invite someone with it, or delete or manage a `SYSTEM` user, so a
  `USER` admin cannot promote themselves.
- **Security of the link:** the token is a random UUID and only its SHA-256 hash is stored (table `invites`), so a copy of the database does not
  yield working links. The set-password page and its two functions (`invites:check`, `invites:redeem`) are the only unauthenticated entry
  points; they succeed only with a valid, unexpired token.

## Game Analytics

- **Data:** `gameStats` has one row per finished solo game or multiplayer party, written where a game finishes (`applyAction`,
  `strangerDecision.commit`, multiplayer `recordTerminals`). `gameStatsTotals` keeps running totals. Test Mode games are never
  recorded. It holds deaths and quits too, unlike `highScores`.
- **Overview:** headline totals cover every game; the charts cover the newest 1000 (`WINDOW` in `convex/analytics.ts`). Duration and
  cause of death are not recorded.
- **Live games:** active games touched in the last 30 minutes.
- **History:** every recorded game, newest first, with a replay for solo games.

### Backfill (once, after the first deploy)

Games finished before the table existed are added by two idempotent commands. Run each, repeating with the returned
`continueCursor` until `isDone` is true:

```bash
cd apps/web
npx convex run gameStats:backfill      '{"paginationOpts":{"numItems":20,"cursor":null}}'   # solo games
npx convex run gameStats:backfillMulti '{"paginationOpts":{"numItems":50,"cursor":null}}'   # multiplayer parties
```

Backfilled rows take the game's last update as their finish time, so the per-day chart is approximate for old games.

## Testing

The tab starts a Test Mode game with any party, forks a saved scenario by code, and browses the scenario games. Starting or
restoring opens the normal game screen on that game (its id is passed in `sessionStorage`; the server still checks ownership).
See [`TEST-MODE.md`](TEST-MODE.md).

## Deferred

Moving to Convex Auth 2.0 (it has no usable anonymous sign-in yet, which the players rely on), and the System tab. Password change and recovery are not built: an admin can issue a new set-password link only for a user who has not set one yet (to reset a password, delete the user and invite them again, or use `admin:setPassword` from the CLI).
