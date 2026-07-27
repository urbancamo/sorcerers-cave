# Extension Kit — Multiplayer Milestone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the extension kit to multiplayer per Part 4 of
[2026-07-26-engine-integration-design.md](2026-07-26-engine-integration-design.md): the kit flag
threads into MP game creation (cave-shared 101/90 decks), every recorded MP seam closes, and the
lobby offers the toggle — while kit-off multiplayer stays byte-identical and production (where MP
is live) is never exposed to a half-wired state.

**Architecture:** The solo reducer already implements every kit rule and MP composes it unchanged
(INV-2) — this milestone is *threading and seams*, not rules: variant plumbing (engine + Convex +
lobby), MP-side table/lookup sweeps that become reachable the moment kit ids can enter MP, the
Part-4 union/PvP/zombie decisions, UI parity, and pinning. The lobby toggle lands LAST so nothing
reachable ships before every seam beneath it is closed.

**Tech Stack:** TypeScript, vitest, Convex (prod-live multiplayer), existing MP layer
(`multi*.ts`), no new dependencies.

## Global Constraints

- Branch: create `mp-extension-kit` from `main`. Design authority: design doc Part 4 + the
  Resolved interpretations; on conflict the design doc wins — report it.
- **MP byte-identity kit-off:** every existing multi-*.test.ts / gap-multiplayer.test.ts stays
  green unmodified; `buildMpGame` without the flag builds byte-identical caves (same shuffles).
  Solo behavior untouched (engine 757 / web 445 baseline).
- **Prod-live sequencing:** multiplayer is deployed (`VITE_MULTIPLAYER=1`). Convex
  `games.variants` ALREADY carries `extensionKit` (schema.ts:38, shared with solo) — but
  `multiplayer.ts`'s own `variantsV` (line ~62) does NOT. Tasks 1–7 are inert in prod (no UI can
  set the flag on an MP game) — the lobby checkbox (Task 8) is the exposure switch and ships only
  after Tasks 1–7 are reviewed. Never reorder it earlier.
- **CLAUDE.md spec-sync:** every task touching `packages/engine/src` updates
  `docs/specs/engine-spec.md` in the same commit — new rows continue `SC-EXT-30+` (or amend the
  touched `SC-MP-<n>` row), verbatim it() titles, citations verified against FINAL files (grep
  after the last edit; insertions shift neighbours — re-shift what your diff moves).
- **Kit-id lookups:** `ALL_CREATURES`/`ALL_TREASURES`/`ALL_HAZARD_NAMES` (index === id) —
  `CREATURES[18]` is `undefined`. The MP layer and MP-only web files still hold base-only
  lookups by design; this milestone removes the last of them.
- **TDD:** failing tests first. Type-level RED/GREEN: engine `pnpm --filter @sorcerers-cave/engine
  exec tsc --noEmit`; **apps/web uses `pnpm --filter web typecheck` (`tsc -b`) — plain
  `tsc --noEmit` is a NO-OP there.** Convex function tests follow
  `apps/web/convex/*.test.ts` (`convexTest`) patterns.
- Assertions in this plan are REQUIRED behavior; build fixtures the way the neighbouring
  multi-*.test.ts files do.
- New engine events (if any) need eventNotices cases (exhaustive switch enforces it) + log lines.

## Part-4 decisions this plan implements (already designed/ruled)

- Kit flag must MATCH for all seats (cave-shared decks) — it is a game-level variant, host-set.
- New kit specials need NO `areaInteractionMask` entries (all are chambers); Whirlpool crossings
  compose like Deep Pool.
- **Zombie classifications (design Part 4 proposal — flag to MSW in the final report, adopted as
  the default):** zombies IGNORE Desertion and Quarrel (social hazards); Crypt and Harpies apply.
- Quarrel under a union picks the two strongest from the COMBINED force.
- A loaned ally that deserts (Desertion / Bell-vanish) ENDS its loan.
- Magic Shield in PvP nullifies the magic of the enemy fighter paired against the bearer
  (design US-23 MP note).
- Harpy stash, Gallery statues, the Demon, and a parked Crypt are cave-shared content: the first
  seat to act takes the risk/reward; the Lair delivers stolen artifacts whichever seat's Harpies
  filled the stash.

## File Structure

- `packages/engine/src/multi.ts` (variants type + deck threading), `multi-union.ts` (Apprentice
  hook, Quarrel-under-union), `multi-fight.ts` (Shield pairing, remaining base lookups),
  `multi-zombies.ts` (hazard classifications), new `multi-kit.test.ts` (+ additions to existing
  multi test files where they own the subsystem)
