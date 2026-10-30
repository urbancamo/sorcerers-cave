# User Interface Review

This work package is to review and re-implement the user interface, both for normal use and during
combat, to achieve the following high-level goals:

 - minimise interface clutter
 - standardise the card view interface
 - replace the manual by providing manual hints 'inline'
 - maximise vertical screen real estate for combat
 - contextualise actions for artifacts
 - remove hints for deploying artifacts
 - reduce screen real estate used for party members during combat
 - use a 'left-to-right' metaphor for combat party selection
 - party-leader philosophy

The 3D view remains the same. All overlaid panels will be affected by this review.

Peter has provided a power-point mockup in PDF format of the main user interface items. This should
not be considered a specification for the look-and feel, but on the main user-interface elements,
where they should appear and how the user interact with them:

 - [Revised UI Presentation 20261029.pdf](Revised%20UI%20Presentation%2020261029.pdf)

## Party Leader Philosophy

The User Interface will follow the 'party leader philosophy'. This pitches the player as the party
leader who is in control of the group. All decisions about actions that party members can take
is from a party-leader perspective. So, for example, having defeated a stranger group, the party
leader is responsible for deciding who out of the party should pick up what artifact in the chamber.
They are responsible for choosing party members during combat. They are responsible for redistributing
treasure amongst party members.

## Minimise interface clutter

This improves the user experience by allowing the player to have an unrestricted view
of the 3D play surface, by default.

There will be a thin title bar containing the following:

 - Left hand icon group
 - The title *SORCERER'S CAVE* will be displayed in the top-middle position
 - Right hand icon group

### Top-left Icon Group

 - *Party* icon - this controls the display of the party listing, which when enabled is display 
   on the left-hand side of the play area.
 - *Inventory* icon - this controls the display of the party inventory (artifacts & treasure),
   which when enabled is displayed on the left-hand side of the play area

The party listing or inventory display are mutually-exclusive and occupy the same UI slot, so the 
control icons when pressed should switch between the two if one is already displayed.

### Top-right Icon Group

 - *Book* icon - "Card Panel" - this displays the card panel on the right-hand side (see the clarification under
   "Small items" below). This replaces the current card view which is displayed top-right in the existing UI.
 - *Settings* icon - "Settings" - the current title bar display information is to be presented in a vertical format
   on the right-hand side of the play area, for example: game code, game type, level, turns, party count,
   deck cards (remaining/total) and game control icons.
 - *T* icon - "Test Panel" - this opens the test panel when test mode is enabled.

## Bottom Icon Group

The bottom icon group should remain the same. The current 'bottom-left' help panel is to be removed (the
information displayed in this panel is going to be replaced by a new-player tutorial mode).

### Card View

The card panel replaces the current view. The purpose is to display any card selectable in the game,
together with additional information and any applicable actions.

A 'clickable card' could be a stranger card in the 3D play area, an artifact in the 3D play area,
a member of the party listing, an artifact in the inventory panel.

Additional information should be pulled from the relevant section of the manual, and displayed below a 
graphic of the card.

For party members the full-size card should be supplemented with mini-card views of the artifacts being 
carried. Selecting one of these mini-card views should swap the main card display to be a view of that
artifact (being a 'clickable card' itself).

Any actions that can be performed by the card (for example to use the Charmed Flute to lull a dragon
should be available within the card view).

## Party View

The default party view remains the same. There is a 'combat party view' that contains additional information
relevant to combat, as described below.

## Inventory View

We are implementing the inventory view with a new philosophy which implements the requirement to 
'remove hints for deploying artifacts'. So there will be no auto-use of artifacts (for example using
the magic flute to automatically put dragons to sleep) - it will be up to the player to identify where
artifacts *can* be used, and the user-interface should allow artifacts to be selected where the 
situation allows.

The inventory view therefore colour codes the artifact icon in the inventory to have on the following
states:

 - gray: carried by a party member who is unable to use the artifact based on their class.
 - yellow: carried by a party member and potentially wielded 
 - green: carried by a party member who is allowed to use the artifact, available for use in the current
   scenario.

The inventory view presents a list of items the party is carrying, from the item perspective. So where
associated with a party member (for example dwarf carrying a magic sword, hero carrying silver) the
information about the party member is shown associated with the artifact (rather than the other way round
currently).

## Replace combat interface

The left hand party listing information will be expanded during combat, and provide a multi-select
pick list for party members, as required, with a more compact (non-card based) representation of card stats and 
artifacts to minimize the vertical real estate required. The party list will expand downwards and then where
it exceeds the available vertical space be scrollable.

For each party member there is a widget displaying all the stats required for the party-leader to 
choose combat pairings. Widgets are multi-selectable, as required, so for example when choosing
a 'front line' the player should be able to select the required players as one action and drag or click
to drop them all in the front line with one action.

