# Questions for Peter — Combat Rules

`DATE: 04-OCT-2026`
`FROM: Mark`
`RESPONDS TO: your response of 03-OCT-2026 ([response-to-feedback-20261003.md](../../rules/response-to-feedback-20261003.md))`
`RULES REFERENCED: [Each Round is Fought](../../rules/each-round-is-fought.md), [Fighting a Match](../../rules/fighting-a-match.md), [Strangers Default Loadout V2](../../rules/strangers-default-loadout-v2-20261003.md), [Expanded Consolidated Rules PV2026 V2](../../rules/Expanded%20Consolidated%20Rules%20PV2026%20V2.md) ("Consolidated Rules" below)`
`CHECKED AGAINST: the Consolidated Rules, 04-OCT-2026. Where they already answer or constrain a question, the relevant text is quoted.`

Thank you for the detailed answers. Your corrections are in: the Thief and Woman order, the Eye being always on in its area, "uses artefacts as", Hero 5 and Spectre 5, and the Sorcerer house rule as Addendum note #4.

Before the software is changed, I need a few more rulings. **Every question has a default.** If the default is right, reply "agree" and I'll use it; if not, give me the rule. The questions are in the order they matter, most blocking first. I've kept them in rules language, so you don't need the technical spec.

One thing underlies several questions. In the Consolidated Rules, for a fight with strangers the **player** lays out the strangers' cards and pairs off both sides (*Setting up the fight*), and every round ends the player's turn. *Each Round is Fought* changes that: the strangers now deploy and engage, and the roles alternate. The questions below ask how the two fit together.

---

## A. The start and end of a fight

The overview lists *Triggering a Fight* and *Ending a Fight*, but there is no document for either. These two are the biggest gap.

**1. Who attacks in round 1?** *Each Round is Fought* has the attacker and defender alternate. The Consolidated Rules give the following starts (*Encountering Strangers*, *Advantage of Surprise*, *Retreat*). For each, who is the attacker in round 1, and who has the surprise bonus?

| How the fight starts | Default attacker | Default surprise |
|---|---|---|
| The party approaches and the strangers react **hostile** ("they immediately attack") | Strangers | Strangers +1 ("Strangers gain the advantage when they attack on being approached") |
| The party **attacks** straight after entering by a new doorway or stairway, or by magic carpet | Party | Party +1 |
| The party **attacks** strangers found **indifferent**, on a later turn (or after re-entering, or after a dead end) | Party | None (the Scroll can give it back, as the rules say) |
| A Demon appears in the area the party just left (extension kit) | Strangers | Strangers +1 |
| A **blocked retreat** ("the party must return and fight another round in the same turn") | Strangers | None |

Does the role then swap **every** round? The Consolidated Rules only say that for fights between parties ("the first round is fought during the attacker's turn, the second in the defender's turn"). *Default: yes, strict alternation.*

A related point: the Consolidated Rules say "each round ending a turn of play". With alternation, does a round in which the **strangers** attack still end the player's turn? Does the player get the choice to retreat or continue at the start of **their own** turn only? *Default: yes to both.*

**2. How does a fight end?** The Consolidated Rules say a fight continues "until all the strangers or all of the exploring party have been killed or put to sleep, or until the party chooses to retreat and does so successfully", and that a retreating party "must leave behind any treasure dropped in the area, including artefacts carried by creatures which have perished". I'll implement exactly that. What's missing is the detail, so I'll keep today's behaviour unless you say otherwise:
- party wiped out: the game is over; strangers cleared: the party wins and takes the treasure;
- a retreat leaves the strangers hostile for the rest of the game ("remain hostile to it for the rest of the game");
- strangers never retreat;
- sleeping creatures (Lotus Dust, or a Dragon lulled by the Flute) stop counting as able to fight. *Default: yes.*

Are *Wrap Up the Round* and *Ending a Fight* steps for the whole round or fight, rather than for each match? *Default: yes.*

---

## B. Forming the matches

