// Multiplayer is under active development and MUST NOT be exposed in production until complete and
// approved (see docs/requirements/2026-06-15-multiplayer-plan.html §1). It is ON in local dev and
// OFF in any built/deployed bundle, unless explicitly enabled with VITE_MULTIPLAYER=1 (never set in
// production). The splash entry points stay disabled whenever this is false.
export const MULTIPLAYER_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_MULTIPLAYER === "1";

// Dead End rule (§6.3.2, "forced redraw"): purely cosmetic — which leaderboard table HighScores.tsx
// opens on by default. What actually gets RECORDED is locked down server-side by the Convex-only
// FORCED_REDRAW_ENABLED env var (apps/web/convex/game.ts); this constant has no bearing on that —
// it only picks which already-correctly-labeled table a viewer's browser requests first.
export const FORCED_REDRAW_ENABLED = import.meta.env.VITE_FORCED_REDRAW === "1";