- `apps/web/convex/multiplayer.ts` (variantsV + startGame), `apps/web/convex/multiplayer.test.ts`
- `apps/web/src/game/`: `MultiplayerLobby.tsx` (toggle, LAST), `MultiplayerPlay.tsx`
  (presentation-hold parity), `PartyDraft.tsx` (variant-aware roster), `PvpFightSurface.tsx` /
  `TradeModal.tsx` (ALL_* sweeps)
- `docs/specs/engine-spec.md` (SC-EXT-30+ / SC-MP amendments), `docs/specs/PORTING-GUIDE.md`
  (kit section)

---

### Task 1: MP variant threading (engine)

**Files:** Modify `packages/engine/src/multi.ts`: `MpGameState.variants` type gains
`extensionKit?: boolean` (line ~133 and the `buildMpGame` param ~235); `buildMpGame` threads the
variant into `buildLargePack`/`buildSmallPack` (lines ~237-238 — the solo builders already accept
it, T1/T3 of the solo milestone). Test: `multi-kit.test.ts`.

**Interfaces:** Produces kit-on MP caves (90/101 decks) every later task builds games from;
`variants.extensionKit` readable by the composed solo reducer for free (compose copies variants?
VERIFY: `compose()` must place `extensionKit` into the composed `GameState.variants` so solo kit
rules and selection helpers see it — trace compose and thread if missing).

- [ ] **Step 1: Failing tests** — kit-off `buildMpGame(seed, seats)` byte-identical to today
  (deep-equal against a pre-change reference build, solo-milestone Task-1 pattern); kit-on cave
  has 90-card large / 101-card small decks; a composed seat's `GameState.variants.extensionKit`
  is true; a kit creature drawn as a stranger in an MP game resolves (smoke: one scripted draw).
- [ ] **Step 2-4: RED → implement → GREEN + FULL engine suite** (multi goldens/pins unmodified).
- [ ] **Step 5: Spec** — SC-EXT-30 (MP threading: game-level flag, cave-shared decks, compose
  pass-through); amend SC-MP-36 (variants shape) in place.
- [ ] **Step 6: Commit** `feat(engine): extension-kit variant threads into multiplayer caves (SC-EXT-30)`

### Task 2: MP-side lookup sweeps + Apprentice revert hook (engine)

**Files:** Modify `multi-fight.ts` (remaining base-only `CREATURES[...]` at ~:657 and any others —
grep exhaustively), `multi-union.ts` (the `sorcererKilled = true` stamp at ~:472 gains the
Apprentice-revert: reuse `revertApprenticesOnSorcererDeath` (effects.ts) across EVERY seat's
party — cave-global per design US-14; a reverting ally that was LOANED ends its loan per Part 4).
Test: additions to `multi-union.test.ts` + `multi-kit.test.ts`.

- [ ] **Step 1: Failing tests** — union Sorcerer kill with an Apprentice ally in (a) the killing
  seat, (b) another seat, (c) ON LOAN: all revert to hostile strangers in their current areas,
  the loan ends, items spill (solo semantics); a PvP fight where a kit creature (Witch) fights
  does not crash (multi-fight lookups).
- [ ] **Step 2-4: RED → implement → GREEN + full engine suite.** Grep-verify zero base-only
  `CREATURES[`/`TREASURES[` indexing remains in `packages/engine/src/multi*.ts`.
- [ ] **Step 5: Spec** — SC-EXT-31 (cave-global Apprentice revert incl. loans); amend SC-MP-33's
  row if its citation shifts.
- [ ] **Step 6: Commit** `feat(engine): MP Apprentice revert + kit-safe MP lookups (SC-EXT-31)`

### Task 3: Shared kit content across seats (engine)

**Files:** `multi-kit.test.ts` (mostly tests — the mechanics are solo code under compose; fix
only what fails). Verify/pin: Harpies stash filled by seat A lands in the Lair for seat B to
recover; a Demon spawned by seat A ambushes seat B entering its area; a Crypt parked by seat A is
enterable by seat B exactly once; Gallery statues petrified for seat A are statues for seat B and
a Staff-Wizard seat wakes them (reaction test rolls on the SHARED cave stream); Whirlpool
crossing composes (drag relocates only the crossing seat); Well/Bell no-withdraw flags are
per-seat turn state (design US-03/07 MP notes).

