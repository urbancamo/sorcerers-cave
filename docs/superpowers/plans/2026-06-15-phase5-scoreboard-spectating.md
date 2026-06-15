# Phase 5 — Live Scoreboard & Spectating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live, Counter-Strike-style scoreboard overlay (with a read-only free-roam spectator camera) so finished players watch the rest of the game instead of being dropped to the menu.

**Architecture:** Reuse the reactive `gameState` query and the existing 3D renderer. Add a per-party kill counter in the multiplayer engine, extend the `gameState`/`playView` projections, build one pure `<Scoreboard>` component shown in three contexts as a translucent overlay over the live cave, and add a `focusArea` camera method for click-to-jump spectating.

**Tech Stack:** TypeScript, Convex (queries/mutations + convex-test/vitest), React + Testing Library, the `@sorcerers-cave/engine` package, vanilla Three.js renderer (`cave3d.js`).

**Delivery:** Two PRs under this plan — **PR1 = Tasks 1–5 (live scoreboard)**, **PR2 = Tasks 6–7 (spectator camera)**. Multiplayer stays behind the production-off flag; never `vercel --prod`.

**Verify commands (run from repo root `/Users/msw/code/retro/sorcerers-cave`):**
- Engine tests: `pnpm --filter @sorcerers-cave/engine exec vitest run multi.test.ts`
- Web tests: `pnpm --filter web exec vitest run convex/multiplayer.test.ts` (or a specific file)
- Typecheck: `pnpm --filter web typecheck`
- Convex codegen after server changes: `cd apps/web && npx convex codegen` (pushes to the **dev** deployment — fine; never prod)

---

## File Structure

- `packages/engine/src/multi.ts` — add `kills` to `PartyState`; init in `buildMpGame`; increment in `mpReduce`.
- `packages/engine/src/multi.test.ts` — kills unit tests.
- `apps/web/convex/multiplayer.ts` — `gameState` projection adds `depth/turns/kills`; `playView` also serves `finished`.
- `apps/web/convex/multiplayer.test.ts` — projection + finished-playView tests.
- `apps/web/src/game/Scoreboard.tsx` — **new**, pure presentational leaderboard.
- `apps/web/src/game/ScoreboardPanel.tsx` — **new**, thin `useQuery(gameState)` wrapper.
- `apps/web/src/game/Scoreboard.test.tsx` — **new**, component test.
- `apps/web/src/game/MultiplayerPlay.tsx` — overlay routing (terminal/active/finished), replace `GameOverScreen` overlay, wire spectate + click-to-jump.
- `apps/web/src/game/MultiplayerGame.tsx` — route `finished` → `MultiplayerPlay`; remove `Results`.
- `apps/web/src/styles.css` — scoreboard overlay styles (contrast-checked).
- `apps/web/src/view/cave3d.js` + `cave3d.d.ts` — `focusArea` method.
- `apps/web/src/view/CaveCanvas.tsx` — expose `focusArea` via a ref handle.

---

## PR1 — Live scoreboard

### Task 1: Per-party kill counter in the engine

**Files:**
- Modify: `packages/engine/src/multi.ts` (PartyState ~38-43, buildMpGame ~107-111, mpReduce ~145-164)
- Test: `packages/engine/src/multi.test.ts`

- [ ] **Step 1: Write the failing tests** — append to the `describe("mpReduce (turn-gated play)")` block in `packages/engine/src/multi.test.ts`:

```ts
  it("counts enemies slain on the acting party (strangerKilled/annihilated), not other events", () => {
    // Build a controlled fight: seat 0's party of a Giant (FS 7) vs a single Dwarf-stranger.
    const fighter = { creatureId: 12, status: 0 as const, dragonKills: 0, treasure: [] };
    const mp = playing({}, [
      partyAt(0, { phase: "fight", fight: { surprise: 1, round: 1, focus: 0 }, party: [fighter], strangers: [7], seed: 5 }),
      partyAt(1),
    ]);
    const r = mpReduce(mp, 0, { type: "fightOn" });
    expect(r.state.parties[0]!.kills).toBe(1); // the Dwarf was slain
    expect(r.state.parties[1]!.kills).toBe(0); // untouched
  });

  it("starts every party with zero kills", () => {
    const mp = buildMpGame(7, [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }]);
    expect(mp.parties.every((p) => p.kills === 0)).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run multi.test.ts`
