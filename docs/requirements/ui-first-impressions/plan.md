# UI First Impressions — Plan

Source: [2026-11-02-ui-first-impressions.md](2026-11-02-ui-first-impressions.md) (Peter, games RMUP and GWBE, 2026-10-31).
Status: **approved 2026-11-02 with the recommended answers to the open questions; building.** The notes number two items [6]; here they are **6a** (Apprentice) and **6b**
(Troll with a Treasure Chest). "Book pane" is the card panel (Book icon, right slot).

## What the notes add up to

Eight comments, but five of them (4, 6a, 6b, 8, and part of 5) are one problem. The earlier UI review decided that
standing in the doorway of a new card shows the **Encounter version of the card panel** automatically, with its actions
(Peter, 20261030; `ui-review/requirements.md`, "Card View for any card"). It was built in stages, and the worklog records
the last stage as not done: *"the Withdraw / Attack buttons are still in `EncounterPanel`, not on the card"* and *"Leaving
the treasure stays in the encounter panel."* So today a decision is split across two surfaces: the card panel (right)
describes and the old `EncounterPanel` (centre, lower edge) acts. Peter is meeting the seam. **That is a gap against the
agreed design, not a matter of taste, so the plan addresses it rather than defending the UI as it stands.**

| # | Peter's point | Verdict | Size |
|---|---|---|---|
| 1 | Party pane open by default at the Gateway | Address | S |
| 2 | Save / Game log / Abandon do not belong in the lower dock | Address | S |
| 3 | "Move or drop treasure…" is pointless when the inventory is empty | Address | XS |
| 4 | Pickup pane lingers; "Leave the treasure" is not in the Book pane | Address (part of the encounter move) | M |
| 5 | "Move X to a member, or Drop here / Cancel" when nobody can take it | Address, as Peter suggests | S |
| 6a | Apprentice: a stray Stranger card in the Book pane, actions in the old pane | Address (encounter move) + reproduce | L |
| 6b | Troll + Chest: heavy informational "Actions" pane after recruiting | Address (encounter move) + reproduce | (in 6a) |
| 7 | No way to see the expanded party view unless managing inventory | Address, but with a different control than a third icon | M |
| 8 | Bell Rope: no Encounter in the Book pane | Address (encounter move) | (in 6a) |

Nothing here is defended as-is. The one place the plan departs from Peter's wording is item 7 (below).

## The items

### 1. Party pane open by default (S)
`GameScreen` starts with `leftSlot = null`. Start a new or resumed game with `'party'` open, so the player sees the party
they chose. Open it **once per game**: if the player closes it, it stays closed (including across levels). Landscape only,
as the rest of this review. A fight already forces the party list, so nothing changes there.
Tests: opens on game start; stays closed after the player closes it; not reopened on a new level.

### 2. Lower dock: keep only the camera controls (S)
Save and Game log already exist in **Settings** (`SettingsPanel`), so the dock buttons are duplicates. In the shell,
stop passing `onSave`/`onLog` to the dock and hide its Quit button; **add Abandon to Settings**, behind a confirmation
(it ends the game and tallies the score, so it should not be one tap). The dock is then Snap / Orbit / Levels, which is
one job. The old HUD in **multiplayer** has no Settings pane, so `CaveHud` keeps the buttons when `shell` is absent.
Check while building: how solo quit is wired in the shell today (`onQuit` / `resetBtn`), so Abandon in Settings uses the
same path and the `quit-abandon` help topic still holds.
Tests: Settings has Abandon with a confirm; dock has no Save/Log/Quit in the shell; multiplayer dock unchanged.

### 3. Hide "Move or drop treasure…" when nothing is carried (XS)
`InventoryPanel` shows the button whenever `onManage` is passed. Show it only when `rows.length > 0`. (With item 7 this
button may go away entirely; see there.)

### 4 / 6a / 6b / 8. One surface for a decision: the encounter moves into the card panel (L)
**Diagnosis.** `EncounterPanel` is rendered at the centre of the lower edge for the phases `encounter`, `pickup` and
`medusa`; `ChamberPickup` (right slot) handles giving treasure but not leaving it, so both show during a pickup (4). On
arrival the 3D scene reports an automatic card via `onSelectCard`; for an Apprentice that card was the wrong one (6a —
reproduce first, below). After a recruit the panel keeps showing its information lines and a list of actions (6b), and
special chambers such as the Bell Rope get no Encounter card, only bottom-edge buttons (8).

**Change.**
- Add an `encounter` kind to the card panel's `Selected`. While the game is in an encounter, pickup or Medusa pause, the
  card panel shows: the chamber's description (the area text we already build for special chambers, plus the strangers
  named), the stranger card(s), and the **action buttons**. They are the ones from `EncounterPanel` (Test, Attack,
  Withdraw, Retreat, Leave the treasure, Descend the Chasm, Draw from the Well, the Medusa pause, and so on), unchanged
  in behaviour.
