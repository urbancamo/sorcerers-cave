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

A `VITE_`-prefixed variable in `apps/web/src/game/featureFlags.ts` also gates behaviour, but it's a
**different trust model entirely** — anything `VITE_`-prefixed is bundled into the client
JavaScript and readable by anyone in browser devtools, so it only ever gates what the UI *offers*,
never anything that affects scoring or must be tamper-proof:

- **`VITE_MULTIPLAYER`** — shows/hides the multiplayer entry points on the splash screen. On
  automatically in local dev (`import.meta.env.DEV`); off in any built/deployed bundle unless set to
  `1`. Must stay unset in production until multiplayer is approved for release.

Set it the ordinary Vite way — in `apps/web/.env.local` (`VITE_MULTIPLAYER=1`), not via
`npx convex env set` (it's never read by any Convex function).
