# Plan: Peter's impressions of the combat revision (2026-10-20 and 2026-10-21)

Sources, both read in full:

- **A** `docs/bug-reports/2026-10-20-combat-initial-impressions.md` ("initial")
- **B** `docs/bug-reports/2026-10-21-combat-subsequent-impressions.md` plus its screenshot `drag-creatures-here.png` ("subsequent")

Scope: the revised combat (`variants.combatRevision`): `RevisedFightSurface.tsx`, `FightCard.tsx`, `revisedRound.ts`, `styles.css`.
Rules reference: `docs/rules/fighting-rules-reformulated-20261014.md`, steps [c]–[f].
Peter says the stranger tactics "seem credible so far", so this is UI and decision flow only. No rules, dice or strength behaviour changes.

## What the second document changes

| Topic | Initial (A) | Subsequent (B) | Effect on the plan |
|-------|-------------|----------------|--------------------|
| Pauses | Remove redundant pauses; keep a "roll the round" pause | Confirms A, and states it as a **general principle**: solicit interaction only when player input is actually necessary. Names "drag creatures here" as unnecessary when the party defends, and **specifies the replacement sequence and wording** | R1 becomes principle-led. R1.1 and R1.5 are made concrete: the auto-deploy plus a timed message sequence. The button is named "Roll the Round". |
| Hand of cards | Must not scroll out of view | Same, and the hand should look like the splash screen's floating fan **when the player has selections or placement to make**: flat, one row, overlapping all the way across, shrinking to fit the width, so every card's key numbers show at a glance | R2.1 is **replaced**: a fixed single-row overlapping hand (R2). This also removes the "huge battle" sideways or downward scroll problem. |
| Retreat view | Shrink the battlefield so the map is visible | Not mentioned | R3 unchanged, but the compact bar now hides the hand too, which fits with R2. |
| 3D battlefield | Not mentioned | The hand design should still work with a face-to-face 3D battlefield above it | A design constraint on R2 (the hand is self-contained, with its own height). The 3D battlefield itself is **out of scope**. |

