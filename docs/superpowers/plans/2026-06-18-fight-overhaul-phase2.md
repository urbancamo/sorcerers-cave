# Fight Overhaul — Phase 2 (Drag-card fight UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy auto-combat UI for the `fight` phase with a player-driven, drag-to-pair
surface built on Phase 1's `resolveRound` action: lay the strangers out, drag party cards onto them
(front line / 2-v-1), drop casters into a background slot, see live strength totals, then roll. Real
creature cards, wielded artefacts tucked on the corner, and hover/tap card zoom. Solo + multiplayer.

**Architecture:** A new `FightSurface` renders whenever `phase === "fight"` (the existing `EncounterPanel`
stops handling fight and keeps encounter + pickup). All pairing logic is a pure, unit-tested reducer
`fightPlan.ts` (the in-progress `PlanDraft`); both the drag path and the tap/keyboard path dispatch into
it. The player builds a `BattlePlan` client-side, gated live by the engine's `validatePlan`, then
dispatches `{ type: "resolveRound", matches }`. The existing `DiceRoll` overlay (via `rollFromEvents`,
already handling `combatRoll`) shows the result; the casualty choice and retreat reuse the existing
`chooseCasualty` / `retreat` actions. The player only ever assigns one stranger per match — the engine
auto-forms the strangers' strongest combination when out-numbered (Phase 1), so the UI needs no manual
1-v-2 builder.

**Tech Stack:** React + TypeScript, Vite, Vitest + Testing Library (jsdom), the vanilla card art from
the manifest. Engine consumed from TS source.

**Design spec:** `docs/superpowers/specs/2026-06-18-fight-overhaul-design.md`; mockup:
`docs/superpowers/specs/2026-06-18-fight-ui-mockup.html`. Phase 1 engine: `packages/engine/src/combatPlan.ts`.

---

## Conventions for every task

- Engine tests: `pnpm --filter @sorcerers-cave/engine exec vitest run <file>`.
- Web tests: `cd apps/web && pnpm exec vitest run <file>`.
- Typecheck: `pnpm -r typecheck`. Build check (final task): `cd apps/web && pnpm build`.
- Branch `fight-phase2`; merge to `main` only in the final task. Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File structure

- **Modify** `packages/engine/src/index.ts` — export `combatPlan` (so the UI can call `validatePlan`).
- **Create** `apps/web/src/game/fightPlan.ts` — pure `PlanDraft` reducer (assign/unassign → `BattlePlan`).
- **Create** `apps/web/src/game/fightPlan.test.ts`.
- **Create** `apps/web/src/data/useManifestCards.ts` — load + cache the manifest cards for panels.
- **Create** `apps/web/src/game/CardZoom.tsx` — hover/tap enlarge overlay (creature + artefact).
- **Create** `apps/web/src/game/FightCard.tsx` — one creature/stranger card (art, badge, wielded artefacts, drag, click, zoom).
- **Create** `apps/web/src/game/FightSurface.tsx` — the surface (strangers, tray, matches, totals, controls, casualty chooser).
- **Create** `apps/web/src/game/FightSurface.test.tsx`.
- **Modify** `apps/web/src/game/EncounterPanel.tsx` — drop the `fight` phase (FightSurface owns it).
- **Modify** `apps/web/src/game/GameScreen.tsx` and `apps/web/src/game/MultiplayerPlay.tsx` — mount `FightSurface`.
- **Modify** `apps/web/src/styles.css` — fight-surface styles (mirroring the mockup).

---

### Task 1: Export the plan engine to the UI

**Files:** Modify `packages/engine/src/index.ts`

- [ ] **Step 1: Add the export**

After the `export * from "./combat";` line, add:

```ts
export * from "./combatPlan";
```

- [ ] **Step 2: Verify the UI can see it**

Run: `pnpm --filter @sorcerers-cave/engine typecheck` → PASS. (`validatePlan`, `PlanError`, and — already
via `state` — `PlanMatch`/`BattlePlan` are now importable from `@sorcerers-cave/engine`.)

- [ ] **Step 3: Commit**

```bash
git checkout -b fight-phase2
git add packages/engine/src/index.ts
git commit -m "Fight UI: export combatPlan (validatePlan) from the engine index

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `fightPlan.ts` — the pure pairing reducer

The UI's in-progress pairing. Members are assigned to a stranger as `front` (hand-to-hand, max 2) or
`backer` (a caster lending magic). One stranger per match; the engine augments out-numbered foes.

**Files:** Create `apps/web/src/game/fightPlan.ts` and `apps/web/src/game/fightPlan.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/game/fightPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emptyDraft, place, unplace, toMatches, freeMembers, strangerOf } from "./fightPlan";

