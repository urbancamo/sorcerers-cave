# Implementation Plan — Initial Project Structure

> Project: **The Sorcerer's Cave** — online re-imagining of Terence Donnelly's 1978 board game
> Scope of this plan: scaffold the project and ship the **solitaire** version, hosted on **Convex + Vercel**, with an architecture that extends to **multiplayer** without an engine rewrite.
> Created: 2026-06-12
> Status: Approved design — ready for plan execution
> Source of truth for rules/engine: [`docs/specs/design-spec.html`](../specs/design-spec.html) (the rulebook in [`sorcerers-cave-rules.md`](../specs/sorcerers-cave-rules.md) is secondary).

---

## 1. Goals & Non-Goals

### Goals
1. A faithful, **solitaire** implementation of the game exactly as specified in `design-spec.html`.
2. A clean **Convex + Vercel** deployment, modelled on the `lambda` and `humanrisq` reference projects.
3. A **TypeScript Vue** frontend.
4. An architecture where **multiplayer is an additive change**, not a rewrite — explicitly required by the brief.

### Non-Goals (this phase)
- Multiplayer, trading, unions, party-vs-party fights, zombies, scenarios (the spec marks these out of scope for solitaire).
- The asset-conversion pipeline itself — that is a **sibling requirement** ([`2026-06-12-asset-conversion.md`](./2026-06-12-asset-conversion.md)). This plan consumes its output and defines the integration seam only.
- Closing every fidelity gap in spec §15/§16 in the first release. Gaps are tracked as discrete, post-MVP tasks (see §10, Milestone E).

---

## 2. Architecture Decisions (confirmed)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Repo layout | **pnpm + Turborepo monorepo** | Lets the game-rules engine be a first-class, isolated package importable by both the Vue client and Convex functions. Mirrors `humanrisq`'s workspace tooling. |
| D2 | Frontend stack | **Vue 3 + Vite SPA** | The game is a client-heavy SPA with no SSR/SEO need. Simpler than Nuxt; matches `humanrisq`'s Vite/Vitest tooling (swap React→Vue). |
| D3 | State authority | **Server-authoritative in Convex** from day one | The engine runs inside Convex mutations even for solitaire. Multiplayer reuses the same code with zero rewrite. |
| D4 | Identity | **Anonymous `@convex-dev/auth`** | Games persist per device with no signup friction; upgrade to real accounts cleanly for multiplayer. |

### The keystone: a pure, deterministic engine
The single most important structural choice is that **all game rules live in `packages/engine` as a pure reducer** with no I/O, no Convex, no DOM:

```ts
reduce(state: GameState, action: GameAction): { state: GameState; events: GameEvent[] }
```

- `GameState` is the serializable runtime model from **spec §3.6** — map arrays, party, decks, chamber/fight working sets, **and the LCG seed itself** (spec §5).
- Because the RNG seed lives *inside* the state, the engine is **fully deterministic**: it never calls `Math.random` or `Date.now`. This makes it (a) testable by seeded replay, and (b) safe to run inside Convex mutations (which must be deterministic-friendly).
- The engine is identical for 1 or N players. Multiplayer adds a `playerId` to actions and a turn-ownership check at the Convex boundary — the rules code does not change.

This is the seam that satisfies the multiplayer-readiness requirement.

---

## 3. Repository Structure

