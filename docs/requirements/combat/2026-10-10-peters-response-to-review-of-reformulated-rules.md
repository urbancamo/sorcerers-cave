# Peter's Response to: Questions raised in: 2026-10-09 Review: Peter's Responses and the Reformulated Fighting Rules

`DATE: 10-OCT-2026`
`FROM: Peter`
`RESPONDS TO: [Review: Peter's Responses and the Reformulated Fighting Rules](2026-10-09-review-of-peters-responses-and-reformulated-rules.md) §5 (questions Q1 to Q10)`
`SOURCE: "2026-10-10 Peters response to Review of Reformulated Rules.pdf" (5 pages; kept beside this file but git-ignored, like every PDF under docs/requirements)`
`CONVERTED: 11-OCT-2026, wording verbatim. Only the layout is changed: lists, quotations and the rule-text edits are set as markdown. Peter's spelling is left as written. How each answer is applied: [review §8](2026-10-09-review-of-peters-responses-and-reformulated-rules.md#8-peters-response-of-10-oct-2026-and-how-it-is-applied)`

---

## Q1

Two-against-two in the front line (2v2) pairings are a feature of the reformulated rules. This arises because of the primary
objective to make the fighting rules serve equally well for both Solitaire and Player vs Player (PvP). In the consolidated
rules PvP, the defender is allowed to keep some creatures back from the deployment (provided that the defensive line can
meet all approaching unengaged attackers one-to-one). This differs from the consolidated rules Solitaire, where the defender
must deploy all unengaged creatures. This is what creates the possibility of 2v2 pairings.

Under the reformulated rules:

- Step c may inherit zero, one or more 2v2 frontline pairings persisting as tied outcomes from the previous round.
- Step d cannot create new 2v2 pairings – because the attacker in Step d must engage their unengaged creatures against the
  defenders line, one-to-one.
- In Step e, the player that still has unengaged creatures is free to deploy unengaged creatures into any legal position,
  including adding one fighter type creature into an existing one-against-two (1v2) match.

### Worked Example: A fight with no artefacts, no bonuses, no curses.

Attacker with 5 creatures attacks a defender with 4 creatures.

**ROUND 1**

Steps a & b

- Not relevant in this fight

Step c: Defender deploys:

- Giant, Troll, Lion, and Woman to the frontline.

Step d: Attacker picks targets, creating one-to-one matches:

- Dragon vs Giant, Ogre vs Troll, Woman-Hero vs Lion, Man vs Woman
- Leaving a Dwarf unengaged.

Step e:

- Attacker has one unengaged creature (Dwarf). Attacker deploys Dwarf to the frontline alongside Dragon, turning that match
  into a 2v1 from their perspective.

Step f: The match outcomes are:

- Dragon+Dwarf vs Giant = A tie, match persists.
- Ogre vs Troll = Troll dies, match is resolved.
- Woman-Hero vs Lion = Woman-Hero dies, match is resolved.
- Man vs Woman = Man dies, match is resolved.

**ROUND TWO**

Steps a & b are still not relevant in this fight

Step c:

- Dragon, Dwarf and Giant must stay where they are in the frontline.
- Attacker has one unengaged creature (Ogre).
- Defender has two unengaged creatures (Lion and Woman)
- Defender must put at least one creature into the frontline.
- Defender deploys Woman to the frontline.

Step d:

- Attacker picks targets, but there are no choices.
- Attacker creates a one-to-one match:
- Ogre vs Woman

Step e:

- Defender has one unengaged creature (Lion).
- Defender deploys Lion alongside Giant in the frontline, creating a 2v2 pairing.

---

## Q2

The reformulated rules are in error in Step g.
The two condition tests are better replaced by a description of the conditions which dictate that there is now no way to
continue fighting.

Change From:

```
IF (All matches are resolved) THEN (The fight is over, go to [4] Ending a Fight).
IF (The only remaining unresolved matches are stalemates) AND (Neither side has unengaged
creatures which could be deployed to break the stalemate) THEN (The fight is over, go to [4]
Ending a Fight).
```

Change To:

```
IF neither side has any creatures able to:
    1. Continue fighting a match.
    2. Be deployed to create a new match.
    3. Be deployed to break a stalemate.
THEN (The fight is over, go to [4] Ending a Fight).
```

---

## Q3

