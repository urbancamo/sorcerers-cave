# Revised combat — what to test

Summary for Peter of what has been built on the `combat-review` branch, following your reformulated fighting rules (14 Oct). It describes what a player sees and does, so you can check it against your intent. Anything marked **?** is my reading of the rules and is the thing most worth checking.

**Status:** provisional. Games played with the revised combat are not recorded on the leaderboard. The revised combat is switched on for the whole test site (it is a server setting, not a party-screen tick box), so every new game uses it.

## How a fight now plays

A fight is a series of rounds. Each round asks for a few decisions in turn, and **each combat sits on its own row**, as in the old battle plan: the strangers on the left, the strength tally in the middle ("their strength vs yours"), your side on the right.

1. **Scroll** (if you attack and carry it) — asked before the round: destroy the unmagical strangers, take the surprise bonus, or decline.
2. **Defender puts creatures in the front line.** If you defend, drag creatures into the front-line box (or tap them).
3. **Attacker makes the initial pairings.** If you attack, tap one of your fighters, then the foe it will face. Press **Confirm Initial Pairings** (there is an **Undo pairings** button).
4. **Spare creatures join in.** Drag a spare creature onto a match to make it two against one (never more), or drag a Priest/Wizard into the "behind" slot to lend magic. The strength tally updates as you place them. Press **Fight** (or **Undo moves** first). You don't have to move anyone.
   - **A look before the dice:** if the strangers have paired up with your creatures (or sent spares into matches) and you have had no decision since, the screen pauses once so you can see the arrangement. Only **Fight** (or retreat) is possible then.
5. **The matches are rolled**, one dice pair per match, then results.

Other things to look for:
- The **leader** of the strangers is shown top row, right-most card.
- If the fight is a stalemate (nobody can hurt anybody), you are told, and your only way out is to retreat.
- The strangers' side is played by the computer, which makes its own pairings and moves.

## The Ghouls (new behaviour)

- A **"Ghouls attack!"** announcement appears before anything is rolled, with a reminder of what the Ghouls do. Press **Face the Ghouls**.
- There is **one Ghoul (strength 2) for each creature in your party**, no surprise either way.
- Your creatures are **matched to Ghouls automatically** (no choice, as they are all identical). You see each of your creatures beside its Ghoul while the dice roll.
- **One round only, one on one.** Everything is rolled once. A creature that loses its duel is slain; any Ghoul left standing then withdraws and the combat is over.
- **There is no retreat from the Ghouls.** They are treated as a hazard.
- The Ghouls stay in the chamber after you beat them, and attack any party that comes back.
- Any real strangers in the chamber wait, and are met after the Ghouls are beaten.
- The Talisman still wards them off.

## Hazard order

When several hazards are drawn in one chamber they now resolve in your order: **Earthquake, Spell, Harpies, Medusa, Ghouls, Quarrel, Desertion, Mutiny, Trap** — with the **Trap always last**, whether or not the extension kit is on (the kit hazards Spell, Harpies, Quarrel and Desertion only appear when the kit is on).

Worth testing specifically — **Ghouls and a Trap in the same chamber:**
- You fight the Ghouls first.
- Once they are beaten you **fall through the trap**. A popup tells you so after you press Continue on the last combat round, and the cave view then shows only the new level.
- With a Dwarf to guide you (and the trap-rules switch on), the choice to be guided past or fall comes **after** the Ghouls fight.
- **?** If the Ghouls kill the whole party, the trap never matters. If the Ghouls are beaten, the fall always happens (you cannot retreat from them).

## Other rules carried over from your notes

- **The Scroll** is no longer used up; asked each round while it applies (human present, no Eye of God, not already used in this area).
- **The Treasure Chest's Spectre** fights one round, with no surprise, then vanishes.
- **The Apprentice** no longer turns the moment the Sorcerer dies: you choose to leave the area (she is left behind, harmless) or stay (she turns and everyone attacks with surprise).
- **Dwarves and traps:** each Dwarf can guide the party past one trap.

## Things to check in particular

1. Is the **order of the steps** right — in particular that pairings come first, and spare creatures join in a second step rather than at the same time?
2. Does the **strength tally** match what you expect when a second creature or a caster is added to a match?
3. Is it right that **Ghouls are paired automatically** and cannot be retreated from?
4. Is **Ghouls then Trap** the sequence you intended (fight first, then fall)?
5. Anything where the screen asks for a decision the rules don't, or skips one they do.

If something looks wrong, the four-letter game code (shown in the corner of the game screen) lets me replay exactly what happened.
