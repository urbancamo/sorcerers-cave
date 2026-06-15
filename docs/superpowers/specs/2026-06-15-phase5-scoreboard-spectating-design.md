# Phase 5 — Live Scoreboard & Spectating — Design

> Multiplayer plan Phase 5 (§8.2 of `docs/requirements/2026-06-15-multiplayer-plan.html`).
> Created: 2026-06-15. Builds on the completed Phases 1–4 (beginner ruleset).

## Overview

When a player's party finishes (escaped / wiped / abandoned) they are not kicked out. By default they
land on a **live, Counter‑Strike‑style scoreboard** that keeps updating as the rest of the game plays
on, rendered as a **semi‑transparent overlay over the still‑running 3D cave**. From it they can dip
into the cave to watch read‑only (free‑roam camera), return to the scoreboard, or quit to the menu.
Players still exploring can also peek at the standings at any time. The persistent multiplayer
high‑score table (already built in Phase 4) remains the lasting record.

This is **Approach 1**: reuse the existing 3D renderer and the reactive `gameState` query; add only a
scoreboard component, a per‑party kill counter, a camera‑focus method, and overlay routing.

## Resolved scope decisions

- **Layout:** a dense leaderboard **table** (one row per party), sorted by score descending.
- **Columns:** `#` (rank), Party (colour chip + name), Status, Depth, Turns, Slain, Score.
  - Terminal rows show the outcome badge (Escaped / Perished / Abandoned) and final score; Depth shows `—`.
  - In‑maze rows show live Depth / Turns / Slain / Score‑so‑far.
- **Finish flow:** when your own party ends you go **straight to the scoreboard**, your row
  highlighted; your personal score breakdown is one click away (the existing `GameOverScreen`).
- **Active access:** players still exploring **can peek** at the scoreboard any time via a toggle.
- **Stats plumbing:** Depth / Turns / Score‑so‑far are derived from existing state. **Enemies slain**
  adds a small per‑party kill counter. **No presence / "last seen" signal** in this phase.
- **Spectator camera:** **free orbit + click‑to‑jump** — manual orbit/zoom over the shared map, and
  clicking a scoreboard row flies the camera to that party. (Clicking a map token to jump is a stretch goal.)
- **Game‑end view:** the **same scoreboard, frozen**, is the final results screen (replaces the
  current separate `Results` view).
- **Deck exhaustion is NOT an end condition.** With the area deck exhausted, parties navigate
  already‑placed tiles back toward a level‑1 up‑stair (the engine already allows moves onto existing
  areas without a draw; an undrawn frontier is simply a no‑op). A boxed‑in party must quit. Game‑end
  is solely "every seat is terminal," which already works via `advanceTurn → phase: "finished"`.

## Architecture

```
act mutation ── mpReduce ──> updates kills + status on PartyState ──> game.state patched
                                                                          │  (reactive)
gameState query ── projection (adds depth/turns/kills) ──────────────────┘
        │
        ├── MultiplayerPlay  (phase: playing | finished)  — renders read-only CaveCanvas + Scoreboard overlay
        └── ScoreboardPanel ── useQuery(gameState) ── <Scoreboard> (pure presentational)
```

One reactive source (`gameState`), one presentational component reused in three contexts, the existing
renderer reused for spectating.

## Server & data model

### Per‑party kill counter (`packages/engine/src/multi.ts`)

- Add `kills: number` to the `PartyState` interface (a multiplayer‑only field, alongside
  `seat/color/name/status`; **not** added to the solo `GameState`, so solo is untouched).
- `buildMpGame` initialises `kills: 0` for every seat.
- In `mpReduce`, after the engine `reduce` runs, increment the acting party's `kills` by the number of
  `strangerKilled` + `annihilated` events in the result, and carry it onto the rebuilt `PartyState`:
  `kills: (party.kills ?? 0) + slain`. In‑flight games lacking the field default to `0` via `?? 0`.

### `gameState` projection (`apps/web/convex/multiplayer.ts`)

Extend each party entry (currently `seat/name/color/status/members/score`) with:

- `depth: p.level`, `turns: p.turn`, `kills: p.kills ?? 0`.

`score` (via `scoreGame(partyView(...))`), `status` (= outcome), `name`, `color`, `members` already
exist. No new tables. The query is already membership‑gated and reactive; a finished player remains a
`players` member, so terminal/finished clients keep receiving updates.

### `playView` query (`apps/web/convex/multiplayer.ts`)

Extend `playView` to also serve `phase: "finished"` (return the composed state with `yourTurn: false`
for all seats), so the renderer stays mounted through game‑over for the frozen overlay.

## Scoreboard component (`apps/web/src/game/`)

- **`Scoreboard.tsx`** — a **pure presentational** component. Props: `parties` (the `gameState`
  projection shape), `youSeat`, `frozen?`, and footer callbacks `onSpectate?`, `onViewMyRun?`,
  `onQuit?`, `onResume?`, `onBackToMenu?`, and `onRowClick?(seat)`.
  - Renders the leaderboard table sorted by `score` desc; highlights the `youSeat` row; terminal rows
    show the outcome badge + final score, in‑maze rows show Depth / Turns / Slain / Score.
  - Footer buttons render only for the callbacks the parent supplies.
  - Row click → `onRowClick(seat)`.