- While a decision is pending it **takes the right slot**, even from Settings or Help (it is a must-act choice, the same
  rule the Medusa pause already follows). Settings or Help come back when the decision is done. Today the pickup pane is
  hidden if Settings is open, which would leave no buttons at all if `EncounterPanel` were removed.
- The pending encounter outranks the automatic card, so a Stranger from another chamber can no longer appear in its place.
- `ChamberPickup` gains **Leave the treasure**, so a pickup is decided in one place (4).
- Remove `EncounterPanel` from the centre once nothing depends on it. Where there is **no decision** (6b, after the
  recruit) nothing is shown at the bottom; the information lives in the card panel. Fights are unchanged (their own surface).
- Clicking a card elsewhere still works: it shows that card, with a "Back to the encounter" row while a decision is pending.

**Reproduce first.** Replay games **RMUP** (Apprentice) and **GWBE** (silver, Troll + Chest, Bell Rope) from their codes.
Confirm the cause of the stray card in 6a and of the heavy pane in 6b before building; the design above assumes the
auto-selection picks the wrong card and that the pane is `EncounterPanel` rendering after the decision is made.

**Phasing inside this item** (each shippable):
1. 4a: `Leave the treasure` on the pickup pane; the old pane skips the `pickup` phase when `ChamberPickup` is up. (Fixes 4.)
2. 4b: encounter kind on the card panel, with description and stranger card, no buttons yet; pending encounter wins the
   auto-selection. (Fixes the stray card in 6a.)
3. 4c: move the action buttons across, take the right slot, delete the centre pane. (Fixes 6b and 8.)

Risk: `EncounterPanel` is 220 lines of confirm pickers and special-area actions, with many tests pinning its buttons.
They move rather than disappear, so expect a large but mechanical test migration. Multiplayer keeps the old HUD and its own
panel; **out of scope** here.

### 5. Move / Drop prompt (S)
The prompt "Move X to a member, or Drop here / Cancel" lives in the legacy `PartyPanel` (the "Move or drop treasure…"
route). The item card already does this properly in `ItemActions`, where the *Give to* chooser appears only if someone can
carry the item. Adopt Peter's suggestion there: always show **Give to…**, **disabled with a tooltip** ("Move item to a
party member that can carry it") when no one can, so the player can see why it is unavailable. **Drop here** stays.
Then retire the legacy prompt: the worklog already says `PartyPanel`'s moving and dropping stays "until the artifact card
takes over", and it now has. This also resolves item 3.

### 7. Seeing the whole party (M) — proposed alternative to a third icon
Peter is right that the summary list cannot answer "is my party strong enough?". The expanded party view
(`PartyPanel`: strength, magic, load, charisma per member) should be reachable without managing inventory.
Rather than a **third top-left icon** (he has no icon in mind), I recommend an **expand control (⤢) on the Party pane's
heading**, which opens the full view and closes back to the list:
- it keeps the left group at two mutually exclusive occupants, as the review specified;
- the old roster had the same ⤢, so players have met the idea; Peter's first sentence in [7] asks for exactly this;
- a third icon is a fallback if Peter prefers it (a shield or crossed-swords glyph would suit "strength").
With the legacy move/drop prompt retired (item 5), the expanded view becomes browse-only, so it no longer needs a mode for
managing. **Question for Peter:** expand control or third icon?

## Order of work
1. Items 1, 2, 3 (small, independent, no risk to play).
2. Item 5, then item 7 (they share the retirement of the legacy prompt).
3. Replay RMUP and GWBE to confirm the 6a/6b causes.
4. Item 4 in phases 4a → 4b → 4c.

Each step is test-first, with typecheck and the whole suite green before the next.

## Documentation to update with the work
`apps/web/src/manual/`: `hud-tour` and `controls` (default party pane, Abandon in Settings, expand control),
`inventory-status` and `item-actions` (Give to disabled; Move-or-drop button gone), `pickup-capacity` (Leave the treasure
on the pickup pane), `encounter-choices` (actions now in the card panel). Per `CLAUDE.md`, no engine change is planned, so
`engine-spec.md` is untouched.

## Decisions (2026-11-02, Mark: all recommended defaults accepted)
1. **Item 7:** expand control on the Party pane, or a third icon? (Recommended: expand control.)
2. **Item 4:** may a pending encounter take the right slot even when Settings or Help is open? (Recommended: yes.)
3. **Item 2:** Abandon behind a confirmation? (Recommended: yes.)
4. **Item 1:** open the Party pane once per game, or every time a game is loaded or resumed? (Recommended: once per
   load, and not again after the player closes it.)

## Not covered
Multiplayer's older HUD (no title bar, its own panels) and portrait layouts, as in the earlier review. No browser check
has been done on any of this; the causes in 6a and 6b are inferred from the code until the replays confirm them.
