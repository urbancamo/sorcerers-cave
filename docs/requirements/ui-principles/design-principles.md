# UI Design Principles — draft for iteration

Status: **draft 1, 2026-11-02. Nothing here is agreed until Mark says so.**
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
| Bottom edge | the camera controls, with the **decision bar** just above them while a choice is pending | Snap, Orbit, Levels; Decision bar (transient) |
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
*Source:* Peter's notes 6 and 8: "an Encounter in the Book pane, with a description and Action buttons".
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

## G. Where the current branch breaks these (honest list)

- **P8** the decision pane hides the floor card, and its stranger images do nothing when clicked.
- **P5** the decision pane and the card view are offset against each other with a hard-coded `right: 311px`.
- **P5** the expanded party list widens the left panel and covers more of the stage, a second state for the same slot.
- **P15** solo and multiplayer now have different encounter surfaces and different party panels.
- **P2** the decision pane can be tall (several strangers plus treasure plus choices).

These are symptoms. The fix is not another layout; it is settling the open questions below first.

## H. Open questions for the next iteration

1. **Q1 (leaning decided, 2026-11-02, Mark): a thin decision bar at the bottom.** One line of context, the choices,
   and a printed-strength comparison; it clears when the decision ends; the Card view stays free to inspect any card.
   Treasure assignment ("Give to…") lives on the item's card; pickers open as a popover above the bar.
   To confirm: the bar sits above the camera controls. Earlier candidates, for the record:
   - *a. The card view is the encounter.* Choices sit on the stranger's card in the right slot; clicking another
     card swaps it, with a standing "back to the encounter" row. (Fits P7, P9; breaks P8 while another card is shown.)
   - *b. Information in the right slot, choices as a compact strip.* Right slot is always the card view; the choices
     are a small fixed strip (not a panel) tied to the party-leader seat. (Fits P8, P7; strip needs a home in P4.)
   - *c. Choices in the right slot header, cards in the body.* The pane is the card view with a permanent
     "Decision" header carrying the choices. (Fits both; a single panel, so P5 holds.)
   My lean is (c), which is (a) with the choices pinned so they never scroll away. Needs your view.
2. **Is a party-strength summary part of the left slot always, or only during a decision?** (P13, note 7.)
   And is the "expand" state a separate occupant of the slot, or a size of the same one?
3. **What counts as "must-act" (blocking)?** The review says trap, game over, rule-critical. Is an encounter ever
   blocking, or never?
4. **Which controls are allowed in the title bar?** Today: Party, Inventory, Card, Settings, Help, Test.
5. **Do we want a standing layout test?** A short checklist run on a screenshot of each state before merging UI work.

## I. How we use this

1. Iterate on this document until you are content with P1–P17 and answer H1–H3.
2. Re-derive each screen state from the principles in a table (state → slot → content → actions), before any code.
3. Only then compare with what the branch has, and keep, change or drop each piece.
4. Until then, the branch's UI changes stay uncommitted-to-main and no more are layered on.
