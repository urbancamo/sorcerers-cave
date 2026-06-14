# Milestone A — Scaffold & Toolchain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm + Turborepo monorepo, a pure game-engine package, a React + Vite app, and a Convex backend wired with anonymous auth — ending with a reactive `game.get` round-trip in the browser and a Vercel build configuration.

**Architecture:** A workspace with `packages/engine` (pure, deterministic TS rules — no I/O), `packages/assets` (typed asset manifest), and `apps/web` (React 19 + Vite SPA with co-located Convex backend). The client is a thin renderer over server-authoritative Convex state. This milestone builds the skeleton and proves the toolchain end-to-end; game logic and UI arrive in later milestones.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript, Vitest, React 19, Vite, Tailwind v4, react-router, Zustand, Convex, `@convex-dev/auth` (anonymous), `convex-test`, `@testing-library/react`, Vercel.

---

## Pre-flight (read once before starting)

- **Library APIs change — verify, don't trust memory.** The Convex Auth setup, `convex-test` wiring, and Turborepo schema are version-sensitive. Two ground-truth sources, in priority order: (1) the working reference project **`/Users/msw/code/humanrisq/monorepo`** — same stack (React + Vite + Convex + `@convex-dev/auth` + `convex-test`, pnpm + Turborepo); copy its config when in doubt. (2) Current official docs: Convex (`https://docs.convex.dev`), Convex Auth (`https://labs.convex.dev/auth`).
- **Install commands resolve latest.** This plan uses `pnpm add <pkg>` (no pinned versions) so the lockfile records current releases. Don't hand-write version strings into `package.json` dependency blocks.
- **Commit after every green step.** Frequent, small commits.
- **Run everything from the repo root** unless a step says otherwise: `/Users/msw/code/retro/sorcerers-cave`.
- **Node ≥ 20, pnpm ≥ 10** must be installed (`node -v`, `pnpm -v`).

## File Structure (created by this milestone)

```
sorcerers-cave/
├── package.json                 # workspace root: turbo scripts
├── pnpm-workspace.yaml          # workspace globs
├── turbo.json                   # task graph
├── tsconfig.base.json           # shared compiler options
├── packages/
│   ├── engine/
│   │   ├── package.json         # @sorcerers-cave/engine (source exports, no build)
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/{index.ts, rng.ts, rng.test.ts}
│   └── assets/
│       ├── package.json         # @sorcerers-cave/assets
│       ├── tsconfig.json
│       └── src/{index.ts, index.test.ts}
└── apps/web/
    ├── package.json
    ├── index.html
    ├── vite.config.ts
    ├── vitest.config.ts          # jsdom (UI) project
    ├── tsconfig.json, tsconfig.app.json, tsconfig.node.json
    ├── vercel.json               # (added at root — see Task 8)
    ├── src/{main.tsx, App.tsx, App.test.tsx, styles.css, test/setup.ts, ScaffoldGame.tsx}
    └── convex/
        ├── schema.ts
        ├── game.ts               # newGame, get (stubs)
        ├── auth.ts, auth.config.ts, http.ts   # @convex-dev/auth (anonymous)
        ├── game.test.ts          # convex-test
        ├── convex.test.setup.ts  # convex-test module glob (if needed)
        └── _generated/           # committed
```

> The root `vercel.json` lives at repo root (Vercel "Root Directory" = repo root, required for pnpm `workspace:*` resolution). See Task 8.

---

## Task 1: Workspace root (pnpm + Turborepo)

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "sorcerers-cave",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test"
  }
}
```

- [ ] **Step 3: Add Turborepo + TypeScript at the root**

Run: `pnpm add -D -w turbo typescript`
Note: `-w` installs at the workspace root. This also writes `packageManager` into `package.json` if pnpm prompts; if not, add `"packageManager": "pnpm@<your version>"` (from `pnpm -v`).

- [ ] **Step 4: Create `turbo.json`** (Turborepo 2.x uses the `tasks` key)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "types": []
  }
}
```