Expected: FAIL — `kills` is `undefined` (property doesn't exist yet).

- [ ] **Step 3: Add `kills` to the `PartyState` interface** — in `packages/engine/src/multi.ts`, the interface currently is:

```ts
export interface PartyState extends PartyCore {
  seat: number;
  color: string;
  name: string;        // the required Party Name (identity)
  status: SeatStatus;
}
```

Change it to add `kills`:

```ts
export interface PartyState extends PartyCore {
  seat: number;
  color: string;
  name: string;        // the required Party Name (identity)
  status: SeatStatus;
  kills: number;       // enemies slain this game (for the live scoreboard)
}
```

- [ ] **Step 4: Initialise `kills` in `buildMpGame`** — the `parties` map currently starts each party with `seat: s.seat, color: s.color, name: s.name, status: "selecting",`. Add `kills: 0`:

```ts
  const parties: PartyState[] = seats.map((s) => ({
    seat: s.seat, color: s.color, name: s.name, status: "selecting", kills: 0,
    gs: GS_PLAYING, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
    partyArea: 0, level: 1, prev: 0, prev2: 0, party: [], strangers: [], treasures: [], hazards: [], fight: null,
  }));
```

- [ ] **Step 5: Increment `kills` in `mpReduce`** — the function currently builds `updated` like this:

```ts
  const { cave, rest } = splitCave(next);
  const updated: PartyState = { ...rest, seat: party.seat, color: party.color, name: party.name, status: TERMINAL[next.gs] ?? "exploring" };
```

Replace with a kill tally carried onto the rebuilt party:

```ts
  const { cave, rest } = splitCave(next);
  const slain = events.filter((e) => e.type === "strangerKilled" || e.type === "annihilated").length;
  const updated: PartyState = {
    ...rest, seat: party.seat, color: party.color, name: party.name,
    status: TERMINAL[next.gs] ?? "exploring", kills: (party.kills ?? 0) + slain,
  };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run multi.test.ts`
Expected: PASS (all multi tests, including the two new ones).

- [ ] **Step 7: Typecheck the engine**

Run: `pnpm --filter @sorcerers-cave/engine typecheck`
Expected: clean (no output / "Done").

- [ ] **Step 8: Commit**

```bash
git checkout -b phase5-scoreboard
git add packages/engine/src/multi.ts packages/engine/src/multi.test.ts
git commit -m "Multiplayer engine: track enemies slain per party (kills)"
```

---

### Task 2: Live stats in the `gameState` projection

**Files:**
- Modify: `apps/web/convex/multiplayer.ts` (`gameState` projection ~328-333)
- Test: `apps/web/convex/multiplayer.test.ts`

- [ ] **Step 1: Write the failing test** — add to `apps/web/convex/multiplayer.test.ts` (it already has `reachPlaying`):

```ts
test("gameState projection exposes live per-party stats (depth, turns, kills)", async () => {
  const t = convexTest(schema, modules);
  const { gameId, userBySeat } = await reachPlaying(t);
  const gs = (await userBySeat[0]!.query(api.multiplayer.gameState, { gameId }))!;
  for (const p of gs.parties) {
    expect(typeof p.depth).toBe("number");
    expect(typeof p.turns).toBe("number");
    expect(typeof p.kills).toBe("number");
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run convex/multiplayer.test.ts`
Expected: FAIL — `p.depth`/`p.turns`/`p.kills` are `undefined` (TypeScript error in test or runtime undefined).

- [ ] **Step 3: Extend the projection** — in `apps/web/convex/multiplayer.ts`, the `gameState` parties map is:

```ts
      parties: mp.parties.map((p) => ({
        seat: p.seat, name: p.name, color: p.color, status: p.status,
        members: p.party.map((m) => m.creatureId),
        // running/final score per party (the engine computes it from the party's state)
        score: p.party.length ? scoreGame(partyView(mp, p.seat)) : 0,
      })),
```

Replace with:

```ts
      parties: mp.parties.map((p) => ({
        seat: p.seat, name: p.name, color: p.color, status: p.status,
        members: p.party.map((m) => m.creatureId),
        // running/final score per party (the engine computes it from the party's state)
        score: p.party.length ? scoreGame(partyView(mp, p.seat)) : 0,
        depth: p.level, turns: p.turn, kills: p.kills ?? 0, // live scoreboard stats
      })),
```

- [ ] **Step 4: Run codegen, then the test**

Run: `cd apps/web && npx convex codegen && cd ../.. && pnpm --filter web exec vitest run convex/multiplayer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/convex/multiplayer.ts apps/web/convex/multiplayer.test.ts
git commit -m "Multiplayer: expose depth/turns/kills in the gameState projection"
```

---

### Task 3: `playView` serves the finished phase

**Files:**
- Modify: `apps/web/convex/multiplayer.ts` (`playView` ~353-366)
- Test: `apps/web/convex/multiplayer.test.ts`

- [ ] **Step 1: Write the failing test** — add to `apps/web/convex/multiplayer.test.ts`:

```ts
test("playView still returns a state once the whole game is finished", async () => {
  const t = convexTest(schema, modules);
  const { gameId, userBySeat } = await reachPlaying(t);
  // Both seats quit → every seat terminal → phase flips to "finished".
  for (let i = 0; i < 2; i++) {
    const cur = (await userBySeat[0]!.query(api.multiplayer.playView, { gameId }))?.currentSeat;
    if (cur === null || cur === undefined) break;
    await userBySeat[cur]!.mutation(api.multiplayer.act, { gameId, action: { type: "quit" } });
  }
  const gs = await userBySeat[0]!.query(api.multiplayer.gameState, { gameId });
  expect(gs?.phase).toBe("finished");
  const pv = await userBySeat[0]!.query(api.multiplayer.playView, { gameId });
  expect(pv).not.toBeNull();
  expect(pv!.yourTurn).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run convex/multiplayer.test.ts`
Expected: FAIL — `playView` returns `null` when `mp.phase !== "playing"`.

- [ ] **Step 3: Allow the finished phase** — in `playView`, the guard is:

```ts
    const mp = game.state as MpGameState | null;
    if (!mp || mp.phase !== "playing") return null;

    const current = mp.order[mp.active]!;
    return {
      state: partyView(mp, me.seat),
      youSeat: me.seat,
      currentSeat: current,
      yourTurn: current === me.seat,
```

Replace with (serve both `playing` and `finished`; no current turn when finished):

```ts
    const mp = game.state as MpGameState | null;
    if (!mp || (mp.phase !== "playing" && mp.phase !== "finished")) return null;

    const current = mp.phase === "playing" ? mp.order[mp.active]! : null;
    return {
      state: partyView(mp, me.seat),
      youSeat: me.seat,
      currentSeat: current,
      yourTurn: current === me.seat,
```

- [ ] **Step 4: Run codegen, then the test**

Run: `cd apps/web && npx convex codegen && cd ../.. && pnpm --filter web exec vitest run convex/multiplayer.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (the `currentSeat` type widened to `number | null`)**

Run: `pnpm --filter web typecheck`
Expected: clean. (If `MultiplayerPlay` errors on `currentSeat`, it is handled in Task 5.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/convex/multiplayer.ts apps/web/convex/multiplayer.test.ts
git commit -m "Multiplayer: playView also serves the finished phase (for the frozen overlay)"
```

---

### Task 4: The `Scoreboard` component + `ScoreboardPanel` wrapper

**Files:**
- Create: `apps/web/src/game/Scoreboard.tsx`
- Create: `apps/web/src/game/ScoreboardPanel.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/game/Scoreboard.test.tsx`

- [ ] **Step 1: Write the failing component test** — create `apps/web/src/game/Scoreboard.test.tsx`:

```tsx
import { render, screen, fireEvent, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Scoreboard, type ScoreboardParty } from "./Scoreboard";

const parties: ScoreboardParty[] = [
  { seat: 0, name: "Alpha", color: "green", status: "exploring", members: [0], score: 60, depth: 2, turns: 12, kills: 3 },
  { seat: 1, name: "Beta", color: "blue", status: "left", members: [5], score: 142, depth: 1, turns: 22, kills: 9 },
];

test("ranks by score descending and highlights your row", () => {
  render(<Scoreboard parties={parties} youSeat={0} />);
  const rows = screen.getAllByTestId("sb-row");
  expect(within(rows[0]!).getByText("Beta")).toBeTruthy(); // 142 first
  expect(within(rows[1]!).getByText(/Alpha/)).toBeTruthy(); // 60 second
  expect(rows[1]!.className).toContain("me"); // seat 0 highlighted
});

test("shows live stats for in-maze parties and an outcome for finished ones", () => {
  render(<Scoreboard parties={parties} youSeat={0} />);
  expect(screen.getByText("Escaped")).toBeTruthy(); // Beta (status "left")
  expect(screen.getByText("In maze")).toBeTruthy(); // Alpha (status "exploring")
});

test("fires footer + row callbacks", () => {
  const onQuit = vi.fn(), onRowClick = vi.fn();
  render(<Scoreboard parties={parties} youSeat={0} onQuit={onQuit} onRowClick={onRowClick} />);
  fireEvent.click(screen.getByRole("button", { name: /quit to menu/i }));
  expect(onQuit).toHaveBeenCalled();
  fireEvent.click(screen.getAllByTestId("sb-row")[0]!);
  expect(onRowClick).toHaveBeenCalledWith(1); // Beta's seat
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run src/game/Scoreboard.test.tsx`
Expected: FAIL — cannot find module `./Scoreboard`.

- [ ] **Step 3: Create the pure `Scoreboard` component** — create `apps/web/src/game/Scoreboard.tsx`:

```tsx
import { CREATURES } from "@sorcerers-cave/engine";
import { PARTY_COLOR_HEX, type PartyColor } from "./partyColors";

export interface ScoreboardParty {
  seat: number; name: string; color: string; status: string;
  members: number[]; score: number; depth: number; turns: number; kills: number;
}

const OUTCOME: Record<string, { label: string; cls: string }> = {
  left: { label: "Escaped", cls: "esc" },
  wiped: { label: "Perished", cls: "die" },
  quit: { label: "Abandoned", cls: "die" },
  exploring: { label: "In maze", cls: "live" },
  selecting: { label: "Choosing", cls: "live" },
};

/** Pure leaderboard for a multiplayer game. Parents supply the data and the footer callbacks. */
export function Scoreboard({
  parties, youSeat, frozen,
  onSpectate, onViewMyRun, onQuit, onResume, onBackToMenu, onRowClick,
}: {
  parties: ScoreboardParty[];
  youSeat: number;
  frozen?: boolean;
  onSpectate?: () => void;
  onViewMyRun?: () => void;
  onQuit?: () => void;
  onResume?: () => void;
  onBackToMenu?: () => void;
  onRowClick?: (seat: number) => void;
}) {
  const ranked = [...parties].sort((a, b) => b.score - a.score);
  return (
    <div className="scv-sb">
      <h3 className="scv-sb-hd">{frozen ? "Final standings" : "Standings"}</h3>
      <table className="scv-sb-table">
        <thead>
          <tr>
            <th>#</th><th>Party</th><th>Status</th>
            <th className="num">Depth</th><th className="num">Turns</th><th className="num">Slain</th><th className="num">Score</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((p, i) => {
            const o = OUTCOME[p.status] ?? { label: p.status, cls: "live" };
            const live = p.status === "exploring";
            return (
              <tr
                key={p.seat}
                data-testid="sb-row"
                className={"scv-sb-row" + (p.seat === youSeat ? " me" : "")}
                onClick={() => onRowClick?.(p.seat)}
              >
                <td>{i + 1}</td>
                <td>
                  <span className="scv-sb-chip" style={{ background: PARTY_COLOR_HEX[p.color as PartyColor] }} />
                  {p.name}{p.seat === youSeat && <em className="scv-sb-you"> (you)</em>}
                </td>
                <td><span className={"scv-sb-badge " + o.cls}>{o.label}</span></td>
                <td className="num">{live ? `L${p.depth}` : "—"}</td>
                <td className="num">{p.turns}</td>
                <td className="num">{p.kills}</td>
                <td className="num scv-sb-score">{p.score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="scv-sb-foot">
        {onSpectate && <button className="scv-primary" onClick={onSpectate}>▣ Dip into the cave</button>}
        {onViewMyRun && <button className="scv-primary ghost" onClick={onViewMyRun}>My run ▸</button>}
        {onResume && <button className="scv-primary" onClick={onResume}>Resume</button>}
        {onQuit && <button className="scv-primary ghost" onClick={onQuit}>Quit to menu</button>}
        {onBackToMenu && <button className="scv-primary" onClick={onBackToMenu}>Back to menu</button>}
      </div>
    </div>
  );
}

// CREATURES is imported for a possible member tooltip later; referenced to avoid an unused import.
void CREATURES;
```

(If the lint/typecheck flags the unused `CREATURES` import, delete both the import line and the `void CREATURES;` line instead of keeping them.)

- [ ] **Step 4: Add the overlay + table styles (contrast-checked)** — append to `apps/web/src/styles.css`:

```css
/* Phase 5 — live scoreboard overlay (translucent over the live cave; AA-contrast text). */
.scv-sb-overlay {
  position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(10, 10, 14, 0.55); backdrop-filter: blur(4px);
}
.scv-sb {
  width: min(560px, 94vw); padding: 16px 18px; border-radius: 14px;
  background: rgba(16, 16, 22, 0.92); border: 1px solid var(--brass); box-shadow: 0 24px 60px -20px rgba(0,0,0,0.9);
}
.scv-sb-hd { margin: 0 0 10px; font-family: var(--display); font-size: 18px; color: var(--cream); }
.scv-sb-table { width: 100%; border-collapse: collapse; font-family: var(--ui); font-size: 13px; color: var(--cream); }
.scv-sb-table th { text-align: left; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--stone-dim); padding: 4px 8px; }
.scv-sb-table th.num, .scv-sb-table td.num { text-align: right; }
.scv-sb-row td { padding: 8px; border-top: 1px solid rgba(255,255,255,0.10); cursor: pointer; }
.scv-sb-row:hover td { background: rgba(255,255,255,0.05); }
.scv-sb-row.me td { background: rgba(230,196,99,0.12); }
.scv-sb-chip { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 7px; vertical-align: middle; }
.scv-sb-you { color: var(--stone-dim); font-style: normal; opacity: 0.7; }
.scv-sb-score { font-weight: 700; color: var(--brass-bright); }
.scv-sb-badge { font-size: 10px; padding: 2px 7px; border-radius: 10px; }
.scv-sb-badge.esc { background: #2e6b3e; color: #eaf4ea; }
.scv-sb-badge.die { background: #8a3a34; color: #f6e2df; }
.scv-sb-badge.live { background: #36476b; color: #e3e9f6; }
.scv-sb-foot { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.scv-sb-foot .scv-primary { margin-top: 0; }
```

- [ ] **Step 5: Create the `ScoreboardPanel` data wrapper** — create `apps/web/src/game/ScoreboardPanel.tsx`:

```tsx
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Scoreboard, type ScoreboardParty } from "./Scoreboard";

type Cb = {
  onSpectate?: () => void; onViewMyRun?: () => void; onQuit?: () => void;
  onResume?: () => void; onBackToMenu?: () => void; onRowClick?: (seat: number) => void;
};

/** Subscribes to the reactive gameState and renders the pure Scoreboard. */
export function ScoreboardPanel({ gameId, frozen, ...cb }: { gameId: Id<"games">; frozen?: boolean } & Cb) {
  const proj = useQuery(api.multiplayer.gameState, { gameId });
  if (!proj || proj.phase === "lobby" || proj.phase === "partySelect") return null;
  return <Scoreboard parties={proj.parties as ScoreboardParty[]} youSeat={proj.youSeat} frozen={frozen} {...cb} />;
}
```

- [ ] **Step 6: Run the component test + typecheck**

Run: `pnpm --filter web exec vitest run src/game/Scoreboard.test.tsx && pnpm --filter web typecheck`
Expected: PASS + clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/game/Scoreboard.tsx apps/web/src/game/ScoreboardPanel.tsx apps/web/src/game/Scoreboard.test.tsx apps/web/src/styles.css
git commit -m "Multiplayer: add the live Scoreboard component + data wrapper"
```

---

### Task 5: Wire the scoreboard into play & game-over (overlay routing)

**Files:**
- Modify: `apps/web/src/game/MultiplayerGame.tsx` (route finished → MultiplayerPlay; remove `Results`)
- Modify: `apps/web/src/game/MultiplayerPlay.tsx` (overlay state; replace GameOverScreen overlay; Standings toggle)

- [ ] **Step 1: Route the finished phase through `MultiplayerPlay`** — in `apps/web/src/game/MultiplayerGame.tsx`, the playing route is:

```tsx
  // Shared 3D play renders full-screen (its own layout), outside the panel/chat wrap below.
  if (proj.phase === "playing") return <MultiplayerPlay gameId={gameId} onExit={onExit} />;
```

Change the condition to also cover finished:

```tsx
  // Shared 3D play renders full-screen (its own layout); the finished phase reuses it for the frozen
  // scoreboard over the read-only cave.
  if (proj.phase === "playing" || proj.phase === "finished") return <MultiplayerPlay gameId={gameId} onExit={onExit} />;
```

- [ ] **Step 2: Remove the now-dead `finished` branch + `Results`/`OUTCOME` from `MultiplayerGame.tsx`** — delete the `Results` function and the `OUTCOME` map, and change the body assignment:

```tsx
  let body: React.ReactNode;
  if (proj.phase === "partySelect") {
    body = <PartyDraft gameId={gameId} proj={proj} />;
  } else {
    body = <section className="scv-panel scv-mp"><p className="scv-muted">Waiting…</p></section>;
  }
```

(The `CREATURES` and `PARTY_COLOR_HEX` imports become unused — remove them if the typecheck flags them.)

- [ ] **Step 3: Run typecheck to confirm what's now unused**

Run: `pnpm --filter web typecheck`
Expected: errors only for unused imports in `MultiplayerGame.tsx` (remove them) — fix until clean.

- [ ] **Step 4: Add overlay state + imports to `MultiplayerPlay.tsx`** — add the import near the other game imports:

```tsx
import { ScoreboardPanel } from "./ScoreboardPanel";
```

Replace the existing quit-popup state line:

```tsx
  const [showQuit, setShowQuit] = useState(false); // HUD "Quit" → leave-to-menu vs abandon popup
```

with the Phase-5 overlay state (keep `showQuit` too):

```tsx
  const [showQuit, setShowQuit] = useState(false); // HUD "Quit" → leave-to-menu confirm
  const [spectating, setSpectating] = useState(false); // terminal/finished: scrim hidden, roaming the cave
  const [peeking, setPeeking] = useState(false);       // active player opened the standings
  const [showMyRun, setShowMyRun] = useState(false);   // personal GameOverScreen sub-modal
```

- [ ] **Step 5: Compute the scoreboard visibility** — in `MultiplayerPlay.tsx`, just after the existing `const terminal = state.gs !== GS_PLAYING;` / `const yourTurn = ...` lines, add:

```tsx
  const gameOver = view.currentSeat === null; // playView reports no current seat once finished
  const showScoreboard = (terminal || gameOver) ? !spectating : peeking;
```

- [ ] **Step 6: Replace the terminal `GameOverScreen` overlay block with the scoreboard overlay** — the current block is:

```tsx
      {/* Your expedition has ended: show the score screen. Result is auto-recorded server-side, so no save form. */}
      {terminal && (
        <div className="scv-mp-finishoverlay">
          <GameOverScreen state={state} onNewGame={onExit} />
        </div>
      )}
```

Replace it with the scoreboard overlay + an optional personal-run sub-modal + a Standings toggle for active players:

```tsx
      {/* Active players can peek at standings; terminal/finished players land here by default. */}
      {!showScoreboard && !terminal && !gameOver && (
        <button className="scv-mp-standings" onClick={() => setPeeking(true)}>Standings ▣</button>
      )}
      {/* Spectating (scrim hidden): a way back to the board. */}
      {(terminal || gameOver) && spectating && (
        <button className="scv-mp-standings" onClick={() => setSpectating(false)}>Standings ▣</button>
      )}
      {showScoreboard && (
        <div className="scv-sb-overlay">
          <ScoreboardPanel
            gameId={gameId}
            frozen={gameOver}
            onRowClick={(seat) => focusSeat(seat)}
            onResume={peeking ? () => setPeeking(false) : undefined}
            onSpectate={(terminal || gameOver) ? () => setSpectating(true) : undefined}
            onViewMyRun={terminal && !gameOver ? () => setShowMyRun(true) : undefined}
            onQuit={(terminal && !gameOver) ? onExit : undefined}
            onBackToMenu={gameOver ? onExit : undefined}
          />
        </div>
      )}
      {showMyRun && (
        <div className="scv-mp-finishoverlay" onClick={() => setShowMyRun(false)}>
          <GameOverScreen state={state} onNewGame={onExit} />
        </div>
      )}
```

- [ ] **Step 7: Add a placeholder `focusSeat`** — for PR1, row-click just dips into the cave (camera focus arrives in PR2). Add near the other callbacks in `MultiplayerPlay.tsx`, before the `return`:

```tsx
  // PR1: clicking a row drops into the read-only cave; PR2 adds the camera fly-to.
  const focusSeat = (_seat: number) => { setPeeking(false); setSpectating(true); };
```

- [ ] **Step 8: Add the Standings-button style** — append to `apps/web/src/styles.css`:

```css
.scv-mp-standings {
  position: fixed; top: 12px; right: 14px; z-index: 60;
  font-family: var(--ui); font-size: 12px; padding: 6px 12px; border-radius: 9px;
  border: 1px solid var(--line-strong); background: rgba(15,15,20,0.82); color: var(--brass-bright); cursor: pointer;
}
```

- [ ] **Step 9: Typecheck + run the full web suite**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: clean typecheck; all tests pass (the removed `Results` view has no test; `GameOverScreen` test untouched).

- [ ] **Step 10: Push to dev + commit + open PR1**

```bash
cd apps/web && npx convex codegen && cd ../..
git add apps/web/src/game/MultiplayerGame.tsx apps/web/src/game/MultiplayerPlay.tsx apps/web/src/styles.css
git commit -m "Multiplayer: live scoreboard overlay over the cave (finish/peek/frozen)"
```

Then merge PR1: `git checkout main && git merge --ff-only phase5-scoreboard`.

---

## PR2 — Spectator camera

### Task 6: `focusArea` camera method in the renderer

**Files:**
- Modify: `apps/web/src/view/cave3d.js` (boot return ~791; camera helpers ~394-402)
- Modify: `apps/web/src/view/cave3d.d.ts` (boot return type)
- Modify: `apps/web/src/view/CaveCanvas.tsx` (expose via ref)

- [ ] **Step 1: Add `focusArea` to cave3d** — in `apps/web/src/view/cave3d.js`, just after `viewSnapTile` (~line 402), add:

```js
function focusArea(a){ // a: {col,row,level} — fly the camera to that area (free-roam spectating)
  if(a==null) return;
  setMode('orbit','Spectating'); setIsolation(a.level);
  const wp=worldPos(a);
  flyTo(wp.clone().add(new THREE.Vector3(TILE_W*1.6,11,12)),wp,40);
}
```

- [ ] **Step 2: Export `focusArea` from boot** — the boot return is:

```js
  return { dispose, refresh, setParty, setOtherParties };
```

Change to:

```js
  return { dispose, refresh, setParty, setOtherParties, focusArea };
```

Also add it to the debug handle on the line above for parity:

```js
  window.__cave={scene,camera,controls,renderer,THREE,engine,tileMeshes,exitMarkers,doMove,worldPos,layContents,contentGroup,setParty,setOtherParties,focusArea};
```

- [ ] **Step 3: Type `focusArea` in `cave3d.d.ts`** — the boot return type currently is:

```ts
export function boot(opts: BootOptions): Promise<{
  dispose(): void;
  refresh(): void;
  setParty(party: ViewPartyMember[]): void;
}>;
```

Change to include the optional-tokens + focus methods actually returned:

```ts
export function boot(opts: BootOptions): Promise<{
  dispose(): void;
  refresh(): void;
  setParty(party: ViewPartyMember[]): void;
  setOtherParties(list: { color: string; col: number; row: number; level: number }[]): void;
  focusArea(a: { col: number; row: number; level: number }): void;
}>;
```

- [ ] **Step 4: Expose `focusArea` from `CaveCanvas`** — in `apps/web/src/view/CaveCanvas.tsx`, the ctrl ref type is:

```tsx
  const ctrl = useRef<{ dispose(): void; refresh(): void; setParty(p: ReturnType<typeof viewParty>): void; setOtherParties?: (list: OtherPartyToken[]) => void } | null>(null);
```

Add `focusArea?` to that type:

```tsx
  const ctrl = useRef<{ dispose(): void; refresh(): void; setParty(p: ReturnType<typeof viewParty>): void; setOtherParties?: (list: OtherPartyToken[]) => void; focusArea?: (a: { col: number; row: number; level: number }) => void } | null>(null);
```

Then add a `focusArea` prop and forward calls. Change the component signature:

```tsx
export function CaveCanvas({ engine, state, color, onPartyClick, onSave, onQuit, otherParties, onReady }: { engine: CaveEngine; state: GameState; color: PartyColor; onPartyClick?: () => void; onSave?: () => void; onQuit?: () => void; otherParties?: OtherPartyToken[]; onReady?: (api: { focusArea: (a: { col: number; row: number; level: number }) => void }) => void }) {
```

After `ctrl.current = await boot({...})` and the existing `ctrl.current?.setOtherParties?.(otherRef.current);` line, add:

```tsx
      onReady?.({ focusArea: (a) => ctrl.current?.focusArea?.(a) });
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git checkout -b phase5-spectator
git add apps/web/src/view/cave3d.js apps/web/src/view/cave3d.d.ts apps/web/src/view/CaveCanvas.tsx
git commit -m "Cave view: focusArea camera method for spectating"
```

---

### Task 7: Wire click-to-jump in `MultiplayerPlay`

**Files:**
- Modify: `apps/web/src/game/MultiplayerPlay.tsx`

- [ ] **Step 1: Capture the renderer focus API** — in `MultiplayerPlay.tsx`, add a ref near the other refs (after `const adapterRef = ...`):

```tsx
  const focusApiRef = useRef<{ focusArea: (a: { col: number; row: number; level: number }) => void } | null>(null);
```

Pass `onReady` to the `CaveCanvas` element (it currently reads `<CaveCanvas key={gameId} engine={engine} state={state} color={myColor} onPartyClick={...} onQuit={...} otherParties={otherParties} />`):

```tsx
      <CaveCanvas key={gameId} engine={engine} state={state} color={myColor} onPartyClick={() => setShowParty(true)} onQuit={() => setShowQuit(true)} otherParties={otherParties} onReady={(api) => { focusApiRef.current = api; }} />
```

- [ ] **Step 2: Make `focusSeat` fly the camera** — replace the PR1 placeholder `focusSeat` with one that resolves the seat's area coord and calls `focusArea`:

```tsx
  // Drop into the read-only cave and fly the camera to that party's current area.
  const focusSeat = (seat: number) => {
    setPeeking(false);
    setSpectating(true);
    const p = view.parties.find((q) => q.seat === seat);
    const area = p ? state.areas[p.partyArea] : undefined;
    if (area) { const c = unpackCoord(area.coord); focusApiRef.current?.focusArea({ col: c.x, row: c.y, level: c.level }); }
  };
```

(`unpackCoord` and `view`/`state` are already in scope in this component.)

- [ ] **Step 3: Typecheck + run the full web suite**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: clean typecheck; all tests pass.

- [ ] **Step 4: Manual smoke (optional but recommended)** — in the dev app, start a 2-player game (auth-swap in one browser), let one party quit, confirm: the quitter lands on the translucent scoreboard over the cave; "Dip into the cave" hides the scrim; clicking another party's row flies the camera to it; "Standings ▣" returns; the active player's "Standings ▣" peek shows the board with Resume.

- [ ] **Step 5: Push to dev + commit + merge PR2**

```bash
cd apps/web && npx convex codegen && cd ../..
git add apps/web/src/game/MultiplayerPlay.tsx
git commit -m "Multiplayer: spectator click-to-jump from the scoreboard"
git checkout main && git merge --ff-only phase5-spectator
```

---

## Self-Review

**Spec coverage:**
- Leaderboard table + columns → Task 4. Sort/highlight/outcome → Task 4 tests.
- Straight-to-scoreboard finish → Task 5 (Step 6, terminal default `!spectating`).
- Active peek → Task 5 (Standings toggle + `peeking`).
- Depth/Turns/Score + kills → Tasks 1 (kills) + 2 (projection); base stats already present.
- Free-orbit + click-to-jump spectator → Tasks 6–7; read-only is inherent (turn-gate).
- Frozen game-end scoreboard replacing `Results` → Tasks 3 (playView finished) + 5 (routing, remove Results).
- Translucent, contrast-checked overlay → Task 4 (Step 4 CSS, AA targets + opacity).
- No presence/last-seen → not implemented (correct). Deck-exhaustion not an end condition → no code added (correct).
- Token click-to-jump = stretch → intentionally omitted.

**Placeholder scan:** No TBD/TODO; every code step is concrete. The `focusSeat` placeholder in Task 5 is explicitly replaced in Task 7.

**Type consistency:** `ScoreboardParty` fields match the Task 2 projection (`seat/name/color/status/members/score/depth/turns/kills`). `focusArea(a: {col,row,level})` consistent across cave3d.js, cave3d.d.ts, CaveCanvas, and `focusSeat`. `view.currentSeat === null` (Task 5) matches the widened `currentSeat: number | null` from Task 3.
