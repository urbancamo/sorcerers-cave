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

Turns on the **Dead End rule** ("forced redraw", `docs/specs/engine-spec.md` §6.3.2): when a party
has genuinely run out of every doorway or stairway it could try anywhere in its explored map
(including backtracking), the area card that just made the last dead end is reshuffled into the
pack and a new one drawn, until a way opens. Off by default — today's behaviour (a fully boxed-in
tunnel can soft-lock, SC-6.3-1) is unchanged unless this is set.

It is **never player-selectable and never sent by the client** — unlike the Extension Kit, which a
player chooses in the party screen, this flag changes scoring difficulty, so a tampered client
request must not be able to switch it on for one run. It's folded into a new game's `variants`
entirely server-side, in `convex/game.ts`'s `newGame`/`startTestGame` handlers; the client-facing
`variants` argument has no key for it at all. Because it affects difficulty, a game recorded with it
on is kept in its own leaderboard table (`extensionKit`-style segmentation, `convex/highScores.ts`)
— never compared head-to-head against a run that couldn't be rescued.

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

There's a separate, purely cosmetic client-side flag with a confusingly similar name — see
[Client-side flags are not server options](#client-side-flags-are-not-server-options) below before
reaching for `VITE_FORCED_REDRAW`.

## `TEST_MODE_SECRET`

Gates **Test Mode**, the QA harness for scripting a scenario (forced draws, forced reactions, forced
dice) and playing it out through the normal solo UI. Unset ⇒ Test Mode is unreachable on that
deployment (fails closed). Full setup, rotation, and usage instructions live in
[`TEST-MODE.md`](TEST-MODE.md#configuring-locally) — the short version:

```bash
cd apps/web
npx convex env set TEST_MODE_SECRET <a-hard-to-guess-string>        # local dev
npx convex env set TEST_MODE_SECRET <a-hard-to-guess-string> --prod # production
```

then visit `http://localhost:5173/?test=<that-string>` (or your prod domain, for the `--prod` value).

## `CONVEX_SITE_URL`

Read by `convex/auth.config.ts` for the auth provider's domain. **Auto-injected by Convex into every
deployment's function runtime** — this is not something you set yourself; it's listed here only so
it isn't mistaken for a missing option if you go looking for it in `npx convex env list`.

## Auth signing keys (`JWT_PRIVATE_KEY`, `JWKS`)

Required by `@convex-dev/auth` for anonymous-session signing. Each deployment (local dev and prod)
needs its **own** keypair — never share the local dev keys with production. See the root
[`README.md`](../README.md#deployment-vercel--convex) ("Auth keys on prod") for how to generate and
set a fresh keypair; there's nothing project-specific to configure beyond following Convex's own
`@convex-dev/auth` setup for a new deployment.

## Client-side flags are not server options

Two `VITE_`-prefixed variables in `apps/web/src/game/featureFlags.ts` also gate behaviour, but they
are a **different trust model entirely** — anything `VITE_`-prefixed is bundled into the client
JavaScript and readable by anyone in browser devtools, so these only ever gate what the UI *offers*,
never anything that affects scoring or must be tamper-proof:

- **`VITE_MULTIPLAYER`** — shows/hides the multiplayer entry points on the splash screen. On
  automatically in local dev (`import.meta.env.DEV`); off in any built/deployed bundle unless set to
  `1`. Must stay unset in production until multiplayer is approved for release.
- **`VITE_FORCED_REDRAW`** — **cosmetic only**: which of the two leaderboard tables (rescued vs.
  not) `HighScores.tsx` opens on by default. It has **no effect on what gets recorded** — that's
  `FORCED_REDRAW_ENABLED` above, and the two are independent. Setting this client flag does **not**
  turn the Dead End rule on for any game.

Set these the ordinary Vite way — in `apps/web/.env.local` (`VITE_MULTIPLAYER=1`), not via
`npx convex env set` (they're never read by any Convex function).