Pairings should continue to be displayed in the main combat dialog with a 
'one row per pairing' philosophy. The combat dialog should use the maximal amount of vertical screen
available, and be scrollable as required.

Once party members have been dragged or click-selected into a pairing the card representation should be
displayed.

# Tasks

This is a list of tasks that should be expanded as this work is underway. Keep a `worklog.md` file updated
in this directory with any work tasks completed including a summary of the task, linking back to this list, as 
well as any thinking and outcomes and work completed.

## Task 1 - Requirements Review

The first task is a requirements review. This should examine these requirements and the proposed solution to the
user-interface review. The purpose of the review is to:

 - compare the proposed UI against industry best practice with this class of application
 - examine Peter's mockups to get a 'feel' for how the new UI should be laid out and implemented
 - compare the functionality of the proposed UI with the current UI, highlighting any gaps and how they
   might be implemented, based on the philosophy
 - create a self-contained summary HTML document that shows a mockup of the proposed user-interface and how it will 
   function

The outcome of the review is the summary HTML document.


### Review Questions and Answers

These are the questions raised while reviewing the requirements and Peter's mockup, each with the answer given. Answers
are quoted as given. Items marked **Assumed** were put forward during the review and accepted. Items marked
**For confirmation** are proposals that have not yet been confirmed.

#### 1. Does the new combat panel replace the fan hand?

*Question.* The fan hand was built from Peter's earlier combat revisions (the flat, overlapping, shrink-to-fit row).
The new requirements move party selection into a left-hand list, with multi-select and a one-action "Deploy Frontline",
and show cards only once a creature is placed. Does the new panel replace the fan hand? Does it cover the legacy and
PvP fights as well as the revised fight? Does it satisfy Peter's rulings of 25 October (simulate deployments by moving
cards, overlap only for large parties)?

*Answer.*

1. The new combat panel replaces the fan hand. The party is displayed vertically on the left-hand side of the UI.
2. The new combat panel covers the revised fights for solitaire only, but with a view to replacing the multiplayer
   UI in the future. The legacy UI can be removed.
3. Yes this satisfies Peter's rulings

*Assumed:* "the legacy UI" means only the legacy single-sided fight surface (`FightSurface.tsx`) and its feature flag.
The PvP fight surface and its fan hand stay until the multiplayer follow-up.

#### 2. "No auto-use of artifacts" changes the rules, not just the UI

*Question.* The engine applies some artifacts automatically (for example the Magic Shield and the Eye of God), and the UI
currently suggests uses such as "Use Charmed Flute on dragon". The requirements do not say which artifacts are active
(a player action) and which are passive (always on). Does this change any engine behaviour?

*Answer.*

There are some artifacts are applied passively still, where the presence in a chamber or the very
fact that they are being carried makes then work automatically. This isn't changing. Where an artifact
requires an action to use, this action should be associated with the artifact itself, rather than the
current action suggestions 'Use charmed flute on dragon'. So there are no longer suggestions that
'lead' the player on how and when to use an artifact, the UI only reflects when artifacts are available for
use, they would have to know that if they move to the Charmed Flute inventory there is the option to use
it that turn.

If necessary after a rules review we can classify artifacts accordingly,

*Outcome.* No engine rule change is implied. A draft passive/active classification is in the summary document
(section 6) for the rules review.

#### 3. Artifact colours

*Question.* The three colour states are not fully specified. "Yellow: carried and potentially wielded" overlaps with
"green: allowed to use, available now". What do dead, petrified or stone-borne carriers show? Colour alone also fails for
colour-blind players.

*Answer.*

This is not an exhaustive list, we will need to iterate on the colours to harden the requirements.

Artifact colours, yes let's iterate on these as we get into the weeds of this panel.

*For confirmation:* the summary mockup reads the states as **gray** (the carrier cannot use it, or it has no use),
**yellow** (carried by a member who can use it, but not usable now, which includes wielded passive items) and **green**
(usable now), and adds a text tag to each state as a second cue. Peter to say whether that reading is right.

#### 4. Panel clashes

*Question.* The left slot holds the party or inventory, but combat expands the party list into a selector. Can the
inventory still be opened mid-fight (for example for Lotus Dust or Holy Water)? The right side holds both Settings and the
Card Panel: can they show together?

*Answer.*

Once in 'combat mode' there should not need to be a requirement to show either the party or inventory panels.
The UI for combat should allow selection of any party member, stranger or artifact and update the 'card view'
for the selected card. Any card-specific actions should be available from the card view.

Settings and card panels are mutually exclusive, you can't display both at the same time.

#### 5. The manual and in-game help

*Question.* Inline hints "replace the manual", but the project keeps `manual.html` in sync with the game. Which is the
source of truth, and what covers new players while the help panel is removed and tutorial mode does not yet exist?

*Answer.*

The goal is to make the current manual redundant and unavailable, with any information it contains availabe
contextually within the UI. So yes, the manual data will need to become structured, although it still needs
to remain in-sync. The structured data should be source of truth, but we should retain the ability to generate
a complete HTML version of this data if required.