- [ ] **Step 6: Append build outputs to `.gitignore`**

Add these lines to the existing `.gitignore`:

```
# monorepo build + cache
.turbo/
dist/
**/_generated/_deps/
```

- [ ] **Step 7: Verify the workspace resolves**

Run: `pnpm install && pnpm turbo --version`
Expected: install completes; turbo prints a 2.x version number.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .gitignore pnpm-lock.yaml
git commit -m "chore: scaffold pnpm + turborepo workspace root"
```

---

## Task 2: `packages/engine` skeleton + seeded RNG (TDD)

This task validates the whole TS+Vitest toolchain by implementing the first real, spec-faithful unit: the deterministic LCG from design-spec §5.

**Files:**
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/vitest.config.ts`, `packages/engine/src/index.ts`, `packages/engine/src/rng.ts`
- Test: `packages/engine/src/rng.test.ts`

- [ ] **Step 1: Create `packages/engine/package.json`** (consumed as TS source — no build step; Vite and Convex transpile it)

```json
{
  "name": "@sorcerers-cave/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Add dev deps to the engine package**

Run: `pnpm add -D --filter @sorcerers-cave/engine vitest typescript`

- [ ] **Step 3: Create `packages/engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["vitest/globals"] },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/engine/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true, environment: "node" },
});
```

- [ ] **Step 5: Write the failing test — `packages/engine/src/rng.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { nextSeed, rollDie } from "./rng";

