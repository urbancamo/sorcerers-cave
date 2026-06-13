# Milestone D-3 — Convex Server-Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Convex the authoritative home of the engine — `newGame`/`applyAction` mutations run the pure reducer inside Convex and persist the `GameState` + an action log; a reactive `get` query streams the authoritative state; and a thin client hook feeds the D-2 adapter's mirror and routes its `onAction` back to `applyAction`.

**Architecture:** No schema change — the existing `games.state` (`v.any()`) holds the engine `GameState`, and `gameEvents` holds the per-action log. `convex/game.ts` imports `@sorcerers-cave/engine` and runs `newGame`/`reduce`/`legalActions` server-side (the same deterministic reducer the client mirror runs optimistically). The client `useCaveGame` hook builds a `createCaveAdapter` from the reactive snapshot, syncs it on updates, and dispatches accepted actions to `applyAction`.

**Tech Stack:** Convex (`mutation`/`query`, `convex-test` in the edge-runtime vitest project), `@convex-dev/auth` (`getAuthUserId`), `@sorcerers-cave/engine` (pure `reduce`/`newGame`/`validatePicks`/`legalActions`), the D-1/D-2 client modules, React + `convex/react`.

---

## Design notes (read first)

- **Two runtime risks this phase must surface (Task 1 is the de-risk):**
  1. **Bundling** — `@sorcerers-cave/engine` exports raw TS (`./src/index.ts`). `convex-test` runs via Vite (transpiles TS fine), so a green Task-1 test proves the *logic* runs in a Convex-like (edge) runtime. The **production Convex bundler** is separate and is verified by the user running `pnpm --filter web convex` (dev) once — call this out in the final report. If production bundling rejects the TS package, the contingency is to add a `tsc` build to `@sorcerers-cave/engine` and point its `exports` at `dist/` (a follow-up, not this plan).
  2. **`structuredClone`** — the engine calls global `structuredClone` 11×. It must exist in the runtime. `@edge-runtime/vm` (the convex test env) should provide it; if a Task-1 test throws `structuredClone is not defined`, add a polyfill in a convex setup module and report it (contingency: `globalThis.structuredClone ??= (x) => JSON.parse(JSON.stringify(x))` — adequate since `GameState` is pure JSON). Also flag for the user to confirm on the real Convex runtime at deploy.
- **No schema change.** `games`: `ownerId?`, `state` (the `GameState` blob, `v.any()`), `status` (`"active"|"finished"`), `createdAt`, `updatedAt`, index `by_owner`. `gameEvents`: `gameId`, `seq`, `action`, `events`, index `by_game` (`["gameId","seq"]`). The `state: v.any()` is deliberate — the engine owns the shape; mirroring it as Convex validators would duplicate and drift from the engine types.
- **Name collision:** the Convex mutation is also called `newGame`. Import the engine factory aliased: `import { newGame as createGameState, ... }`.
- **Seed advances:** `createGameState(seed, picks)` advances the seed through deck-shuffling, so `state.seed !== inputSeed`. Tests must assert engine fields (phase/areas/party/turn), not `state.seed === seed`.
- **Authority via the reducer:** `reduce` returns the *original* state + `[{blocked}]` for illegal actions (wrong phase etc.) and a pruned state + `[{deadEnd}]` for a dead-end attempt. `applyAction` always persists `reduce`'s returned state (the engine's truth) and appends a `gameEvents` row **unless** the only event is a pure `blocked` no-op (keeps the log clean). `status` becomes `"finished"` when `state.gs !== GS_PLAYING`.
- **Auth + ownership (IDOR fix):** every game is owned by the (anonymous) caller. `newGame` requires auth and sets `ownerId = getAuthUserId(ctx)`. `applyAction` requires auth and rejects (`Forbidden`) when `game.ownerId !== caller`. `get` returns `null` for non-owners. `listMine` returns `[]` when unauthenticated. Under `convex-test` there is no JWT, so tests authenticate with a helper that inserts a `users` row and wraps the client via `t.withIdentity({ subject: \`${userId}|session\` })` — `getAuthUserId` parses the user id from the `subject`'s first `|`-segment.
- **Action validator:** the engine `GameAction` is a union; validate its shape permissively (`type` + the optional numeric fields) rather than enumerating every member, then cast to `GameAction` and let `reduce` enforce semantics.
- **Client testing convention (this repo):** Convex-bound React is verified in the browser, not jsdom (see `App.test.tsx`'s comment). Task 3 ships the hook + wiring **typecheck-verified + browser-verified**; automated coverage stays on the server (convex-test) and a pure presentational unit.

---

## File structure

- **Modify** `apps/web/convex/game.ts` — engine-backed `newGame` + `applyAction` + `get` + `listMine`.
- **Modify** `apps/web/convex/game.test.ts` — real engine assertions + round-trip + de-risk.
- **Create** `apps/web/src/game/useCaveGame.ts` — the client hook.
- **Create** `apps/web/src/game/GameScreen.tsx` — minimal engine-backed screen using the hook.
- **Create** `apps/web/src/game/MoveList.tsx` + `MoveList.test.tsx` — pure presentational unit (testable without Convex).
- **Modify** `apps/web/src/App.tsx` — render `GameScreen`.

---

### Task 1: Engine-backed `newGame` (de-risk bundling + structuredClone)

**Files:**
- Modify: `apps/web/convex/game.ts`
- Modify: `apps/web/convex/game.test.ts`

- [ ] **Step 1: Rewrite the `newGame` mutation**

Replace the whole body of `apps/web/convex/game.ts` with (this adds `applyAction`/`listMine` too, used in Task 2 — implement them now; their tests come in Task 2):

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  newGame as createGameState,
  validatePicks,
  reduce,
  GS_PLAYING,
  type GameState,
  type GameAction,
} from "@sorcerers-cave/engine";

