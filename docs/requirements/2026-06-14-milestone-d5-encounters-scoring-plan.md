# Milestone D-5 — Party Selection, Encounters & Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the playable game — a party-selection screen that seeds `newGame`, an engine-driven encounter/fight/pickup panel that resolves chambers through real engine actions, and an end-game scoring screen.

**Architecture:** Three React pieces driven entirely by the authoritative engine `GameState` (from the D-3 `useCaveGame` hook) and the engine's pure selectors: `PartySelect` (uses `validatePicks`/`CREATURES`/`STARTING_STOCK`), `EncounterPanel` (renders `legalActions(state)` for `encounter`/`fight`/`pickup` phases and dispatches via the hook's `applyAction`), and `GameOverScreen` (uses `scoreGame`). `GameScreen` orchestrates the flow by `gs`/`phase`. The vanilla renderer's self-contained `reveal.js` decision flow is neutered (the engine-driven panel replaces it); the renderer gains a `refresh()` so the scene re-syncs after panel-driven resolution.

**Tech Stack:** React 19 + Tailwind, the engine (`legalActions`/`reduce`/`scoreGame`/`validatePicks` + `CREATURES`/`TREASURES`/`STARTING_STOCK`/`PARTY_BUDGET`/`GS_*`), the D-3 hook, the D-4 renderer/`CaveCanvas`, Vitest + Playwright.

---

## Design notes (read first)

