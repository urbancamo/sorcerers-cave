# Review: Peter's Responses and the Reformulated Fighting Rules

`DATE: 09-OCT-2026`
`REVISED: 11-OCT-2026 — Peter's answers to §5 are in [his response of 10-OCT](2026-10-10-peters-response-to-review-of-reformulated-rules.md) and are applied in [§8](#8-peters-response-of-10-oct-2026-and-how-it-is-applied)`
`REVIEWS: [Response to the 2026-10-04 questions](../../rules/response-to-questions-for-peter-20261004.md) and [Fighting Rules Reformulated, draft 20261008](../../rules/fighting-rules-reformulated-20261008.md)`
`AGAINST: [Questions for Peter](2026-10-04-questions-for-peter.md), the [pairing lab](../../../packages/pairing-lab) (rules.ts, sim.ts, policies.ts, scenario.ts), the [training spec](2026-10-05-nn-pairing-training-task-spec.md), the [Monte Carlo spec](2026-10-06-monte-carlo-pairing-spec.md) and the [findings report](2026-10-06-pairing-lab-findings-report.md)`
`NOTE: the engine statements come from the answers in the questions document (checked against the code on 05-OCT) and from the code read while preparing the trap debate. The engine was not re-audited for this review.`

## 1. Summary

Peter confirmed most of our Section A and accepted most defaults in Section B. Several answers change what we built or
assumed, and the reformulated rules add more.

1. **Roles are fixed for the whole fight.** The attacker is whoever started it. Rounds do not alternate. The lab's default
   (`alternate: true`) is wrong, and so is the "round structure" of the specs.
2. **The strangers' casualty rule flips.** The stranger side nominates (by default the weaker creature), a die is rolled with
   the Ring's +1 and 7 counting as 6, and on 4 or more the nominated creature dies. Our default had the *other* creature
   dying on 4 to 6.
3. **Surprise is now an attacker-only, first-round bonus of 0, 1 or 2.** Strangers who are approached and prove hostile
   *always* have +1. The lab gives them +1 only 60% of the time and never models the party's bonus.
4. **Strangers' artefacts are allocated once, before round 1, by the Default Loadout.** Nothing is re-allocated afterwards.
   The lab places artefacts at random among eligible creatures, and some of its eligibility lists are too wide.
5. **The Staff gives a Priest-class creature +2.** The lab already does this. The engine gives +1.
6. **New game rules:** stalemates, sleeping parties, the Scroll working differently by round, and surprise from the
   Whirlpool, Chasm and deliberate trap falls.
7. **The reformulated rules contain some ambiguities** (section 5). The biggest: whether a fight ends when every match
   is resolved even though one side still has unengaged creatures.

**What does not change:** the fight arithmetic (strength plus die plus bonuses), persistence of matches, the defender's
minimum deployment, the Ring's per-side bonus, and Peter's view that strangers should use Monte Carlo search with a time
limit. The Default Loadout is unchanged from the V2 document apart from one typo fix.

**The trap debate.** The reformulated surprise rules agree with the interpretation we recommended: surprise from a trap
depends on whether the fall was **deliberate**, with no "first use" limit. See section 3, R5.

## 2. Answer by answer

Status key: **Confirmed**, **Overturned** (our default was wrong), **Refined** (confirmed with a change to detail), **New**
(a rule we did not have), **Open** (needs Peter).

### Section A: what the game does today