```
sorcerers-cave/
├── apps/
│   └── web/                        # Vue 3 + Vite SPA (the only app for now)
│       ├── convex/                 # Convex backend (co-located, humanrisq-style)
│       │   ├── schema.ts           # tables: games, gameEvents (+ auth tables)
│       │   ├── auth.ts             # @convex-dev/auth setup
│       │   ├── auth.config.ts
│       │   ├── game.ts             # newGame mutation, applyAction mutation, getGame query
│       │   ├── lib/
│       │   │   └── ownership.ts    # turn/seat ownership guard (multiplayer-forward)
│       │   ├── game.test.ts        # convex-test coverage
│       │   └── _generated/         # committed, per humanrisq convention
│       ├── src/
│       │   ├── main.ts             # mounts app, installs ConvexVue + auth provider
│       │   ├── App.vue
│       │   ├── convex.ts           # ConvexClient (VITE_CONVEX_URL)
│       │   ├── router.ts           # vue-router (title / game / help)
│       │   ├── stores/             # Pinia — LOCAL ui state only (cursors, modals)
│       │   ├── composables/        # useGame(), useKeyboard(), useAssets()
│       │   ├── components/
│       │   │   ├── TurnScreen.vue      # §13.1 frame
│       │   │   ├── AreaView.vue        # §13.2 area visualization
│       │   │   ├── PartyRoster.vue     # §13.1 roster region
│       │   │   ├── PromptLine.vue      # §13.1 message/prompt
│       │   │   ├── MapBrowser.vue      # §13.3 full-screen map
│       │   │   ├── EncounterPanel.vue  # §8 stranger options
│       │   │   ├── FightPanel.vue      # §9 focus-fire UI
│       │   │   ├── PartySelect.vue     # setup: 6-point budget
│       │   │   ├── ScoreScreen.vue     # §12 end screens
│       │   │   └── HelpManual.vue      # §14
│       │   └── assets.ts           # typed re-export of packages/assets manifest
│       ├── index.html
│       ├── vite.config.ts          # @vitejs/plugin-vue + @tailwindcss/vite
│       ├── vitest.config.ts
│       ├── tsconfig*.json
│       └── vercel.json             # buildCommand wires convex deploy (see §8)
├── packages/
│   ├── engine/                     # PURE TS RULES — no I/O
│   │   ├── src/
│   │   │   ├── state.ts            # GameState type (§3.6)
│   │   │   ├── actions.ts          # GameAction union, GameEvent union
│   │   │   ├── data/               # static tables (§3, appendices)
│   │   │   │   ├── areaCards.ts    # 61 cards (Appendix A)
│   │   │   │   ├── creatures.ts    # 14 creatures (§3.2)
│   │   │   │   ├── treasures.ts    # 15 treasures (§3.3)
│   │   │   │   ├── hazards.ts      # 5 hazards (§3.4)
│   │   │   │   ├── smallPack.ts    # 52-card template (§3.5)
│   │   │   │   └── reactions.ts    # leader priority + reaction tables (App. B)
│   │   │   ├── rng.ts              # seeded LCG (§5)
│   │   │   ├── reduce.ts           # top-level reducer / dispatch (§4)
│   │   │   ├── systems/            # one module per spec seam (§2.1)
│   │   │   │   ├── setup.ts        # party select, shuffle, place Gateway
│   │   │   │   ├── map.ts          # try_move, decode, dead-ends, levels (§6)
│   │   │   │   ├── chamber.ts      # draws, hazard resolution, pickup (§7)
│   │   │   │   ├── strangers.ts    # withdraw/attack/test, reactions (§8)
│   │   │   │   ├── fight.ts        # focus-fire, surprise, casualties (§9)
│   │   │   │   ├── special.ts      # viper pit, deep pool (§10)
│   │   │   │   ├── artifacts.ts    # passive queries (§11)
│   │   │   │   └── score.ts        # scoring + game-over (§12)
│   │   │   └── index.ts            # public API: reduce, newGame, selectors
│   │   ├── test/                   # seeded scenario + golden-replay tests
│   │   └── package.json
│   └── assets/                     # OUTPUT of the asset-conversion spec
│       ├── manifest.ts             # typed: cardId/creatureId/treasureId → sprite ref
│       ├── sprites/                # generated images (gitignored or LFS — TBD by sibling spec)
│       └── package.json
├── docs/                           # existing specs + requirements + this plan
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                    # workspace root scripts (turbo)
├── tsconfig.json
└── .gitignore
```

**Dependency direction (one-way, enforced):**
`packages/engine` depends on nothing internal. `apps/web/convex` imports `engine`. `apps/web/src` imports `engine` (for types/selectors) and `assets`. Nothing imports `apps/web`.

---

## 4. The Engine Package (`packages/engine`)

