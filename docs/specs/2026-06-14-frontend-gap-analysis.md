# Frontend gap analysis — engine features vs. UI

> Created: 2026-06-14
> Updated: 2026-06-14
> Status: ✅ Resolved — all critical/important gaps closed; minor polish remains (see below)

The pure-TS engine (`packages/engine`) implements the full Sorcerer's Cave rule set.
This document audits which engine capabilities the frontend (`apps/web`) actually
surfaces — controls the player can trigger, and feedback the player can see — and
lists the gaps.

## Resolution summary (2026-06-14)

| # | Gap | Status | Where |
|---|-----|--------|-------|
| 1 | The game cannot be won | ✅ Done | Cave exit + "Leave the Cave?" confirm, score roll call, name entry, global Convex leaderboard (`game/HighScores.tsx`, `convex/highScores.ts`, `view/cave3d.js` exit marker) |
| 2 | No explore-phase action panel | ✅ Done | `game/ExplorePanel.tsx` — open chest + the four exploration artifacts, with named targets |
| 3 | Member status not shown | ✅ Done | Fallen members filtered from the roster; `ally` / `stone` badges in `view/viewParty.ts` + `cave3d.js:renderRoster` |
| 4 | ~17 silent events | ✅ Done | `game/eventNotices.ts` → renderer "Aftermath" modal (move path) + `game/NoticeModal.tsx` (panel path); chest d6 via `rollView.ts` |
| 5 | Ambiguous artifact labels | ◑ Partial | Explore-phase labels name target/dir (`ExplorePanel`); encounter/fight multi-target labels in `EncounterPanel.tsx` are still generic |
| 🟡 | Minor polish | ⬜ Open | `fightStarted` surprise and the `charisma` flag still unsurfaced |

The game is now completable end-to-end and the frontend surfaces the full engine rule
set. Detailed findings below are kept for the record, annotated with their resolution.

## Method

- **Engine surface:** every `GameAction` (player input) and `GameEvent` (outcome) in
  `packages/engine/src/actions.ts`; the per-phase action contract in
  `selectors.ts:legalActions`; mechanics in `reduce.ts`, `effects.ts`, `special.ts`,
  `combat.ts`, `hazards.ts`, `chest.ts`, `ruby.ts`, `score.ts`.
- **Frontend surface:** action controls in `game/EncounterPanel.tsx` and
  `view/cave3d.js` (movement); event feedback in `game/rollView.ts` +
  `game/GameScreen.tsx` (DiceRoll overlay) and `view/cave3d.js`
  (`setPrompt`/`showToast`/`showConfirm`/`onChamber`/animations); roster/HUD in
  `view/cave3d.js` + `view/CaveHud.tsx` + `view/viewParty.ts`.

## Root cause of most gaps: no explore-phase action menu

The only explore-phase controls are **movement** (3D exit markers + N/E/S/W/U/D keys,
via `cave3d.js:doMove`). `EncounterPanel` — the only action menu — renders **only** in
`encounter`/`fight`/`pickup` (`ACTIVE` set), never in `explore`.

But `legalActions("explore")` offers, besides moves: `exitCave`, `openChest`, the
explore-phase artifact uses, and `quit`. None of these have any control. (When a
button *is* shown, `EncounterPanel` dispatches the full action object, so
`useArtifact` target/dir params from `legalActions` are correctly passed — the issue
is purely that the panel is absent in `explore`.)

---

## 🔴 Critical — blocks the core game loop

### 1. The game cannot be won — ✅ Done
`exitCave` (leave via the gateway stair on level 1) has **no UI anywhere**
(`grep exitCave apps/web/src` → none). The win condition is unreachable.

> **Resolved:** any level-1 up-stair now shows an exit marker; `doMove` routes it
> through a "Leave the Cave?" confirm (one-way). On exit the game-over screen shows a
> per-member/per-item score roll call (`score.ts:scoreBreakdown`), takes a name, and
> records it on a global Convex leaderboard (`highScores` table), viewable after a run
> and from a "High Scores" button on the splash.

### 2. No explore-phase action panel — ✅ Done
Unreachable during exploration as a result:

- **`openChest`** — the Treasure Chest (id 14) can never be opened; its d6
  curse/Spectre/loot outcome (`reduce.ts` openChest) is dead from the player's side.
- **Explore-phase artifacts** (all implemented, none usable):
  - Healing Balm (6) — revive a dead member
  - Magic Staff (9) — cure a petrified member
  - Magic Carpet (4) — teleport the party
  - Charmed Flute (12) — reveal a secret stairway
- **`quit`** during exploration (minor — `quit` is reachable inside encounters).