- [ ] **Step 1: Failing/pinning tests for each of the six behaviors above** (seed-pinned where
  dice fire). Expect most to pass by construction (INV-2) — any failure is a real seam: fix it
  in the owning module with its own RED first, and report which.
- [ ] **Step 2: Full engine suite green.**
- [ ] **Step 3: Spec** — SC-EXT-32 (shared kit content semantics, one row citing the pins).
- [ ] **Step 4: Commit** `test(engine): pin shared kit content across MP seats (SC-EXT-32)`

### Task 4: Zombie-variant classifications (engine)

**Files:** Modify `multi-zombies.ts` (`zombieActionGate`/`zombieAfterAction`/`zombiePostSweep`):
zombies IGNORE Desertion (5) and Quarrel (7) — run-then-undo repair per the module's documented
pattern — while Crypt falls and Harpies theft APPLY to zombie parties; kit specials need no gate
entries (chambers) but VERIFY the Deep-Pool special-case region (~:96-102) needs no Whirlpool
twin (crossing is solo-composed). Test: additions to `multi-zombies.test.ts`.

- [ ] **Step 1: Failing tests** — zombie party: Desertion fires no rolls/removals (repaired);
  Quarrel fizzles (no duel); Harpies strip zombie-held artifacts to the stash; a Crypt trap
  drops a zombie party.
- [ ] **Step 2-4: RED → implement → GREEN + full engine suite.**
- [ ] **Step 5: Spec** — SC-EXT-33 (zombie×kit-hazard matrix), noting the classification is the
  design-Part-4 proposal pending MSW's nod (final-report flag).
- [ ] **Step 6: Commit** `feat(engine): zombie-variant kit-hazard classifications (SC-EXT-33)`

### Task 5: Union Quarrel + PvP Magic Shield (engine)

**Files:** Modify `hazards.ts` Quarrel picker (union-aware: when the acting seat commands a
union, rank the COMBINED force — find how union composition surfaces in the composed state,
multi-union.ts loan model) and `multi-fight.ts` (Shield pairing ward at the PvP matchup layer:
the enemy fighter paired against a Shield bearer contributes 0 mp — mirror combatPlan's
`matchShielded`/`strangerMP` shape from the solo Task 14; Eye nullification parity; Elixir
`fsBonus` — VERIFY PvP strength path reads `frontStrength` (it should; pin it)). Test:
`multi-union.test.ts` / `multi-fight.test.ts` additions.