// Permissive shape validator for the engine's GameAction union; reduce() enforces semantics.
const actionValidator = v.object({
  type: v.string(),
  dir: v.optional(v.number()),
  ti: v.optional(v.number()),
  mi: v.optional(v.number()),
  idx: v.optional(v.number()),
  artifact: v.optional(v.number()),
  target: v.optional(v.number()),
});

/** Start a new authoritative game: validate the party, build the engine state, persist it (owned by the caller). */
export const newGame = mutation({
  args: { seed: v.number(), picks: v.array(v.number()) },
  handler: async (ctx, { seed, picks }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthenticated");
    if (!validatePicks(picks)) throw new Error("Invalid party selection");
    const state = createGameState(seed, picks);
    const now = Date.now();
    return await ctx.db.insert("games", { ownerId, state, status: "active", createdAt: now, updatedAt: now });
  },
});

/** Apply one player action authoritatively: reduce, persist the new state, log the events. */
export const applyAction = mutation({
  args: { id: v.id("games"), action: actionValidator },
  handler: async (ctx, { id, action }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    const game = await ctx.db.get(id);
    if (!game) throw new Error("Game not found");
    if (game.ownerId !== callerId) throw new Error("Forbidden"); // IDOR guard
    if (game.status !== "active") return { state: game.state as GameState, events: [] };

    const { state, events } = reduce(game.state as GameState, action as GameAction);
    const status = state.gs === GS_PLAYING ? "active" : "finished";
    await ctx.db.patch(id, { state, status, updatedAt: Date.now() });

    const blockedNoop = events.length === 1 && events[0]!.type === "blocked";
    if (!blockedNoop) {
      const last = await ctx.db
        .query("gameEvents")
        .withIndex("by_game", (q) => q.eq("gameId", id))
        .order("desc")
        .first();
      await ctx.db.insert("gameEvents", { gameId: id, seq: (last?.seq ?? -1) + 1, action, events });
    }
    return { state, events };
  },
});

export const get = query({
  args: { id: v.id("games") },
  handler: async (ctx, { id }) => {
    const callerId = await getAuthUserId(ctx);
    const game = await ctx.db.get(id);
    if (!game || game.ownerId !== callerId) return null; // owner-scoped (IDOR guard)
    return game;
  },
});

/** The signed-in player's games (newest first); empty when unauthenticated. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return [];
    return ctx.db.query("games").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").collect();
  },
});
```

- [ ] **Step 2: Rewrite the `newGame` test for the real engine**

Replace `apps/web/convex/game.test.ts` with (Task 1 assertions only; Task 2 appends more):

```typescript
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { newGame as createGameState } from "@sorcerers-cave/engine";

const modules = import.meta.glob("./**/*.*s");

