# Frontend gap analysis — engine features vs. UI

> Created: 2026-06-14
> Status: Findings (stock-take of what remains to implement on the frontend)

The pure-TS engine (`packages/engine`) implements the full Sorcerer's Cave rule set.
This document audits which engine capabilities the frontend (`apps/web`) actually
surfaces — controls the player can trigger, and feedback the player can see — and
lists the gaps.

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

### 1. The game cannot be won
`exitCave` (leave via the gateway stair on level 1) has **no UI anywhere**
(`grep exitCave apps/web/src` → none). The win condition is unreachable.

### 2. No explore-phase action panel
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

---

## 🟠 Important — mechanics work but are invisible

### 3. Member status is not shown
The roster (`cave3d.js:renderRoster`, `viewParty.ts`) lists only living members with
no indicator for:
- **Petrified** (status 2, from Medusa)
- **Dead** (status 3) — dead/deserted members simply disappear
- **Ally vs. original** (status 1 vs 0)

`viewParty` even computes `charisma` but it is never rendered.

### 4. ~17 events produce no feedback (silent)
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

### 5. Artifact button labels are ambiguous
In encounter/fight, multi-target artifacts render several **identical** buttons
(e.g. "Use artifact Lotus Dust" per stranger; "Use artifact Strength Potion" per
member). Params are correct; only the label needs the target/member name.

---

## 🟡 Minor / polish
- `fightStarted` (surprise ±1) not surfaced.
- `charisma` flag unused in the roster.
- `deadEnd` / `blocked` are handled via the move result rather than as events (fine).

## Out of scope (engine-side deferrals, not frontend gaps)
- `sorcererKilled` is never set — the Sorcerer / Sorcerer's Den scenario isn't built.
- Competitive "special scenarios" from the rules aren't implemented.

---

## Suggested implementation order
1. **Explore-phase action panel** — restores winning + chest + the four explore
   artifacts (largest single win; makes the game completable end-to-end).
2. **Event-feedback pass** — toast/overlay for the silent events, prioritising the
   lethal Viper Pit crossing and the special-area outcomes.
3. **Roster status badges** — petrified / dead / ally.
4. **Artifact label disambiguation** (small polish).
