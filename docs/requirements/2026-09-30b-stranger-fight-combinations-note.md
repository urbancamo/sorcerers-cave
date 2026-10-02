# Stranger Fight Combinations — starting note for a separate requirement

This note records what was found while looking at a reported fight screen, so that the review of how strangers are
combined in a fight starts from facts. It is **not** a change request and nothing in the engine has been changed.

## What was reported

A party of a single Dwarf met hostile strangers: two Trolls, a Witch and a Wizard. On the fight screen the Witch and the
Wizard were both shown "+behind". The expectation was that the rules allow only one magic user behind a single
stand-off.

## What the printed rules say

From [Expanded Consolidated Rules PV2026.md](../rules/Expanded%20Consolidated%20Rules%20PV2026.md), the Fights section
(lines 254 to 326):

- **Who arranges the fight.** "The player involved in the fight lays out the stranger cards in a line, and pairs off his
  own fighting creatures against them. If the party is numerically larger than the group of strangers, the player may send
  two against one. If the group of strangers is larger, the player must send one against two; if he is still unable to
  engage all the strangers, he must fight the strongest combination."
- **Magic users in the background.** "Priests, wizards, witches, apprentice or scholar can either fight hand-to-hand,
  using their total strength, or remain in the background, adding their magical power to the fighting strength of a
  creature in the front line, or to the combined strength of two creatures fighting a single enemy. **Any number** of
  priests, wizards, witches, apprentice or scholar may combine their magical power against a single enemy in this way."
- **Strangers' magic users.** "Priests, wizards, witches, apprentice, scholar and the Sorcerer among strangers will
  normally fight hand-to-hand, except when the over-all strength of the strangers will be improved if they remain in the
  background."
- **The rules' own example.** A single hero meets a priest, a troll, a man and a dwarf. Unable to engage them all, the hero
  must engage the strongest combination: the troll and the man hand-to-hand, with the priest in the background, for a
  total strength of 9.

So the printed rule does **not** limit the background to one magic user. The expectation in the report is not what the
rules text says. (If there is a different source for a one-backer limit, it has not been found in `docs/rules`.)

## What the engine does today

Source: `packages/engine/src/combatPlan.ts`, `previewPlan` (line 231), and the engine spec SC-9.1-4 to SC-9.1-11.

1. The player submits a plan of matches. Each match is one or two front fighters against one or two strangers, never two
   against two (`groupTooBig`, `twoVsTwo`).
2. **Gang-up happens only when the party has no free fighter** (line 242). While any fighter is free, leftover strangers
   stay separate.
3. When the party is out of fighters, each lone fighter facing a lone stranger gets **one extra hand-to-hand stranger
   attached automatically**, chosen only from strangers with no magical power, strongest fighting strength first (lines
   248 and 256).
4. **Every other unengaged stranger that has magical power is folded into the background** of the first non-Spectre match,
   strongest magic first, and adds its magical power to the strangers' strength (lines 251 and 263, SC-9.1-11). There is no
   cap on how many.
5. Enemy match strength is the sum of each hand-to-hand stranger's fighting strength plus magical power, plus the magical
   power of every background caster (SC-9.3-5).
6. Spectres and Demons are magic-only and are never attached or backgrounded this way.
7. The "must engage every stranger a free, capable fighter could fight" check (`mustEngageAll`, line 163) only applies
   while a fighter is still free. With a lone fighter it never applies.

## Worked example (run against the engine)

The reported fight: a lone Dwarf against Troll, Troll, Witch, Wizard. Creature values: Troll fighting strength 4, magic 0;
Witch 1 and 4; Wizard 2 and 5.

| The Dwarf targets | Hand-to-hand | Background casters | Enemy strength | Left idle |
| --- | --- | --- | --- | --- |
| a Troll | Troll + Troll | Wizard + Witch | **17** | none |
| the Wizard | Wizard + Troll | Witch | 15 | a Troll |
| the Witch | Witch + Troll | Wizard | 14 | a Troll |

Targeting a Troll reproduces the reported screen, and it is the strongest arrangement the strangers can make, so it fits
the printed rule.

A second case, a lone Dwarf against a Wizard and a Witch:

| The Dwarf targets | Hand-to-hand | Background casters | Enemy strength |
| --- | --- | --- | --- |
| the Wizard | Wizard | Witch | 11 |
| the Witch | Witch | Wizard | 10 |
| the Wizard and the Witch | Wizard + Witch | none | **12** |

Here the engine does let the player put two casters hand-to-hand, by choosing both as targets. Only the *automatic*
gang-up skips casters.

## Observations and open questions for the requirement

1. **Is "any number of backers" the intended behaviour?** The printed rule says so, and the engine matches it. A
   house-rule limit (for example one background caster per match) would be a deliberate change to SC-9.1-11 and to the
   fight screen.
2. **The player can pick a weaker combination than the rule allows.** With a lone fighter, the rule says "he must fight the
   strongest combination". The engine accepts any legal target, including ones that leave a Troll idle and give the
   strangers 14 or 15 instead of 17. `mustEngageAll` does not catch it, because no fighter is free. Is that leniency
   intended, or should the strongest combination be enforced, or chosen for the player?
3. **The automatic attachment ignores casters.** Step 3 above attaches only strangers with no magic as the extra
   hand-to-hand foe, and step 4 backgrounds every caster. The rule says a stranger caster fights hand-to-hand "except
   when the over-all strength of the strangers will be improved if they remain in the background". The engine never
   compares the two options. In the reported example backgrounding is the stronger choice, but that is not guaranteed
   (for instance, a Sorcerer is 4 + 9 = 13 hand-to-hand against 9 in the background).
4. **Who decides the strangers' side?** The rule has the player arrange both sides. The engine arranges the strangers'
   extras itself. The requirement should say which behaviour is wanted, and whether the strangers should play to their own
   best advantage.
5. **Player-against-player fights** (multiplayer) use separate logic (`multi-fight.ts`, where the defender assigns
   background casters), so anything decided here needs checking against it.
6. **Extension kit creatures** (Witch, Scholar, Apprentice, Demon) are treated as casters by their magical power. The
   requirement should confirm this is wanted, since the printed list of backers names priests, wizards, witches,
   apprentice and scholar explicitly.

## Suggested scope for the requirement

- Decide questions 1 to 4 and write the intended rule down in one place.
- Cover strangers' combinations only: the automatic gang-up, the background, and the "strongest combination" rule.
- Keep PvP fights, retreat and surprise out of scope, but check they agree with the result.
- Update the engine spec (SC-9.1-4 to SC-9.1-11, SC-9.3-5) and the fight screen in the same change, as the repository
  `CLAUDE.md` requires for any engine change.

## Not part of this note

The report came from the game `QEUP`, but its log has no moves, so the actual fight was not replayed. The worked
examples above use the engine's own preview function with the same strangers.
