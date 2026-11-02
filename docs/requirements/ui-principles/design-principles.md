# UI Design Principles — draft for iteration

Status: **draft 2, 2026-11-02 (after the decision bar, dock move, treasure-on-the-card and bar label were built). Nothing here is agreed until Mark says so.**
Purpose: state the rules the interface follows, so that individual screens are *derived* from them
instead of being redesigned one complaint at a time. Each principle gives the rule, why, where it came
from, and a test you can apply to any proposed change.

Sources: the UI review ([requirements.md](../ui-review/requirements.md), Q&A answers, and
[Peter's 20261030 response](../ui-review/20261030-peters-response.md)); Peter's first-impressions notes
([2026-11-02](../ui-first-impressions/2026-11-02-ui-first-impressions.md)); and what went wrong on the
`ui-first-impressions` branch. Where a principle is my reading rather than something stated, it is marked
**(inferred)**.

## A. The frame

### P1. The player is the party leader
All choices are made from the leader's seat: who fights, who carries, who picks up what, when to withdraw.
The UI never decides for the player, and never makes the leader act through a member's screen.
*Source:* "Party Leader Philosophy" in the review.
*Test:* is the decision phrased as something the leader does ("Give to…", "Attack"), not as something a card does?

### P2. The cave is the stage; panels are guests
The 3D view is what the player came for. By default it is unobstructed. A panel appears because the player
asked for it or because something needs a decision, and it goes away when that ends.
*Source:* "minimise interface clutter".
*Test:* with nothing to decide and nothing requested, is anything but the title bar and camera controls on screen?

### P3. Calm when there is nothing to decide
Information tied to a moment (a pickup, an encounter, a result) does not linger after that moment.
Peter's complaints 4 and 6b are both this.
*Test:* after the last action of a moment, is every surface for that moment gone?

## B. Where things live

### P4. Every kind of thing has one home (slots)
The screen has a small fixed set of places, and each has one job:

| Place | Job | Occupants (mutually exclusive) |
|---|---|---|
| Title bar | switches the panels on and off; shows game identity | — |
| Left slot | **my side**: who I command and what we carry | Party, Inventory (Combat selector during a fight) |
| Right slot | **the thing in focus**: whatever card, place or choice I am looking at | Card view, Settings, Help, Test |
| Bottom edge | one row: the camera dock at the left, and the **decision bar** centred beside it while a choice is pending | Snap, Orbit, Levels (always); Decision bar (transient) |
| Blocking popup | a must-act choice that cannot wait | Trap, game over, rule-critical choices |

Anything new has to be placed in one of these. If it doesn't fit, that is a design question, not a
reason to add a place.
*Source:* "Minimise clutter", answers to Q4 and Q6. Peter's note 2 (Save, Log and Abandon don't belong at the bottom).
*Test:* name the slot. If you need to say "next to" or "also at the bottom", the principle is being broken.

### P5. Slots hold one thing at a time; the player never has to arrange panels
Panels in the same slot swap. We do not offset, nest or float one panel beside another to make two things fit.
If two things need to be seen together, they are one panel, or one of them is not in a slot (see P7).
*Source:* "mutually exclusive and occupy the same UI slot"; Q4 "Settings and card panels are mutually exclusive".
*Test:* does any rule say "if A is open, move B"?

### P6. System controls live in Settings
Save, Game log, Abandon, verbose text, anything about the session rather than the cave.
*Source:* Q6; Peter's note 2.

## C. Cards and decisions

### P7. One surface to see a card, and act on it
The Card view is the one place to see any card and the actions that belong to it. "Any card" means every
clickable card: strangers, artifacts, party members, area cards, large and small.
Actions sit with the thing they act on (the flute on the flute, Sibyl actions on the Sibyl).
*Source:* "standardise the card view", "Card View for any card", Q6.
*Test:* is there a card the player can see but not click, or an action shown away from the card it belongs to?

### P8. A decision never takes away the means to make it
When the player must choose (attack, withdraw, test, take, leave), everything they need to choose well stays
reachable *without leaving or answering the choice*: the strangers' cards and strengths, their own party's
strength, what is on offer. A surface that asks for a decision must not hide or block what informs it.
Blocking popups are for the few choices that are made on the spot (a trap), not for choices that need weighing.
*Source:* Q6 (blocking only where "an action absolutely must be taken"); Peter's note 7 ("is my party strong enough?");
and Mark's report that stranger cards cannot be inspected at the decision point. **This is the principle this
branch broke.**
*Test:* at each decision, can the player find out everything the rules let them know, with the choices still visible?

### P9. Looking and choosing are separate surfaces (revised)
The Card view is for looking; the **decision bar** is for choosing. On arrival the Card view shows the
strangers automatically, and the bar offers the choices, with one line saying what they are about. The bar holds
no descriptions or card images, so it is never "heavy", and it exists only while a choice is pending.
*Source:* Peter's notes 6 and 8 asked for "an Encounter in the Book pane, with a description and Action buttons". **Mark decided
otherwise (2026-11-02): the choices stay in the bar and the Card view stays free.** This departs from the review's literal text.
*Resolved:* the tension between P8 and P9 is answered by the decision bar (Q1 below).

### P10. The player drives; the UI informs, it does not lead
No auto-use of artifacts, no "Use flute on dragon" prompts. The UI shows what is *available*; the player works
out what to do. Passive effects (carried, or present in the chamber) stay automatic.
*Source:* "remove hints for deploying artifacts"; Q2.

## D. Honesty and legibility

### P11. Say why, don't hide
If an option is unavailable, show it disabled with the reason. Peter's note 5 ("Give to…" with a tooltip). Do not
silently remove a control the player expects, and do not show one that has no possible effect (note 3).
*Test:* does a missing or inert control leave the player guessing?

### P12. Never rely on colour alone
Every state carries a text tag or glyph as well as colour.
*Source:* Q3 and Peter's agreement.

### P13. Numbers shown are the numbers used (inferred)
If the UI shows strength or magic, it says what it includes (printed, or with bonuses). A figure the rules
will change later is labelled as such.
*Why:* the party-strength check (note 7) is only useful if it can be trusted.

### P14. Help is where the question arises
The manual is structured data shown in context: the card's Help section, "?" at screens and options, the Help
panel for browsing. There is no separate manual. Showing only the rules in force.
*Source:* Q5 and the structured-manual work.

## E. Consistency

### P15. Same thing, same look, same place, same name
A card looks like a card wherever it appears; a member is called what the card says; a control that does the same
thing is in the same place on every screen. When solo and multiplayer differ, it is deliberate and recorded.
(Multiplayer's older HUD is out of scope for now, but new work should not widen the gap without saying so.)

### P16. Mode changes are announced and reversible
When the screen changes mode (combat takes over the left slot; a must-act choice takes the right) the title or
label says what mode it is (the "Encounter" / "Treasure" label is the right idea). Destructive or irreversible
actions (Abandon) are confirmed; everything else is one tap and undoable by the rules.

### P17. Landscape first
Portrait is a later review. Nothing is designed so that it *cannot* adapt (no fixed pixel offsets between panels).

## F. What Peter's notes mean as principles

| Note | Principle it is really about |
|---|---|
| 1 Party open at start | P2/P4: confirm the party the player chose is in play. A reassurance, shown once |
| 2 Save/Log/Abandon in the dock | P4, P6: one job per place |
| 3 "Move or drop" with empty inventory | P11: no control with no possible effect |
| 4 Pickup pane lingers | P3: calm when nothing is to be decided |
| 5 Move prompt with nobody able | P11: say why |
| 6 Apprentice, stray Stranger card | P7, P9: the card in focus is the one I am at |
| 6b Troll and chest, heavy pane | P3 |
| 7 Can't see party strength | P8, P13: the decision needs the information |
| 8 Bell Rope, no Encounter | P9: a special chamber behaves like any other encounter |

## G. Gaps between the UI and these principles (2026-11-02, after the bar rebuild)

Closed since draft 1: the decision pane (P5, P8), "Leave the treasure" (P3), the pickup panel hiding the card view (P7, P8),
the bar's missing mode label (P16), and the missing party-strength comparison (P13, note 7), and the information-only explore bar (P3). Still open:

| # | Principle | Gap |
|---|---|---|
| 1 | P16 | **The explore bar** no longer opens for an explanatory note alone (that was Peter's 6b); the reason a treasure cannot be carried is on its own card. Its heading is still the generic "Actions" (see J row 8). |
| 2 | P9 | Peter's 6a (stray Stranger card) and 8 (Bell Rope has no Encounter in the Book pane) are not reproduced. The card view auto-shows only the first stranger or treasure; for a special chamber it may show nothing relevant. |
| 3 | P13 | The strength line sums every member able to fight, but the fight pairs people off. The Sorcerer and Sibyl are not modelled. "Printed" is only in a tooltip. |
| 4 | P15 | Solo and multiplayer differ (dock, party panel, Leave button, no Settings or card view in multiplayer). Not yet written down as a deliberate list. |
| 5 | P17 | The bar's maximum width assumes the dock's width (`100vw - 680px`); its height is untested with many strangers. |
| 6 | P5 | The expanded party list is a second *size* of the left occupant; whether that is acceptable is open (H2). |
| 7 | P12, P14 | Not audited: inventory colour states carry a text tag? The Great feats topic has no help button; rear-guard detachments and Zombies in multiplayer have no topic. |
| 8 | all | **Nothing has been seen in a browser.** Every "met" in section J is by reading the code. |

## H. Open questions for the next iteration

1. **Q1 (decided, 2026-11-02, Mark): a thin decision bar at the bottom.** One line of context, the choices,
   and a printed-strength comparison; it clears when the decision ends; the Card view stays free to inspect any card.
   Treasure assignment ("Give to…") lives on the item's card; pickers open as a popover above the bar.
   Built: the bar shares the bottom row with the camera dock (dock at the left). Earlier candidates, for the record:
   - *a. The card view is the encounter.* Choices sit on the stranger's card in the right slot; clicking another
     card swaps it, with a standing "back to the encounter" row. (Fits P7, P9; breaks P8 while another card is shown.)
   - *b. Information in the right slot, choices as a compact strip.* Right slot is always the card view; the choices
     are a small fixed strip (not a panel) tied to the party-leader seat. (Fits P8, P7; strip needs a home in P4.)
   - *c. Choices in the right slot header, cards in the body.* The pane is the card view with a permanent
     "Decision" header carrying the choices. (Fits both; a single panel, so P5 holds.)
2. **Is a party-strength summary part of the left slot always, or only during a decision?** (P13, note 7.)
   And is the "expand" state a separate occupant of the slot, or a size of the same one?
3. **What counts as "must-act" (blocking)?** The review says trap, game over, rule-critical. Is an encounter ever
   blocking, or never?
4. **Which controls are allowed in the title bar?** Today: Party, Inventory, Card, Settings, Help, Test.
5. **Do we want a standing layout test?** A short checklist run on a screenshot of each state before merging UI work.

## J. Screen states (derived from the principles)

For each state: what each place holds, what the player can do, and whether today's build meets it. "Today" is by reading the
code, not by seeing it run. **Left** = party/inventory/combat selector; **Right** = card view, Settings, Help or Test.

| # | State | Left | Right | Bottom row (dock + bar) | Popup | Today |
|---|---|---|---|---|---|---|
| 1 | Exploring, nothing selected | Party (open at game start; the player's toggle sticks) | Empty | Dock only | — | Met |
| 2 | Click any card, area or member (any time) | unchanged | Card view of it: stranger/treasure card with wording; a scouted-away area as a mini with words; a member with mini-cards; an item with "← member" | unchanged | — | Met |
| 3 | Arrive at a chamber with strangers | Party | Card view auto-shows the first stranger; any other can be clicked | **Encounter** bar: stranger names, strength/magic them v you, Test, Attack, Withdraw (+ Retreat), help | — | Mostly (G2, G3) |
| 4 | After a reaction test | Party | as 3 | Bar offers the next legal choice; if the party may leave, the doorways light up in the cave | — | Not checked |
| 5 | Fight (revised) | Combat selector (forced) | Card view of the clicked member, stranger or artifact | None; the fight dialog owns the middle | — | Met |
| 6 | Pickup (treasure on the floor) | Party | Card view auto-shows the first piece, with Give to… (greyed with the reason if no one can); any other card still clickable | None, except the one-tap Retake after a win (labelled Treasure/Artifact). Walking on leaves it | — | Met |
| 7 | Medusa pause | Party | Card view | **Medusa** bar: throw the dust, Holy Water, or proceed | — | Met |
| 8 | Special chamber (Chasm, Well, Bell Rope, Crypt, island) | Party | Card view: the chamber's words | Bar with the choice, behind a confirm | Confirm | Partly: the bar is headed "Actions", not the chamber's kind (G1) |
| 9 | Trap | Party | — | — | Blocking trap choice | Met |
| 10 | Sorcerer's terms | Party | — | — | Blocking terms | Met |
| 11 | Sibyl | Party | Her own card, with her look action | — | — | Met |
| 12 | Inventory open; item selected | Inventory | Item card: use, wield/stow, Give to… (greyed with the reason), drop | unchanged | Confirm for Elixir, Scroll | Met |
| 13 | Settings / Help / Test | as before | Settings (game info, Save, Game log, Abandon with confirm), Help, or Test, swapping with the card view | unchanged | Confirm for Abandon | Met |
| 14 | Dice, outcome notice | as before | as before | as before | Dice are an overlay; the notice is a modal to dismiss | Per the review notices should not block (Q6); not changed |
| 15 | Game over / save | — | — | — | Blocking | Met |
| 16 | Party selection (before the game) | the chooser | Card view of the clicked recruit | — | — | Met |

Reading across the rows, the rules the table enforces are:
- the **right** place always holds exactly one of card view, Settings, Help or Test (P4, P5);
- the **bar** appears only in rows 3, 4, 6 (retake), 7 and 8, and never holds descriptions (P3, P9);
- anything that *informs* a choice is a card in the Card view; anything that *is* the choice is on the bar or on the card it acts on (P7, P8);
- only rows 9, 10 and 15 block (P8).

## I. How we use this

1. Iterate on this document until you are content with P1–P17 and answer H2–H5.
2. Section J is the screen-state table; check each row, then correct the code where "Today" says otherwise.
3. Only then compare with what the branch has, and keep, change or drop each piece.
4. Until then, the branch's UI changes stay uncommitted-to-main and no more are layered on.