describe("fightPlan draft reducer", () => {
  it("places a fighter on a stranger as front", () => {
    const d = place(emptyDraft(), 0, 2, "front");
    expect(toMatches(d)).toEqual([{ front: [0], backers: [], strangers: [2] }]);
    expect(strangerOf(d, 0)).toBe(2);
  });

  it("a second fighter on the same foe makes a 2-v-1; a third is ignored", () => {
    let d = place(emptyDraft(), 0, 2, "front");
    d = place(d, 1, 2, "front");
    d = place(d, 3, 2, "front"); // capped at two front
    expect(toMatches(d)[0]!.front).toEqual([0, 1]);
  });

  it("re-placing a member moves it (never duplicates across matches)", () => {
    let d = place(emptyDraft(), 0, 2, "front");
    d = place(d, 0, 5, "front"); // move to a different foe
    expect(toMatches(d)).toEqual([{ front: [0], backers: [], strangers: [5] }]);
  });

  it("places a caster as a backer", () => {
    let d = place(emptyDraft(), 0, 2, "front");
    d = place(d, 1, 2, "backer");
    expect(toMatches(d)).toEqual([{ front: [0], backers: [1], strangers: [2] }]);
  });

  it("drops backer-only matches (a match needs a front fighter)", () => {
    const d = place(emptyDraft(), 1, 2, "backer");
    expect(toMatches(d)).toEqual([]);
  });

  it("unplace frees a member back to the tray", () => {
    let d = place(emptyDraft(), 0, 2, "front");
    d = unplace(d, 0);
    expect(toMatches(d)).toEqual([]);
    expect(strangerOf(d, 0)).toBeNull();
  });

  it("freeMembers returns the living members not yet assigned", () => {
    const d = place(emptyDraft(), 0, 2, "front");
    expect(freeMembers(d, [0, 1, 2])).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/web && pnpm exec vitest run src/game/fightPlan.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `fightPlan.ts`**

Create `apps/web/src/game/fightPlan.ts`:

```ts
import type { PlanMatch } from "@sorcerers-cave/engine";

export type Role = "front" | "backer";

/** The in-progress pairing: for each engaged stranger, the front fighters and backing casters.
 *  One stranger per match — the engine forms the strangers' strongest combination when out-numbered. */
export interface PlanDraft {
  byStranger: Record<number, { front: number[]; backers: number[] }>;
}

export const emptyDraft = (): PlanDraft => ({ byStranger: {} });

/** Which stranger (if any) a party member is currently assigned to. */
export function strangerOf(draft: PlanDraft, memberIdx: number): number | null {
  for (const [s, g] of Object.entries(draft.byStranger)) {
    if (g.front.includes(memberIdx) || g.backers.includes(memberIdx)) return Number(s);
  }
  return null;
}

/** Remove a member from every match (immutably). */
export function unplace(draft: PlanDraft, memberIdx: number): PlanDraft {
  const byStranger: PlanDraft["byStranger"] = {};
  for (const [s, g] of Object.entries(draft.byStranger)) {
    byStranger[Number(s)] = {
      front: g.front.filter((i) => i !== memberIdx),
      backers: g.backers.filter((i) => i !== memberIdx),
    };
  }
  return { byStranger };
}

/** Assign a member to a stranger as front (max 2) or backer; moves it off any prior match. */
export function place(draft: PlanDraft, memberIdx: number, strangerIdx: number, role: Role): PlanDraft {
  const moved = unplace(draft, memberIdx);
  const g = moved.byStranger[strangerIdx] ?? { front: [], backers: [] };
  const next = { front: [...g.front], backers: [...g.backers] };
  if (role === "front") {
    if (next.front.length >= 2 || next.front.includes(memberIdx)) return draft; // 2-v-1 cap → no-op
    next.front.push(memberIdx);
  } else {
    if (next.backers.includes(memberIdx)) return draft;
    next.backers.push(memberIdx);
  }
  return { byStranger: { ...moved.byStranger, [strangerIdx]: next } };
}

/** Serialize to the engine's BattlePlan matches — only matches that have at least one front fighter. */
export function toMatches(draft: PlanDraft): PlanMatch[] {
  return Object.entries(draft.byStranger)
    .filter(([, g]) => g.front.length > 0)
    .map(([s, g]) => ({ front: [...g.front], backers: [...g.backers], strangers: [Number(s)] }));
}

/** Living member indices not yet assigned anywhere (the tray). */
export function freeMembers(draft: PlanDraft, livingIdxs: number[]): number[] {
  return livingIdxs.filter((i) => strangerOf(draft, i) === null);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/web && pnpm exec vitest run src/game/fightPlan.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/game/fightPlan.ts apps/web/src/game/fightPlan.test.ts
git commit -m "Fight UI: pure pairing-draft reducer (fightPlan)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `useManifestCards` hook

**Files:** Create `apps/web/src/data/useManifestCards.ts`

- [ ] **Step 1: Implement (load once, module-cached)**

Create `apps/web/src/data/useManifestCards.ts`:

```ts
import { useEffect, useState } from "react";
import { loadManifest, type CardArt } from "./manifest";

let cache: CardArt[] | null = null;
let inflight: Promise<CardArt[]> | null = null;

/** The small-card art, loaded once and shared. `null` until ready. */
export function useManifestCards(): CardArt[] | null {
  const [cards, setCards] = useState<CardArt[] | null>(cache);
  useEffect(() => {
    if (cache) { setCards(cache); return; }
    inflight ??= loadManifest().then(({ cards }) => (cache = cards));
    let live = true;
    void inflight.then((c) => { if (live) setCards(c); });
    return () => { live = false; };
  }, []);
  return cards;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/data/useManifestCards.ts
git commit -m "Fight UI: useManifestCards hook (load + cache small-card art)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `CardZoom` overlay

A lightweight enlarged-card popover. The small-card art already shows the printed stats/effects, so zoom
is just the same image at large size. Used by `FightCard` on hover (desktop) and tap-and-hold (touch).

**Files:** Create `apps/web/src/game/CardZoom.tsx`

- [ ] **Step 1: Implement**

Create `apps/web/src/game/CardZoom.tsx`:

```tsx
import { createPortal } from "react-dom";

/** A centered, enlarged card image shown while hovering/holding a card. `src` null → nothing. */
export function CardZoom({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return null;
  return createPortal(
    <div className="scv-cardzoom" aria-hidden>
      <img src={src} alt={alt} />
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/game/CardZoom.tsx
git commit -m "Fight UI: CardZoom enlarged-card overlay

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `FightCard` — one card with art, badge, artefacts, zoom, drag

**Files:** Create `apps/web/src/game/FightCard.tsx`

- [ ] **Step 1: Implement**

Create `apps/web/src/game/FightCard.tsx`:

```tsx
import { useState } from "react";
import { CREATURES, TREASURES, type GameState } from "@sorcerers-cave/engine";
import { resolveCardVariant, resolveCard, type CardArt } from "../data/manifest";
import { CardZoom } from "./CardZoom";

export type CardKind = "ally" | "caster" | "foe";

/** One creature card: real art, a strength badge, any wielded artefacts tucked on the corner, hover/tap
 *  zoom, and (for party members) drag + click to assign. `strength` is the value shown in the badge. */
export function FightCard({
  creatureId, kind, strength, caption, treasure = [], cards, state,
  draggable, onPick, dim, selected,
}: {
  creatureId: number; kind: CardKind; strength: number; caption?: string;
  treasure?: number[]; cards: CardArt[]; state: GameState;
  draggable?: boolean; onPick?: () => void; dim?: boolean; selected?: boolean;
}) {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const art = resolveCardVariant("creature", creatureId, creatureId, cards) ?? resolveCard("creature", creatureId, cards);
  const name = CREATURES[creatureId]?.name ?? "?";
  const relics = treasure.map((t) => ({ id: t, art: resolveCard("treasure", t, cards), name: TREASURES[t]?.name ?? "artefact" }));

  return (
    <div className={`scv-fc scv-fc-${kind}${dim ? " is-dim" : ""}${selected ? " is-sel" : ""}`}>
      <div
        className="scv-fc-frame"
        draggable={draggable}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onPick?.(); }}
        onClick={onPick}
        onMouseEnter={() => art && setZoom({ src: art.file, alt: name })}
        onMouseLeave={() => setZoom(null)}
        role={onPick ? "button" : undefined}
        tabIndex={onPick ? 0 : undefined}
        onKeyDown={(e) => { if (onPick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(); } }}
      >
        {art ? <img className="scv-fc-art" src={art.file} alt={name} /> : <div className="scv-fc-art scv-fc-blank">{name}</div>}
        <span className="scv-fc-badge">{strength}</span>
        {relics.length > 0 && (
          <div className="scv-fc-wield">
            {relics.map((r, i) => r.art
              ? <img key={i} className="scv-fc-relic" src={r.art.file} alt={r.name} title={r.name}
                     onMouseEnter={() => setZoom({ src: r.art!.file, alt: r.name })} onMouseLeave={() => setZoom(null)} />
              : null)}
          </div>
        )}
      </div>
      <div className="scv-fc-cap"><b>{name}</b>{caption ? <span>{caption}</span> : null}</div>
      <CardZoom src={zoom?.src ?? null} alt={zoom?.alt ?? ""} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/game/FightCard.tsx
git commit -m "Fight UI: FightCard (art + strength badge + wielded artefacts + zoom)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `FightSurface` — the pairing surface

**Files:** Create `apps/web/src/game/FightSurface.tsx` and `apps/web/src/game/FightSurface.test.tsx`

`FightSurface` owns the `PlanDraft`, shows strangers (each a drop target with a front zone + ✦ background
slot), the unassigned tray, live totals, and the controls. Tap model: tap a tray card to select, then tap
a stranger's front/✦ to place; drag does the same via `place`. Roll is gated by `validatePlan`. When
`state.fight.casualtyQueue` is set, it shows the casualty chooser instead.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/game/FightSurface.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { newGame, type GameState } from "@sorcerers-cave/engine";
import { FightSurface } from "./FightSurface";
import type { CardArt } from "../data/manifest";

const cards: CardArt[] = []; // art is optional in tests — FightCard falls back to a name block

// Web tests build state by spreading newGame(seed, picks) (the public constructor), as the other
// panel tests do — newGame(1, [0, 4]) gives a Hero + Priest party on the gateway.
const fightState = (over: Partial<GameState> = {}): GameState =>
  ({ ...newGame(1, [0, 4]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3, 9], ...over });

describe("FightSurface", () => {
  it("Roll is disabled until the plan is legal, then dispatches resolveRound", () => {
    const dispatch = vi.fn();
    render(<FightSurface state={fightState()} dispatch={dispatch} cards={cards} />); // Hero, Priest vs Troll, Spectre
    const roll = screen.getByRole("button", { name: /roll the round/i });
    expect(roll).toBeDisabled();

    // Assign the Priest (caster) to the Spectre, the Hero to the Troll (tap model).
    fireEvent.click(screen.getByTestId("tray-1"));     // pick the Priest
    fireEvent.click(screen.getByTestId("front-1"));    // place on the Spectre (stranger idx 1)
    fireEvent.click(screen.getByTestId("tray-0"));     // pick the Hero
    fireEvent.click(screen.getByTestId("front-0"));    // place on the Troll (stranger idx 0)

    expect(roll).not.toBeDisabled();
    fireEvent.click(roll);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "resolveRound" }));
    const arg = dispatch.mock.calls[0]![0];
    expect(arg.matches).toEqual(expect.arrayContaining([
      { front: [0], backers: [], strangers: [0] },
      { front: [1], backers: [], strangers: [1] },
    ]));
  });

  it("shows the casualty chooser when a casualty is queued", () => {
    const dispatch = vi.fn();
    const s = fightState({ fight: { surprise: 0, round: 2, focus: 0, casualtyQueue: [[0, 1]] } });
    render(<FightSurface state={s} dispatch={dispatch} cards={cards} />);
    expect(screen.getByText(/who is lost/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /let .* fall/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "chooseCasualty", idx: expect.any(Number) });
  });

  it("offers retreat after round 1", () => {
    const dispatch = vi.fn();
    // The gateway (card 175) has all four doorways, so legalActions offers N/E/S/W retreats at round > 1.
    const s = fightState({ fight: { surprise: 0, round: 2, focus: 0 }, party: newGame(1, [0]).party, strangers: [3] });
    render(<FightSurface state={s} dispatch={dispatch} cards={cards} />);
    fireEvent.click(screen.getByRole("button", { name: /retreat/i }));
    fireEvent.click(within(screen.getByTestId("retreat-menu")).getAllByRole("button")[0]!);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "retreat" }));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/web && pnpm exec vitest run src/game/FightSurface.test.tsx` → FAIL (component missing).

- [ ] **Step 3: Implement `FightSurface.tsx`**

Create `apps/web/src/game/FightSurface.tsx`:

```tsx
import { useMemo, useState } from "react";
import {
  CREATURES, legalActions, validatePlan, frontStrength, casterMP,
  type GameState, type GameAction,
} from "@sorcerers-cave/engine";
import type { CardArt } from "../data/manifest";
import { FightCard, type CardKind } from "./FightCard";
import { emptyDraft, place, unplace, toMatches, freeMembers, strangerOf, type PlanDraft } from "./fightPlan";

const DIR_NAME: Record<number, string> = { 1: "North", 2: "East", 3: "South", 4: "West", 5: "Up the stair", 6: "Down the stair" };
const RETREAT_REASON: Record<string, string> = {
  twoVsTwo: "Two against two isn't allowed — send two against one, or one against two.",
  backerNotCaster: "Only a Priest or Wizard may fight from the background.",
  spectreNeedsMagic: "A Spectre can only be fought with magic or the Magic Sword.",
  mustEngageAll: "Engage every stranger you can before rolling.",
  emptyPlan: "Set at least one fighter against a foe.",
};

const living = (s: GameState) => s.party.map((m, i) => i).filter((i) => { const m = s.party[i]!; return m.status === 0 || m.status === 1; });
const isCaster = (s: GameState, i: number) => casterMP(s.party[i]!, s) > 0;
const kindOf = (s: GameState, i: number): CardKind => (isCaster(s, i) ? "caster" : "ally");

export function FightSurface({ state, dispatch, cards }: { state: GameState; dispatch: (a: GameAction) => void; cards: CardArt[] }) {
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft());
  const [sel, setSel] = useState<number | null>(null); // tap-selected tray member
  const [retreatOpen, setRetreatOpen] = useState(false);
  if (state.phase !== "fight" || !state.fight) return null;

  // --- Casualty choice takes over the surface until resolved.
  const pair = state.fight.casualtyQueue?.[0];
  if (pair) {
    return (
      <div className="scv-fight" data-testid="fight-surface">
        <h3 className="scv-fight-hd">Round {state.fight.round - 1} — who is lost?</h3>
        <p className="scv-fight-sub">Your front line was overcome. Choose which creature falls — a die decides (4–6 grants your choice).</p>
        <div className="scv-fight-row">
          {pair.map((idx) => (
            <button key={idx} className="scv-fight-btn" onClick={() => dispatch({ type: "chooseCasualty", idx })}>
              Let {CREATURES[state.party[idx]!.creatureId]!.name} fall
            </button>
          ))}
        </div>
      </div>
    );
  }

  const livingIdx = living(state);
  const tray = freeMembers(draft, livingIdx);
  const matches = toMatches(draft);
  const valid = validatePlan(state, { matches });
  const reason = valid.ok ? null : (RETREAT_REASON[valid.reason] ?? "That pairing isn't legal yet.");
  const retreats = legalActions(state).filter((a): a is Extract<GameAction, { type: "retreat" }> => a.type === "retreat");
  const artifacts = legalActions(state).filter((a): a is Extract<GameAction, { type: "useArtifact" }> => a.type === "useArtifact");

  const placeOn = (strangerIdx: number, role: "front" | "backer") => {
    if (sel === null) return;
    setDraft((d) => place(d, sel, strangerIdx, role));
    setSel(null);
  };
  const memberStrength = (i: number, spectre: boolean) => (spectre && isCaster(state, i) ? casterMP(state.party[i]!, state) : frontStrength(state.party[i]!, state));

  return (
    <div className="scv-fight" data-testid="fight-surface">
      <div className="scv-fight-top">
        <h3 className="scv-fight-hd">⚔ Fight · Round {state.fight.round}</h3>
        {state.fight.round === 1 && state.fight.surprise !== 0 && (
          <span className={`scv-fight-banner ${state.fight.surprise === 1 ? "good" : "bad"}`}>
            {state.fight.surprise === 1 ? "You took them by surprise — +1 this round" : "The strangers surprised you — −1 this round"}
          </span>
        )}
      </div>

      <div className="scv-fight-strangers">
        {state.strangers.map((sid, si) => {
          const spectre = sid === 9;
          const g = draft.byStranger[si] ?? { front: [], backers: [] };
          const partyStr = g.front.reduce((s, i) => s + memberStrength(i, spectre), 0) + g.backers.reduce((s, i) => s + casterMP(state.party[i]!, state), 0);
          const enemyStr = CREATURES[sid]!.fs + CREATURES[sid]!.mp;
          return (
            <div key={si} className="scv-match">
              <FightCard creatureId={sid} kind="foe" strength={enemyStr} caption={spectre ? "magic only" : undefined} cards={cards} state={state} />
              <div className="scv-match-vs"><span className="me">{partyStr}</span> vs <span className="them">{enemyStr}</span></div>
              <div className="scv-match-front" data-testid={`front-${si}`} role="button" tabIndex={0}
                   onClick={() => placeOn(si, "front")} onKeyDown={(e) => { if (e.key === "Enter") placeOn(si, "front"); }}
                   onDragOver={(e) => e.preventDefault()} onDrop={() => placeOn(si, "front")}>
                {g.front.length ? g.front.map((i) => (
                  <FightCard key={i} creatureId={state.party[i]!.creatureId} kind={kindOf(state, i)} strength={memberStrength(i, spectre)}
                             treasure={state.party[i]!.treasure} cards={cards} state={state} onPick={() => setDraft((d) => unplace(d, i))} />
                )) : <span className="scv-match-hint">drop a fighter</span>}
              </div>
              <div className="scv-match-bg" data-testid={`bg-${si}`} role="button" tabIndex={0}
                   onClick={() => placeOn(si, "backer")} onKeyDown={(e) => { if (e.key === "Enter") placeOn(si, "backer"); }}
                   onDragOver={(e) => e.preventDefault()} onDrop={() => placeOn(si, "backer")}>
                ✦ {g.backers.length ? g.backers.map((i) => CREATURES[state.party[i]!.creatureId]!.name).join(", ") + ` (+${g.backers.reduce((s, i) => s + casterMP(state.party[i]!, state), 0)})` : "background magic"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="scv-fight-tray" data-testid="fight-tray">
        <span className="scv-fight-cap">Your party — tap a fighter then a foe (or drag):</span>
        {tray.length ? tray.map((i) => (
          <div key={i} data-testid={`tray-${i}`}>
            <FightCard creatureId={state.party[i]!.creatureId} kind={kindOf(state, i)} strength={frontStrength(state.party[i]!, state)}
                       treasure={state.party[i]!.treasure} cards={cards} state={state} draggable selected={sel === i}
                       onPick={() => setSel(sel === i ? null : i)} />
          </div>
        )) : <span className="scv-fight-hint">all fighters assigned</span>}
      </div>

      {reason && <p className="scv-fight-reason">{reason}</p>}

      <div className="scv-fight-actions">
        <button className="scv-fight-btn primary" disabled={!valid.ok} onClick={() => dispatch({ type: "resolveRound", matches })}>
          Roll the round ⚔
        </button>
        {retreats.length > 0 && (
          <div className="scv-retreat">
            <button className="scv-fight-btn" onClick={() => setRetreatOpen((o) => !o)}>Retreat ▾</button>
            {retreatOpen && (
              <div className="scv-retreat-menu" data-testid="retreat-menu">
                {retreats.map((a) => (
                  <button key={a.dir} className="scv-fight-btn" onClick={() => dispatch(a)}>{DIR_NAME[a.dir]}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <button className="scv-fight-btn ghost" onClick={() => { setDraft(emptyDraft()); setSel(null); }}>Reset</button>
        {artifacts.map((a, i) => (
          <button key={i} className="scv-fight-btn" onClick={() => dispatch(a)}>Use artefact</button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/web && pnpm exec vitest run src/game/FightSurface.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/game/FightSurface.tsx apps/web/src/game/FightSurface.test.tsx
git commit -m "Fight UI: FightSurface (drag/tap pairing, live totals, casualty, retreat)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Styles

**Files:** Modify `apps/web/src/styles.css`

- [ ] **Step 1: Append the fight-surface styles** (mirrors the mockup — dark surface, parchment cards, brass drop zones)

```css
/* ---- player-driven fight surface ---- */
.scv-fight { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 55;
  width: min(960px, 96vw); max-height: 70vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
  padding: 14px 18px; background: linear-gradient(180deg, rgba(21,21,27,.94), rgba(10,10,14,.97));
  border: 1px solid var(--line-strong); border-radius: 16px; backdrop-filter: blur(8px);
  box-shadow: 0 30px 70px -28px rgba(0,0,0,.9); color: var(--parchment); font-family: var(--ui); }
.scv-fight-top { display: flex; align-items: center; gap: 12px; }
.scv-fight-hd { font-family: var(--display); font-weight: 700; font-size: 14px; letter-spacing: .14em; text-transform: uppercase; color: var(--cream); }
.scv-fight-sub, .scv-fight-cap, .scv-fight-hint { font-family: var(--body); font-style: italic; font-size: 13px; color: var(--stone-dim); }
.scv-fight-banner { font-family: var(--body); font-style: italic; font-size: 13px; padding: 3px 11px; border-radius: 999px; }
.scv-fight-banner.bad { color: #e7a59c; border: 1px solid rgba(168,68,58,.5); background: rgba(46,18,16,.6); }
.scv-fight-banner.good { color: #bfe0ad; border: 1px solid rgba(127,174,111,.5); background: rgba(22,34,18,.6); }
.scv-fight-strangers { display: flex; gap: 22px; flex-wrap: wrap; }
.scv-match { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px; border: 1px dashed var(--line-strong); border-radius: 12px; background: rgba(201,161,78,.04); min-width: 150px; }
.scv-match-vs { font-family: var(--display); font-weight: 700; font-size: 14px; }
.scv-match-vs .me { color: #7fae6f; } .scv-match-vs .them { color: #e7a59c; }
.scv-match-front { min-height: 96px; min-width: 120px; display: flex; gap: 10px; align-items: center; justify-content: center; padding: 6px; border: 1px dashed var(--line); border-radius: 9px; }
.scv-match-front:focus-visible, .scv-match-bg:focus-visible { outline: 2px solid var(--brass-bright); }
.scv-match-hint { font-family: var(--body); font-style: italic; font-size: 12px; color: var(--stone-dim); }
.scv-match-bg { font-family: var(--body); font-style: italic; font-size: 12px; color: var(--arcane); border: 1px dashed var(--line); border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.scv-fight-tray { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; border: 1px dashed var(--line); border-radius: 12px; padding: 10px; background: rgba(0,0,0,.18); }
.scv-fight-reason { font-family: var(--body); font-style: italic; font-size: 13px; color: #e7c07a; }
.scv-fight-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.scv-fight-row { display: flex; gap: 12px; }
.scv-fight-btn { font-family: var(--ui); font-size: 13.5px; padding: 9px 14px; border-radius: 9px; border: 1px solid var(--line-strong); color: var(--parchment); background: rgba(201,161,78,.06); cursor: pointer; }
.scv-fight-btn.primary { border-color: var(--brass); color: var(--cream); background: rgba(201,161,78,.16); font-weight: 600; }
.scv-fight-btn.ghost { background: transparent; } .scv-fight-btn:disabled { opacity: .4; cursor: default; }
.scv-fight-btn:hover:not(:disabled) { border-color: var(--brass); color: var(--cream); }
.scv-retreat { position: relative; } .scv-retreat-menu { position: absolute; bottom: 110%; left: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px; background: rgba(15,15,20,.96); border: 1px solid var(--line-strong); border-radius: 10px; }

/* a card */
.scv-fc { width: 84px; }
.scv-fc-frame { position: relative; width: 84px; cursor: pointer; }
.scv-fc-art { width: 84px; aspect-ratio: 63/88; object-fit: cover; border-radius: 7px; border: 1px solid var(--line-strong); background: #0c0c10; display: block; }
.scv-fc-blank { display: flex; align-items: center; justify-content: center; font-family: var(--black); font-size: 12px; color: var(--parchment); text-align: center; }
.scv-fc-ally .scv-fc-art { border-color: #b9a05a; } .scv-fc-caster .scv-fc-art { border-color: var(--arcane); } .scv-fc-foe .scv-fc-art { border-color: rgba(168,68,58,.6); }
.scv-fc.is-sel .scv-fc-art { outline: 2px solid var(--brass-bright); outline-offset: 1px; }
.scv-fc.is-dim { opacity: .45; }
.scv-fc-badge { position: absolute; top: -8px; right: -8px; min-width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--display); font-weight: 700; font-size: 12px; background: #2b2310; color: var(--brass-bright); border: 1px solid var(--brass); }
.scv-fc-foe .scv-fc-badge { background: #2a1014; color: #e7a59c; border-color: rgba(168,68,58,.7); }
.scv-fc-wield { position: absolute; right: -9px; bottom: -10px; display: flex; }
.scv-fc-relic { width: 32px; aspect-ratio: 63/88; object-fit: cover; border-radius: 4px; border: 1px solid var(--brass); margin-left: -14px; box-shadow: 0 3px 8px -3px rgba(0,0,0,.8); }
.scv-fc-relic:first-child { margin-left: 0; }
.scv-fc-cap { text-align: center; margin-top: 7px; font-family: var(--ui); font-size: 10.5px; color: var(--stone); }
.scv-fc-cap b { display: block; font-family: var(--black); font-weight: 500; font-size: 12px; color: var(--parchment); }

/* zoom overlay */
.scv-cardzoom { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; pointer-events: none; background: rgba(7,7,9,.55); }
.scv-cardzoom img { width: min(320px, 70vw); aspect-ratio: 63/88; object-fit: contain; border-radius: 12px; box-shadow: 0 30px 80px -20px rgba(0,0,0,.9); }
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/styles.css
git commit -m "Fight UI: fight-surface styles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Integrate — mount FightSurface, retire the auto fight UI

**Files:** Modify `EncounterPanel.tsx`, `GameScreen.tsx`, `MultiplayerPlay.tsx`

- [ ] **Step 1: EncounterPanel stops handling the fight phase**

In `apps/web/src/game/EncounterPanel.tsx`, change the active set so the surface owns fights:

```ts
const ACTIVE = new Set<GameState["phase"]>(["encounter", "pickup"]);
```

- [ ] **Step 2: Mount FightSurface in solo (`GameScreen.tsx`)**

Add the imports:

```ts
import { FightSurface } from "./FightSurface";
import { useManifestCards } from "../data/useManifestCards";
```

Inside the component (where `state` is in scope), get the cards:

```ts
  const cards = useManifestCards();
```

Render the surface next to the panels (it self-hides unless `phase === "fight"`):

```tsx
      <EncounterPanel state={state} dispatch={dispatchWithRolls} />
      {state.phase === "fight" && cards && <FightSurface state={state} dispatch={dispatchWithRolls} cards={cards} />}
      <ExplorePanel state={state} dispatch={dispatchWithRolls} />
```

- [ ] **Step 3: Mount FightSurface in multiplayer (`MultiplayerPlay.tsx`)**

Add the same two imports, get `const cards = useManifestCards();`, and render (turn-gated, like the
other panels):

```tsx
      {yourTurn && <EncounterPanel state={state} dispatch={dispatch} />}
      {yourTurn && state.phase === "fight" && cards && <FightSurface state={state} dispatch={dispatch} cards={cards} />}
      {yourTurn && <ExplorePanel state={state} dispatch={dispatch} />}
```

- [ ] **Step 4: Update the EncounterPanel test for the narrowed phase set**

In `apps/web/src/game/EncounterPanel.test.tsx`, replace any assertion that the panel renders fight-phase
buttons (`Fight` / `Fight on`) with an assertion that it renders **nothing** in the fight phase:

```tsx
  it("renders nothing in the fight phase (the FightSurface owns it)", () => {
    const s: GameState = { ...newGame(1, [0]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3] };
    const { container } = render(<EncounterPanel state={s} dispatch={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
```

(Delete the now-obsolete fight-phase EncounterPanel tests; keep the encounter + pickup ones.)

- [ ] **Step 5: Run the web suite + typecheck**

Run: `cd apps/web && pnpm exec vitest run` → PASS. Run: `pnpm -r typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/game/EncounterPanel.tsx apps/web/src/game/EncounterPanel.test.tsx apps/web/src/game/GameScreen.tsx apps/web/src/game/MultiplayerPlay.tsx
git commit -m "Fight UI: mount FightSurface (solo + MP); EncounterPanel drops the fight phase

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Verify, build, manual QA, merge

**Files:** none (integration)

- [ ] **Step 1: Full automated checks**

Run, expecting all green:
- `pnpm --filter @sorcerers-cave/engine exec vitest run`
- `cd apps/web && pnpm exec vitest run`
- `pnpm -r typecheck`
- `cd apps/web && pnpm build`

- [ ] **Step 2: Push the engine export to Convex dev**

Run: `cd apps/web && npx convex codegen` (the engine is bundled from source; this re-publishes it).

- [ ] **Step 3: Manual QA (solo, then a 2-seat multiplayer game)**

Verify by playing:
1. Enter a chamber with ≥2 strangers; on hostile/attack the **FightSurface** appears (not the old buttons).
2. Drag a fighter onto a foe; drag a second for 2-v-1; drag a Priest/Wizard onto the ✦ slot. Live totals update.
3. A Spectre rejects an ordinary fighter and accepts a caster / Magic-Sword bearer; Roll stays disabled with the reason shown until the plan is legal.
4. Roll → the per-match dice overlay plays; a two-fighter loss prompts the casualty chooser; the round advances.
5. Hover (and on a touch device, press-hold) a creature **and** a wielded artefact → the card zooms.
6. Retreat by a doorway after round 1; a dead end forces another round.
7. Multiplayer: the fight is one round per turn — after rolling, the turn passes; your fight resumes next turn; only the active seat sees the surface.

- [ ] **Step 4: Merge**

```bash
git checkout main && git merge --ff-only fight-phase2 && git branch -d fight-phase2
```

- [ ] **Step 5: Report** the surface is live behind the same `resolveRound` engine; Phase 3 (heavy-treasure
  drop on fighting, retreat-leaves-treasure, removing the legacy auto path) is the remaining work.

---

## Self-review checklist (run before starting)

- **Spec coverage:** drag + tap pairing, 2-v-1, background casters, live totals, validation gating with
  reasons, Spectre constraint surfaced, per-match dice (reused), casualty chooser, retreat, hover/tap
  card zoom (creature + artefact), real card art + wielded artefacts, solo + MP — all have tasks. ✔
- **Out-numbered 1-v-2:** handled by the engine's strongest-combination (Phase 1); the UI assigns one
  stranger per match, so no manual 1-v-2 builder is needed. ✔
- **Non-breaking:** the legacy `fightOn` path stays in the engine; only the UI switches to `resolveRound`.
  Encounter + pickup still flow through EncounterPanel. ✔
- **Type consistency:** `place/unplace/toMatches` produce `PlanMatch[]`; `validatePlan` / `frontStrength`
  / `casterMP` imported from `@sorcerers-cave/engine`; `CardArt` from `../data/manifest`. ✔
- **Test reality:** drag is hard to exercise in jsdom, so tests drive the shared tap path + the pure
  `fightPlan` reducer; both feed the same `place()` logic the drag handlers call. Web tests build state by
  spreading `newGame(seed, picks)` (the pattern the existing panel tests use), with jsdom + jest-dom
  already configured in `src/test/setup.ts`. ✔
