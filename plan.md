# Plan: Peter's gameplay testing, 2026-11-04

Source: `docs/bug-reports/2026-11-04-general-gameplay-testing.md` (games RIUP and WEPL).
Numbers in brackets are Peter's item numbers. Work through Group 1 first.

---

## Group 1: Issues (things that look wrong or misleading today)

### I-1. [5] Mutiny "does nothing" and the card persists — DONE: confirmed not an engine bug (it only affects allies); a notice now says so
- **Observed:** queued Mutiny with a large party; nothing happened; the Mutiny card stays in the chamber.
- **What the code does:** `hazards.ts` `HAZARD_MUTINY` only affects **allies** (status 1). A party of originals is untouched, and the card is deliberately left on the tile as a display marker (`300 + HAZARD_MUTINY`) so it doesn't vanish.
- **Likely cause:** Peter's party was all originals, so there was nobody to desert. The card staying is intentional, but it reads as "stuck".
- **Steps:**
  1. Ask Peter (or reproduce in Test Mode): did the party contain any recruited allies?
  2. If no allies: no engine change. Add a visible notice, e.g. "Mutiny! Your original party stands firm — no allies to lose", so "nothing happened" is explained.
  3. If there were allies and they didn't desert: write a failing test in `packages/engine` first, then fix.
  4. Decide whether the persistent marker needs a tooltip or Card View text saying why it stays.
- **Docs:** player manual (`hazards.ts`) wording; engine spec only if engine behaviour changes.