| # | We said | Peter said | Status | Consequence |
|---|---|---|---|---|
| A1 | One or two per side; two against two not allowed; engage every stranger first | Agree; the "two against two" wording is "strange", the last sentence is true | **Closed 10-OCT (Q1)** | Step [e] of the new rules allows up to two creatures per side in a match. It reads as if two against two is permitted. The lab forbids it (`policies.ts`, `joinable`, `opp.length <= 1`). Ask Peter |
| A2 | Casters back a match | Agree | Confirmed | None |
| A3 | Casters stay back only with numerical advantage | Agree | **Refined** | New step [c]/[e]: a defender with more unengaged creatures than the attacker may keep back *any* surplus, fighters or casters |
| A4 | Spectre: Man, Woman or Hero with Sword. Demon: any Axe bearer | Sword users are Hero, Woman Hero, Man, Woman or Thief. Demon: Axe bearer is Hero, Woman Hero, Man, Woman, Thief or Dwarf | **Refined** | Lab `CAN_BEAR` lets Priest and Wizard classes bear the Sword and Axe. They gain nothing, but the Default Loadout would never give them either. Narrow it |
| A5 | Ring: +1 per side, even if the bearer dies that round; Eye cancels; level 4+ bearers cannot die | Agree | Confirmed | Matches the lab. The new rules compute the Ring bonus once at the start of the round |
| A6 | Treated the blank "ally" column as a typo | It means we are on an old Consolidated Rules. The 2026-10-05 version splits the "who can use" table into allies and strangers | **Open** | We do not have the 2026-10-05 Consolidated Rules. Obtain them |
| A7 | Woman-Hero 4 to 6 friendly | Corrected in the 2026-10-05 rules | Confirmed | None |
| A8 | Surprise is plus or minus 1, round 1 only; strangers have it on hostile approach, on re-entry after retreat, and from a chest Spectre | Bonus can be 0, 1 or 2, round 1 only. Surprise Attack is obscure; see the new procedure | **Overturned** | See R4 and R5. Re-entry after a retreat is "problematic" and no longer a trigger **Chest Spectre: Peter later ruled no surprise** (Q6, §8). |
| A9 | How a fight ends | Now covered in the reformulated rules | **New** | See R6 |
| A10 | Party casualty: nominate, roll, 4 to 6 the nominated dies; add Ring and 7 as 6 | Agree | Confirmed | The game still has to add the Ring and the 7-as-6 rule |
| A11 | A union's commander deploys; "strongest fights strongest" settles disputes | Agree, assuming each party nominates its strongest and a fight follows "the same fight procedure as for Quarrel" | **Refined** | Our wording and his differ. His is one "Fighting a Match" run with surprise 0 and Ring 0 (definition 10). Confirm which we mean |
| A12 | Demon follows the usual reaction rules | Agree | Confirmed | None |

### Section B: what we asked

| # | Our default | Peter's answer | Status | Consequence |
|---|---|---|---|---|
| B1 | Attacker per trigger; **roles swap every round** | Re-entering a chamber after a retreat is "problematic". Swapping roles was his mistake and is removed | **Overturned** | Roles fixed. Only two triggers are listed: the player attacks, or strangers are approached and prove hostile. Chest Spectre and blocked retreat are not covered (section 5, Q6) |
| B2 | Matches persist; joining allowed | Agree | Confirmed | None |
| B3 | Strangers' casualty as written: nominated stranger spared on 4 to 6 | **Wrong.** Roll normally, add the Ring bonus, and 4 to 7 select the **weaker** (by strength) to die; ties random | **Overturned** | Flip the rule in the lab (section 4). Later text: the stranger party nominates through its Fight Plan, and 4, 5, 6 kill the nominated creature. The two agree if the default nomination is "the weaker" |
| B4 | Defender follows the same minimum-deployment rule | Agree, in the clearer wording: "attempt to deploy at least as many creatures as the attacker has unengaged creatures" | **Refined** | The lab already does this. A defender who outnumbers the attacker may keep back fighters and casters, including a Ring bearer, but the Ring still counts |
| B5 | Scroll usable if you are "the attacker in this round" | Roles do not alternate; the attacker is who started the fight | **Refined** | See R3 for how the Scroll now works |
| B6 | Consumables usable when strangers attack | Agree | Confirmed | None |
| B7 | Stranger loadout run at the start and after every round | **No.** Only before the first round. Artefacts dropped by the dead stay on the floor | **Overturned** | The engine re-equips each round. The lab never did, so it is unaffected on this point |
| B7b | "Stranger Fight Preparations" is the loadout only | Fight Plan covers the loadout, deployment and casualty nomination | Confirmed | The loadout is the only item in step [2] of the new rules |
| B8 | Pairing by program, with a fallback | Fight Plan will eventually supply every decision. He favours **Monte Carlo with a time cutoff**: the longer the human takes to decide, the longer the strangers get | **Refined** | Our spec fixed a budget of about 400 ms. His version is a budget that grows with the human's thinking time (R7) |
| B9 | Step 5 wording; Staff +2; Shield item 8 | Agree to all three | Confirmed | Staff +2 for the Priest class is now settled. The 20261008 loadout has the typo fixed |

