# sorcerers-cave

Online Re-Imagining of the classic Sorcerer's Cave board game.

A pnpm + Turborepo monorepo:

- `packages/engine` — pure, deterministic TypeScript game rules (no I/O).
- `packages/assets` — typed contract for the extracted card/tile/token art.
- `apps/web` — React 19 + Vite SPA with a co-located Convex backend (server-authoritative game state, anonymous auth).

## Develop

```bash
pnpm install
# Terminal 1 — Convex backend (keeps functions + local deployment in sync):
pnpm --filter web convex
# Terminal 2 — web app:
pnpm --filter web dev      # http://localhost:5173
```

Run the test suites:

```bash
pnpm test                  # all packages via turbo
pnpm --filter web exec vitest run   # web: ui (jsdom) + convex (edge-runtime) projects
```

## Deployment (Vercel + Convex)

- **Vercel → Project → Root Directory:** repo root (NOT `apps/web`) — required for pnpm `workspace:*`.
- **Framework preset:** Other. Build command and output directory come from the root `vercel.json`,
  which runs `convex deploy` (shipping the backend) and injects the production `VITE_CONVEX_URL`
  into the frontend build via `--cmd-url-env-var-name`.
- **Env var (Vercel):** `CONVEX_DEPLOY_KEY` — create a **production** Convex deployment first
  (`cd apps/web && npx convex login && npx convex deploy`), then generate a deploy key in the
  Convex dashboard (Settings → Deploy keys) and add it to the Vercel project.
- **Auth keys on prod:** the local dev deployment has its own `JWT_PRIVATE_KEY` / `JWKS`. Generate a
  fresh RS256 keypair for the production deployment and set them with `npx convex env set` against prod.