// Authenticate the convex-test client as a fresh anonymous user (no JWT available in tests).
// getAuthUserId parses the user id from the subject's first `|`-segment.
export async function asUser(t: ReturnType<typeof convexTest>) {
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  return { as: t.withIdentity({ subject: `${userId}|session` }), userId };
}

test("newGame builds and persists a real engine GameState", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 123, picks: [0] }); // Hero, cost 6
  const game = await as.query(api.game.get, { id });
  expect(game?.status).toBe("active");
  // The engine advances the seed through deck shuffles, so assert engine structure, not the input seed.
  expect(game?.state.phase).toBe("explore");
  expect(game?.state.turn).toBe(1);
  expect(game?.state.areas.length).toBe(1);        // the gateway
  expect(game?.state.party.map((m: { creatureId: number }) => m.creatureId)).toEqual([0]);
  // The server runs the SAME deterministic engine as the client.
  expect(game?.state).toEqual(createGameState(123, [0]));
});

test("newGame requires authentication", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.game.newGame, { seed: 1, picks: [0] })).rejects.toThrow();
});

test("newGame rejects an illegal party selection", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  await expect(as.mutation(api.game.newGame, { seed: 1, picks: [] })).rejects.toThrow();
  await expect(as.mutation(api.game.newGame, { seed: 1, picks: [8] })).rejects.toThrow(); // Wizard not selectable (cost null)
});
```

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter web test game`
Expected: PASS — proves the engine imports, bundles (in the Vite/edge test runtime), and runs inside a Convex function, and that `newGame` is engine-backed.

**IF it fails with `structuredClone is not defined`** (or similar missing-global), the edge test runtime lacks it. Add a polyfill so the engine runs: create `apps/web/convex/_setup.ts` exporting nothing but `globalThis.structuredClone ??= (x: unknown) => JSON.parse(JSON.stringify(x));` and import it at the TOP of `game.ts`. Re-run. Report this in your status (it also signals the real Convex runtime must be checked at deploy).
**IF it fails to resolve `@sorcerers-cave/engine`**, report BLOCKED with the exact error (a production-bundling contingency, not solvable by weakening the test).

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm --filter web typecheck`
Expected: clean (the convex tsconfig includes the engine types).

```bash
git add apps/web/convex/game.ts apps/web/convex/game.test.ts
git commit -m "feat(web): engine-backed newGame mutation in Convex (D-3)"
```

(If you added the polyfill, include `apps/web/convex/_setup.ts` in the commit.)

---

### Task 2: `applyAction` round-trip + queries

**Files:**
- Modify: `apps/web/convex/game.test.ts`

`applyAction`, `get`, and `listMine` were implemented in Task 1; this task proves them.

- [ ] **Step 1: Append the round-trip tests**

Append to `apps/web/convex/game.test.ts`:

```typescript
import { reduce } from "@sorcerers-cave/engine";
// `asUser` is defined in this file (Task 1).

test("applyAction matches the local engine and logs the event", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  // The authoritative result must equal a local deterministic reduce of the same state.
  const expected = reduce(createGameState(7, [0]), { type: "move", dir: 1 }); // move North from the gateway
  const res = await as.mutation(api.game.applyAction, { id, action: { type: "move", dir: 1 } });
  expect(res.state).toEqual(expected.state);
  const game = await as.query(api.game.get, { id });
  expect(game?.state).toEqual(expected.state);
  // A non-blocked action is logged.
  const logged = await t.run((ctx) =>
    ctx.db.query("gameEvents").withIndex("by_game", (q) => q.eq("gameId", id)).collect(),
  );
  expect(logged.length).toBe(1);
  expect(logged[0]!.seq).toBe(0);
});

test("an illegal action is a no-op and is not logged", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  const before = await as.query(api.game.get, { id });
  const res = await as.mutation(api.game.applyAction, { id, action: { type: "attack" } }); // illegal in explore
  expect(res.events).toEqual([{ type: "blocked" }]);
  const after = await as.query(api.game.get, { id });
  expect(after?.state).toEqual(before?.state); // unchanged
  const logged = await t.run((ctx) =>
    ctx.db.query("gameEvents").withIndex("by_game", (q) => q.eq("gameId", id)).collect(),
  );
  expect(logged.length).toBe(0); // blocked no-op not logged
});