**Fix:** one new explore-phase action panel (mirror `EncounterPanel`, driven by
`legalActions` in `explore`). Unblocks winning, the chest, and the four explore
artifacts in a single component.

> **Resolved:** `game/ExplorePanel.tsx` renders the non-movement explore actions
> (open chest + the four artifacts), driven by `legalActions`, hidden when none apply.
> Labels name the target/direction. The chest's d6 outcome shows as a single-die
> overlay (`rollView.ts:chestView`). (`exitCave` is handled by the up-stair marker;
> `quit` remains available via the dock's Restart and inside encounters.)

---

## 🟠 Important — mechanics work but are invisible

### 3. Member status is not shown — ✅ Done
The roster (`cave3d.js:renderRoster`, `viewParty.ts`) lists only living members with
no indicator for:
- **Petrified** (status 2, from Medusa)
- **Dead** (status 3) — dead/deserted members simply disappear
- **Ally vs. original** (status 1 vs 0)

`viewParty` even computes `charisma` but it is never rendered.

> **Resolved:** fallen members (status 3) are now deliberately filtered out of the
> on-screen roster; `viewParty` exposes `ally`/`petrified` flags, and `renderRoster`
> shows an "ally" or "stone" badge and dims a petrified row. (`charisma` is still
> unrendered — see Minor / polish.)

### 4. ~17 events produce no feedback (silent) — ✅ Done
No prompt/overlay/animation for:

- **`crossedSpecial`** — the **Viper Pit can kill members on crossing with zero
  feedback**; Deep Pool `treasureDropped` / `treasureReclaimed` likewise silent.
- `enteredSpecial`
- Artifact/effect outcomes: `artifactUsed`, `chestOpened`, `carpetUsed`,
  `dragonsLulled`, `secretDoorRevealed`, `wardedOff`, `annihilated`,
  `statuePowerless`, `deathPrevented`, `unicornGuards`, `unicornDeparted`
- `hazardFired` for Medusa / Ghouls / Earthquake
- `mutinied` — *partly* surfaced (the roster animates the desertion via the
  `setParty` diff) but there is no message/overlay.

Well-surfaced today: `reaction`, `combatRoll`/`fightWon`/`memberDied`/`strangerKilled`
(DiceRoll overlay), `trapSprung`/`trapAvoided` (confirm modal), `drewChamber`/`moved`
(prompt + card animations), `gameOver` (GameOverScreen).

> **Resolved:** `game/eventNotices.ts` maps each silent event to a notice (text +
> tone). The renderer attaches move-path notices to the `MoveEvent` and shows them in an
> "Aftermath" modal (viper deaths, hazards, Deep Pool, on-entry effects); panel-dispatched
> outcomes (artifact effects) show via `game/NoticeModal.tsx`; `chestOpened` got its own
> d6 overlay (#2). Events with dedicated UI are intentionally skipped to avoid
> double-reporting; `enteredSpecial` is deliberately omitted as noise (the move prompt
> already names the area).

### 5. Artifact button labels are ambiguous — ◑ Partial
In encounter/fight, multi-target artifacts render several **identical** buttons
(e.g. "Use artifact Lotus Dust" per stranger; "Use artifact Strength Potion" per
member). Params are correct; only the label needs the target/member name.

> **Partly resolved:** the explore-phase panel (`ExplorePanel`) names its targets/
> directions. The encounter/fight labels in `EncounterPanel.tsx` are still generic —
> remaining work: name the stranger/member in each `useArtifact` button there.

---

## 🟡 Minor / polish — ⬜ Open
- `fightStarted` (surprise ±1) not surfaced.
- `charisma` flag unused in the roster.
- `deadEnd` / `blocked` are handled via the move result rather than as events (fine).

## Out of scope (engine-side deferrals, not frontend gaps)
- `sorcererKilled` is never set — the Sorcerer / Sorcerer's Den scenario isn't built.
- Competitive "special scenarios" from the rules aren't implemented.

---

## Implementation order (completed)
1. ✅ **Cave exit + scoring + leaderboard** — makes the game winnable end-to-end.
2. ✅ **Explore-phase action panel** — chest + the four explore artifacts.
3. ✅ **Event-feedback pass** — notices for the silent events (lethal Viper Pit
   crossing, hazards, special-area / artifact outcomes).
4. ✅ **Roster status badges** — fallen filtered out; ally / petrified badges.
5. ◑ **Artifact label disambiguation** — done for explore; encounter/fight labels remain.

### Remaining (minor polish)
- Name the target/member in encounter/fight `useArtifact` buttons (`EncounterPanel.tsx`).
- Surface `fightStarted` surprise (±1).
- Render the `charisma` flag in the roster.
