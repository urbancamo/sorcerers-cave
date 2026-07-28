# High-score tables: solitaire/multiplayer × standard/extension kit — design

> Approved by MSW 2026-07-28 (conversation). Rationale: multiplayer shares one cave's
> treasure between seats, so MP scores aren't comparable with solo scores — the same
> argument SC-EXT-29 already applies to deck composition (base vs kit). Four
> independent leaderboards, keyed `mode` × `extensionKit`.

## Current state

- `highScores` already carries `mode: "solo" | "multi"`; solo saves stamp
  `extensionKit`; MP terminals are auto-recorded per seat (`recordTerminals`,
  multiplayer.ts) with `mpScore`, including wipes at 0 — but are never listed
  (`list` filters multi out) and are NOT stamped with `extensionKit`.
- The UI (`LeaderboardPanel`) has one segmented toggle: Base Game / Extension Kit.

## Design

### Backend (`apps/web/convex`)

1. `recordTerminals` stamps `extensionKit: after.variants?.extensionKit ?? undefined`
   and `seatCount: after.parties.length` on every MP row. Schema gains
   `seatCount: v.optional(v.number())`.
2. `highScores.list` gains `mode: v.optional(v.union("solo","multi"))` (absent =
   solo). Filtering:
   - mode match: `(r.mode ?? "solo") === wantMode`;
   - kit match with a read-time fallback for any MP row recorded before stamping
     landed: `(r.extensionKit ?? (r.state as GameState).variants?.extensionKit ?? false)`;
   - multiplayer lists ONLY escaped seats (`outcome === GS_ESCAPED`) — solo parity:
     wipes/abandons stay recorded (game archive) but are not leaderboard material.
   - Returned rows additionally carry `seatCount` (and keep the existing shape).
3. No backfill: kit-on MP games are unreachable in prod until this deploys together
   with the MP-kit milestone; the read-time fallback covers any straggler rows.

### UI (`apps/web/src/game/HighScores.tsx`)

4. `LeaderboardPanel` gains a second segmented toggle ahead of the existing one:
   `Solitaire | Multiplayer` (state `mode`), with `defaultMode` prop (default
   "solo"). Four combinations = four independent top-100s.
5. Multiplayer tables add a `Players` column showing `seatCount` ("—" for legacy
   rows); the score-detail meta line reads `· Multiplayer of N` alongside the
   existing `· Extension kit` tag. Solo tables are unchanged.
6. Defaults: splash modal opens Solitaire/Base as today; solo GameOverScreen keeps
   `defaultKit` behavior (mode stays solo). The MP end screen is unchanged (its
   Standings panel already shows the game's own result; adding the global
   leaderboard there is out of scope).

## Out of scope

- Splitting further by seat count or by zombies/fogLite/concurrent variants —
  surfaced as the Players badge (and nothing) respectively; comparability argument
  only justifies the two axes.
- MP end-screen leaderboard mount.

## Testing

- convex `multiplayer.test.ts`: a kit-on MP terminal row carries
  `extensionKit: true` and `seatCount`; kit-off rows carry no kit flag.
- convex `highScores.test.ts`: `list({mode:"multi"})` returns only escaped multi
  rows; kit split respects the stamped flag AND the state-derived fallback; the
  default (solo) call still excludes multi rows.
- component `HighScores.test.tsx`: mode toggle renders and re-queries; defaultMode
  opens Multiplayer; Players column renders for multi rows.