- **Engine-driven encounters (no reveal.js rolls).** Our engine already resolves reaction/combat/pickup authoritatively. So encounters are driven by reading `state.phase` + `legalActions(state)` and dispatching the chosen `GameAction` through the hook (the same `applyAction` Convex authority path used for moves). `reveal.js`'s self-contained abstract rolls are NOT used for resolution — remove the `Reveal.run(...)` call in `cave3d.js`'s `onChamber` (the only place it's invoked). Reusing reveal.js's dice/banner *visuals* later is deferred polish.
- **Phases:** after a move into a chamber the engine sets `phase` to `encounter` (strangers present), `pickup` (only treasure), or stays `explore` (empty). `legalActions` returns exactly the legal actions per phase (encounter: `test`/`attack`/`withdraw` + `useArtifact`; fight: `fightOn`/`retreat`/`focusTarget`/`useArtifact`; pickup: `takeTreasure`/`leaveTreasure`; plus `quit` in encounter/fight). The panel renders buttons from that list — never inventing an action `reduce` would reject.
- **`gs` lifecycle:** `GS_PLAYING=0`, `GS_ESCAPED=1`, `GS_DEAD=2`, `GS_QUIT=3`. `GameScreen` shows the scoring screen when `state.gs !== GS_PLAYING`.
- **Renderer refresh seam.** Panel-driven resolution changes engine state without the renderer's own `doMove` running, so the renderer must re-sync (exit markers, HUD, newly-laid floor cards). Change `boot` to return `{ dispose, refresh }`; `refresh()` re-runs `updateHUD()`/`selectCurrent()`/`refreshExitMarkers()` and lays any not-yet-laid chamber contents. `CaveCanvas` calls `refresh()` whenever the authoritative `state` prop changes.
- **Hook dispatch.** Extend `useCaveGame` to return `dispatch(action)` = `applyAction({id, action})` (the same mutation `onAction` already uses). The panel uses it.
- **Party budget:** selectable starters are creature ids 0–7 (cost ≠ null); `STARTING_STOCK` caps each id's count; total cost ≤ `PARTY_BUDGET` (6); `validatePicks(picks)` is the authority (use it to gate Confirm).
- **Testing:** the three React components are pure (given `state`/`dispatch`/callbacks) and unit-tested in jsdom (no Convex). The live Convex round-trip + the offline render harness (extended here to drive an encounter) are browser-verified (Playwright by the controller). `App.test.tsx` stays provider-free.

---

## File structure

- **Create** `apps/web/src/game/PartySelect.tsx` + `PartySelect.test.tsx`.
- **Create** `apps/web/src/game/GameOverScreen.tsx` + `GameOverScreen.test.tsx`.
- **Create** `apps/web/src/game/EncounterPanel.tsx` + `EncounterPanel.test.tsx`.
- **Modify** `apps/web/src/game/useCaveGame.ts` — add `dispatch`.
- **Modify** `apps/web/src/game/GameScreen.tsx` — orchestrate select → play → game-over + encounter overlay.
- **Modify** `apps/web/src/view/cave3d.js` (+ `cave3d.d.ts`) — `boot` returns `{dispose,refresh}`; neuter `Reveal.run`.
- **Modify** `apps/web/src/view/CaveCanvas.tsx` — use `{dispose,refresh}`, call `refresh()` on state change.
- **Modify** `apps/web/src/cave-test.tsx` — drive encounters offline (harness).

---

### Task 1: Party selection

**Files:**
- Create: `apps/web/src/game/PartySelect.tsx`, `apps/web/src/game/PartySelect.test.tsx`
- Modify: `apps/web/src/game/GameScreen.tsx`

- [ ] **Step 1: Write the test**

Create `apps/web/src/game/PartySelect.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PartySelect } from "./PartySelect";

describe("PartySelect", () => {
  it("confirms a budget-valid party and reports the picks", () => {
    const onConfirm = vi.fn();
    render(<PartySelect onConfirm={onConfirm} />);
    // add one Woman (cost 2) — within the budget of 6
    fireEvent.click(screen.getByRole("button", { name: /add Woman/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Enter the cave/i }));
    expect(onConfirm).toHaveBeenCalledWith([6]);
  });

  it("disables Confirm when nothing is picked and when over budget", () => {
    render(<PartySelect onConfirm={() => {}} />);
    const confirm = screen.getByRole("button", { name: /^Enter the cave/i });
    expect(confirm).toBeDisabled(); // empty party is invalid
    // a Hero (cost 6) is valid; a second pick over budget disables again
    fireEvent.click(screen.getByRole("button", { name: /add Hero/i }));
    expect(confirm).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /add Woman/i })); // 6+2 = 8 > 6
    expect(confirm).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `pnpm --filter web test PartySelect` → FAIL.

- [ ] **Step 3: Implement `PartySelect`**

Create `apps/web/src/game/PartySelect.tsx`:

```tsx
import { useState } from "react";
import { CREATURES, STARTING_STOCK, PARTY_BUDGET, validatePicks } from "@sorcerers-cave/engine";

const SELECTABLE = CREATURES.filter((c) => c.cost !== null); // ids 0–7

export function PartySelect({ onConfirm }: { onConfirm: (picks: number[]) => void }) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const picks = Object.entries(counts).flatMap(([id, n]) => Array(n).fill(Number(id)) as number[]);
  const total = picks.reduce((s, id) => s + (CREATURES[id]!.cost ?? 0), 0);
  const valid = validatePicks(picks);

  const set = (id: number, delta: number) =>
    setCounts((c) => {
      const next = Math.max(0, Math.min(STARTING_STOCK[id] ?? 0, (c[id] ?? 0) + delta));
      return { ...c, [id]: next };
    });

  return (
    <div className="flex flex-col items-center gap-4 text-stone-100">
      <h2 className="text-xl font-semibold">Choose your party</h2>
      <p className="text-stone-400">Budget {total}/{PARTY_BUDGET}</p>
      <ul className="flex flex-col gap-2">
        {SELECTABLE.map((c) => (
          <li key={c.id} className="flex items-center gap-3">
            <span className="w-24">{c.name}</span>
            <span className="w-16 text-stone-400">cost {c.cost}</span>
            <button className="rounded bg-stone-700 px-2" aria-label={`remove ${c.name}`} onClick={() => set(c.id, -1)}>−</button>
            <span className="w-6 text-center">{counts[c.id] ?? 0}</span>
            <button className="rounded bg-stone-700 px-2" aria-label={`add ${c.name}`} onClick={() => set(c.id, +1)}>+</button>
            <span className="text-stone-500 text-xs">/ {STARTING_STOCK[c.id]}</span>
          </li>
        ))}
      </ul>
      <button
        className="rounded bg-amber-700 px-4 py-2 font-semibold disabled:opacity-40"
        disabled={!valid}
        onClick={() => onConfirm(picks)}
      >
        Enter the cave ({picks.length})
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run it (passes)**

Run: `pnpm --filter web test PartySelect` → PASS.

- [ ] **Step 5: Wire into `GameScreen`**

In `GameScreen.tsx`, replace the hardcoded `newGame({ seed: Date.now(), picks: [0] })` button with the `PartySelect` screen when there's no `gameId`:

```tsx
// when !gameId:
return <PartySelect onConfirm={async (picks) => setGameId(await newGame({ seed: Date.now(), picks }))} />;
```

Keep the sign-in flow above it. Import `PartySelect`.

- [ ] **Step 6: Typecheck + test + commit**

Run: `pnpm --filter web typecheck` then `pnpm --filter web test`. Green.

```bash
git add apps/web/src/game/PartySelect.tsx apps/web/src/game/PartySelect.test.tsx apps/web/src/game/GameScreen.tsx
git commit -m "feat(web): party selection screen seeding newGame (D-5)"
```

---

### Task 2: End-game scoring screen

**Files:**
- Create: `apps/web/src/game/GameOverScreen.tsx`, `apps/web/src/game/GameOverScreen.test.tsx`
- Modify: `apps/web/src/game/GameScreen.tsx`

- [ ] **Step 1: Write the test**

Create `apps/web/src/game/GameOverScreen.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, GS_ESCAPED, GS_DEAD, type GameState } from "@sorcerers-cave/engine";
import { GameOverScreen } from "./GameOverScreen";

describe("GameOverScreen", () => {
  it("shows the escape outcome and final score", () => {
    const base = newGame(1, [0]); // Hero (10 pts)
    const escaped: GameState = { ...base, gs: GS_ESCAPED };
    render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    expect(screen.getByText(/escaped/i)).toBeInTheDocument();
    expect(screen.getByText(/\b10\b/)).toBeInTheDocument(); // Hero = 10 points
  });

  it("shows perished + score 0 for a dead party and fires onNewGame", () => {
    const base = newGame(1, [0]);
    const dead: GameState = { ...base, gs: GS_DEAD };
    const onNewGame = vi.fn();
    render(<GameOverScreen state={dead} onNewGame={onNewGame} />);
    expect(screen.getByText(/perished/i)).toBeInTheDocument();
    expect(screen.getByText(/\b0\b/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /new game/i }));
    expect(onNewGame).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it (fails)** — `pnpm --filter web test GameOverScreen` → FAIL.

- [ ] **Step 3: Implement `GameOverScreen`**

Create `apps/web/src/game/GameOverScreen.tsx`:

```tsx
import { CREATURES, TREASURES, scoreGame, GS_ESCAPED, GS_DEAD, GS_QUIT, type GameState } from "@sorcerers-cave/engine";

const OUTCOME: Record<number, string> = {
  [GS_ESCAPED]: "Your party escaped the cave!",
  [GS_DEAD]: "The party perished in the dark.",
  [GS_QUIT]: "You abandoned the expedition.",
};

export function GameOverScreen({ state, onNewGame }: { state: GameState; onNewGame: () => void }) {
  const score = scoreGame(state);
  const survivors = state.party.filter((m) => m.status === 0 || m.status === 1);
  return (
    <div className="flex flex-col items-center gap-4 text-stone-100" data-testid="game-over">
      <h2 className="text-2xl font-semibold">{OUTCOME[state.gs] ?? "The expedition ends."}</h2>
      <p className="text-4xl font-bold text-amber-400">{score}</p>
      <p className="text-stone-400">points</p>
      <ul className="text-sm text-stone-300">
        {survivors.map((m, i) => (
          <li key={i}>
            {CREATURES[m.creatureId]!.name}
            {m.treasure.length > 0 && <> — {m.treasure.map((t) => TREASURES[t]!.name).join(", ")}</>}
          </li>
        ))}
      </ul>
      <button className="rounded bg-amber-700 px-4 py-2 font-semibold" onClick={onNewGame}>New game</button>
    </div>
  );
}
```

- [ ] **Step 4: Run it (passes)** — `pnpm --filter web test GameOverScreen` → PASS.

- [ ] **Step 5: Wire into `GameScreen`**

In `GameScreen.tsx`, after the hook gives `state`, branch on `gs`:

```tsx
import { GS_PLAYING } from "@sorcerers-cave/engine";
// ...after loading guard, before rendering CaveCanvas:
if (state.gs !== GS_PLAYING) return <GameOverScreen state={state} onNewGame={() => setGameId(null)} />;
```

(`onNewGame` clears the game id → returns to `PartySelect`.)

- [ ] **Step 6: Typecheck + test + commit**

Run: `pnpm --filter web typecheck` then `pnpm --filter web test`. Green.

```bash
git add apps/web/src/game/GameOverScreen.tsx apps/web/src/game/GameOverScreen.test.tsx apps/web/src/game/GameScreen.tsx
git commit -m "feat(web): end-game scoring screen (D-5)"
```

---

### Task 3: Engine-driven encounter panel + renderer refresh

**Files:**
- Create: `apps/web/src/game/EncounterPanel.tsx`, `apps/web/src/game/EncounterPanel.test.tsx`
- Modify: `apps/web/src/game/useCaveGame.ts`, `apps/web/src/game/GameScreen.tsx`
- Modify: `apps/web/src/view/cave3d.js`, `apps/web/src/view/cave3d.d.ts`, `apps/web/src/view/CaveCanvas.tsx`
- Modify: `apps/web/src/cave-test.tsx`

- [ ] **Step 1: Write the panel test**

Create `apps/web/src/game/EncounterPanel.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, type GameState } from "@sorcerers-cave/engine";
import { EncounterPanel } from "./EncounterPanel";

function encounterState(): GameState {
  // Force an encounter: a Man+Woman party facing a lone Man stranger.
  return { ...newGame(1, [5, 6]), phase: "encounter", strangers: [5] };
}

describe("EncounterPanel", () => {
  it("renders nothing in the explore phase", () => {
    const { container } = render(<EncounterPanel state={newGame(1, [5, 6])} dispatch={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers encounter actions and dispatches the chosen one", () => {
    const dispatch = vi.fn();
    render(<EncounterPanel state={encounterState()} dispatch={dispatch} />);
    expect(screen.getByRole("button", { name: /test reaction/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /attack/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "attack" });
  });

  it("offers pickup actions", () => {
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] }; // Gold
    render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /leave/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "leaveTreasure" });
  });
});
```

- [ ] **Step 2: Run it (fails)** — `pnpm --filter web test EncounterPanel` → FAIL.

- [ ] **Step 3: Implement `EncounterPanel`**

Create `apps/web/src/game/EncounterPanel.tsx`:

```tsx
import { CREATURES, TREASURES, legalActions, type GameState, type GameAction } from "@sorcerers-cave/engine";

