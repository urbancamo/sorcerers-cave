# Test Mode

Test Mode is a QA-only harness that lets a tester script the next area drawn (including any plain
chamber/tunnel shape, not just the special areas), a chamber's contents, or a forced reaction
outcome, then play the scenario out through the normal solo UI. Full spec: `docs/specs/engine-spec.md`
(§Test Mode, `SC-Test-1`..`SC-Test-10`).

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

## Placing any area tile (2026-09-11)

The in-game Test Mode panel's "Next area — special" picker isn't limited to the ten rulebook
specials (Deep Pool, Viper Pit, …). It's grouped into two `<optgroup>`s:

- **Special areas** — the original ten.
- **Plain tiles** — one normal chamber, plus one tunnel per exit shape that actually exists in the
  deck (NE, NS, NW, EW, SW, NES, NEW, NSW, ESW, NESW, and the kit-only ES tunnel) — **and**, where
  the deck actually has one, a stair-up and/or stair-down printed variant of that same shape, e.g.
  "Tunnel ESW (stair up)", "Tunnel NESW (stairs up & down)". Only NW and the kit-only ES tunnel have
  no such variant — every NW/ES tile in the deck is plain.

Pick a direction and a tile, hit **"Queue next area"**, then move that way — the chosen tile is
placed and always connects, regardless of its printed orientation, exactly like a special. This is
the way to script, say, "the party is about to draw a dead-end NW tunnel," "the next room is a plain
chamber," or "the next tunnel has a stair up as well as its lateral exits" instead of only ever
landing on named specials. See `docs/specs/engine-spec.md` `SC-Test-8`/`SC-Test-9` for the full
mechanics.

## Repositioning and minimizing the panel (2026-09-11)

The Test Mode panel's title bar is a drag handle — grab it and move the pointer to reposition the
whole panel anywhere on screen (useful if it's covering something you need to see underneath, like
the 3D view's own card inspector in the same corner). The small button next to the title minimizes
the panel down to just its title bar; click it again to expand. Position and minimized state are
plain in-memory component state — they reset if you reload the page.

## Forcing dice — the Next Roll Selector (2026-09-11)

The panel's "Next reaction" buttons are now a **Next Roll Selector** toggle with three modes:

- **Next Reaction Roll** — unchanged: Friendly / Indifferent / Hostile buttons force the next
  reaction's OUTCOME directly, guaranteed regardless of which creature is leading (this is still the
  right choice if you need a specific outcome from a leader for whom it wouldn't normally be
  reachable, e.g. forcing "friendly" from a Dragon).
- **Next Single Die Roll** — pick a value 1-6 and queue it; the very next d6 rolled ANYWHERE in the
  engine (a combat round, a hazard, the Whirlpool crossing, the Chest, the Bell Rope, the Crypt, or
  even a reaction) uses that value instead of a real roll, then is consumed. A reaction that consumes
  it still bands the value through the leader's own thresholds — the same charisma/curse adjustment a
  genuine roll gets — so it may not produce the outcome you'd expect for every creature; use "Next
  Reaction Roll" instead when you need a guaranteed outcome.
- **All Die Rolls Until End Of Turn** — same as above, but the forced value applies to EVERY roll for
  the rest of the current turn, not just the next one. It clears automatically once the turn
  advances, or immediately via "Clear all overrides."

This is the tool for scripting anything that isn't a reaction — "the party's next fight round rolls
a 6," "the Whirlpool crossing always drags them down this turn," "the Chest always yields Gems."

## Saving and restoring a scenario for a bug report (2026-09-11)

Once you've scripted a scenario (queued an override, drawn a specific creature, forced a reaction,
whatever reproduces the bug), you can hand it off as a four-letter code:

- **Save:** click **"Save scenario"** in the Test Mode panel (or the HUD's save icon — same
  mutation either way). The code-reveal modal that pops up also offers:
  - **View replay** — opens the read-only replay viewer for that code, to sanity-check the scenario
    before sharing it.
  - **Copy debug bundle** — copies the game's full `{ game, moves }` log as JSON to your clipboard.
    This is the most direct artifact to paste into a bug report or hand to an AI reader — it's the
    exact seed/picks/variants plus every action and event, not just a snapshot.
- **Restore:** on the splash screen (only shown once Test Mode is unlocked via `?test=`), enter a
  code under **"Restore a test scenario"**. This works for ANY Test Mode game's code, not just ones
  you created — restoring **forks** it into a brand-new game you own, with its own new code, rather
  than resuming the original row. That's deliberate: you (or whoever you handed the code to) can
  replay and continue the same scenario as many times as needed without one attempt clobbering
  another's progress, and without ever mutating the original saved scenario.

Only a `testMode: true` game can be restored this way (a real player's game, or a multiplayer game,
is rejected) — see `docs/requirements/test-mode/2026-09-11-save-restore-test-scenario-plan.md` for
why that's the safe boundary, and `apps/web/convex/game.ts`'s `restoreTestScenario` mutation for the
implementation.

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