describe("rng (design-spec §5 LCG)", () => {
  it("nextSeed matches the glibc LCG recurrence", () => {
    // (1 * 1103515245 + 12345) mod 2^31 = 1103527590
    expect(nextSeed(1)).toBe(1103527590);
  });

  it("rollDie is deterministic for a given seed", () => {
    expect(rollDie(42)).toEqual(rollDie(42));
  });

  it("rollDie returns 1..6 and covers the full range", () => {
    const seen = new Set<number>();
    let s = 12345;
    for (let i = 0; i < 600; i++) {
      const r = rollDie(s);
      s = r.seed;
      expect(r.value).toBeGreaterThanOrEqual(1);
      expect(r.value).toBeLessThanOrEqual(6);
      seen.add(r.value);
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
});
```

- [ ] **Step 6: Run the test to confirm it fails**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: FAIL — cannot resolve `./rng` (module not found).

- [ ] **Step 7: Implement `packages/engine/src/rng.ts`**

```ts
// Seeded linear-congruential generator (glibc constants), per design-spec §5.
// Deterministic: the RNG state lives in `seed` and is carried through GameState,
// so the engine never touches Math.random/Date.now. BigInt avoids 32-bit overflow.
const A = 1103515245n;
const C = 12345n;
const M = 1n << 31n; // 2^31

/** Advance the LCG one step and return the new 31-bit seed. */
export function nextSeed(seed: number): number {
  return Number((BigInt(seed) * A + C) % M);
}

/** Roll a fair d6 (1..6). Returns the advanced seed and the rolled value. */
export function rollDie(seed: number): { seed: number; value: number } {
  const s = nextSeed(seed);
  const bits = Math.floor(s / 32768) % 65536; // upper bits 15..30
  const value = Math.min(5, Math.floor(bits / 10923)) + 1; // 65536/6 ≈ 10923
  return { seed: s, value };
}
```

- [ ] **Step 8: Create the barrel `packages/engine/src/index.ts`**

```ts
export * from "./rng";
```

- [ ] **Step 9: Run the test to confirm it passes**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: PASS — 3 tests green.

- [ ] **Step 10: Verify typecheck**

Run: `pnpm --filter @sorcerers-cave/engine typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/engine pnpm-lock.yaml package.json
git commit -m "feat(engine): seeded LCG rng with deterministic d6 (spec §5)"
```

---

## Task 3: `packages/assets` skeleton (typed manifest)

A tiny package that owns the asset manifest type and base path. The real sprite mapping is filled in once the engine entity ids exist (Milestone B/E); here we just establish the package and its contract.

**Files:**
- Create: `packages/assets/package.json`, `packages/assets/tsconfig.json`, `packages/assets/src/index.ts`
- Test: `packages/assets/src/index.test.ts`

- [ ] **Step 1: Create `packages/assets/package.json`**

```json
{
  "name": "@sorcerers-cave/assets",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Add dev deps**

Run: `pnpm add -D --filter @sorcerers-cave/assets vitest typescript`

- [ ] **Step 3: Create `packages/assets/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["vitest/globals"] },
  "include": ["src"]
}
```

- [ ] **Step 4: Write the failing test — `packages/assets/src/index.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { ASSET_BASE, type AssetManifest } from "./index";

describe("assets package", () => {
  it("exposes a served base path", () => {
    expect(ASSET_BASE).toBe("/assets");
  });

  it("AssetManifest type is structurally usable", () => {
    const m: AssetManifest = { generated: "2026-06-12", categories: {} };
    expect(Object.keys(m.categories)).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run to confirm it fails**

Run: `pnpm --filter @sorcerers-cave/assets test`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 6: Implement `packages/assets/src/index.ts`**

```ts
// Typed contract for the extracted card/tile/token assets (docs/assets/manifest.json).
// Engine entities reference assets by stable integer id; this package maps ids -> sprites.
// The id->sprite mapping is populated in Milestone B/E; here we own only the shape.

export interface AssetItem {
  file: string;
  w: number;
  h: number;
  channels: string;
  sheet: number | null;
  index: number | null;
  sourcePage: number;
  rotationApplied: number;
}

export interface AssetCategory {
  dir: string;
  source: string;
  description: string;
  rotationApplied: number;
  count: number;
  items: AssetItem[];
}

export interface AssetManifest {
  generated: string;
  categories: Record<string, AssetCategory>;
}

/** Public URL prefix the web app serves the PNGs from. */
export const ASSET_BASE = "/assets";
```

- [ ] **Step 7: Run to confirm it passes**

Run: `pnpm --filter @sorcerers-cave/assets test`
Expected: PASS — 2 tests green.

- [ ] **Step 8: Commit**

```bash
git add packages/assets pnpm-lock.yaml
git commit -m "feat(assets): typed asset manifest contract"
```

---

## Task 4: `apps/web` — React + Vite + Tailwind + smoke test

**Files:**
- Create: `apps/web/package.json`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/web/tsconfig.json`, `apps/web/tsconfig.app.json`, `apps/web/tsconfig.node.json`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`, `apps/web/src/test/setup.ts`
- Test: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Install runtime + dev dependencies**

Run (runtime):
```bash
pnpm add --filter web react react-dom react-router zustand \
  @sorcerers-cave/engine@workspace:* @sorcerers-cave/assets@workspace:*
```
Run (dev):
```bash
pnpm add -D --filter web vite @vitejs/plugin-react tailwindcss @tailwindcss/vite \
  typescript @types/react @types/react-dom \
  vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Create `apps/web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 4: Create `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>The Sorcerer's Cave</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create the TypeScript configs**

`apps/web/tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`apps/web/tsconfig.app.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "noEmit": true,
    "composite": true
  },
  "include": ["src"]
}
```

`apps/web/tsconfig.node.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "composite": true, "noEmit": true },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 6: Create `apps/web/src/styles.css`** (Tailwind v4 single-import)

```css
@import "tailwindcss";
```

- [ ] **Step 7: Create `apps/web/src/App.tsx`**

```tsx
export default function App() {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-950 text-stone-100">
      <h1 className="text-3xl font-bold tracking-wide">The Sorcerer's Cave</h1>
    </main>
  );
}
```

- [ ] **Step 8: Create `apps/web/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 9: Create the test setup `apps/web/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 10: Create `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 11: Write the smoke test `apps/web/src/App.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";

test("renders the game title", () => {
  render(<App />);
  expect(screen.getByText("The Sorcerer's Cave")).toBeInTheDocument();
});
```

- [ ] **Step 12: Run the smoke test**

Run: `pnpm --filter web test`
Expected: PASS — 1 test green.

- [ ] **Step 13: Verify the build and dev server**

Run: `pnpm --filter web build`
Expected: `tsc -b` passes and Vite emits `apps/web/dist`.
Run: `pnpm --filter web dev` then open `http://localhost:5173`.
Expected: dark page with the title centered. Stop the dev server (Ctrl-C).

- [ ] **Step 14: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): react + vite + tailwind scaffold with smoke test"
```

---

## Task 5: Convex backend — init, schema, stub functions (`convex-test`)

**Files:**
- Create (via CLI + edits): `apps/web/convex/schema.ts`, `apps/web/convex/game.ts`, `apps/web/convex/game.test.ts`, `apps/web/.env.local` (CLI-managed), `apps/web/convex/_generated/**`
- Modify: `apps/web/package.json` (add a `convex` dev script)

> **Reference:** mirror `/Users/msw/code/humanrisq/monorepo/apps/web/convex` for the exact `convex-test` vitest wiring if the version differs from below.

- [ ] **Step 1: Add Convex to the web app**

Run: `pnpm add --filter web convex`

- [ ] **Step 2: Initialize the Convex dev deployment** (run inside `apps/web`)

Run: `cd apps/web && pnpm dlx convex dev --once ; cd ../..`
This logs in (browser), creates a dev deployment, writes `apps/web/.env.local` with `CONVEX_DEPLOYMENT` + `CONVEX_URL`, and creates `apps/web/convex/_generated/`.
Expected: `.env.local` contains a `CONVEX_URL=https://<name>.convex.cloud` line.

- [ ] **Step 3: Add a `convex` script to `apps/web/package.json`**

Add to the `"scripts"` block:
```json
"convex": "convex dev"
```

- [ ] **Step 4: Create the schema `apps/web/convex/schema.ts`** (auth tables included now; `ownerId` optional until Task 6/7 wires identity)

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  games: defineTable({
    ownerId: v.optional(v.id("users")),
    state: v.any(), // serialized engine GameState (engine owns the shape; Milestone B)
    status: v.union(v.literal("active"), v.literal("finished")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  gameEvents: defineTable({
    gameId: v.id("games"),
    seq: v.number(),
    action: v.any(),
    events: v.any(),
  }).index("by_game", ["gameId", "seq"]),
});
```

- [ ] **Step 5: Add the auth-server dependency** (schema imports it; full wiring in Task 6)

Run: `pnpm add --filter web @convex-dev/auth`

- [ ] **Step 6: Create stub functions `apps/web/convex/game.ts`**

```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Milestone A stubs: prove the round-trip. Real engine-backed logic lands in Milestone D.
export const newGame = mutation({
  args: { seed: v.number() },
  handler: async (ctx, { seed }) => {
    const now = Date.now();
    return await ctx.db.insert("games", {
      state: { seed, turn: 0, gs: 0 }, // placeholder GameState
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const get = query({
  args: { id: v.id("games") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});
```

- [ ] **Step 7: Add `convex-test` + wire a Convex test project**

Run: `pnpm add -D --filter web convex-test @edge-runtime/vm`

Append a second Vitest project for Convex to `apps/web/vitest.config.ts` by replacing its contents with a workspace of two projects (UI = jsdom, convex = edge-runtime):

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
    ],
  },
});
```
> If your installed Vitest predates the `projects` field, use `workspace` instead, or mirror humanrisq's `vitest.config.ts`. Verify with `pnpm --filter web exec vitest --version`.

- [ ] **Step 8: Write the failing Convex test `apps/web/convex/game.test.ts`**

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// convex-test needs every function module discoverable; this glob covers them.
const modules = import.meta.glob("./**/*.*s");