test("a non-owner cannot read or mutate another player's game (IDOR guard)", async () => {
  const t = convexTest(schema, modules);
  const owner = await asUser(t);
  const id = await owner.as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  const attacker = await asUser(t);
  expect(await attacker.as.query(api.game.get, { id })).toBeNull();               // can't read
  await expect(attacker.as.mutation(api.game.applyAction, { id, action: { type: "move", dir: 1 } }))
    .rejects.toThrow(/Forbidden/);                                                // can't mutate
});

test("quitting finishes the game", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  await as.mutation(api.game.applyAction, { id, action: { type: "quit" } });
  const game = await as.query(api.game.get, { id });
  expect(game?.status).toBe("finished");
});

test("a finished game accepts no more changes", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  await as.mutation(api.game.applyAction, { id, action: { type: "quit" } });
  const res = await as.mutation(api.game.applyAction, { id, action: { type: "move", dir: 1 } });
  expect(res.events).toEqual([]);
});
```

NOTE TO IMPLEMENTER: `move North` from the gateway draws a shuffled tile, so the *outcome* (moved vs dead-end) is seed-dependent — but the test asserts the server equals a **local `reduce` of the same seed/state**, which is deterministic regardless of what that outcome is. Do not pin the outcome; pin server==local. If `t.run`/`t.withIdentity` usage differs in this convex-test version, adapt to the working form (the assertions are what matter).

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter web test game`
Expected: PASS (all newGame + applyAction tests green).

- [ ] **Step 3: Typecheck + full web suite + commit**

Run: `pnpm --filter web typecheck` then `pnpm --filter web test`
Expected: all green.

```bash
git add apps/web/convex/game.test.ts
git commit -m "test(web): applyAction authority round-trip + queries (D-3)"
```

---

### Task 3: Client hook + minimal engine-backed screen

**Files:**
- Create: `apps/web/src/game/useCaveGame.ts`
- Create: `apps/web/src/game/MoveList.tsx`
- Create: `apps/web/src/game/MoveList.test.tsx`
- Create: `apps/web/src/game/GameScreen.tsx`
- Modify: `apps/web/src/App.tsx`

Per this repo's convention (`App.test.tsx`), Convex-bound React is browser-verified, not jsdom-tested. Automated coverage here is the **pure `MoveList` unit** + typecheck; the live loop is browser-verified.

- [ ] **Step 1: Write the pure `MoveList` test**

Create `apps/web/src/game/MoveList.test.tsx`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MoveList } from "./MoveList";
import type { Move } from "../view/ports";

