# Test Mode

Test Mode is a QA-only harness that lets a tester script the next area drawn (including any plain
chamber/tunnel shape, not just the special areas), a chamber's contents, or a forced reaction
outcome, then play the scenario out through the normal solo UI. Full spec: `docs/specs/engine-spec.md`
(§Test Mode, `SC-Test-1`..`SC-Test-8`).

It is gated behind a magic-string secret so it can never be reached from a real game:

- The client reads the secret from the URL's `?test=` query param (`src/game/testMode.ts`) and
  remembers it in `sessionStorage` for the rest of the tab's session.
- The secret is **never validated client-side**. It's sent to Convex's `startTestGame` mutation
  (`convex/game.ts`), which compares it against the `TEST_MODE_SECRET` environment variable on the
  Convex deployment itself — never a `VITE_`-prefixed variable, so it is never bundled into the
  client build and never visible in browser devtools/source.
- If `TEST_MODE_SECRET` is unset on a deployment, every `startTestGame` call on that deployment
  fails closed — there's no way to accidentally leave Test Mode reachable.

Once the secret is configured and you load the app with the matching `?test=` param, the splash
screen shows a **"Start Test Game"** option; picking a party through it starts a game with
`testMode: true` and shows the in-game Test Mode control panel.

## Configuring locally

The secret lives on your **local Convex dev deployment** (the one `npx convex dev` / `pnpm convex`
targets, from `CONVEX_DEPLOYMENT` in `apps/web/.env.local`) — it is deployment config, not a
project file, so it's never checked into git.

```bash
cd apps/web
npx convex env set TEST_MODE_SECRET <your-secret-uuid>
```

Any string works, but a UUID (e.g. `uuidgen` on macOS/Linux) is a sane default — it just needs to
be hard to guess. Check what's currently set with:

```bash
npx convex env get TEST_MODE_SECRET
```

Then, with `pnpm dev` running, visit:

```
http://localhost:5173/?test=<your-secret-uuid>
```

## Configuring in Convex prod

Production's Convex functions are deployed as part of the Vercel build (`vercel.json`'s
`buildCommand` runs `npx convex deploy`), but environment variables are **not** part of that
deploy — they live on the prod deployment itself and are set once, out of band, the same way as
locally but with `--prod`:

```bash
cd apps/web
npx convex env set TEST_MODE_SECRET <your-secret-uuid> --prod
npx convex env get TEST_MODE_SECRET --prod   # verify
```

You can use the same secret value as your local dev deployment for convenience, or a different one
per environment — the two are independent. Once set, Test Mode works on the production site the
same way: visit `https://<your-prod-domain>/?test=<your-secret-uuid>`.

## Rotating or disabling

- **Rotate:** re-run `npx convex env set TEST_MODE_SECRET <new-uuid>` (add `--prod` for
  production) and share the new URL with whoever needs it — the old value stops working
  immediately.
- **Disable:** `npx convex env remove TEST_MODE_SECRET` (add `--prod` for production). Every
  `startTestGame` call then fails closed, and the splash screen's "Start Test Game" option
  disappears for anyone without a cached (now-invalid) secret.