const ACTIVE = new Set<GameState["phase"]>(["encounter", "fight", "pickup"]);

/** Human label for a legal action button. */
function label(a: GameAction, state: GameState): string {
  switch (a.type) {
    case "test": return "Test reaction";
    case "attack": return "Attack";
    case "withdraw": return "Withdraw";
    case "fightOn": return "Fight on";
    case "retreat": return "Retreat";
    case "leaveTreasure": return "Leave the treasure";
    case "focusTarget": return `Focus ${CREATURES[state.strangers[a.idx]!]?.name ?? a.idx}`;
    case "takeTreasure": return `Take ${TREASURES[state.treasures[a.ti]!]?.name ?? "treasure"} → ${CREATURES[state.party[a.mi]!.creatureId]!.name}`;
    case "useArtifact": return `Use artifact ${TREASURES[a.artifact]?.name ?? a.artifact}`;
    case "quit": return "Abandon the expedition";
    default: return a.type;
  }
}

export function EncounterPanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  if (!ACTIVE.has(state.phase)) return null;
  const actions = legalActions(state);
  const strangers = state.strangers.map((id) => CREATURES[id]!.name);
  const treasures = state.treasures.map((id) => TREASURES[id]!.name);

  return (
    <div className="absolute right-4 bottom-24 z-50 flex w-72 flex-col gap-2 rounded bg-stone-900/95 p-4 text-stone-100 ring-1 ring-amber-700/40" data-testid="encounter-panel">
      <h3 className="font-semibold capitalize">{state.phase}</h3>
      {strangers.length > 0 && <p className="text-sm text-rose-300">Strangers: {strangers.join(", ")}</p>}
      {treasures.length > 0 && <p className="text-sm text-amber-300">Treasure: {treasures.join(", ")}</p>}
      {state.fight && <p className="text-xs text-stone-400">Round {state.fight.round}</p>}
      <div className="flex flex-col gap-1">
        {actions.map((a, i) => (
          <button key={i} className="rounded bg-amber-800 px-3 py-1 text-left text-sm hover:bg-amber-700" onClick={() => dispatch(a)}>
            {label(a, state)}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it (passes)** — `pnpm --filter web test EncounterPanel` → PASS.

- [ ] **Step 5: Add `dispatch` to the hook**

In `useCaveGame.ts`, add inside the hook (after `apply`):

```typescript
  const dispatch = (action: GameAction) => { if (id) void apply({ id, action }); };
```

and include `dispatch` in the returned object: `return { engine: adapterRef.current, loading: ..., version, state, dispatch };`.

- [ ] **Step 6: Renderer `refresh()` + neuter `Reveal.run`**

In `apps/web/src/view/cave3d.js`:
- In `onChamber`, DELETE the `Reveal.run(area, chamber)` invocation (and the `revealed`-set guard around it) — the React `EncounterPanel` now drives resolution. Leave the rest of `onChamber` (lay contents, prompt, showCard).
- Define a `refresh` function (near the other HUD fns):
  ```js
  function refresh(){
    updateHUD(); selectCurrent(); refreshExitMarkers();
    engine.areas.forEach(a=>{ if((a.strangers.length||a.treasure.length) && !a._contentGroup) layContents(a,false); });
  }
  ```
- Change `boot` to return `{ dispose, refresh }` instead of the bare `dispose` function (wrap the existing dispose).

In `cave3d.d.ts`, change the return type: `export function boot(opts: BootOptions): Promise<{ dispose(): void; refresh(): void }>;`.

In `CaveCanvas.tsx`:
- Store the booted object in a ref: `const ctrl = useRef<{ dispose(): void; refresh(): void } | null>(null);` set on boot resolve; cleanup calls `ctrl.current?.dispose()`.
- Add an effect that refreshes when the authoritative state changes: `useEffect(() => { ctrl.current?.refresh(); }, [state]);` (place after the boot effect; safe when null).

- [ ] **Step 7: Wire the panel into `GameScreen`**

In `GameScreen.tsx`, render the panel as an overlay sibling of `CaveCanvas`, and pass `dispatch` from the hook:

```tsx
const { engine, loading, state, dispatch } = useCaveGame(gameId);
// ...
return (
  <div className="relative h-screen w-screen">
    <CaveCanvas key={gameId} engine={engine} state={state} />
    <EncounterPanel state={state} dispatch={dispatch} />
  </div>
);
```

(Imports: `EncounterPanel`. The game-over branch from Task 2 stays above this return.)

- [ ] **Step 8: Make the harness drive encounters (offline browser check)**

In `apps/web/src/cave-test.tsx`, make a single authoritative `mirror` the source of truth so both moves and panel actions work without Convex, and render the panel:

```tsx
import { useState } from "react";
import ReactDOM from "react-dom/client";
import { newGame, reduce, type GameAction, type GameState } from "@sorcerers-cave/engine";
import { createCaveAdapter } from "./view/engineAdapter";
import { loadManifest } from "./data/manifest";
import { CaveCanvas } from "./view/CaveCanvas";
import { EncounterPanel } from "./game/EncounterPanel";
import type { ArtTables } from "./view/projection";

function Harness({ art }: { art: ArtTables }) {
  const [state, setState] = useState<GameState>(() => newGame(20260614, [5, 6]));
  // One adapter; apply() advances the shared mirror and re-syncs the adapter (idempotent for moves).
  const [adapter] = useState(() =>
    createCaveAdapter(state, art, { onAction: (a: GameAction) => apply(a) }),
  );
  function apply(a: GameAction) {
    setState((s) => { const next = reduce(s, a).state; adapter.sync(next); return next; });
  }
  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas engine={adapter} state={state} />
      <EncounterPanel state={state} dispatch={apply} />
    </div>
  );
}

void (async () => {
  const { tiles, cards } = await loadManifest();
  ReactDOM.createRoot(document.getElementById("root")!).render(<Harness art={{ tiles, cards }} />);
})();
```

NOTE TO IMPLEMENTER: `createCaveAdapter`'s `tryMove` advances its own mirror AND calls `onAction`; here `onAction` re-reduces the shared `mirror` from its PRE-action value and `sync`s the adapter to it — deterministic, so the adapter's optimistic state and the re-reduced state match (idempotent, no double-apply). Verify a move still advances exactly one step. If you observe a double-step, switch the adapter's `onAction` to a no-op and have only the panel use `apply` (moves then rely solely on the adapter's internal mirror, and `state` is updated via a `version`-style bump) — but try the shared-mirror form first.

- [ ] **Step 9: Gates + offline Playwright verification**

Run: `pnpm --filter web sync-assets`, `pnpm --filter web typecheck`, `pnpm --filter web build`, `pnpm --filter web test` — all green.
The controller then Playwright-verifies on `http://localhost:5173/cave-test.html`: move until a chamber draws strangers (encounter panel appears), click an action (e.g. Attack/Test), and confirm the engine state advances (panel updates / closes, renderer refreshes, no console errors). Do NOT fabricate this check; leave the harness ready if you can't drive Playwright.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/game/EncounterPanel.tsx apps/web/src/game/EncounterPanel.test.tsx apps/web/src/game/useCaveGame.ts apps/web/src/game/GameScreen.tsx apps/web/src/view/cave3d.js apps/web/src/view/cave3d.d.ts apps/web/src/view/CaveCanvas.tsx apps/web/src/cave-test.tsx
git commit -m "feat(web): engine-driven encounter/fight/pickup panel + renderer refresh (D-5)"
```

---

## Definition of Done

- [ ] `PartySelect` picks a budget-valid party (`validatePicks`) and seeds `newGame`; unit-tested.
- [ ] `EncounterPanel` renders `legalActions` for `encounter`/`fight`/`pickup` and dispatches real engine actions via the hook; the renderer `refresh()`es after resolution; `reveal.js`'s decision flow is neutered; unit-tested.
- [ ] `GameOverScreen` shows the outcome + `scoreGame`; unit-tested; reachable when `gs !== GS_PLAYING`.
- [ ] `GameScreen` orchestrates sign-in → party select → play (3D + encounter overlay) → game over → new game.
- [ ] Offline harness drives a full move→encounter→resolve loop; **Playwright confirms** the encounter panel appears, an action advances state, and the renderer refreshes (no console errors).
- [ ] `pnpm --filter web typecheck` (tsc -b) + `build` + `test` green; engine unchanged.