### 4.1 State model
A direct, typed transcription of spec **§3.6**. Plain serializable objects/arrays (no classes, no `Map`/`Set` in stored state) so the whole thing round-trips through Convex/JSON losslessly. Includes:
- Top-level: `gs` (0=playing,1=escaped,2=dead,3=quit), `turn`, `score`, `curses`, `sorcererKilled`.
- Map: placed-area arrays (`cards`, `coords`, `visited`), `partyArea`, `level`, `prev`, `prev2`, per-area persistent contents & flags.
- Party: members (`creatureId`, `status`, `dragonKills`, `treasure[]`).
- Decks: shuffled large/small packs + draw positions.
- Working sets: chamber (strangers/treasure/hazards), fight (front/defenders/casters, surprise, round).
- `seed`: the LCG state (§5).

### 4.2 Actions & events
- `GameAction` — every player decision as a serializable, replayable command: `Move(dir)`, `ChooseParty(picks)`, `Withdraw`, `Attack`, `Test`, `FocusTarget(i)`, `FightOn`, `Retreat`, `AssignTreasure(item, member)`, `DropTreasure(...)`, `Quit`, `ExitCave`, etc. (Multiplayer will wrap these with `playerId`.)
- `GameEvent` — what happened, for the UI to narrate and for the move log: `Moved`, `DeadEnd`, `DrewChamber`, `HazardFired`, `ReactionRolled`, `MatchResolved`, `MemberDied`, `GameOver`, etc. The reducer is the *only* producer of events; the UI never infers game facts.

### 4.3 RNG (spec §5)
Exact LCG (glibc constants) operating on `state.seed`, extracting upper bits, with `rollDie()`, `randBelow(n)`, Fisher–Yates `shuffle()`. Deterministic seeding is passed in at `newGame(seed)` time (Convex supplies the seed from `Date.now()` at the mutation boundary — outside the pure core). Exact reproduction enables golden-replay tests.

### 4.4 Public API
```ts
newGame(seed: number, partyPicks: CreatureId[]): GameState
reduce(state, action): { state, events }
// selectors (pure, for UI): decodeArea, livingParty, currentArea, legalMoves, ...
```

### 4.5 Tests (Vitest)
- **Unit** per system module (map decode, reaction thresholds, scoring formula, carry limits).
- **Seeded scenarios**: given seed S + a fixed action sequence, assert exact resulting state/events (golden files). This is the primary regression safety net and is only possible because the engine is pure.
- Targeted coverage of the constants in **Appendix D** and the reaction tables in **Appendix B**.

---

## 5. Convex Backend (`apps/web/convex`)

### 5.1 Schema
```ts
games: defineTable({
  ownerId: v.id('users'),           // anonymous user id (multiplayer: -> players[])
  state: v.any(),                   // serialized engine GameState (validated by engine on load)
  status: v.union(v.literal('active'), v.literal('finished')),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index('by_owner', ['ownerId'])

gameEvents: defineTable({           // append-only log: history, replay, debugging
  gameId: v.id('games'),
  seq: v.number(),
  action: v.any(),                  // the GameAction applied
  events: v.any(),                  // resulting GameEvents
}).index('by_game', ['gameId', 'seq'])
```
> Note: `state` is stored as an opaque blob the engine owns. We keep a single source of truth (the engine type) rather than re-declaring every field as a Convex validator — the engine validates shape on load. (Revisit if we later want fine-grained server-side validators.)

### 5.2 Functions
- `newGame` (mutation): require auth → generate `seed = Date.now()` → `engine.newGame(seed, picks)` → insert `games` row → return id.
- `applyAction` (mutation): require auth → load game → **ownership guard** (`lib/ownership.ts`: owner check now; seat/turn check later) → `engine.reduce(state, action)` → patch `state`, append `gameEvents`, set `status` on game-over → return new state.
- `getGame` (query): reactive read of a game by id (auth-scoped).
- `listMyGames` (query): resume support.

The mutation is the **only** place rules execute on the server; the client cannot mutate game truth directly.