### I-2. [6] Desertion "does nothing" with dice forced to 1 — DONE: same cause (no allies, so no rolls); a notice now says so
- **Observed:** queued Desertion with forced rolls of 1; nothing happened (the card doesn't persist, which is correct).
- **What the code does:** `HAZARD_DESERTION` rolls a d6 **per ally only**; originals never roll, and a roll of 1–2 removes the ally. With no allies there are no rolls and no event.
- **Likely cause:** same as I-1, no allies in the party. Also check that the forced die (`testForceDie` / `testForceAllDice`) is not consumed or ignored on this path (the dice cueing bug was fixed 2026-09-21, so verify it still holds).
- **Steps:**
  1. Reproduce in Test Mode with allies present and rolls forced to 1. Expect `desertionRoll` events and removal.
  2. Reproduce with no allies. Expect no rolls. Add a "no allies, nobody to desert" notice so the hazard isn't silent.
  3. Fix only if step 1 fails.
- **Docs:** manual `hazards.ts`; spec SC-EXT-14 if behaviour changes.

### I-3. [7] Charmed Flute never becomes "USABLE NOW" at the Viper Pit — DONE: the Flute is now a deliberate play at the pit ("lull the Vipers"; Mark, 2026-11-04). Holding it no longer lulls them; they sleep until the party leaves
- **Observed:** Inventory pane shows the Flute as "NOT USABLE NOW" at the edge of the Viper Pit, with no Play action.
- **What the code does:** `selectors.ts` offers `useArtifact{artifact:12}` only in the `encounter` phase when Dragons are among the strangers (SC-11-30). The Viper Pit crossing is a `special` step, so the Flute action isn't offered there. Peter's note that "Flute playing may not be implemented" for Vipers matches this.
- **Steps:**
  1. Confirm the rule from the rulebook: does the Flute put Vipers to sleep at the pit edge? (`fluteLulls` is already consulted at `selectors.ts:304`, so some Viper-lull path exists. Find out why the UI doesn't surface it.)
  2. Make the Inventory pane's usability check agree with the engine's legal actions for the Viper Pit, and add the Play action.
  3. Tests: engine `legalActions` at a Viper Pit edge with the Flute; web `ItemActions` / `InventoryPanel` test.
- **Docs:** engine spec (SC-11-30 neighbours) and the manual (`treasure.ts` / `areas.ts`).

### I-4. [1] — DONE (8392031). Bell Rope help says "once per visit"; the rule and implementation are "once per game"
- **Observed:** help text wording is wrong. The implementation matches the rules.
- **Fix:** `apps/web/src/manual/areas.ts:41` — change "Pull it once per visit" to the once-only wording. Check any other Bell Rope text (card panel, event notices, `house.ts`) for the same claim.
- **Size:** one-line wording fix plus a grep. No engine change.

### I-5. [4] Illegal deployment drag gives no explanation — DONE (refusal note under the battle; an unpaired foe's behind slot now accepts the drop to explain)
- **Observed:** an attacker dragging a magic user to the background with no fighters in the front line is refused silently.
- **Fix:** surface a short message at the point of refusal, e.g. "There are no frontline fighters there to support them." Reuse the existing notice or toast mechanism used for other refused moves. Check whether the engine already returns a reason code or `planRejected` to hang the text on. Add a UI test for the message.
- **Docs:** manual `play.ts` or the combat topic if the rule isn't already stated there.

### I-6. [3] — DONE (SC-9.7-23). Strength badge shows potential strength, not the effective strength right now
- **Observed:** Peter expects the badge to show the creature's current contribution (a Priest in the background shows 2; a Hero facing a Spectre without a Magic Sword shows 0). Today it always shows the maximum.
- **Why this is in Group 1:** Peter reads the current badge as misleading during a fight. It is arguably an enhancement, so confirm with Peter before building. It is also the largest item here, because it needs a per-creature "effective strength in this pairing" selector that agrees with the combat engine.
- **Steps (if confirmed):**
  1. Find where the engine computes a creature's strength for a pairing (front vs background, Spectre/Demon needing magic, Priest in the background counting 2).
  2. Expose it as a pure selector that the combat UI reads. Do not duplicate the rules in the view.
  3. Show the contextual value only during a fight; outside a fight keep the maximum.
  4. Tests for the selector (each of Peter's two examples) and for the badge.
- **Docs:** manual combat topic; engine spec if a new selector is added.

---

## Group 2: Enhancements (we'll deal with these after the issues)

### E-1. [8] — DONE (Mark signed off 2026-11-04; Ghouls stay as they are, the Viper Pit exit prompt is fine, and holding the outcome behind the dice in multiplayer is deferred to the major multiplayer review). Was: IN PROGRESS (built: gated `DiceRoll` with a stakes line and a "Roll the dice" button; Settings option to roll automatically). Visible dice rolls with a "Roll the dice" button for chambers, hazards and artefacts
- Peter's principle: whenever a Special Chamber, Hazard or Artefact needs a roll (single, or one per party member), the player should see the dice and click to roll, to build tension as in the tabletop game.
- Applies to: Bell Rope, Whirlpool, Viper Pit, Desertion, Medusa, Crypt, Elixir, Treasure Chest, and Quarrel (added by Mark). Ghouls already show dice in the fight interface.
- Likely approach: reuse the existing dice overlay (`.scv-dice-overlay`, `wellDraw`/`bellRoll`-style events that already carry the roll). Add a "pending roll" step so the engine event is held until the player clicks.
- Design question to settle first: does the engine roll up front and the UI merely reveal it (simple, keeps determinism and Test Mode forced dice working), or does it wait for a click action? Recommend reveal-only.
- Needs a brainstorm and a small design doc before building, and a per-player option to skip the animation for repeat play.

### E-2. [9] — DONE (second click on the same card, tile, member or item closes the panel). Click a tiny card or area again to dismiss its Card View
- Make the Card View a toggle: a second click on the same object closes it, so players don't have to travel to the top-right close button.
- Small, self-contained web change. Add a test: click opens, a second click on the same target closes, and a click on a different target switches.

### E-3. [2] Charmed Flute reveals secret doors on every visited area (for later)
- Peter's idea: playing the Flute (a different tune) should reveal all secret doors on visited map areas, to avoid tedious area-by-area use.
- Rules and balance change, so it needs MSW's ruling first. Also touches the multiplayer text ("Secret doors ... may use ... or if you hold the Charmed Flute"). Park until the Flute-play UI (I-3) exists.

---

## Suggested order for Group 1

1. **I-4** — wording fix (minutes).
2. **I-1 and I-2** — reproduce in Test Mode together; most likely both are "no allies, no feedback".
3. **I-5** — missing explanatory message.
4. **I-3** — Flute at the Viper Pit.
5. **I-6** — confirm with Peter, then build.

## Open questions for Peter or Mark

- RIUP/WEPL: did the Mutiny and Desertion parties include any recruited allies? (Decides whether I-1 and I-2 are bugs.)
- I-6: is the contextual strength badge wanted now, or should it move to Group 2?
- E-1: reveal-only dice (recommended), or a true wait-for-click?