**3. The limit of two on the front line.** The Consolidated Rules allow "two against one" when the party is larger, and "one against two" when the strangers are larger, but never mention two against two. *Each Round is Fought* says the front line of a match "does not exceed two". Is that two **per side**, with 2v2 not allowed? *Default: two per side, 2v2 banned.*

May an unengaged creature on the larger side join a match that is **already engaged**, as the second front-line creature? The Consolidated Rules example says so ("the hero could turn and fight alongside the survivor of the other match"). *Default: yes, for either side.*

**4. When do magic users go to the background?** The Consolidated Rules already say:
- a magic user can fight hand to hand or "remain in the background" adding its magical power to a front-line creature (or to two fighting a single enemy);
- "any number" may combine against a single enemy;
- among **strangers** they "will normally fight hand-to-hand, except when the over-all strength of the strangers will be improved if they remain in the background".

I'll use all three as written. The open points are only these:
- In a fight between parties, casters go behind the line only "if his party has the numerical advantage". Does the same condition apply in a fight with strangers? *Default: no, but a background caster needs a front-line creature on its own side to support.*
- Casters are placed in step (d) by the larger side, and with the front line by the smaller side. *Default: as stated.*

**5. Do casters count towards the defender's minimum?** "The defender must deploy at least as many creatures as the attacker has." The Consolidated Rules treat casters as fighters ("can either fight hand-to-hand, using their total strength, or remain in the background"). Do they count as one of those deployed creatures? *Default: yes.*

**6. Spectres and Demons.** The Consolidated Rules say:
- a **Spectre** can be fought by magic users "not otherwise engaged", or by a Man, Woman or Hero bearing the Magic Sword;
- a **Demon** can be fought with magical power, or by a bearer of the Magic Axe;
- a Magic Shield bearer "may match himself against a spectre or demon", and it is "simply ignored for that round; neither it nor the shield bearer will be killed";
- if the party has no magical power to pit against a Spectre, "the strongest creature in the party must be matched against the spectre, and is automatically slain".

I'll use these as written (Sword for the Spectre only, Axe for the Demon only, Shield for either). The open point is **timing**: is "the strongest creature is slain" decided in step (e), before the other matches are fought? *Default: yes.*

---

## C. Winning, losing and casualties

**7. Who is spared when the strangers lose a two-creature front line?** For the party, *Fighting a Match* has the player nominate a creature, and "on 4, 5, 6, the loser gets their choice and that creature dies"; on 1–3 the **other** creature dies. For strangers, the winning player nominates, and on 4, 5, 6 "the **other** (not nominated) creature dies". So the nominated stranger **dies on 1–3 and is spared on 4–6**, which is the opposite way round to the party rule. Is that intended? And whose Ring gives the +1 to that roll? *Default: as written, so the nominated stranger is spared on 4–6; the losing side's Ring gives the +1.*

**8. Does the Ring-bearer have to be fighting?** The card says "adds 1 to the die rolls of your party", and the rules say the bonus applies "even if the bearer is slain in that round". Is any living holder enough, even one not in the match? (The invincibility on level 4 and deeper is separate: that bearer does fight.) *Default: any living holder.*

---

## D. Scroll and consumables

**9. The Scroll.** The card says it "only works when your party is attacking, not when it is being attacked". Your own note in *Each Round is Fought* asks whether it works only before the first round or before any round.
- With rounds alternating, does "attacking" mean the **fight** was begun by the party, or that the party is the **attacker in this round**? *Default: the attacker in this round.*
- Is the "destroy" variant usable in any round the party attacks, and the two surprise variants (double or add) only before round 1, since surprise lasts only the first round? *Default: yes.*

**10. Consumables when the strangers attack.** The Consolidated Rules say a Strength Potion "can be taken immediately before any round of fighting" and Lotus Dust "may be used before approaching strangers, or before any round of fighting". Does that still hold in a round where the **strangers** are the attacker, so the player may use them while only deploying? *Default: yes, as the cards say.*

