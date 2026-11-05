# Wielding Weapons: specification

> Status: APPROVED 2026-11-05 (Mark confirmed Q1-Q3 as proposed). Source: `2026-11-05-wielding-weapons.md` (rules and answers).
> Tasks: `2026-11-05-wielding-weapons-tasks.md`. **[MY CALL]** marks a default I chose; Mark has accepted them.

## Goal

An item's combat benefit applies only when its holder is **using** it: wielding a weapon or shield, or wearing the Ring or
Talisman. Carrying alone gives nothing. Today the engine is possession-based (SC-7.3-13): any member who holds the item gets
the bonus, and "borne" only decides whether the item is lost with a fallen holder.

## Rules

| # | Rule |
|---|------|
| W-1 | An item picked up (found, dealt, traded, moved) is **carried**, never in use. Handing over or dropping an item takes it out of use (already true). |
| W-2 | **Wielded** items: Magic Sword, Magic Axe, Magic Staff, Magic Shield. **Worn** items: The Ring, the Talisman. Worn items are in addition to wielded ones and use no hand. |
| W-3 | Each member has two hands. A member may wield **at most one attacking weapon** (Sword, Axe or Staff) plus the **Shield**: so at most two hands are ever in use. |
| W-4 | A weapon's combat effect applies only while it is wielded (Sword, Axe, Staff) and the Shield's ward only while wielded by an eligible bearer. The Ring's and Talisman's effects apply only while worn. |
| W-5 | The Eye of God works by being carried (unchanged). Every other artefact (potions, Balm, Lotus Dust, Flute, Carpet, Holy Water, Scroll, Elixir...) is unchanged. |
| W-6 | **No automatic wielding or wearing**, ever: not on pickup, not before a fight. The player prepares the party. Wielding and wearing stay blocked during a fight (as `setBorne` is today). |
| W-7 | **No item is lost with its holder.** Every weapon is treated as carried for death and petrification: it spills to the floor like any carried item (SC-7.2-13, SC-9.5-11). The old "borne items are lost with the body" rule goes. |
| W-8 | Strangers are unchanged (their loadout, SC-9.6-4, already models what they bear). |

## What "effect" covers (my reading of W-4)

- **Sword** wielded: +1 (Man, Woman) or +2 (Hero) strength, and the bearer can fight Spectres.
- **Axe** wielded: +1 (Man, Woman, Hero) or +3 (Dwarf) strength, and the bearer can fight Demons. **[MY CALL]** the Spectre and Demon abilities need the weapon wielded, like the bonus.
- **Staff** wielded: +1 (Priest) or +2 (Wizard) magic power. Its non-combat powers (a Wizard's Staff wards off Medusa and reanimates the stoned) also need it wielded (Q1, decided).
- **Shield** wielded by a Man, Woman or Hero: nullifies the matched opponent's magic, and takes 2 off a Sorcerer or Apprentice.
- **Ring** worn: +1 to the party's rolls, and the bearer is invincible on level 4+.
- **Talisman** worn by any living member: wards Zombies and Ghouls, and on level 4+ Spectres. one wearer protects the whole party (and others in the area), as the card's "party displaying it" suggests (Q2, decided).

## Design

- **State.** Keep the existing per-member `borne` list as the single "in use" list. Which word the UI uses (wield or wear) comes from the item. `BORNEABLE` becomes the usable set `[3, 9, 17, 20]` wielded and `[10, 7]` worn. The Talisman is new to it. **[MY CALL]** Left and right hands are not stored: the only legal combinations (one attacking weapon plus the Shield) never need to say which hand, so the UI may show hand icons but state stays one list.
- **Action.** `setBorne` already bears and stows. Add the W-3 refusal ("already wielding the Magic Sword") and the Talisman. The member must still be living, and the item eligible for the bearer where an eligibility rule exists (Shield, Ring, Sword and Axe benefits). **[MY CALL]** Wielding an item that gives that member no benefit (a Sword in a Wizard's hands) is allowed, but it still occupies the attacking-weapon slot.
- **Engine reads.** Replace "holds" with "in use" for the party in: `combat.ts` (legacy strength and MP), `combatPlan.ts` (Spectre and Demon predicates, modifier lists), `revisedRound.ts` (match modifiers), `effects.ts` (Ring, Talisman, Shield), `hazards.ts` (Talisman wards Ghouls and Harpies, Staff against Medusa if Q1 says wielded). Strangers keep reading their gear.
- **Loot.** Remove the borne carve-out in `loot.ts` (`spillCarried`, `sweepFallen`), the multiplayer trade and zombie code that special-case it, and the "petrifies with its bearer" behaviour for the Axe and Shield.
- **Web.** Party panel and inventory: buttons Wield / Stow and Wear / Remove, a state tag on each item (Carried, Wielded, Worn), and the strength badge and match breakdown showing only what is in use. A fight screen note when a carried item would have helped ("Magic Sword carried, not wielded") **[MY CALL]**: information only, it never acts.
- **Docs.** Engine spec (SC-7.3-13, SC-7.2-13, SC-9.5-11, the combat rows, SC-EXT-26/27), the manual (`treasure.ts`, `house.ts`, `play.ts`), and the rules text in `docs/other`.

## Tests

- Engine: each bonus applies only when in use (Sword, Axe, Staff, Shield, Ring, Talisman) and not when merely carried; the W-3 refusal; no auto-use after pickup, trade or a won fight; a fallen holder's weapons spill; the Eye still works carried.
- Update existing tests that give a member an item and expect the bonus. Golden and conformance files will change where a bot or Test Mode relied on possession; regenerate them (`vitest -u`) and review the diff. Saved games are not preserved (Mark, Q6).
- Web: wield and wear controls, the state tags, the badge, the fight note.

## Decided questions

- **Q1.** Does the Staff's Medusa ward and reanimation need it wielded? Yes ("in the hands of a Wizard"). Medusa fires on entry, so the Staff must be wielded before the party walks in.
- **Q2.** One Talisman wearer protects the whole party? Yes.
- **Q3.** Should the Test Mode panel offer ready-wielded items, so tests do not have to click through wielding? No change to Test Mode; items given there are carried.