Tutorial mode will be covered in a future requirement - we can assume for now that a player knows how to
use the game, as if they had completed a tutorial.

#### 6. Other overlays

*Question.* "All overlaid panels will be affected", but the requirements only cover the main panels. What happens to
the trade modal, pickup screen, trap choice, Sorcerer's terms, Sibyl, notices and dice overlays, and the remaining
system controls (scoreboard, save, log, chat)?

*Answer.*

The card view should be used, wherever possible, to implement other overlays. There will still be a requirement
for some notices. Where an action absolutely most be taken (for example trap) then this should be implemented
in a blocking popup. Other scenarios, like Sibyl, should be driven off their card view. So the Sibyl actions
must be accessed from the card view of the Sibyl card. If you want to peek in the desk, you must know that
is something the Sibyl does without 'prompting' the player.

Remaining system overlays: chat is multiplayer, so out of scope for now. Other controls should land in the
settings panel.

*Assumed:*

- Treasure pickup and redistribution happen from the card view: the party leader selects a chamber artifact and
  chooses who carries it. This replaces the pickup screen and the trade modal.
- The blocking popups are the trap choice, game over and rule-critical choices such as the Sorcerer's terms. Dice
  rolls and outcome notices stay non-blocking overlays.

#### 7. Phone and narrow screens

*Question.* A left panel, a right panel and a central fight dialog will not fit on a phone. What is the plan?

*Answer.*

Once we've implemented the landscape oriented user interface we will decide how best to modify this for
portrait display in a future review. So this review is landscape only for now.

#### 8. Small items

*Question.* Which title is correct (*SORCERER'S CAVE* in the text, *THE SORCERER'S CAVE* in the mockup)? What does the
Book icon do? Where does the test panel go? How should the attacker's front line be chosen, given that the mockup shows
the defender's Frontline box?

*Answer.*

- Use the correct title, as now.
- the book icon usage isn't defined yet, this is a future requirement.
  *Clarification from Peter, since given:* the book icon "was there so that the player could force the right-hand side information
  panel to pop up (on top if necessary), or hide it away if it was hanging around unnecessarily."
  *Confirmed:* "on top" means the panel may float over the combat dialog. The summary mockup does this when the panel is
  forced from the Book icon. When a card selection opens it, it sits beside the dialog, which narrows to make room.
  *Confirmed:* the Book icon displays the card (the card panel). The T icon (previously called the "Text" icon) opens the
  test panel when test is enabled.
- we will need a test icon in the right-hand group that controls the current test panel.
- attacker flow should proceed as it currently does, with the user deciding their front line players by
  dropping them into open slots in the combat panel for pairing.

*Peter's reply (20261030):* the location of the Test icon is not a great concern, and it is "T" for test, not "Text". The
summary mockup shows the T icon only when test mode is on, and the test panel shares the right-hand slot.

#### Card View for any card (Peter, 20261030)

Source: [20261030-peters-response.md](20261030-peters-response.md).

- "Any card" means every card that can be clicked, large area cards included.
- Standing in the doorway of a newly revealed card still shows the Encounter version automatically.
- Clicking a revealed area card that is not currently being scouted shows a landscape "mini" of the area on the
  right, with a suitable text description.
- Descriptions can start terse, except for special chambers. The fuller story text is suggested as an optional
  "verbose descriptions" setting. Peter's examples:
  - Fogged: "You have not yet explored that area."
  - Revealed tunnel: "A tunnel, with exits North, West and East."
  - Revealed tunnel with demon: "A tunnel, with exits North and South. Something evil lurks in the darkness..."
  - Previously revealed empty chamber: "A chamber with exits West, East and South, and a secret stairway leading upwards."
  - Previously revealed non-empty chamber: the strangers are named, they are guarding something, and "You recall
    withdrawing from the entrance - they did not see you."
  - Previously visited non-empty chamber: "You recall approaching the strangers here ... They were indifferent to you."
  - Revealed special chamber: "Dark water churns here ... crossing the shallows risks the pull of the whirlpool."
- *Mockup:* new "Area card" scene. Clicking a revealed area on the board opens it; buttons on the card show each of the
  seven states, and a "Verbose descriptions" row in Settings switches terse and full text (special chambers always full).
- *Assumed:* the setting lives in Settings, and is off by default.

#### Items still open

- **Colour states:** iterate on the exact meaning of gray, yellow and green with real play (question 3).
- **Artifact classification:** the draft passive/active list needs a rules review (question 2).
- **Test icon location:** Peter says it is not a great concern; the mockup keeps the T icon in the right-hand group.
- **Area descriptions:** the Card View for an area needs the game to remember what the party did there (withdrew
  unseen, approached and found the strangers indifferent). Check what the state already records before building it.
- **Future requirements:** tutorial mode, portrait layout, multiplayer and chat.
