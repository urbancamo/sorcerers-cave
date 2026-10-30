# UI Review Worklog

Work log for the work package in [requirements.md](requirements.md). Each entry links back to the task it
belongs to, with a summary, the thinking behind it and the outcome.

## Task 1 - Requirements Review

Task definition: [requirements.md, "Task 1 - Requirements Review"](requirements.md#task-1---requirements-review).

### 2026-10-30 - Requirements read, issues raised, questions answered

- **Done:** read `requirements.md` and all 20 pages of Peter's `Revised UI Presentation 20261029.pdf`; read the
  current UI entry points (`GameScreen.tsx`, `ExplorePanel.tsx`, `EncounterPanel.tsx`, `PartyPanel.tsx`,
  `TradeModal.tsx`, `TrapChoice.tsx`) and the engine's `useArtifact` actions (`selectors.ts`) for the review.
- **Thinking:** the requirements were clear on layout but left open how combat, artifacts and the manual interact
  with the new panels. Raised as questions; the answers are now in `requirements.md` ("Initial Review Answers",
  "Additional Clarifications", "Other Overlays").
- **Outcome:** three assumptions approved by the user, carried into the mockup:
  1. Only `FightSurface.tsx` and its flag are removed. The PvP surface and `FightHand` stay until the
     multiplayer follow-up.
  2. Treasure pickup and redistribution happen from the card view (replacing the pickup session screen and the
     trade modal).
  3. Blocking popups are the trap choice, game over and rule-critical choices (e.g. the Sorcerer's terms). Dice
     rolls and outcome notices stay non-blocking overlays.

### 2026-10-30 - Summary document

- **Done:** `ui-review-summary.html`, a self-contained interactive mockup and review (see its sections for the
  best-practice comparison, gap analysis, artifact classification and open items).
- **Thinking:** a static picture would not show the interaction rules the requirements care about (mutually exclusive
  panels, multi-select, tentative placement), so the stage is a small state machine driven by the same icons and
  clicks the real UI would use. Availability colours follow a "Situation" switch so the "show availability, do not
  advise" principle can be seen working.
- **Outcome:**
  - Twelve scenes: clear view, party list, member card with mini-cards, encounter card, inventory with an
    artifact card, artifact with a picker, chamber pickup, Sibyl card, settings, trap popup, combat (defend) and
    combat (attack).
  - Findings written into the document: best-practice comparison (one refinement: colour alone is not
    accessible, so each state also carries a text tag), a gap analysis against the current components, a draft
    artifact classification taken from `selectors.ts` and `data/treasures.ts`, and the open items.
  - Gaps identified: per-artifact target and direction pickers must move onto the artifact card; Wield/Stow
    (`setBorne`) needs a home on the card; the structured manual and the tutorial do not exist yet; the
    `CLAUDE.md` manual-sync rule will need rewording; the Sorcerer's terms flow should be its own task.
  - Interpretations flagged for confirmation: the test icon joins the exclusive right-hand group; the meaning of
    the yellow state ("carried by a member who can use it, but not usable now").
- **Checked:** all scenes render with no page errors; icon exclusivity (party/inventory, card/settings/test);
  defend flow (multi-select, Frontline, confirm, Roll the Round); attack flow (Roll the Round stays disabled until
  every stranger is matched); no horizontal scroll at 1440 wide; screenshots reviewed and three layout faults
  fixed (clipped foe column, empty message, missing sword glyph).
- **Files:** `ui-review-summary.html`, this worklog.

### 2026-10-30 - Book icon clarified

- **Source:** Peter, via Mark: the Book icon "was there so that the player could force the right-hand side information
  panel to pop up (on top if necessary), or hide it away if it was hanging around unnecessarily."
- **Done:** recorded in `requirements.md` (Small items) and as an open question, because the requirements also give the
  Text icon the Card Panel. In `ui-review-summary.html` the Book icon now shows or hides the right-hand panel.
- **Open:** if the Book and Text icons control the same panel, what each one does needs Peter's answer.
- **Confirmed (Mark):** "on top" means the information panel may float over the combat dialog. Mockup: forced from the Book icon it overlays the dialog; opened by selecting a card it sits beside it.

### 2026-10-30 - Icon roles corrected

- **Source:** Mark, from Peter: the Book icon displays the card; the T icon (earlier called "Text") opens the test panel
  when test is enabled.
- **Done:** `requirements.md` top-right icon group, Small items and open items updated; mockup now has Book = card panel
  (floats on top of the combat dialog when forced from the Book), Settings, and a T icon shown only when a new "Test mode"
  checkbox is ticked. The separate flask test icon and the second card icon are gone.
- **Open:** whether the test panel shares the exclusive right-hand slot with the card panel and Settings (assumed).

### 2026-10-30 - Peter's response to the review questions

- **Source:** [20261030-peters-response.md](20261030-peters-response.md).
- **Done:** all eight review answers are "Agree"; the colour question also says the text tag and glyph are liked. New
  requirement recorded in `requirements.md` ("Card View for any card"): every clickable card, including area cards, opens
  in the card panel, with terse or optional verbose text. Mockup gets an "Area card" scene (clickable board areas, seven
  states, verbose switch in Settings). The Test icon location is no concern, so that open item is closed.
- **Open:** Peter's "Agree." after the gray/yellow/green reading may answer the whole item rather than that question, so the
  yellow meaning is still worth one more confirmation. The area text needs the game to remember withdrawn and visited
  chambers, which has not been checked.

## Task 1 (implementation) - Shell and panel state

Plan: `/Users/msw/.claude/plans/snug-booping-taco.md`, task 1. Requirements: ["Minimise interface clutter"](requirements.md#minimise-interface-clutter).

### 2026-10-30 - Title bar, slots and Settings

- **Done:** new `apps/web/src/game/shell/` (`shellState.ts` slot rules, `TitleBar.tsx`, `SettingsPanel.tsx`) with tests. `CaveHud`
  gets a `shell` mode that drops the brand, stat chips and bottom-left help panel; the dock is unchanged and the compass stays.
  `GameScreen` owns the left and right slots. `TestControlsPanel` takes an `open` prop driven by the T icon.
  `cave3d.js` tolerates the missing chips and title, and reports card show/hide through a new `onCardShown` callback.
- **Thinking:** `CaveCanvas` is shared with the multiplayer, spectate and replay views, which keep the legacy HUD, so the shell is a
  prop used by the solo game only. Two things are deliberate stop-gaps for later tasks: the Party icon shows the existing roster
  and the Inventory icon opens the existing party panel (task 3 replaces both); the Card icon shows the existing card (task 2
  replaces it). A card on the floor opens the card panel by itself, unless Settings or the test panel holds the slot.
- **Outcome:** typecheck clean; web tests 886 pass. `manual.html` updated (HUD section, controls, footer date).
- **Not yet done:** no browser check of the real game (needs the Convex backend and login); the deck chip's red low-deck highlight is gone
  (the low-deck toast still fires); Quit is only on the dock.
