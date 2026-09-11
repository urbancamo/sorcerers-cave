# Save and Restore Test Scenario — Implementation Plan

> Plan for: docs/requirements/test-mode/2026-09-11-save-restore-test-scenario.md
> Created: 2026-09-11
> Status: Implemented (sign-off received 2026-09-11: restore is open-by-code, and the §6 extras
> shipped alongside save/restore in the same pass)

## 1. What already exists (don't rebuild this)

Before designing anything new, it's worth being precise about how much of the requirement is
already shipped, because it changes what's actually left to build:

- **Every game already gets a unique code at creation.** Both `game.newGame` and
  `game.startTestGame` (`apps/web/convex/game.ts:68-105`) call `uniqueCode(ctx)` and persist it —
  a test-mode game has a `code` from the moment it's created, not just after an explicit "save".
- **"Save" already shows the code.** `game.save` (`game.ts:109-121`) is owner-scoped, backfills a
  code if one is somehow missing, bumps `updatedAt`, and returns the code — which
  `SaveGameModal.tsx` already displays with a copy-to-clipboard button. It's wired to the HUD's
  save icon (`CaveHud.tsx:153-154`) and works, unmodified, on a test-mode game today.
- **"Restore" (resume) already exists, but resumes the SAME row.** `game.resumeByCode`
  (`game.ts:127-137`) looks up a game by its 4-letter code and hands back its id — but it's
  **owner-scoped** ("never transfers ownership", per its own comment) and there's no copy: playing
  from it continues to mutate the one persisted row. Two replay attempts from the same code would
  step on each other, which is exactly the failure mode the requirement's "assign a NEW code" ask
  is trying to avoid.
- **A faithful, shareable replay already exists.** `game.replayByCode` (`game.ts:219-249`) is
  **deliberately not owner-scoped** ("anyone holding the code may replay the game") and returns
  `seed`/`picks`/`variants`/`testMode` plus the full ordered `gameEvents` action log — enough for
  the engine's `replay()` to reconstruct the exact state move-by-move. This already gets most of
  the way to "give an accurate view of the game state and actions that led to a bug" for **any**
  solo game, test-mode or not, with zero new code.

**Implication:** the only genuinely missing piece is a way to **fork** a test-mode game — by code,
into a brand-new row with its own code and its own owner — so it can be replayed and continued
independently, as many times as needed, without the original scenario drifting. Everything else in
the request is either already built or a thin UI convenience on top of what's already built.

## 2. Is "make a copy and assign a new code" the right mechanism? Yes — with one hard rule

Two ways to implement "restore" were considered:

**Rejected: have the client reconstruct state (via `replayByCode` + the engine's `replay()`) and
hand the resulting `GameState` back to a new "create game from this state" mutation.** This looks
appealing because `replayByCode` is already public and reusable, but it means a mutation would
have to accept an arbitrary client-supplied `state: v.any()` blob and persist it as a new owned
row. That's a state-forgery hole: nothing stops a client from crafting a `GameState` with maxed-out
loot, kills, or `testMode: undefined` and inserting it as if it were a legitimately-played game.
**Rejected outright** — the schema's `state: v.any()` only stays safe because every existing
mutation derives `state` itself (`newGame`/`startTestGame` build it from `seed`/`picks`;
`applyAction` derives it from `reduce()`); this would be the first mutation to trust a client-
supplied state wholesale.

**Chosen: a new mutation looks the source game up BY CODE itself** (same pattern as
`resumeByCode`/`replayByCode`), reads `state`/`seed`/`picks`/`variants` off the row it just loaded
(never off a client argument), and only then writes a new row. This is the same trust boundary
every other mutation in this file already uses, just inserting instead of returning.

**The one hard rule this mutation must enforce:** only a row whose `state.testMode === true` may
be forked this way. Without that check, a guessable 4-letter code (26⁴ ≈ 457k combinations — the
existing `resumeByCode` comment already flags this keyspace as small) would let anyone duplicate
an arbitrary *real* player's in-progress game into their own account. Restricting the source to
test-mode rows caps the blast radius of a guessed code to "duplicated a QA fixture" — no worse than
what `replayByCode` already exposes for the same class of data, and test-mode games are already
excluded from `highScores` (no leaderboard-integrity angle either).

## 3. Open decision: does forking require owning the source game?

This is the one real judgment call, and it changes what the feature is actually for:

| | Owner-scoped (like `resumeByCode`) | Open by code (like `replayByCode`) |
|---|---|---|
| Who can fork a test-mode game | Only the account that created it | Anyone holding the code |
| Fits "share a code in a bug report" for someone else to replay-and-continue | **No** — the recipient can't fork it into their own account | **Yes** |
| Extra risk beyond what already exists | None | Same guessable-keyspace exposure `replayByCode` already accepts, for the same test-only data |

Given the requirement's own stated purpose — "specify the game code as part of a bug report" so
someone else can replay it — an **owner-scoped** restore would quietly fail to deliver that,
identically to how `resumeByCode` already can't be used to hand a game to someone else. I recommend
**open by code, restricted to `testMode: true` sources** (row 3 in §2), matching `replayByCode`'s
existing precedent for this exact class of data. Flagging this rather than deciding it silently,
since it's a real security-posture choice — see the sign-off question at the end of this doc.

Note this doesn't require Claude (me) to hold a Convex login: `replayByCode` is already
unauthenticated and sufficient for me to inspect what happened. "Restore" is for a **human** tester
who wants to replay a scripted scenario through the real game UI multiple times — worth stating
explicitly so the feature isn't over-built chasing a need (an AI agent reading state) that's
already met.

## 4. Does the fork need to copy the event log, or just the current state snapshot?

**Copy both** `state` and the full `gameEvents` log (re-sequenced 0..N into the new row). Reasoning:

- The requirement explicitly wants "the game state **and player actions** that lead to a bug" —
  the actions are the point, not just a snapshot.
- Without copying `gameEvents`, the new code's own `game.log`/`game.replayByCode` would return an
  empty `moves: []` that doesn't reconstruct the copied `state` at all — a silent inconsistency
  with the invariant every other code in this app already upholds (any code's replay bundle
  reconstructs its own row byte-for-byte).

## 5. Proposed design

### 5a. Convex: one new mutation, nothing else touched

```ts
export const restoreTestScenario = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    const normalized = code.trim().toUpperCase();
    const source = await ctx.db.query("games").withIndex("by_code", (q) => q.eq("code", normalized)).first();
    if (!source) throw new Error("No game with that code");
    if (!(source.state as GameState).testMode) throw new Error("Only a Test Mode scenario can be restored");

    const newCode = await uniqueCode(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("games", {
      ownerId: callerId,
      code: newCode,
      seed: source.seed,
      picks: source.picks,
      variants: source.variants,
      state: structuredClone(source.state),
      status: source.status,
      color: source.color,
      createdAt: now,
      updatedAt: now,
    });

    const rows = await ctx.db.query("gameEvents").withIndex("by_game", (q) => q.eq("gameId", source._id)).collect();
    for (const r of rows) {
      await ctx.db.insert("gameEvents", { gameId: id, seq: r.seq, action: r.action, events: r.events });
    }
    return { id, code: newCode };
  },
});
```

No schema changes — every field already exists. `save`, `resumeByCode`, `replayByCode`,
`applyAction` are all reused as-is.

### 5b. Web UI

**Save** — add a thin "Save scenario" control directly inside `TestControlsPanel` that calls the
**existing** `game.save` mutation and shows the returned code inline (or reuses `SaveGameModal`).
No new backend. This is purely a discoverability fix: the HUD's save button already works today on
a test-mode game, but a tester mid-scenario shouldn't have to go hunting for it.

**Restore** — lives on the **splash screen**, next to "Start Test Game" (not inside
`TestControlsPanel`, since restoring happens *before* a game exists, exactly like the existing
"Resume" code-input already does — `SplashScreen.tsx:32-45,127-139` is the template to mirror).
Gated behind the same `testSecret` presence as "Start Test Game", since it's a test-mode-only
entry point. Submits to the new `restoreTestScenario` mutation, then opens the resulting game like
`handleResume` already does for `resumeByCode`.

## 6. Other useful features worth adding (all reuse existing infrastructure — no new mechanism)

1. **A "Copy debug bundle" button next to the saved code**, dumping the raw
   `{ game, moves }` JSON `game.log`/`game.replayByCode` already returns. This is a more directly
   useful artifact for a bug report aimed at an AI reader than a human-oriented replay screen — a
   flat paste-able JSON blob is exactly what "give Claude an accurate view" is asking for, and it's
   already computed server-side with zero new logic.
2. **A "View replay" link in `SaveGameModal`** pointing at the existing `ReplayView.tsx` for the
   just-saved code, so a tester can sanity-check the scenario visually before including its code in
   a report.
3. **(Later, optional) a `?restore=<code>` URL param**, mirroring the existing `?test=<uuid>`
   pattern, so a bug report can be a single pasteable link rather than "open the app, unlock test
   mode, type this code in." Flagged as a nice-to-have, not required for this pass — it's a small
   addition once the base mutation exists, and shouldn't block it.

## 7. Explicitly out of scope

- Multiplayer test scenarios (`mode: "multi"` rows) — `replayByCode` already excludes these, and
  the restore mutation should reject them the same way (`source.mode === "multi"` → error),
  consistent with the existing multi exclusion rather than introducing a new one.
- Editing a restored scenario's *initial* conditions (seed/picks/variants) — restore reproduces the
  scenario exactly as saved; changing the setup means starting a fresh test game instead.
- Any limit/cleanup policy on how many forks accumulate — same as the app already doesn't cap how
  many games an account can save today; not a new problem this feature introduces.

## 8. Sign-off (received 2026-09-11)

1. **Access scope for restore** (§3): **open-by-code** (recommended option chosen) — restoring a
   `testMode: true` game does not require owning it, matching `replayByCode`'s precedent.
2. **§6 extras**: **included in this pass** — the debug-bundle copy button and the replay link both
   ship alongside save/restore.

## 9. What actually shipped

- `apps/web/convex/game.ts`: `restoreTestScenario` mutation (§5a, as designed) — 5 new tests in
  `game.test.ts` (fork across two different users; rejects a non-test-mode source; rejects an
  unknown code; rejects a multiplayer source; requires authentication).
- `apps/web/src/game/SaveGameModal.tsx`: gained optional `heading`/`message`/`closeLabel` overrides
  and `onViewReplay`/`onCopyDebugBundle` buttons (§6, items 1–2) — reused for both the "just saved"
  and "just restored" moments rather than building a second modal.
- `apps/web/src/game/TestControlsPanel.tsx`: a "Save scenario" button reusing the existing `onSave`
  handler (§5b) — no new mutation, purely a discoverability fix.
- `apps/web/src/game/SplashScreen.tsx`: a "Restore a test scenario" code-input row (§5b), visually
  parallel to Resume/Replay, gated behind the same test-secret unlock as "Start Test Game".
- `apps/web/src/game/GameScreen.tsx`: wires all of the above — `handleRestoreTestScenario` (mirrors
  `handleReplay`'s `string | null` convention, not `handleResume`'s boolean one, since restoring has
  several distinct failure reasons worth surfacing), `handleCopyDebugBundle` (fetches `game.log` and
  copies it as JSON), and `savedCode` widened to `{ code, restored }` so the SAME modal instance
  serves both flows with the right copy and close behaviour.
- Item 3 from §6 (a `?restore=<code>` URL param) was left out as explicitly flagged optional/later.
- No `packages/engine/src` changes — this feature is entirely Convex + web UI, so
  `docs/specs/engine-spec.md` (which documents the engine package specifically) is untouched.