### 5.3 Auth
`@convex-dev/auth` with the **anonymous provider** (humanrisq already uses `@convex-dev/auth`, so this is a known quantity). `auth.config.ts` keyed off `CONVEX_SITE_URL`. Games are scoped to the anonymous `userId`. Adding email/OAuth providers later is additive.

---

## 6. Vue Client (`apps/web/src`)

- **Transport**: Vue bindings for Convex (`convex-vue` / `@convex-vue/core`, community-maintained — confirm the package at Milestone A4) — `ConvexClient` from `VITE_CONVEX_URL`, installed as a plugin with the auth provider. Fallback if the binding is unsatisfactory: wrap Convex's `ConvexClient` subscriptions in a thin `useQuery` composable ourselves. Game truth flows through `useQuery(api.game.getGame)`; actions through `useMutation(api.game.applyAction)`. The UI is a pure function of server state.
- **Local state (Pinia)**: cursors, modal focus, which stranger is highlighted, help pager position — **never** game truth.
- **Input model (spec §13.4)**: a `useKeyboard()` composable maps single keystrokes to `GameAction`s in the active modal context (turn / encounter / fight / pickup / map / help), dispatched via the mutation. No invalid-key echo.
- **Components**: map 1:1 to spec §13 logical regions (see tree in §3). `AreaView` renders the §13.2 vocabulary; for MVP it can use letter glyphs, swapping to sprites from `packages/assets` as they land (the component contract doesn't change).
- **Styling**: Tailwind v4 via `@tailwindcss/vite` (framework-agnostic, identical to both reference projects).

---

## 7. Assets (`packages/assets`)

The high-res PDF conversion kit in `docs/assets/` (`sorcerers-cave-conversion-kit-base.pdf`, tokens) must be sliced into per-card/creature/treasure sprites with a typed manifest:
```ts
export const sprites: Record<CardId | CreatureId | TreasureId, SpriteRef>
```
**This is owned by the sibling requirement** [`2026-06-12-asset-conversion.md`](./2026-06-12-asset-conversion.md). This plan defines only the **integration contract**: the engine refers to entities by stable integer id (spec §3); `packages/assets` maps those ids to images; `AreaView`/`PartyRoster` consume the manifest. Until assets exist, the UI uses the glyph fallback, so engine + Convex + UI work can proceed in parallel with asset conversion.

---

## 8. Deployment (Vercel + Convex)

Follows the **`lambda` pattern** (Convex deploy wired into the Vercel build) adapted for the pnpm monorepo (the **`humanrisq` root-directory rule**):

- **Vercel root directory**: repo root (so pnpm workspace + `pnpm-workspace.yaml` resolve; `apps/web` as root would break `workspace:*`).
- **`apps/web/vercel.json`**:
  ```json
  { "buildCommand": "npx convex deploy --cmd 'pnpm turbo build --filter=web'" }
  ```
  `convex deploy` pushes backend functions to prod, then builds the SPA. Output dir: `apps/web/dist`.
- **Env vars (Vercel)**: `VITE_CONVEX_URL` (and `VITE_CONVEX_SITE_URL`). Convex deploy key stored in Vercel project settings.
- `_generated/` is committed (humanrisq convention) so CI needs no extra codegen step.

---

## 9. Multiplayer-Forward Design Notes (no work now, but the seams exist)

| Concern | Solitaire now | Multiplayer later (additive) |
|---------|---------------|------------------------------|
| Rules | pure engine, no player concept | actions gain `playerId`; engine adds turn-order + per-seat ownership |
| State | `games.ownerId` | `games.players[]` + `currentSeat` |
| Authority | Convex mutation already server-side | unchanged — same mutation, add seat guard |
| Identity | anonymous auth | add email/OAuth providers |
| Transport | reactive `getGame` query | unchanged — all seats subscribe to the same game |

Because authority and rules are already server-side and action-sourced, multiplayer is a schema/guard extension, not a re-architecture. This is the explicit payoff of decisions D1/D3.

---

## 10. Milestones & Task Breakdown

Each milestone is independently demoable. TDD throughout: engine tests are written against the spec before/with implementation.

### Milestone A — Scaffold & toolchain
- A1. Init pnpm workspace, `turbo.json`, root `tsconfig`, shared lint/format.
- A2. Create `packages/engine` and `packages/assets` package skeletons.
- A3. Create `apps/web` (Vue 3 + Vite + Tailwind v4 + vue-router + Pinia).
- A4. Init Convex in `apps/web/convex`; wire `@convex-dev/auth` (anonymous); `convex-vue` provider; verify `getGame` round-trips a stub.
- A5. `vercel.json` + first preview deploy of an empty shell.

### Milestone B — Engine: exploration core
- B1. Static data tables (§3 + Appendices A/B) with tests asserting constants (Appendix D).
- B2. RNG (§5) with golden tests.
- B3. State model + `newGame` + party selection (6-point budget, §3.2).
- B4. Map/movement: decode, `try_move`, dead-end pruning, levels, trap relocation (§6) + tests.
- B5. Turn loop / `reduce` dispatch skeleton (§4) emitting events.

### Milestone C — Engine: encounters & resolution
- C1. Chambers: depth draws, Tomb/Great Hall extras, hazard resolution order, treasure pickup + carry limits (§7).
- C2. Stranger encounters: leader priority, reaction roll w/ modifiers, perm-indifference (§8).
- C3. Fights: focus-fire pairing, surprise, all strength bonuses, Spectre rule, dragon-slayer, retreat, casualties (§9).
- C4. Special areas: viper pit, deep pool (§10).
- C5. Scoring + game-over screens data (§12).
- *Exit criteria: a full solitaire game is playable through a scripted action sequence in tests.*

### Milestone D — Convex wiring & client UI
- D1. `games`/`gameEvents` schema; `newGame`/`applyAction`/`getGame`/`listMyGames`; ownership guard; `convex-test` coverage.
- D2. Turn screen frame + region components (§13.1) bound to reactive state.
- D3. `AreaView` glyph rendering (§13.2); map browser (§13.3).
- D4. Encounter + fight + pickup modals; keyboard input model (§13.4).
- D5. Party-select + score + help screens (§§3.2, 12, 14).
- *Exit criteria: a human can play a complete solitaire game in the browser against Convex.*

### Milestone E — Assets & fidelity polish
- E1. Integrate `packages/assets` sprite manifest into `AreaView`/`PartyRoster` (depends on the asset-conversion sibling spec).
- E2. Pick off spec §15/§16 gaps as discrete tasks (Talisman, Lotus Dust, Magic Carpet, Healing Balm, Lost Ruby, Eye of God, Treasure Chest open, Unicorn-with-Woman, forced-redraw deadlock, inventory/artifact menus). Each is small and independently testable.

---

## 11. Testing Strategy

| Layer | Tool | What |
|-------|------|------|
| Engine | Vitest | Unit per system + **seeded golden-replay** scenarios (primary safety net) |
| Convex | `convex-test` | mutations, auth scoping, ownership guard, event-log append |
| Client | Vitest + `@vue/test-utils` | component smoke + keyboard→action mapping |
| E2E (optional, later) | Playwright | one full happy-path game |

---

## 12. Open Questions / To Confirm Later
- **Asset storage**: committed in-repo vs Git LFS vs Convex file storage / Vercel static — deferred to the asset-conversion spec.
- **Server-side state validators**: start with `v.any()` + engine validation; revisit if we want column-level Convex validators for the game blob.
- **Save-slot UX**: `listMyGames` supports multiple in-progress games; how many to expose in UI is a product call for Milestone D.

---

## 13. Reference Stacks
- **`lambda`** (`/Users/msw/code/lambda`) — Vue/Convex/Vercel; source of the `vercel.json` "`convex deploy --cmd`" build pattern.
- **`humanrisq`** (`/Users/msw/code/humanrisq`) — pnpm + Turborepo monorepo, `@convex-dev/auth`, `convex-test`, committed `_generated/`, Vercel root-directory rule.
- **Prior implementations** (rules reference only): Casio BASIC (`retro/fx870p-emulator/reference/sorcerers-cave`), VAX MACRO-32 (`retro/macro-32/src/macro32/sorcerer`).