## 3. What the reformulated rules add

| # | Rule | Where | What it means for us |
|---|---|---|---|
| R1 | **Exactly two parties per fight**, which may be a union. A Quarrel is a single creature per side | Definitions 1 and 2 | The lab already plays two sides |
| R2 | **Turns:** round 1 in the attacker's turn, round 2 in the defender's, and so on. In solitaire the strangers' turn is notional and all events happen in the player's turn | Definitions 6 and 7 | No effect on the arithmetic. It answers our earlier question about whose turn a stranger-attack round uses |
| R3 | **The Scroll.** Round 2 onward, attacker is a player: destroy all non-magical enemies. Round 1: add 1 to the surprise bonus. Either way the attacker is cursed. It cannot be used in an area where it was used before. Strangers cannot use it | Step [b] | **Destroy cannot be used in round 1**, which is not what the game does today (it destroys in any round). The Scroll's "double the advantage of surprise" is replaced by "add 1" **Corrected by Q5 (§8):** the destroying variant may be used in any round. |
| R4 | **Round bonuses.** Surprise-attack bonus 0 or more per party, Ring bonus 1 per party, both fixed at the start of the round. Only the attacker can have surprise, only in round 1 | Step [a] | Peter's A8 range 0 to 2 comes from surprise 1 plus the Scroll's 1 |
| R5 | **Determining surprise.** Strangers who are approached and prove hostile *always* attack with the bonus. A player who attacks immediately after entering gets it if: the route cannot be walked back (Magic Carpet, Sorcerer's Teleport, falling into the Whirlpool, descending the Chasm); or the party arrived this turn by a trap and **triggered it deliberately**. No bonus if the trap fall was not deliberate. For a two-way route: only if no party has used it, to enter or to leave, while this group of strangers has occupied the area | Procedure: Determining Surprise Attack | See the trap debate and section 6 |
| R6 | **Ending a fight.** A defeated stranger party leaves the player free to loot. A defeated player is out of the game (unless the Zombies variant is on). If one party is asleep, the other must leave and may not attack or steal. A **stalemate** ends the fight: players divide the floor treasure; strangers keep it and the player leaves | Step [4] | Stalemate is new. Two examples are given (a Ring-bearing Dwarf on level 4+ against an Apprentice; a Spectre against a Shield-bearing Thief) **Step [g] and the stalemate wording corrected by Q2 and Q3 (§8).** |
| R7 | **The Fight Plan** is a library: Default Loadout, Smart Loadout, **Dumb Deployment**, **Smart Deployment**, Choosing the Casualty. It may be fixed choices or a procedure that "thinks" | Fundamentals; work in progress | Our `HEU` baseline plays the role of "Dumb Deployment", and the Monte Carlo or network search plays "Smart Deployment". He has not yet defined the dumb one |
| R8 | **Round order for each round:** (a) bonuses, (b) Scroll, (c) defender deploys, (d) attacker pairs one-to-one, (e) surplus deployed on either side, (f) matches fought, (g) wrap-up | Structure of a fight | Same shape as the lab's order, with the step lettering shifted. Where the lab differs, see section 4 |
| R9 | **Ineligible creatures:** a Spectre under the Talisman, a sleeper, and creatures that will not fight (Sybil, Unicorn) are neither engaged nor unengaged | Definition 9 | Not modelled in the lab (limitation L7) |
| R10 | **Effective strength** adds positional effects, artefact effects (including the Talisman on display) and Spectre and Demon effects, then Result = total strength + die + surprise + Ring | Fighting a match | The Result formula has **no curse term**. Curses subtract 1 from all die rolls in the Consolidated Rules and the lab applies them. See Q4 **Q4: curses confirmed missing, to be added (§8).** |

### Agreement with the trap debate

R5 is the same test our recommendation reached. A fall through a trap gains surprise **if deliberate and not otherwise**, and
there is no "first use" limit. A party that returns to a visited chamber by a deliberate trap gets surprise, with or without a
dwarf. Peter's draft says only "triggered deliberately"; whether a dwarf party may choose to fall is not spelled out and
still needs a ruling (Q8).

It also settles item 4 of the addendum to that debate, the "retreated-from chamber" case. There is no longer a rule that
gives the strangers surprise on re-entry. Peter calls that trigger "problematic" and a fight now starts only when the player
attacks or when a hostile approach is made.

## 4. What changes in the lab

| # | Change | Where | Why |
|---|---|---|---|
| 1 | Set `alternate: false` as the default. Add both attacker cases to scenarios: strangers attack, or the party attacks | `rules.ts`, `scenario.ts` | B1, definition 5 |
| 2 | Give **each side** a surprise bonus, applied to the attacker in round 1 only. Strangers who attack always get +1. A party that attacks gets 0, 1 or 2 (route-based plus the Scroll). Drop the 60% chance | `types.ts` (`Ctx.surprise`), `rules.ts`, `scenario.ts` | R4, R5 |
| 3 | **Flip the stranger casualty.** The stranger side nominates, default the weaker, random on a tie. Roll, add the Ring (+1), 7 counts as 6, and on 4 or more the nominated creature dies. Retire the `"strongest"` option | `rules.ts` `casualtyVictim`, `policies.ts` `nominateStranger`, `sim.ts` | B3, step [iiii] |
| 4 | Allocate the strangers' artefacts with the **Default Loadout**, not at random | `scenario.ts` `dress()` | B7, loadout procedure |
| 5 | Narrow Sword and Axe eligibility to Hero, W-Hero, Man, Woman, Thief (and the Dwarf for the Axe) | `scenario.ts` `CAN_BEAR` | A4 |
| 6 | Two against two **is allowed** (Q1, answered): a persisting tie can stay 2v2, and step [e] may add one fighter to a 1v2 match. Change `joinable` accordingly | `policies.ts` | A1, step [e], Q1 |
| 7 | Let **either** side deploy its surplus in step [e], not only the larger side | `sim.ts` | Step [e] |
| 8 | Add stalemates (Q3: *neither side can beat the other on any roll*) and end the fight when **neither side has any creature able to continue a match, be deployed to create a match, or be deployed to break a stalemate** (Q2). Today a fight ends on a win, a retreat or the 30-round cap | `sim.ts` | R6, Q2, Q3 |
| 9 | Curses are **confirmed** as part of the Result (Q4); the lab already applies them. Keep, and state it in the rules | `rules.ts` | R10, Q4 |
| 10 | Start the strangers' artefacts **on the floor** and run the Default Loadout **once per fight**, including a later fight against surviving strangers (Q10) | `scenario.ts` `dress()` | B7, Q10 |
| 11 | The Scroll's destroying variant may be used in **any round** by a non-stranger attacker when the Eye is absent; level 4+ invulnerable creatures survive (Q5) | `sim.ts`, `rules.ts` | R3, Q5 |

**Effect on the casualty result.** Without a Ring the old and new rules kill the weaker and stronger creature about equally
often (50/50), so results barely move. They differ only when the **strangers hold the Ring**. Then the old rule had the
stronger die about 67% of the time. The new rule has the weaker die about 67% of the time. That favours the strangers.
This follows from the formulas, and the experiment should be re-run to measure it.

**Effect on past results.** The findings report's statements that depend on alternation, on the strangers' 60% surprise, or on
the casualty rule are **superseded** and need re-running: section 4.2 (rules impact), 4.4 and 4.5 (pairing value), section 5
(sensitivity) and the figure that "Peter's casualty rule makes the strangers about 2 points harder to beat". The size of
the space (section 4.6) and the speed results (4.1) stand.

## 5. Ambiguities in the draft: questions for Peter

**All ten were answered by Peter on 10-OCT-2026** ([his response](2026-10-10-peters-response-to-review-of-reformulated-rules.md)); Q9 only tentatively. The answers and what they change are in [§8](#8-peters-response-of-10-oct-2026-and-how-it-is-applied).

| # | Question | Why it matters |
|---|---|---|
| Q1 | **Is two against two allowed?** Step [e] caps "the front line of any match" at two and talks of "all matches now involving two creatures"; A1 says it is not allowed | Changes which pairings exist at all |
| Q2 | **Does a fight end when all matches are resolved**, even if one side still has unengaged creatures? Step [g] says yes. Definition 6 says a fight ends when a party is wiped out, retreats or stalemates | A bigger side could leave survivors on both sides and end the fight with no winner |
| Q3 | **Stalemate is defined as "both sides' result is zero".** A result includes a die roll and cannot be zero. The examples suggest "neither side can ever win" | Needs a testable rule, for example "neither side can beat the other on any roll" |
| Q4 | **Curses** are missing from the Result formula | Curses subtract 1 from all die rolls in the Consolidated Rules |
| Q5 | **Scroll in round 1.** Is destroying really forbidden in round 1? Is "add 1 to surprise" the whole of the old "double the advantage" wording? | Changes how a party opens a fight |
| Q6 | **Other triggers.** Who attacks, and with what bonus, for a chest Spectre, a blocked retreat, and a party that re-enters a chamber it retreated from? | Only two triggers are listed |
| Q7 | **Casualty nomination.** Is "the weaker, by strength" the default for the strangers' Fight Plan, as in B3? And does the later text (the loser nominates, 4 to 6 kills the nominated) mean the same? | They agree only under that default |
| Q8 | **Deliberate trap falls.** May a dwarf party choose to fall through a trap? "Deliberately" is used but not defined | The code change in the trap debate depends on it |
| Q9 | **Dumb Deployment.** What is the baseline procedure? | The lab found that "strongest against strongest" is worse than random. We can supply evidence for the choice |
| Q10 | **Later arrivals.** Strangers who join after round 1 (Mutiny, Demon): are they equipped, and when? | Peter says the loadout is before the first round only |

## 6. What changes in the game engine

The engine statements below are the ones in the questions document and the trap-debate addendum.

1. **Fixed roles** for the whole fight; round order as in R8.
2. **Strangers' loadout once**, before round 1 (it currently re-runs after each round, B7).
3. **Stranger casualty** by the new rule (it currently kills the strongest automatically); add the Ring and 7-as-6 to the party
   rule as well.
4. **Staff +2** for the Priest class (the engine gives +1, `capabilities.ts`).
5. **Scroll:** destroy only from round 2, add 1 to surprise in round 1, attacker cursed, not twice in one area, and check for
   the Eye (R3).
6. **Surprise by route** (R5): surprise from the Chasm and the Whirlpool, which today go through the same code as a trap fall
   and so never get it; a deliberate trap fall (the trap-debate changes); strangers' surprise on hostile approach, not on
   re-entry; and "this group of strangers has occupied this area" in place of `!area.visited`. The engine has no
   Sorcerer's Teleport, only the Magic Carpet.
7. **Stalemates, sleeping parties and the end-of-fight consequences** (R6).
8. **Spectre and Demon eligibility** per A4, and the Demon behaviour already noted for A12.
9. **Unions** (A11) in his wording, if it differs from the current code.
10. **Two against two** exists in the revised engine (Q1): a tied 2v2 persists, and step [e] may add a fighter to a 1v2 match. The legacy engine's `twoVsTwo` rejection stays for the legacy path only.
11. **End of fight** by Q2's single condition, and **stalemate** by Q3's definition (neither side can beat the other on any roll).
12. **Curses** in the Result (Q4). The engine already subtracts them from the die; the reformulated text must say so.
13. **Scroll** by Q5: destroying variant in any round; attacker must not be a stranger party; Eye absent; level 4+ invulnerable creatures survive. Check the existing Scroll (SC-EXT-25) against this.
14. **Chest Spectre has no surprise** (Q6). The engine starts that fight with the *strangers* holding surprise (`openChest`, `surprise: -1`, SC-11-41) — to change to none. Hazard-triggered fights (the chest Spectre and **Ghouls**) must be covered by the revised rules; the engine runs the Ghouls fight as a bespoke per-member sequence in `hazards.ts`.
15. **A blocked retreat is not a new fight** (Q6): roles are unchanged. The engine already behaves so (`retreatBlocked`).
16. **Casualty nomination** (Q7): *high roll = success and the nominated creature dies*, forever; only **which** creature the Fight Plan nominates is open to strategies. Replaces the engine's automatic "strongest foe falls" for strangers (B3).
17. **Dwarves and traps** (Q8 supplementary, ruled 11-OCT-2026): a party with *n* Dwarves can guide past *n* traps. Today the engine allows one (`trapRules`: two traps in a chamber cannot be avoided). See the [debate](../2026-10-09-dwarfs-and-surprise-rule-debate.md#ruling-11-oct-2026-supplementary-issue-how-many-traps-can-dwarves-guide-past).
18. **Each fight is new** (Q10): stranger artefacts start on the floor at the beginning of every fight, including a later fight against survivors of an earlier one. The loadout runs once, in step 2.

## 7. Suggested order

1. ~~**Send Peter section 5.** Q1 to Q4 block the lab and the engine.~~ **Done:** Peter answered on 10-OCT-2026 (§8). Q1 to Q4 no longer block.
2. **Update the lab** (section 4, items 1 to 5, 7), which does not depend on Peter's answers. Re-run the experiments that the
   findings report marks as superseded.
3. **Revise the specs:** the training spec and the Monte Carlo spec assume alternation, a strangers-attack setting and a
   fixed 400 ms budget. Both should cover the strangers as **defender** (step [c] deployment) and as **attacker** (steps
   [d] and [e]), with the budget depending on the human's thinking time.
4. **Revise the combat technical spec (M0 to M2)** for sections 6 and 3, then the round engine.
5. **Add Peter's Default Loadout** results to the lab as a fixed loadout, so the learning task is only about deployment and
   casualty choices.

## 8. Peter's response of 10-OCT-2026 and how it is applied

Source: [Peter's response](2026-10-10-peters-response-to-review-of-reformulated-rules.md) (markdown conversion of his PDF). He answered all ten
questions in section 5. Nine are firm; Q9 is tentative; Q8 raised a new question, ruled below.

| Q | Peter's answer | Status | What it changes |
|---|---|---|---|
| **Q1** Two against two | A **feature**, because the rules must serve Solitaire and PvP alike: the PvP defender may keep creatures back, so ties can persist as 2v2. Step [c] may inherit 2v2 ties; step [d] cannot create new ones (one-to-one only); step [e] lets a side with unengaged creatures deploy them anywhere legal, **including a fighter into a 1v2 match**. Worked example given | **Closed** | A1 closed. Lab: `joinable` must allow joining a match where the opposition has two in front (§4 item 6). Revised engine: 2v2 exists. Legacy engine and PvP staging keep "never 2v2" |
| **Q2** When a fight ends | Step [g] was wrong. Replace both tests with one: the fight is over when **neither side has any creature able to continue a match, be deployed to create a new match, or be deployed to break a stalemate** | **Closed** | Lab `sim.ts` end test (§4 item 8). Revised engine's end-of-fight rule |
| **Q3** Stalemate | **"Neither side can beat the other on any roll."** | **Closed** | A testable definition: a match is a stalemate when each side's highest possible result does not exceed the other side's lowest. Lab and engine (§4 item 8). The engine's Shield stalemate (SC-EXT-40) is one instance |
| **Q4** Curses | Missing from the Result by his mistake; step 3 f iii to include them | **Closed** | R10 resolved. The lab and engine already apply curses (§4 item 9) |
| **Q5** Scroll | Usable **in any round**, choosing the destroying variant, when: the attacking party is not a stranger party, it has a creature carrying and able to use the Scroll, and the Eye is not present. Destroys all enemies without innate magical power (fighters); **invulnerable level 4+ creatures survive** | **Closed** | Overturns the review's R3 (it said destroy from round 2 only). Check SC-EXT-25 |
| **Q6** Other triggers | **Chest Spectre gets no surprise** (the Consolidated Rules say "attacks", not "surprise attacks"). The rules must also cover **any fight triggered by a Hazard card**, i.e. the chest Spectre **and Ghouls**. A **blocked retreat changes no roles** and is not a new fight | **Closed** | Engine: chest Spectre surprise to none. Rules text: add hazard-triggered fights. Ghouls need modelling in the revised engine |
| **Q7** Casualty nomination | **High roll = success, the nominated creature dies**; a fixed principle, whatever creature the Fight Plan nominates and whatever its defaults | **Closed** | The die rule is not pluggable. The *choice of creature* is a Fight Plan decision, so a nomination hook is needed (the pluggable spec's C3) |
| **Q8** Deliberate trap falls | Agrees: a Dwarf party may fall deliberately, and there is **no first-fall house rule**. Supplementary: can a party with **two Dwarves guide past two traps**? He finds "one trap only" not credible and suggests a debate | **Closed, ruled** | The first two are already built. The supplementary question is **ruled below** |
| **Q9** Dumb Deployment | **No definitive answer yet.** Hoped to emerge from Monte Carlo and the pairing lab | **Open (tentative)** | The `standard` deployment baseline stays the lab's `HEU` placeholder until the lab proposes one (pluggable spec D7) |
| **Q10** Later arrivals / later fights | A fight against surviving strangers (after a retreat, a stalemate the player left, or a win while other players continue) is a **completely new fight**, and any artefacts are assumed to be **on the floor**, not wielded. Step 2 amended to say so | **Closed** | Confirms B7: loadout once per fight. Engine: stop re-equipping after each round in the revised engine (pluggable spec C1) |

### Ruling on the supplementary issue (Q8): Dwarves and traps — 11-OCT-2026

**A party with *n* Dwarves can guide past *n* traps.** Recorded in the trap debate. Peter's own observation is the reason: nothing
justifies a second Dwarf losing its guiding ability because the first is busy. The Consolidated Rules' "but not two traps
drawn in the same chamber" is read as the limit for a party with **one** Dwarf.

### Net effect on the plan

1. **Lab (section 4):** items 6, 8 and 9 are now fully specified (above). New: item 10, start the strangers' artefacts on the floor
   and run the Default Loadout once per fight (Q10); item 11, stop treating the Scroll as a round-2-only action (Q5).
2. **Engine (section 6):** items 10 to 18 added. Two were small code changes that did not need the revised engine, and are **done (11-OCT-2026)**: the **chest Spectre
   surprise** (item 14) and the **Dwarf count** (item 17).
3. **Specs:** the Monte Carlo and training specs still assume alternation (section 7, item 3); the pluggable-strategy spec's conflicts
   C1 and C3 are now ruled (see that document).
4. **Still open:** Q9 (the dumb baseline) and the Unicorn/Sibyl eligibility point (R9), which Peter did not address.
