# Save / Load Game — Implementation Plan

> Requirement: `docs/requirements/2026-06-15-save-load-game.md`

**Goal:** Give every game a unique 4-uppercase-letter code, let the player save from the HUD
(shows the code, returns to the splash screen), and add a splash-screen option to resume a saved
game by entering its code.

**Architecture:** Games are already persisted to Convex on every action, so "save" surfaces the
code and navigates home rather than writing fresh state. The 4-letter code is generated server-side
at game creation (uniqueness checked against a new index) and becomes a portable resume handle:
resuming by code claims the game for the current (anonymous) player so the owner-scoped
`applyAction` guard keeps working across sessions/devices.

**Tech stack:** Convex (mutations/queries + schema), React (splash / HUD / GameScreen), engine
untouched.

---

## Task 1 — Schema: add the game code

**Files:** Modify `apps/web/convex/schema.ts`

- Add `code: v.optional(v.string())` to the `games` table (optional so pre-existing docs validate).
- Add `.index("by_code", ["code"])` for uniqueness checks and resume lookup.

## Task 2 — Backend: generate code, save, resume

**Files:** Modify `apps/web/convex/game.ts` (follow existing function style; consult
`convex/_generated/ai/guidelines.md`).

- `genCode()` helper → 4 random `A–Z` letters (`Math.random()` is fine in a mutation; `Date.now()`
  is already used here).
- `newGame`: before insert, loop `genCode()` until `by_code` has no match (cap ~10 tries), then
  store `code` on the inserted doc. Return value unchanged (`Id<"games">`).
- New `save` mutation `{ id }`: owner-checked (reuse the IDOR guard), `patch({ updatedAt })`, return
  the doc's `code` (string). Explicit, testable "save" action.
- New `resumeByCode` mutation `{ code }`: look up via `by_code`; if none → return `null`; else
  `patch({ ownerId: caller })` (claim, so the code is a portable handle) and return the game `_id`.
- `get` already returns the full doc, so `code` flows to the client with no change.

## Task 3 — Client hook: expose the code

**Files:** Modify `apps/web/src/game/useCaveGame.ts`

- Read `code` off the game doc and return it alongside `state`/`color` (used by the save modal).

## Task 4 — HUD Save button

**Files:** Modify `apps/web/src/view/CaveHud.tsx`, `apps/web/src/view/CaveCanvas.tsx`,
`apps/web/src/game/GameScreen.tsx`

- `CaveHud`: add a "Save & exit" button to the `.dock`, with a React `onClick={onSave}` (new optional
  prop) — mirrors the existing `onPartyClick` pattern, so no `cave3d.js` change is needed.
- `CaveCanvas`: thread `onSave` through to `CaveHud`.
- `GameScreen`: pass `onSave` to `CaveCanvas`. Handler: `const code = await save({ id: gameId })`,
  show the save modal with `code`, and on dismiss navigate home
  (`setRoll(null); setNotices(null); setGameId(null); setStarted(false)`).

## Task 5 — Save modal

**Files:** Create `apps/web/src/game/SaveGameModal.tsx`

- Small modal: "Game saved" + the 4-letter code shown large (monospace), a copy-to-clipboard
  affordance, and a "Back to menu" button that invokes the dismiss callback. Styled with existing
  `scv-*` classes (match `NoticeModal`).

## Task 6 — Splash: resume a saved game

**Files:** Modify `apps/web/src/game/SplashScreen.tsx`, `apps/web/src/game/GameScreen.tsx`

- `SplashScreen`: under "Start Solitaire Game" add a "Resume saved game" control — a 4-char input
  (auto-uppercased, `maxLength=4`) + a "Resume" button. Validate `/^[A-Z]{4}$/`; call the new
  `onResume(code): Promise<boolean>` prop; show an inline "No game found with that code." on `false`.
- `GameScreen`: pass `onResume` = `async (code) => { const id = await resumeByCode({ code }); if
  (id) { setGameId(id); setStarted(true); return true; } return false; }`. (gameId set → skips
  PartySelect → `useCaveGame` loads it.)

## Task 7 — Tests

**Files:** `apps/web/convex/game.test.ts`, `apps/web/src/game/SplashScreen.test.tsx`,
(new) `apps/web/src/game/SaveGameModal.test.tsx`

- Convex: `newGame` sets a 4-uppercase-letter `code`; two games get different codes; `save` returns
  the code; `resumeByCode` returns the id and makes the caller the owner; unknown code → `null`.
- Splash: the resume input rejects non-4-letter input and calls `onResume` with the upper-cased code;
  shows the not-found message when `onResume` resolves `false`.
- SaveGameModal: renders the code and fires the dismiss callback.

## Task 8 — Verify & ship

- `pnpm -r test` (engine/web/convex) + `pnpm -r typecheck` green.
- Commit on a branch, merge `--ff-only`, deploy via `vercel --prod` (the build runs `convex deploy`,
  which pushes the schema/index + new functions to prod).

---

## Decisions / notes

- **Resume claims ownership.** With anonymous auth the owner is per-browser; claiming on resume makes
  the code a true portable save handle and keeps the owner-scoped `applyAction` guard intact. For
  single-player this is the expected "load my save" behaviour. (Revisit if shared multiplayer lands.)
- **No engine changes** — codes and ownership live entirely in the Convex layer.
- **Back-compat:** `code` is optional in the schema; only new games get one (existing dev docs are
  unaffected and simply aren't resumable).