There is an error in the reformulated rules.
Agree that the wording should be changed:

A match stalemate = "Neither side can beat the other on any roll".

---

## Q4

There is an error in the reformulated rules.
Curses are missing. My mistake. "Step 3 f iii to be updated to include curse effects.

---

## Q5

There is an error in the reformulated rules.
Scroll is usable in any round when conditions are met and choosing the destroying variant.
Condition to be updated to:

```
IF (The attacking party is not a stranger party) AND (The attacking party includes a creature
carrying the Scroll and able to use the Scroll) AND (Eye-of-God is not present) THEN (The attacker
may choose to use the Scroll to destroy all enemies in this area that do not have innate magical
power i.e. fighters. Invulnerable creatures on level 4+ are not destroyed.)
```

---

## Q6

There are two omissions in the reformulated rules.

### Chest Spectre

The Spectre does not get surprise attack. My case for this is based on the Consolidated Rules:

> "...it attacks with a magical power of 5 and the turn ends after one round of fighting."

If the rule intended was:

> "...it surprise attacks with a magical power of 5, and the turn ends after one round of fighting."

then the rules could easily have been written that way – but they were not.

However, the Reformulated Rules do need to be updated to cover any fight that can be triggered by a Hazard card. The Treasure
Chest Spectre fight was an omission in the first version. Also the Ghoul fight needs to be covered.

### Blocked Retreat

Does not change any roles. It is not a new fight, as described in Consolidated Rules "Retreat":

> "A party may retreat by any doorway or stairway. However, if the way proves to be blocked by a dead end or by creatures from
> which the player wishes to withdraw, the party must return and fight another round in the same turn."

The attacker is still as previously determined. The fight was only interrupted in between rounds by a failed attempt to retreat.

---

## Q7

Yes. In casualty nomination, the principle is:

> "high roll = success, and the nominated creature dies"

This is necessary because of effects which can add (bonuses) or subtract (penalties) from the die roll.
This will never change, regardless of which creature the Fight Plan nominates, and regardless of Fight Plan defaults.

---

## Q8

Agree with Claude's summary conclusions from the debate:

1. A player party that includes a Dwarf my choose to fall down a Trap deliberately.
2. There is no "first fall" house rule.

### Supplementary Issue

Can a party with two Dwarfs guide past two Trap hazards drawn together?
The Consolidated Rules read:

> "A party which includes a dwarf may ignore a trap, but not two traps drawn in the same chamber."

Now by pure logic, the set of all parties that include a Dwarf is the same set as the set of all parties that include 1, 2, 3,
or 4 Dwarfs – so on the surface, it would appear that any party must fall down a second Trap - regardless of having
(potentially) many Trap experts available, not busy, and each in their own right capable of guiding past one Trap.

But that doesn't seem credible. To justify it, we would need to invent some reason as to why a second Dwarf suddenly loses its
guiding ability simply because the first Dwarf is busy guiding.

Perhaps a debate is needed?

---

## Q9

No definitive answer yet. Tentatively, the hope is that a candidate for "dumb deployment" may emerge from future developments
with Monte-Carlo and the pairing lab.

---

## Q10

If a stranger party survives a fight because:

1. The player party in the fight successfully retreated.
2. The fight ended in a stalemate, and the player party left the area.
3. The strangers won the fight by defeating the other player, but more player parties are still in the game which continues.

Then a subsequent fight in where the stranger party may include different creatures, is treated as a completely new fight, and
any artefacts are assumed to be now on the floor – not being wielded.

Step 2 "Stranger Fight Preparations" needs to be updated:

Change From:

```
IF (One of the parties is a stranger party) THEN:

    • Referring to their Fight Plan, the strangers decide how to allocate between them any
      artefacts they possess that are usable in a fight (Magic Axe, Magic Sword, Magic Shield,
      Magic Staff, The Ring). {See Fight Plan: Procedure: Default Loadout.}
```

Change to:

```
IF (One of the parties is a stranger party) THEN:

    • At this stage, all artefacts are assumed to be on the floor, guarded by the strangers.
    • Referring to their Fight Plan, the strangers decide how to allocate between them any
      artefacts they possess that are usable in a fight (Magic Axe, Magic Sword, Magic Shield,
      Magic Staff, The Ring). {See Fight Plan: Procedure: Default Loadout.}
```