- [ ] **Step 1: Failing tests** — union Quarrel picks the two strongest ACROSS the union (a
  loaned Ogre outranks the commander's Man); loser from the loaned side dies and the loan
  ends... (VERIFY design intent: death ends the loan naturally — pin whichever the loan model
  does, report if ambiguous); PvP: Shield bearer's paired opponent contributes 0 mp while an
  unpaired enemy's mp counts; Sorcerer never occurs in PvP (skip the −2 branch — assert
  unreachable or cover if unions can field one); Elixir'd member's +2 shows in PvP totals.
  Also (Part 4): a LOANED ally that deserts via the Desertion hazard (or a Bell-vanish) is
  removed from the game AND its loan ends cleanly — no dangling loan index (the union model's
  loan-index corruption class, see the M-milestone's mutiny fix precedent).
- [ ] **Step 2-4: RED → implement → GREEN + full engine suite.**
- [ ] **Step 5: Spec** — SC-EXT-34 (union quarrel), SC-EXT-35 (PvP shield/fsBonus parity).
- [ ] **Step 6: Commit** `feat(engine): union Quarrel + PvP Magic Shield (SC-EXT-34..35)`

### Task 6: Convex MP variant plumbing (backend — still unexposed)

**Files:** Modify `apps/web/convex/multiplayer.ts`: its own `variantsV` (~:62) gains
`extensionKit: v.optional(v.boolean())`; `createGame`/`setVariants`/`startGame` pass it through
into `buildMpGame`. Test: `apps/web/convex/multiplayer.test.ts` additions.

- [ ] **Step 1: Failing tests** — setVariants with `extensionKit: true` persists; startGame
  builds a kit cave (composed state shows the flag; deck sizes 90/101 via a probe query or
  state inspection); kit-off games byte-identical (existing tests unmodified).
- [ ] **Step 2-4: RED → implement → GREEN + convex/web suites + `pnpm --filter web typecheck`.**
- [ ] **Step 5: Commit** `feat(convex): extension-kit flag through MP create/setVariants/start`
  (no engine change ⇒ no spec edit; prod-safe: still no UI sets it).

### Task 7: MP web parity — draft, PvP surfaces, presentation hold

**Files:** Modify `PartyDraft.tsx` (variant-aware roster/costs/stock via
`selectionCost`/`startingStock` + `ALL_CREATURES` names — kit starters draftable when the game's
flag is on, Ogre/Troll revised costs shown), `PvpFightSurface.tsx`/`TradeModal.tsx` (`ALL_*`
sweeps — kit creatures/artifacts render by name), `MultiplayerPlay.tsx` (adopt the solo
presentation-hold: reuse `useDispatchWithRolls` + `showFightSurface` for the per-seat dispatch
path — the smallest coherent adaptation; MP-specific flows (sessions, turn gating) unchanged;
`midState` already flows through `applyAction`-equivalent? VERIFY the MP apply mutation returns
events/midState and thread if trivial, else document as a known gap with a ledger line). Tests:
component tests per existing patterns.

- [ ] **Step 1: Failing tests** — PartyDraft kit-on shows Witch/Scholar/Thief/Lion/Wolf at
  official costs, Ogre/Troll at 4/3, base draft unchanged kit-off; PvpFightSurface renders a
  kit fighter without crash and with its name; MultiplayerPlay holds the fight surface until
  the roll presents (hook-level reuse — the solo tests are the template).
- [ ] **Step 2-4: RED → implement → GREEN + full web suite + typecheck.**
- [ ] **Step 5: Commit** `feat(web): MP kit draft/PvP surfaces + presentation-hold parity`

### Task 8: Lobby toggle — the exposure switch (LAST)

**Files:** Modify `MultiplayerLobby.tsx` (fourth host-only checkbox, existing pattern lines
~49-88; caption matching the solo toggle's; locked once started), plus the lobby's variant chip
display if present. Test: lobby component tests.

- [ ] **Step 1: Failing tests** — host sees/sets the toggle; non-host sees read-only state;
  locked after start; setVariants called with the merged object (zombies/fogLite/concurrent
  preserved).
- [ ] **Step 2-4: RED → implement → GREEN + full web suite + typecheck.**
- [ ] **Step 5: Commit** `feat(web): extension-kit lobby toggle (MP exposure switch)`

### Task 9: Pinning, PORTING-GUIDE, spec narrative, final report

**Files:** Create an MP-kit scripted game test (`multi-kit-golden`-style: a seeded 2-seat kit
game exercising ≥1 kit special, ≥2 kit hazards incl. one zombie-classified, 1 union or PvP beat
— seed searched via scratchpad script, solo Task-17 methodology incl. pin-bites evidence);
`docs/specs/PORTING-GUIDE.md` gains the kit section (flag, decks, id ranges, vector pointer);
Part II §EXT narrative gains an MP paragraph; Appendix C counts.

- [ ] **Step 1:** Golden scripted + pinned (perturbation-proof documented); full `pnpm test` +
  `pnpm -r typecheck` green; kit-off byte-identity spot-check (no existing fixture churn).
- [ ] **Step 2:** PORTING-GUIDE + Part II + Appendix C.
- [ ] **Step 3:** Final report for MSW: the zombie classification adoption (Task 4) and any
  loan-death ambiguity (Task 5) surfaced as the milestone's design-owner flags; deploy
  sequencing note (single deploy is safe — the toggle only exposes after everything beneath it
  landed together).
- [ ] **Step 4: Commit** `test(engine): MP-kit golden + PORTING-GUIDE kit section; spec narrative`

---

## Out of scope

- Solo behavior changes of any kind (frozen at engine 757 / web 445 baselines).
- MP high-score treatment for kit games (MP scores live separately; revisit if/when MP scoring
  lands on the leaderboard).
- The fogLite×kit interaction beyond what render-filtering gives free (fog is render-only).

## Known judgement calls (flag to MSW if they disagree)

1. Zombie×kit-hazard classifications adopt the design-Part-4 proposal (ignore Desertion/Quarrel;
   Crypt/Harpies apply) — Task 4 implements, final report flags.
2. The lobby toggle is the LAST task by prod-exposure design, not dependency order.
3. MP presentation-hold parity (Task 7) is scoped as reuse of the solo hook; if MP's dispatch
   shape resists the smallest adaptation, the task documents the gap instead of forcing it.
4. `SC-EXT-30+` continues the existing id namespace rather than opening an `SC-MPEXT` section.
