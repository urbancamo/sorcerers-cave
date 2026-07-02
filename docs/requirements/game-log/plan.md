# Game Move-Log & Replay — Implementation Plan

> Requirements: `docs/requirements/game-log/requirements.md`
> Branch: `game-move-log`
> Scope (confirmed): log + download + **engine replay helper**. Solo games this branch;
> designed so multiplayer can adopt the same format later. No graphical replay player yet.

## How the plan fits the requirements

| Req | Requirement | How it's met |
|-----|-------------|--------------|
| 1 | Persist entire game — every action + consequence — replayable move-by-move | The engine is a **pure, deterministic, seeded reducer**. A game is fully captured by `seed + picks + ordered action list`. The `gameEvents` table already records `{seq, action, events}` per action via the single `applyAction` chokepoint; we add the initial `seed`/`picks` so a game replays **from scratch**. |
| 2 | HUD debug/log icon → menu → download human- or machine-readable log | New debug `.btn` in the `CaveHud` dock opens a `GameLogModal` with two client-side downloads: `<code>-log.json` (machine) and `<code>-log.txt` (human). |
| 3 | Piggyback the UI↔backend interface; best practices; extends naturally | Reuses the existing `applyAction` → `gameEvents` path (no parallel logging). The log format is engine-authoritative and deterministic; the stored per-move `events` are a convenience/verification layer. The `{seq, action, events}` shape + a future `seat` field lets multiplayer reuse it unchanged. |
| 4 | Enough detail to replay from scratch, forward/backward like a movie player | Engine `replay(seed, picks, actions) → ReplayFrame[]` reconstructs **every** frame. A viewer indexes the array (◀ ▶). The downloaded JSON is self-contained (seed+picks+actions) → replayable offline with no DB. |

## Design

### Log format (self-contained, replayable)
```jsonc
{
  "version": 1,
  "game":  { "code": "ABCD", "seed": 12345, "picks": [0,5,4], "color": "green",
             "createdAt": 1720000000000, "status": "active" },
  "moves": [ { "seq": 0, "action": { "type": "move", "dir": 3 },
              "events": [ { "type": "moved", ... }, ... ] }, ... ]
}
```
Replay = `newGame(seed, picks)` then fold `reduce` over `moves[i].action`. Every intermediate
state is reconstructable. Determinism holds because **all** actions — player *and*
renderer-initiated (e.g. ghouls-on-entry) — flow through `applyAction` and are logged in `seq`
order; the RNG cursor lives inside the state, so replaying the action list reproduces every roll.

### Engine — `packages/engine/src/replay.ts` (pure, tested)
```ts
export interface ReplayFrame { seq: number; action: GameAction | null; state: GameState; events: GameEvent[]; }
// frame 0 = initial state (action null); frame i = state AFTER actions[0..i-1], with the i-th events.
export function replay(seed: number, picks: readonly number[], actions: readonly GameAction[]): ReplayFrame[];
```
Exported from `index.ts`. Per project rule, `docs/specs/engine-spec.md` is updated in the same change.

### Backend (Convex)
- **schema.ts**: add optional `seed: v.optional(v.number())`, `picks: v.optional(v.array(v.number()))` to `games`.
- **game.ts `newGame`**: persist `seed` + `picks` (already received as args).
- **game.ts `log` query (new)**: owner-scoped (IDOR guard). Returns `{ game: {code, seed, picks, color, createdAt, status}, moves }` by reading `gameEvents` ordered by `seq`.
- `applyAction` unchanged (already logs). Existing solo games without `seed` note "initial conditions unavailable" in the download; new games are fully replayable.

### Frontend
- **`formatLog(log)`** (`apps/web/src/game/gameLog.ts`): builds the human-readable text — a header
  (code, party, seed, date) + one line per move `"<seq>. <action label> — <event notices>"`, reusing
  the existing `eventNotices.ts` formatter. Also a `downloadLog(log, kind)` Blob/anchor helper.
- **`GameLogModal.tsx`** (mirrors `SaveGameModal`): fetches `api.game.log` on open; two download
  buttons (machine JSON / human text); shows move count.
- **`CaveHud`**: new `onLog?` prop + a debug/log `.btn` (bug/scroll SVG) in the dock.
- **`GameScreen`**: wire `onLog` to open the modal (solo path).

## Tasks (TDD, each its own commit)

1. **Engine replay helper** — `replay.ts` + `replay.test.ts` (final state matches live play; determinism; frame N == live reduce; seed-swept). Export from `index.ts`. Update `engine-spec.md`.
2. **Backend** — schema `seed`/`picks`; `newGame` persists them; `game.log` query; `game.test.ts` (persisted seed/picks; ordered moves; owner-scoped IDOR).
3. **Web log utils** — `gameLog.ts` (`formatLog`, `downloadLog`) + `gameLog.test.ts` (text shape; JSON round-trips through `replay`).
4. **Web UI** — `GameLogModal` + HUD debug icon + `GameScreen` wiring + `GameLogModal.test.tsx`.
5. **Verify** — full engine + web suites + both typechecks green; commit on `game-move-log`.

## Out of scope (follow-ups)
- Graphical replay **player** (scrub the 3D cave ◀ ▶ over `replay()` frames).
- Multiplayer logging (add `gameEvents` writes + `seat` to `mpReduce`/`act`; same format).