The screenshot also shows the surprised-party case (2 v 2, strangers attack, the party's hand in a tray at the bottom). The panel is taller than the viewport, so the "FIGHT · ROUND 1" header is clipped at the top. An empty "drag creatures here" box takes a full row, and the hand sits at the bottom of the same scroll region. That confirms initial item 2 (scrolling) and gives R1.1 a concrete test case.

## Assessment

| # | Point | Source | Credible? | Evidence |
|---|-------|--------|-----------|----------|
| 1 | Redundant pauses; a "roll the round" pause is wanted | A, B | **Yes** | Traced the engine (seed 3, plain fighters). Party attacks, 2 v 2: `engage` is the only party decision and confirming it rolls at once, so there is no roll pause. Party 3 v 2: `engage`, then a `redeploy` prompt for surplus placement. `advance()` (`revisedRound.ts:410`) always raises `deploy` for the defender with `min = min(defFree, attFree)`. When the defender has no more free creatures than the attacker, `min` equals every free creature, so the choice is forced, yet the UI still asks for drag-and-drop, as in the screenshot. The existing review pause ("The strangers have taken their places") is raised only when the strangers moved surplus (`strangersMoved`). |
| 2 | The hand of cards must not scroll | A, B | **Yes** | `.scv-fight` (`styles.css:1905`) is one `overflow-y: auto` region holding the header, battlefield, hand and buttons. The screenshot shows the header clipped. |
| 3 | The hand should be the flat, overlapping, shrink-to-fit "fan" | B | **Yes, as a design request** | The splash fan (`.scv-fan-slot`, `styles.css:953`) already has the machinery: overlap via negative margin, hover straightens and scales 1.5×, z-order. The fight hand (`.scv-fight-tray`) is a wrapping flex row of 116 px cards with 18 px gaps, so a large party wraps and grows. The card art puts its key numbers at the **top-left**, so overlapping each card by the card to its right keeps them visible. Note that the effective-strength badge sits at the **top-right** (`.scv-fc-badge`, `styles.css:2056`), which an overlap would hide. See R2.4. |
| 4 | See the map when choosing a retreat | A | **Yes** | The panel is bottom-fixed and can fill the viewport. The Retreat menu pops up inside it. |

## Decisions (settled 2026-10-25)

All six questions below are answered: the recommendations were accepted, and the pop-up is confirmed as the existing hostile one (question 4). The fan hand is shown **always** (question 5). The ~1.6 s pause and the "You have chosen your targets…" wording are approved (question 6 and R1.3). The questions are kept for the reasoning.

1. **Party outnumbers strangers (A).** Merge pairing and surplus placement into one screen with one "Roll the Round" button? That is a bigger change, because the engine needs the matches to exist before surplus can be placed. **Recommendation: no.** Remove the redundant pause only when step [e] has nothing to decide, because surplus placement is a real decision.
2. **Forced pairings (A).** May a single legal pairing set be auto-made? **Recommendation: yes** (R1.2).
3. **Where the auto-skip lives (A).** UI-level (auto-dispatch the forced `deploy`, as the Ghouls' forced pairing already does with `autoPairs`), or engine-level? **Recommendation: UI-level.** An engine change alters the action log, replays and saved games.
4. **The pop-up text (B).** Peter quotes "The strangers are hostile - you must defend yourself!" and says "as now". The nearest existing text I found is "Hostile — they're ready for a fight!" (`rollView.ts:26`, the reaction roll). **Please confirm that this is the pop-up he means, or whether the wording should be changed.** The plan keeps the existing pop-up and its text.
5. **When does the fan hand apply (B)?** Peter says "when the player does have selections and placement to make". **Recommendation: use the fan whenever the fight hand is shown** (deploy, pairing, redeploy, and the plain view), so it does not change shape between prompts. **Alternative: the fan only during decisions.** The answer decides whether the plain view keeps the old tray.
6. **Pause length (B).** "A very brief timed pause". **Recommendation: about 1.6 s for the pop-up** (a skippable click), with no extra wait before the battle view. This is tunable in one constant. Peter should try it.

## Requirements

### R1 — Interact only when input is necessary; always give a "Roll the Round" pause

Principle (B): the game asks for player input only when the player has a real choice. Where there is none, show passive information, then a single "Roll the Round" prompt.

- **R1.1 Forced front line, party defends (A, B).** When the party defends and has no choice in step [c] (its free creatures are no more than the attacker's, so every one must deploy), the "drag creatures here" front-line box is **not shown**. The deployment is dispatched for the party (`deploy` with all free creatures, the same action the UI sends today, so the engine, log and replays are unchanged). It is sent once per decision (StrictMode safe, like the Ghouls' `sent` guard).
- **R1.2 Forced pairing, party attacks (A).** When step [d] has exactly one legal pairing set, it is made for the party. Otherwise the player pairs as today.
- **R1.3 Passive sequence when the party defends and has no choice (B).** The opening is, in order:
  1. The existing hostile pop-up (text per open question 4), unchanged.
  2. A brief timed pause for it to be read (~1.6 s, skippable with a click or key).
  3. The battle view, with the passive message **"The attackers have chosen their targets…"** and one button, **"Roll the Round"**.
  **As built (2026-10-25):** the existing pop-up already waits for a click, which is the time to read it, so no extra blank timer is added between it and the battle view. The battle view appears at once with that message and button. A timed pause can still be added if Peter wants one.
  The message states the case for the party defending. For the party attacking, the equivalent message is **"You have chosen your targets…"** (an inference from B, to be confirmed).
- **R1.4 One-click pair-and-roll, party attacks with nothing left to decide (A).** When the party attacks and, after pairing, step [e] holds no decision for either side (equal numbers, or no legal surplus placement), the "Confirm Initial Pairings" button is replaced by **"Roll the Round"**. One click pairs and rolls. No extra prompt is added.
- **R1.5 Surplus placement stays a decision (A).** When the party attacks and has surplus creatures to place, keep the two-stage flow (pairings, then placement and "Fight ⚔"). The final button is labelled **"Roll the Round"** for consistency.
- **R1.6 A roll pause is always shown before dice (A, B).** Even when R1.1–R1.4 removed every other decision, the player sees the battle lines (matches, strengths, the die bonus), the existing Retreat and artefact buttons, and the "Roll the Round" button. **Revised 2026-10-25 after tracing the engine: no engine change is needed.** When the strangers attack, the engine already raises its review pause after their pairings (party 1 v 1, 2 v 2, 2 v 3 and 2 v 1 all do), which is the pause R1.1 leads into. When the party attacks, the pairing confirmation is itself the roll (R1.4). The earlier plan to extend `strangersMoved` at `revisedRound.ts:427` was based on tracing only the party-attacks case, and is dropped.
- **R1.7 Unchanged.** What the strangers' Fight Plan decides; all dice, strength and outcomes; the Ghouls fight (already automatic); the Scroll step [b].

### R2 — The hand is fixed, flat, overlapping and shrinks to fit (replaces initial R2.1)

- **R2.1 Layout.** The party's hand is a single row below the battlefield. It never scrolls, wraps or grows taller. Cards overlap so that every card is overlapped by the card to its **right** (the left-hand stacking of the splash fan carried all the way across), so each card's top-left numbers stay visible. No rotation, no vertical offset, no curve.
- **R2.2 Fit.** Card width and overlap are computed from the available width and the number of cards. Cards shrink (down to a legibility floor, set during the build and checked in the visual test) rather than wrap. Past the floor, the overlap increases rather than the row widening or scrolling. A large party must never need a horizontal or vertical scroll of the hand.
- **R2.3 Enlarge on interest.** Hovering, focusing, dragging, or selecting a card raises it above its neighbours and enlarges it to full size (as the splash fan does, `scale(1.5)` there). Tap or click still selects. On touch devices a card is enlarged when it is selected.
- **R2.4 Numbers must be readable.** The effective-strength badge moves where an overlap cannot hide it: top-left, inside the card's visible strip, in the hand. A foe or battlefield card keeps its existing placement. The caption (name) is shown in the enlarged state, and hidden or abbreviated while stacked.
- **R2.5 Behaviour carries over.** Dragging a card to the battlefield, tapping to select, dimming cards already used, the "in front" and "vs …" captions (shown as a compact marker while stacked), and keyboard activation (Enter and Space) all still work.
- **R2.6 Fixed parts and scrolling.** In the revised fight surface the header, the hand, the prompts and the action row stay fixed in the panel. Only the battlefield (`.scv-fight-strangers`) scrolls (`overflow-y: auto; min-height: 0; flex: 1 1 auto`). The panel falls back to scrolling as a whole only if the fixed parts alone exceed the viewport (a very small phone window), so no control is ever unreachable. The panel's header must never be clipped, as it is in the screenshot.
- **R2.7 Self-contained.** The hand has its own height and sits at the bottom of the fight panel and is independent of the battlefield above it, so a future face-to-face 3D battlefield (B) can sit above it with no change to the hand. The 3D battlefield itself is out of scope.
- **R2.8 Reuse.** Share the overlap technique with the splash fan where practical (a common class or CSS variables), rather than copying it. Do not alter the splash fan's look.
- **R2.9 Scope.** The legacy single-sided fight surface and the PvP surface share `.scv-fight` and `.scv-fight-tray`. Change them only if it is safe and trivial. Otherwise scope the change with `.scv-rev`.

### R3 — See the map when choosing a retreat (A, unchanged in intent)

- **R3.1** Pressing **Retreat** collapses the fight panel to a compact bar (header, the retreat direction buttons, **Cancel**). The battlefield **and the hand** are hidden, so the map is visible.
- **R3.2** **Cancel** restores the panel with all state intact (pairings, picks, moves in progress).
- **R3.3** Choosing a direction dispatches `retreat` as today. The compact bar is UI state only (like the current `retreatOpen`) and is reset whenever the pending decision changes.
- **R3.4** The collapse and restore are animated briefly (~200 ms) and honour `prefers-reduced-motion`.
- **R3.5** Only the retreats that `legalActions` lists are shown. If none, the Retreat button is not shown, as today.
- **R3.6** Nothing is shown while the strangers are deciding (`deciding`), as today.

### R4 — The "vs" figures explain themselves (added 2026-10-25, from Mark's play-testing of steps 1–4)

Source: Mark's report after trying the build: "the vs figures aren't showing either magical 'behind the line' additions or artifacts/weapons". This is **not from Peter's two documents**, so it is recorded as its own requirement.

**Finding.** Investigated 2026-10-25: in a formed match the totals are right. A Man with a Magic Sword (3 + 1 = 4) in front and a Priest with a Magic Staff (3) behind the line, against an Ogre, read **5 vs 7**; the sword, the staff and the caster behind the line are all counted (`matchStrength`, `revisedRound.ts:188`). The gap is that the revised surface shows **only the two totals**. The old battle-plan screen shows a chip row under each matchup ("Magic Sword · Man +1", "Magic Staff · Priest +1", the Ring, curses, surprise, the Magic Shield). Nothing in the revised view says why a total is what it is, so a bonus looks as if it is missing. Two further gaps are **unconfirmed** and to be checked first: a pairing under way shows only the paired creature's own strength, and a stranger's "behind" slot reads "magic user" on a row where no caster stands.

- **R4.1 Chips on every row.** Each match row, and each pairing-under-way row, shows a chip row under its party side and under its foe side, in the old screen's style (`.scv-mod`, `.scv-match-mods`): the source, then the signed value. Chips that change the strength total show "included in the strength" as their tooltip. Chips that change the die (the Ring, curses, surprise) are marked `is-roll`, with "applied to the die roll" as their tooltip, and are not part of the total.
- **R4.2 Party chips.** Front line: Magic Sword, Magic Axe, Strength Potion, Dragon-slayer (kills), Elixir. Magic: **a caster fighting in front shows its magical power as a chip** ("Magic · Wizard +4"), and **each caster behind the line shows "Behind · Priest +3"** with a separate "Magic Staff · Priest +1" chip when it carries one. A Magic Shield the strangers bear shows the magic it turns aside as a negative chip.
- **R4.3 Stranger chips.** The same chips on the strangers' side: the Sword, Axe and Staff they bear (from their loadout), their casters' magic (front or behind), the Ring, and the Shield's ward ("weaken" or "nullify", with the real change in value).
- **R4.4 Match-wide chips.** The Eye of God ("magic and artefacts nullified"), a Magic Shield standoff, curses, and the round-1 surprise bonus (to whichever side has it).
- **R4.5 Chips reconcile with the totals.** For every match, the base card strengths plus all the strength chips equal the displayed total, on both sides. This is enforced by a test over a seeded sweep, so a chip can never drift from the number it explains.
- **R4.6 Pending placements count.** A creature chosen but not yet confirmed (a pairing under way, a redeploy placement) appears in the totals (it already does for matches) **and in the chips**, with the same caption as its card ("joining").
- **R4.7 One source of truth.** The chips are built by a new engine function beside `matchStrength` (for example `matchModifiers(state, match)`, taking the same match and pending placements), reusing the same helpers (`frontStrength`, `casterMP`, `strangerFS`, `strangerMP`, `shieldedMP`, the bonus tables), so the chips and the totals cannot disagree. The old battle-plan chip code is left alone. **This is an engine change, so `engine-spec.md` is updated** (a new `SC-<§>-<n>` row, the Part II prose, the code reference and the test reference).
- **R4.8 Compact.** Chips wrap within the row's width. Past four chips on a side the rest fold into a "+N more" chip that expands on tap or click, so a heavily armed party does not push the battlefield rows out of view on a phone.
- **R4.9 Unchanged.** The numbers themselves; the legacy battle-plan screen; the Fight Plan; the dice.

## Out of scope

- Strangers' tactics, pairing strength, Fight Plans, and any rules or dice behaviour.
- The face-to-face 3D battlefield (B mentions it only as a future context for the hand).
- Re-ordering battlefield rows or restyling the battlefield cards.
- The legacy and PvP fight flows, except as R2.9 allows.

## Documents to update in the same change (project rules)

- `docs/specs/engine-spec.md`: **R4.7 only** (R1.6 needed no engine change): add the `matchModifiers` row, the Part II prose, the code reference and the test reference; update the Appendix C gap list.
- `apps/web/public/manual.html`: the Fights section (pairing and front-line wording near line 1028; the Retreat text near line 499) must describe the automatic deployment, the "Roll the Round" pause and the new hand. Bump the footer `Updated` date.
- The Appendix C gap list if test coverage changes.

## Tests

- Engine (`packages/engine`): the review pause is raised after strangers' pairings with no surplus (R1.6); not raised twice in one round; not raised when the party acted after the strangers; a seeded sweep over party and stranger counts (1–4 each), for both attacker roles, asserting that the party never faces a forced-empty prompt and never reaches the dice without a pause.
- Web (`RevisedFightSurface.test.tsx` and a hand test): the forced `deploy` is auto-dispatched once; the pop-up timer and its skip; a single legal pairing is auto-made; the button reads "Roll the Round" when step [e] is empty; the hand is one row, with no scroll container, for 2, 8 and 20 cards; the badge moves to the visible strip; the Retreat bar hides the battlefield and hand and Cancel restores them with state intact.
- Visual check with the dev harness (Playwright) at desktop and phone widths: the screenshot scenario (strangers attack, party 2 v 2) end to end; a 4+ match battle with a 20-card hand (no scroll of the hand, header not clipped); the retreat bar with the map visible.
- R4 (engine): `matchModifiers` reconciles with `matchStrength` for every match, on both sides, over a seeded sweep that includes Sword, Axe, Staff, Shield, Ring, Eye, curse, surprise, Dragon-slayer and Elixir; a front caster and a caster behind the line each give their chip; a pending placement is reflected in both chips and totals. R4 (web): chips render under both sides of match rows and pairing rows; strength chips and die chips are told apart; more than four fold into "+N more" and expand.

## Suggested order (each its own commit)

1. R2.6 (CSS only: fixed parts, battlefield scrolls, header not clipped).
2. R2.1–R2.5, R2.7–R2.9 (the fan hand).
3. R3 (retreat bar).
4. R1.1–R1.5 (UI auto-dispatch, passive sequence, relabel).
5. ~~R1.6 (engine change)~~: dropped, see R1.6.
6. R4.7 (engine: `matchModifiers`, with its spec row and tests), then R4.1–R4.6 and R4.8 (UI chips). Two commits: the engine function first, then the UI. Before building, confirm the two unconfirmed gaps in R4 with Mark.