test("newGame creates a game that get returns", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.game.newGame, { seed: 123 });
  const game = await t.query(api.game.get, { id });
  expect(game?.status).toBe("active");
  expect(game?.state.seed).toBe(123);
});
```

- [ ] **Step 9: Run the Convex test project**

Run: `pnpm --filter web exec vitest run --project convex`
Expected: PASS — 1 test green. (If module resolution complains, confirm `_generated/api` exists from Step 2 and the `import.meta.glob` path is `./**/*.*s`.)

- [ ] **Step 10: Confirm the UI project still passes**

Run: `pnpm --filter web exec vitest run --project ui`
Expected: PASS — App smoke test green.

- [ ] **Step 11: Commit** (including the committed `_generated/` per humanrisq convention)

```bash
git add apps/web/convex apps/web/vitest.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(convex): schema + stub game functions with convex-test"
```

---

## Task 6: Convex anonymous auth (`@convex-dev/auth`)

**Files:**
- Create (via CLI): `apps/web/convex/auth.ts`, `apps/web/convex/auth.config.ts`, `apps/web/convex/http.ts`
- Test: `apps/web/convex/auth.test.ts`

> **Reference:** `humanrisq/monorepo/apps/web/convex/auth.ts` + `auth.config.ts`. Run the official initializer; it also sets the server JWT env vars (`JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL`) on the dev deployment.

- [ ] **Step 1: Run the Convex Auth initializer** (inside `apps/web`)

Run: `cd apps/web && pnpm dlx @convex-dev/auth ; cd ../..`
Expected: creates `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`, and sets auth env vars on the dev deployment. Follow its prompts.

- [ ] **Step 2: Configure the Anonymous provider — overwrite `apps/web/convex/auth.ts`**

```ts
import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous],
});
```

- [ ] **Step 3: Confirm `apps/web/convex/auth.config.ts` targets this deployment**

It should read (created by the initializer):
```ts
export default {
  providers: [{ domain: process.env.CONVEX_SITE_URL, applicationID: "convex" }],
};
```

- [ ] **Step 4: Push the auth functions to the dev deployment**

Run: `cd apps/web && pnpm dlx convex dev --once ; cd ../..`
Expected: deploy succeeds; `convex/_generated/api` now includes `auth`.

- [ ] **Step 5: Write the auth test `apps/web/convex/auth.test.ts`**

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

test("anonymous sign-in creates a user row", async () => {
  const t = convexTest(schema, modules);
  await t.action(api.auth.signIn, { provider: "anonymous" });
  const users = await t.run(async (ctx) => ctx.db.query("users").collect());
  expect(users.length).toBe(1);
});
```
> If the `signIn` action signature differs in your installed version, check `convex/_generated/api.d.ts` for the exact args and adjust. The intent: one anonymous sign-in ⇒ one `users` row.