describe("MoveList", () => {
  const moves: Move[] = [
    { dir: "N", kind: "undrawn", target: { level: 1, col: 50, row: 49 } },
    { dir: "D", kind: "stair", target: { level: 2, col: 50, row: 50 } },
  ];
  it("renders a button per move and fires onMove with the dir", () => {
    const onMove = vi.fn();
    render(<MoveList moves={moves} onMove={onMove} />);
    expect(screen.getByRole("button", { name: /N/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /D/ }));
    expect(onMove).toHaveBeenCalledWith("D");
  });
  it("shows a hint when there are no moves", () => {
    render(<MoveList moves={[]} onMove={() => {}} />);
    expect(screen.getByText(/no moves/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it (fails — no component)**

Run: `pnpm --filter web test MoveList`
Expected: FAIL.

- [ ] **Step 3: Implement `MoveList`**

Create `apps/web/src/game/MoveList.tsx`:

```tsx
import type { Dir, Move } from "../view/ports";

export function MoveList({ moves, onMove }: { moves: Move[]; onMove: (dir: Dir) => void }) {
  if (moves.length === 0) return <p className="text-stone-400">No moves available.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {moves.map((m) => (
        <button
          key={`${m.dir}:${m.target.level},${m.target.col},${m.target.row}`}
          className="rounded bg-amber-700 px-3 py-1 font-semibold"
          onClick={() => onMove(m.dir)}
        >
          {m.dir} <span className="text-amber-200 text-xs">({m.kind})</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run it (passes)**

Run: `pnpm --filter web test MoveList`
Expected: PASS.

- [ ] **Step 5: Implement the `useCaveGame` hook**

Create `apps/web/src/game/useCaveGame.ts`:

```typescript
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { loadManifest } from "../data/manifest";
import { createCaveAdapter, type CaveAdapter } from "../view/engineAdapter";
import type { ArtTables } from "../view/projection";
import type { GameState, GameAction } from "@sorcerers-cave/engine";

/**
 * Bind a Convex-authoritative game to a synchronous CaveEngine adapter.
 * The adapter mirrors the authoritative snapshot (reconciled on every query update)
 * and forwards accepted actions to the `applyAction` mutation (server authority).
 */
export function useCaveGame(id: Id<"games"> | null) {
  const game = useQuery(api.game.get, id ? { id } : "skip");
  const apply = useMutation(api.game.applyAction);
  const [art, setArt] = useState<ArtTables | null>(null);
  const adapterRef = useRef<CaveAdapter | null>(null);
  const [version, bump] = useState(0);

  useEffect(() => { void loadManifest().then(setArt); }, []);

  useEffect(() => {
    const state = (game as { state?: GameState } | null | undefined)?.state;
    if (!art || !state || !id) return;
    if (!adapterRef.current) {
      adapterRef.current = createCaveAdapter(state, art, {
        onAction: (action: GameAction) => { void apply({ id, action }); },
      });
    } else {
      adapterRef.current.sync(state);
    }
    bump((n) => n + 1); // re-render consumers when the mirror changes
  }, [art, game, id, apply]);

  return { engine: adapterRef.current, loading: !art || game === undefined, version };
}
```

- [ ] **Step 6: Implement `GameScreen` and wire `App`**

Create `apps/web/src/game/GameScreen.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useCaveGame } from "./useCaveGame";
import { MoveList } from "./MoveList";

export default function GameScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const newGame = useMutation(api.game.newGame);
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const { engine, loading } = useCaveGame(gameId);

  useEffect(() => { if (!isLoading && !isAuthenticated) void signIn("anonymous"); }, [isLoading, isAuthenticated, signIn]);

  if (isLoading) return <p>Connecting…</p>;
  if (!isAuthenticated) return <p>Signing in…</p>;

  if (!gameId) {
    return (
      <button
        className="rounded bg-amber-700 px-4 py-2 font-semibold"
        onClick={async () => setGameId(await newGame({ seed: Date.now(), picks: [0] }))}
      >
        New game (Hero)
      </button>
    );
  }
  if (loading || !engine) return <p>Loading cave…</p>;

  const s = engine.state();
  return (
    <div className="flex flex-col items-center gap-3" data-testid="game-screen">
      <p>Turn {s.turn} · Level {s.level} · {engine.current.name} · {s.placed} placed · {s.deckLeft} in deck</p>
      <MoveList moves={engine.openMoves()} onMove={(dir) => engine.tryMove(dir)} />
    </div>
  );
}
```

Update `apps/web/src/App.tsx` to render `GameScreen` instead of `ScaffoldGame`:

```tsx
import GameScreen from "./game/GameScreen";

export default function App() {
  return (
    <main className="grid min-h-screen place-items-center gap-6 bg-stone-950 text-stone-100">
      <h1 className="text-3xl font-bold tracking-wide">The Sorcerer's Cave</h1>
      <GameScreen />
    </main>
  );
}
```

- [ ] **Step 7: Typecheck + full web suite + commit**

Run: `pnpm --filter web typecheck` then `pnpm --filter web test`
Expected: all green (MoveList unit + all prior tests; the hook/GameScreen are typecheck-verified — no jsdom Convex test, per repo convention).

```bash
git add apps/web/src/game apps/web/src/App.tsx
git commit -m "feat(web): useCaveGame hook + engine-backed game screen (D-3)"
```

(Leave `ScaffoldGame.tsx` in place — unused now; removing it is optional cleanup.)

---

## Definition of Done

- [ ] `convex/game.ts` runs the engine authoritatively: `newGame` validates picks + builds/persists `GameState`; `applyAction` reduces, persists, logs (skipping blocked no-ops), and flips `status` to `finished` at game end; `get`/`listMine` queries work.
- [ ] **De-risk proven:** `convex-test` shows the engine imports and runs inside a Convex function (matching a local `reduce`); any `structuredClone` polyfill needed is noted, and the production-bundle / runtime check is flagged for the user's `convex dev` run.
- [ ] `useCaveGame` builds a `createCaveAdapter` from the reactive snapshot, syncs it on updates, and routes `onAction` → `applyAction`; `GameScreen` drives a real engine-backed loop (typecheck + browser verified); `MoveList` pure unit is tested.
- [ ] `pnpm --filter web test` and `pnpm --filter web typecheck` green; engine unchanged.