- **`ScoreboardPanel.tsx`** — thin wrapper that does `useQuery(api.multiplayer.gameState, { gameId })`
  and renders `<Scoreboard>` (keeps the pure component test‑friendly and decoupled from Convex).

### Overlay presentation & contrast (REQUIRED)

The overlay is a translucent, blurred scrim over the live cave with a translucent panel. Text **must
remain clearly legible over the moving 3D scene**:

- The scrim uses a dark wash (≈ `rgba(10,10,14,0.55)`) plus `backdrop-filter: blur(3–4px)`.
- The panel sits on a darker translucent fill (≈ `rgba(16,16,22,0.86)`) with a brass border.
- Body text and numbers target **WCAG AA contrast (≥ 4.5:1)** against the panel fill; the score
  accent (brass `--brass-bright`) and status badges must also clear AA. Verify against the busiest
  (brightly‑lit) cave backdrop, not just a dark one — bump panel opacity if needed rather than letting
  contrast drop.

## Spectator camera (`apps/web/src/view/`)

- **`cave3d.js` / `cave3d.d.ts`:** add a `focusArea(coord)` method to the `boot` return value. Using
  the existing `worldPos({col,row,level})` and orbit controls, it eases the camera target to that
  area and switches to free orbit. Add it to `BootOptions`'s return type.
- **`CaveCanvas.tsx`:** expose `focusArea` via a ref (or an imperative handle / callback prop) so React
  can drive the camera. Reuse the existing `otherParties` token rendering.
- **Read‑only:** no new mode needed — terminal/finished seats already fail `canAct()`, so no doorways
  or moves are offered. "Dip into the cave" only hides the scrim.
- **Click‑to‑jump:** `onRowClick(seat)` resolves `parties[seat].partyArea → areas[partyArea].coord`
  and calls `focusArea(coord)`, fading the scrim out. Clicking your own row may instead open your
  personal `GameOverScreen` breakdown. **Stretch goal:** raycast picking on the other‑party token group
  so clicking a token on the map jumps the camera too.

## Routing & state (`MultiplayerGame.tsx`, `MultiplayerPlay.tsx`)

- `MultiplayerGame` routes **both `playing` and `finished`** to `MultiplayerPlay`. The standalone
  `Results` component is removed; `finished` shows the frozen scoreboard overlay in `MultiplayerPlay`.
- `MultiplayerPlay` overlay state:
  - **Active player (your party exploring, game ongoing):** a top‑right **"Standings"** toggle opens
    the scoreboard scrim with a single **Resume** button.
  - **Your party terminal, game ongoing:** scrim shown by default → **Dip into the cave** (fade out),
    **My run ▸** (opens `GameOverScreen` as a sub‑modal, no save form), **Quit to menu** (`onExit`).
    A small **Standings** affordance returns from spectating to the scrim.
  - **Whole game finished:** frozen scrim by default → **Dip into the cave**, **Back to menu**.
- The personal breakdown reuses the existing `GameOverScreen` (state = `partyView`, `onNewGame =
  onExit`, no `onSaveScore`).

## Out of scope

- Presence / "last seen" / who‑is‑watching indicator.
- Inter‑party interaction (trading, party‑vs‑party fights), unions, division, fog‑of‑war (Phases 6–7).
- Map‑token click‑to‑jump is a stretch goal, not required for completion.

## Testing

- **Engine (`packages/engine/src/multi.test.ts`):**
  - `mpReduce` increments the acting party's `kills` on `strangerKilled`/`annihilated` events and not
    on unrelated events (deterministic via constructed fight states).
  - `buildMpGame` initialises `kills: 0`.
- **Convex (`apps/web/convex/multiplayer.test.ts`):**
  - `gameState` projection returns numeric `depth`, `turns`, `kills` for each party.
  - `playView` returns a state for a game in `phase: "finished"`.
- **Frontend (`apps/web/src/game/Scoreboard.test.tsx`):** render the pure `Scoreboard` with a fixed
  `parties` array (RTL, like `GameOverScreen.test.tsx`): score‑descending order, your‑row highlight,
  terminal‑vs‑in‑maze row content, and that footer callbacks fire on click.

## Delivery

Two increments under this one spec/plan, landed as two PRs:

1. **Live scoreboard** — `kills` counter, `gameState`/`playView` projection changes, `Scoreboard` +
   `ScoreboardPanel`, overlay routing in `MultiplayerPlay`/`MultiplayerGame` (replacing `Results`),
   contrast‑checked translucent overlay, peek toggle, finish‑straight‑to‑scoreboard, frozen game‑end.
2. **Spectator camera** — `focusArea` in cave3d + `CaveCanvas`, dip‑in / back‑to‑scoreboard, row
   click‑to‑jump. (Token click‑to‑jump stretch.)

Multiplayer stays behind the production‑off feature flag throughout; not deployed to production.