- [ ] **Step 6: Run the auth test**

Run: `pnpm --filter web exec vitest run --project convex`
Expected: PASS — auth + game tests green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/convex pnpm-lock.yaml
git commit -m "feat(convex): anonymous auth via @convex-dev/auth"
```

---

## Task 7: Wire the React client to Convex + reactive round-trip

**Files:**
- Create: `apps/web/src/convex.ts`, `apps/web/src/ScaffoldGame.tsx`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`

- [ ] **Step 1: Add the React auth binding**

Run: `pnpm add --filter web @convex-dev/auth` (already present from Task 5; this is a no-op confirm). The React entry points are `convex/react` and `@convex-dev/auth/react`.

- [ ] **Step 2: Create the client `apps/web/src/convex.ts`**

```ts
import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string;
if (!url) throw new Error("VITE_CONVEX_URL is not set — run `pnpm --filter web convex` once.");

export const convex = new ConvexReactClient(url);
```

- [ ] **Step 3: Expose the Convex URL to Vite**

`pnpm dlx convex dev` writes `CONVEX_URL` to `apps/web/.env.local`. Vite only exposes `VITE_`-prefixed vars, so add this line to `apps/web/.env.local`:
```
VITE_CONVEX_URL=<the same value as CONVEX_URL>
```
Run: `grep CONVEX_URL apps/web/.env.local`
Expected: both `CONVEX_URL=` and `VITE_CONVEX_URL=` present with the same `https://<name>.convex.cloud` value.