**11. Hidden Cards variant.** The rules say a player shows only creatures and any artefact "being used", plus "the top edges of any other treasure cards". May the strangers' decisions use anything beyond that? *Default: no. They see only what a human opponent would see, and nothing face down.*

---

## E. How strangers use artefacts

**12. When is the loadout run?** The Consolidated Rules say strangers "will use the ring, magic staff, and magic sword/axe/shield to best advantage" when the fight is set up, and that an invulnerable stranger "will disappear with the ring, leaving other treasure behind". They don't say when equipping is done again. *Default:*
- at the start of the fight;
- again at the next deployment after a bearer dies, or when more strangers arrive (Mutiny deserters, a Demon);
- no picking up of artefacts dropped in the middle of a fight.

**13. What does *Stranger Fight Preparations* include?** The overview names it as a step for the stranger party. Is it the artefact loadout only, or also an opening stance such as who starts in the background? Does it run once, before round 1 only? *Default: loadout only; once, plus the re-runs in question 12.*

**14. Is there a default pairing procedure?** The only guidance the Consolidated Rules give for how strangers pair is the caster rule in question 4. Your loadout document tells the strangers how to **equip**. Is there a matching procedure for how they **pair** (who deploys, who they engage, who stands back)? If not, I'll derive one from "maximise the strangers' advantage within the rules" until you supply one. *Default: derive it.*

**15. Bonus wording and the Ring.** Does a bonus follow the **card text**? For example, the Sword gives strength only to a Man, Woman or Hero ("1 to the Strength of the MAN or WOMAN who bears it, or 2 to a HERO"), so a Priest-class stranger holding it gains nothing except the right to fight a Spectre. *Default: yes, card text.*

The Ring card lists a **Dwarf** among those who may wear it, but the who-can-use table allows a Dwarf **stranger** and not a Dwarf **ally**. The card text supports the stranger column, so I take the ally blank to be a typo. *Default: typo; both may.*

---

## F. Loadout points still open from before

**16. Wording in the loadout.** Step 5 (the Ring) says "each creature in the party". Do you mean the **stranger** party? And is the loadout meant to run at the trigger given in question 12? *Default: stranger party; yes.*

**17. The Staff bonus.** The card says "Increases the magical power of a PRIEST or WIZARD by 2". The game gives a Priest **+1** and a Wizard +2. Is the Priest +1 a deliberate house rule, or should the Priest get +2? This changes fight results, so I'd like your confirmation before I touch it. *Default: Priest +2, as the card says. A Witch or Scholar (who "use artefacts as a PRIEST") and the Sorcerer (as a Wizard) follow.*

**18. A transcription point.** In loadout V2, Shield item 8 reads "Man already not bearing either Magic Sword or Magic Axe". I've read it as "Man not bearing either Magic Sword or Magic Axe". Is that right?

**19. Woman-Hero.** The Consolidated Rules say "the woman-hero has all the capabilities of a woman and a hero". I take that to mean the **union**: she can bear and gain whatever a Woman or a Hero could. Please just confirm. *Default: union.*

---

## G. A small data point

**20. Woman Hero's reaction.** Her entry reads "Reacts: 1-3 Hostile. 3-6 Friendly." The 3 appears in both. Which is intended: 1–3 hostile and 4–6 friendly, or 1–2 hostile and 3–6 friendly? The Hero card is "1-3 Hostile. 4-6 Friendly". *Default: 1–3 hostile, 4–6 friendly, as for the Hero.*

---

## H. For later, not blocking

**21. Several parties.** The Consolidated Rules say parties who want to fight a common enemy "must form a union" under one commander, and that a party entering an area where a fight is in progress "cannot interfere" unless it joins the union. So I'll take it that a fight with strangers is always one party or one union, and the commander deploys it (with "strongest fights strongest" settling any disagreement). Is that right, or can two separate parties ever fight the same strangers? *Default: one party or union at a time.*

---

### How to reply

A short list is enough, for example: "1 agree, 2 agree, 3 agree, 4 agree, 5 agree …". Anything you change, I'll record in the rules documents and the specification so it stays your decision, not mine.