- [ ] **Step 4: Wrap the app with the providers — overwrite `apps/web/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { convex } from "./convex";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 5: Create `apps/web/src/ScaffoldGame.tsx`** (signs in anonymously, creates a game, subscribes reactively)

```tsx
import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

export default function ScaffoldGame() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const newGame = useMutation(api.game.newGame);
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const game = useQuery(api.game.get, gameId ? { id: gameId } : "skip");

  // Anonymous sign-in once, on first load.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) void signIn("anonymous");
  }, [isLoading, isAuthenticated, signIn]);

  if (isLoading) return <p>Connecting…</p>;
  if (!isAuthenticated) return <p>Signing in…</p>;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        className="rounded bg-amber-700 px-4 py-2 font-semibold"
        onClick={async () => setGameId(await newGame({ seed: Date.now() }))}
      >
        New game
      </button>
      {game && (
        <p data-testid="game-state">
          game {gameId} — turn {game.state.turn}, seed {game.state.seed}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Render it — overwrite `apps/web/src/App.tsx`**

```tsx
import ScaffoldGame from "./ScaffoldGame";

export default function App() {
  return (
    <main className="grid min-h-screen place-items-center gap-6 bg-stone-950 text-stone-100">
      <h1 className="text-3xl font-bold tracking-wide">The Sorcerer's Cave</h1>
      <ScaffoldGame />
    </main>
  );
}
```

- [ ] **Step 7: Fix the now-failing App smoke test** (it no longer renders Convex-free)

Replace `apps/web/src/App.test.tsx` so the smoke test targets the Convex-free unit. Move the title assertion to a presentational check that doesn't need a provider:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

function Title() {
  return <h1>The Sorcerer's Cave</h1>;
}

test("title renders", () => {
  render(<Title />);
  expect(screen.getByText("The Sorcerer's Cave")).toBeInTheDocument();
});
```
> Rationale: components using Convex hooks need a live client/provider, which belongs in Milestone D integration tests, not a scaffold smoke test. Keep Task 7 verification manual (Step 9).

- [ ] **Step 8: Run the test suites**

Run: `pnpm --filter web exec vitest run`
Expected: PASS — UI title test + Convex game/auth tests all green.

- [ ] **Step 9: Manual reactive round-trip verification**

In one terminal: `cd apps/web && pnpm convex` (keeps the dev backend syncing).
In another: `pnpm --filter web dev`, then open `http://localhost:5173`.
Click **New game**. Expected: the line `game <id> — turn 0, seed <number>` appears. Confirm reactivity: in the Convex dashboard (`pnpm dlx convex dashboard` from `apps/web`), edit that game's `state.turn` to `1`; the page updates to `turn 1` without reload.
Stop both processes.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src pnpm-lock.yaml
git commit -m "feat(web): convex provider + anonymous auth + reactive game round-trip"
```

---

## Task 8: Vercel build configuration + preview deploy

Vercel "Root Directory" must be the **repo root** so pnpm resolves the `workspace:*` engine/assets deps. Convex deploy is wired into the build so the backend ships before the frontend (lambda pattern), adapted for the monorepo.

**Files:**
- Create: `vercel.json` (repo root), `apps/web/.env.example`
- Modify: `README.md` (deploy notes)

- [ ] **Step 1: Create root `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "pnpm install",
  "buildCommand": "cd apps/web && npx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd 'cd ../.. && pnpm turbo build --filter=web'",
  "outputDirectory": "apps/web/dist"
}
```
> How it works: the build `cd`s into `apps/web` so `convex deploy` finds `convex/`; `--cmd-url-env-var-name VITE_CONVEX_URL` injects the **production** Convex URL into the frontend build env; `--cmd` builds the SPA from the repo root via Turbo. Verify the flag name against `npx convex deploy --help` for your installed CLI.

- [ ] **Step 2: Create `apps/web/.env.example`** (documents required vars; never commit real `.env.local`)

```
# Written by `npx convex dev`; mirror CONVEX_URL into VITE_CONVEX_URL for Vite.
CONVEX_DEPLOYMENT=
CONVEX_URL=
VITE_CONVEX_URL=
```

- [ ] **Step 3: Document deployment in `README.md`**

Append:
```markdown
## Deployment (Vercel + Convex)

- **Vercel → Project → Root Directory:** repo root (NOT `apps/web`) — required for pnpm `workspace:*`.
- **Framework preset:** Other. Build/output come from root `vercel.json`.
- **Env vars (Vercel):** `CONVEX_DEPLOY_KEY` (from `npx convex dashboard` → Settings → Deploy keys, Production).
  The build injects `VITE_CONVEX_URL` automatically via `convex deploy --cmd-url-env-var-name`.
- **First prod setup:** from `apps/web`, run `npx convex deploy` once and run the Convex Auth
  initializer against prod so the JWT env vars exist on the production deployment.
```

- [ ] **Step 4: Verify the production build command locally** (dry-run the frontend half only — no Convex prod push)

Run: `pnpm turbo build --filter=web`
Expected: builds `apps/web/dist` successfully. (The full `convex deploy --cmd` runs in CI; locally we only verify the wrapped frontend build works.)

- [ ] **Step 5: Commit**

```bash
git add vercel.json apps/web/.env.example README.md
git commit -m "chore: vercel build config wiring convex deploy (monorepo)"
```

- [ ] **Step 6: Preview deploy (manual, requires Vercel account)**

Run: `pnpm dlx vercel link` (set Root Directory = repo root), add `CONVEX_DEPLOY_KEY` in the Vercel dashboard, then `pnpm dlx vercel` for a preview.
Expected: preview URL serves the dark title page + **New game** button, talking to the **production** Convex deployment.
> This step needs interactive Vercel auth — run it yourself with `! pnpm dlx vercel` if you want it driven from this session.

---

## Definition of Done (Milestone A)

- [ ] `pnpm install` clean from a fresh clone; `pnpm turbo build` builds all packages.
- [ ] `pnpm test` (turbo) runs engine, assets, and web (ui + convex) suites — all green.
- [ ] `pnpm --filter web dev` serves a page; **New game** creates a Convex game and the UI updates reactively (incl. an out-of-band dashboard edit).
- [ ] Anonymous auth issues a user; games are created under the authed session.
- [ ] Root `vercel.json` builds the frontend; deployment steps documented in `README.md`.
- [ ] `_generated/` committed; `.env.local` NOT committed (`.env*` is already gitignored).

---

## Self-Review

**Spec coverage vs. parent plan Milestone A (A1–A5):**
- A1 workspace/turbo/tsconfig/lint → Task 1. ✓
- A2 engine + assets skeletons → Tasks 2, 3. ✓
- A3 web (React + Vite + Tailwind + router + Zustand) → Task 4 (react-router/zustand are installed in Task 4 Step 2; routed views arrive in Milestone D, so no router wiring is forced in the scaffold — noted intentionally). ✓
- A4 Convex + `@convex-dev/auth` (anonymous) + provider + `getGame` round-trip → Tasks 5, 6, 7. ✓
- A5 `vercel.json` + preview deploy → Task 8. ✓

**Placeholder scan:** no "TBD"/"handle errors"; the only deferred items (real GameState shape, routed views, integration tests) are explicitly assigned to later milestones, not left vague here.

**Type consistency:** `newGame({ seed })` and `get({ id })` signatures match across `convex/game.ts`, `convex/game.test.ts`, and `ScaffoldGame.tsx`; `state.seed`/`state.turn` placeholder shape is consistent in the mutation, the test, and the component. `ASSET_BASE`/`AssetManifest` names match between `packages/assets` source and its test.

**Known version-sensitive spots (verify against humanrisq + current docs, flagged inline):** Turbo `tasks` schema (Task 1), Vitest `projects` field (Task 5), `convex-test` module glob + edge-runtime (Task 5), `api.auth.signIn` action args (Task 6), `convex deploy --cmd-url-env-var-name` flag (Task 8).
