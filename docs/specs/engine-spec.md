# The Sorcerer's Cave — Engine Specification (v2)

> **Status:** Living specification of the game-logic engine (`packages/engine`), regenerated 2026-07-01 from the code and its git history.
> **Source of truth:** the engine **code** is authoritative. Where this document and the code disagree, the code wins — treat the discrepancy as a spec bug.
> **Scope:** the pure, deterministic game rules in `packages/engine/src` — data model, RNG, turn lifecycle, movement, chambers, encounters, fights, special areas, artifacts, scoring, and the multiplayer seat model. The React/Three.js client, the Convex backend, and logical UX (v1 §2/§13) are **out of scope** here.
> **Supersedes:** `docs/specs/design-spec.html` (v1), whose §15 "Gap Analysis" and §16 "Implementation Sketches for the Open Gaps" are obsolete — nearly all those gaps are now implemented. See **Appendix B** for the corrections.

## How to read this document

- **Part I — Normative Requirements** is the testable contract: one rule per row, each with a stable **ID**, the authoritative **`file:line`**, and the **test** that pins it (`—` = no direct test; consolidated in Appendix C).
- **Part II — Rules Narrative** is the readable rulebook, cross-referencing requirement IDs in parentheses, e.g. (SC-8.3-5).
- **Requirement IDs** are `SC-<§>-<n>`, stable across edits and aligned with the code's `spec §N` comments. `§MP` = multiplayer.
- **Appendices:** A — data tables & constants (incl. the RNG algorithm); B — corrections vs the v1 spec; C — test-coverage gaps.

### Section map

| § | Domain | Primary code |
|---|--------|--------------|
| 3 | Core data model | `state.ts`, `data/*`, `decode.ts`, `coords.ts` |
| 4 | Turn lifecycle & action/event contract | `reduce.ts`, `actions.ts`, `selectors.ts` |
| 5 | Randomness & shuffling | `rng.ts`, `decks.ts`, `setup.ts` |
| 6 | Map, movement & levels | `map.ts`, `coords.ts`, `decode.ts` |
| 7 | Chambers, draws, hazards & pickup | `chamber.ts`, `hazards.ts`, `pickup.ts` |
| 8 | Stranger encounters | `reaction.ts`, `reduce.ts` |
| 9 | Fights | `combat.ts`, `combatPlan.ts`, `reduce.ts` |
| 10 | Special areas | `special.ts`, `reduce.ts` |
| 11 | Artifacts & treasure effects | `effects.ts`, `reduce.ts`, `selectors.ts` |
| 12 | Scoring & game over | `score.ts`, `reduce.ts` |
| MP | Multiplayer | `multi.ts` |

---

# Part I — Normative Requirements

## §3 Core Data Model

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-3-1 | The engine MUST define exactly 61 area cards (`AREA_CARDS`) in normative index order, from which the Gateway (index 21, value 175) is removed to leave a 60-card large pack. | areaCards.ts:12, areaCards.ts:9 | data.test.ts › has 61 area cards and the Gateway (value 175) at index 21 |
| SC-3-2 | Each area-card value MUST be a bit-field decoded as: bit0(1)=N exit, bit1(2)=E, bit2(4)=S, bit3(8)=W, bit4(16)=chamber, bit5(32)=stairUp, bit6(64)=stairDown, and special = (value>>7)&7 (0 none,1 Gateway,2 Deep Pool,3 Viper Pit,4 Tomb,5 Great Hall). | decode.ts:13-24 | decode.test.ts › decodes the Gateway/Tomb/Deep Pool/plain NE |
| SC-3-3 | Area-card index 41 MUST be value 42 (EWU = E+W+stairUp), NOT 74 (EWD), because EWD has no tile in the set and would force an illegal rotation. | areaCards.ts:17 | gap-data-rng.test.ts |
| SC-3-4 | Special-type constants MUST be SPECIAL_NONE=0, GATEWAY=1, DEEP_POOL=2, VIPER_PIT=3, TOMB=4, GREAT_HALL=5. | areaCards.ts:1-6 | decode.test.ts (via SPECIAL_* imports) |
| SC-3-5 | The engine MUST define exactly 14 creatures (ids 0–13) with the normative fields fs, mp, carry, cost, points, flags, hostileMax, indiffMax, leaderPri (e.g. Hero fs5/cost6/pts10, Wizard mp5/cost null, Dragon fs6, Giant fs7/carry150, Sorcerer mp9). | creatures.ts:22-37 | data.test.ts › has 14 creatures with normative key stats |
| SC-3-6 | Creature flags MUST be the bitmask HUMAN=1, CHARISMA=2, BEFRIENDS_UNICORN=4, GUIDES_PAST_TRAP=8, INHUMAN=16. | creatures.ts:1-5 | data.test.ts (FLAG_CHARISMA, FLAG_GUIDES_PAST_TRAP) |
| SC-3-7 | A creature MUST be selectable as a starter iff `cost !== null`; only ids 0–7 have a non-null cost (Hero6, W-Hero5, Ogre5, Troll4, Priest4, Man3, Woman2, Dwarf1); ids 8–13 have cost null. | creatures.ts:22-37, setup.ts:20 | setup.test.ts › rejects a non-selectable creature (Wizard id 8) |
| SC-3-8 | The Dragon's reaction table MUST be hostileMax=4, indiffMax=6 (rolls 1–4 hostile, 5–6 indifferent, never friendly). | creatures.ts:33 | gap-data-rng.test.ts |
| SC-3-9 | Starting stock MUST be Hero×1, W-Hero×1, Ogre×3, Troll×3, Priest×3, Man×6, Woman×3, Dwarf×3 (8 entries, total 23). | creatures.ts:40-42 | data.test.ts › offers 8 selectable starters with the right stock |
| SC-3-10 | The engine MUST define exactly 15 treasures (ids 0–14); heavy = Silver/Gold/Gems (25 kg each) and Treasure Chest (100 kg); the other 12 are weightless artifacts. | treasures.ts:11-27 | data.test.ts › has 15 treasures and 5 hazards |
| SC-3-11 | Treasure Chest (id 14) MUST be kind "heavy", weight 100, points 0; Eye of God (id 13) MUST be points 0. | treasures.ts:25-26 | data.test.ts › TREASURES[14] Treasure Chest weight 100 heavy |
| SC-3-12 | The engine MUST define exactly 5 hazards ids 0–4: Mutiny, Trap, Earthquake, Medusa, Ghouls. | hazards.ts:2-7 | data.test.ts › has 15 treasures and 5 hazards |
| SC-3-13 | The small pack MUST be a single finite deck of exactly 71 cards: 37 creature cards (100+id), 27 treasure cards (200+id), 7 hazard cards (300+id). | smallPack.ts:8-39 | decks.test.ts › smallPackTemplate has 71 cards |
| SC-3-14 | Small-pack creature composition MUST be Hero×1, W-Hero×1, Ogre×3, Troll×3, Priest×3, Man×6, Woman×3, Dwarf×3, Wizard×3, Spectre×3, Dragon×3, Sorcerer×1, Giant×3, Unicorn×1 (37 total). | smallPack.ts:14-27 | decks.test.ts (exactly one W-Hero 101) |
| SC-3-15 | Small-pack treasure composition MUST be Silver×6, Gold×6, Gems×3, and 1× each of the 12 artifacts ids 3–14 (27 total). | smallPack.ts:29-32 | decks.test.ts › 27 treasure cards |
| SC-3-16 | Small-pack hazard composition MUST be Mutiny×1, Trap×2, Earthquake×2, Medusa×1, Ghouls×1 (7 total). | smallPack.ts:34-38 | decks.test.ts › 7 hazard cards |
| SC-3-17 | Card codes MUST be encoded as 100+creatureId (100–199), 200+treasureId (200–299), 300+hazardId (300–399), 400+creatureId (sleeping). | smallPack.ts:13-38, chamber.ts:6-8 | decks.test.ts (100/200/300 ranges) |
| SC-3-18 | A placed area MUST store `{card, coord, faceUp, visited, contents[], flags, indiffCount}` with optional dropped/markers/mirroredStairs/secretDoor fields. | state.ts:30-47 | setup.test.ts › places the Gateway and seats the chosen party |
| SC-3-19 | Coordinates MUST pack as `level*10000 + y*100 + x`; the Gateway MUST start at level 1, x=50, y=50 (packed 15050). | coords.ts:8-10, state.ts:8 | setup.test.ts › areas[0].coord == GATEWAY_START_COORD |
| SC-3-20 | Movement MUST map N→y−1, S→y+1, E→x+1, W→x−1, Up→level−1, Down→level+1 (DIR_N=1,E=2,S=3,W=4,UP=5,DOWN=6). | coords.ts:1-29 | gap-data-rng.test.ts |
| SC-3-21 | Party member status MUST be 0=original, 1=ally, 2=stone(petrified), 3=dead; PARTY_CAP MUST be 12. | state.ts:17-18, state.ts:6 | gap-data-rng.test.ts |
| SC-3-22 | Game-state constants MUST be GS_PLAYING=0, GS_ESCAPED=1, GS_DEAD=2, GS_QUIT=3; AF_DESTROYED MUST be 4. | state.ts:1-4, state.ts:11 | gap-data-rng.test.ts |
| SC-3-23 | `newGame` MUST initialise turn=1, level=1, score=0, curses=0, bonusScore=0, partyArea=0, gs=GS_PLAYING, phase="explore", with the Gateway as the sole placed area (faceUp true, visited false). | setup.ts:64-88 | setup.test.ts › places the Gateway and seats the chosen party |
| SC-3-24 | Each new party member MUST start with status 0, dragonKills 0, empty treasure[]. | setup.ts:57-62 | setup.test.ts › party.every(status===0) |

## §4 The Turn Lifecycle & Action/Event Contract

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-4-1 | `reduce(state, action)` is the single pure entry point: it returns `{ state, events }`. The reducer is the only producer of game facts; the UI never infers them. | reduce.ts:253, actions.ts:23 | gap-contract.test.ts |
| SC-4-2 | If the game is over (`state.gs !== GS_PLAYING`), `reduce` ignores every action, returning the same state and an empty event list. | reduce.ts:254 | reduce.test.ts › ignores actions once the game is over |
| SC-4-3 | The interactive mode is `state.phase`, one of `explore | encounter | fight | pickup | gameOver`; it selects which controls show and which actions `reduce` accepts. | state.ts:15,77 | gap-misc.test.ts |
| SC-4-4 | `legalActions(state)` returns exactly the actions the UI may offer in the current phase; `reduce` validates against the same rules, rejecting any omitted action with `blocked` (or `planRejected`). This is the interactive contract. | selectors.ts:64 | reduce.test.ts › trap fall offers no withdraw; selectors.test.ts › interactive loop |
| SC-4-5 | `legalActions` returns `[]` when the game is over; quit is never an in-menu action (HUD button). | selectors.ts:65,75,95,141 | selectors.test.ts › no actions once over; reduce.test.ts › not.toContainEqual quit |
| SC-4-6 | An unrecognised action for the current phase produces one `{type:"blocked"}` event and no state change. | reduce.ts (phase guards, e.g. :261,270,302,321,445,512,549) | reduce.test.ts › resolveRound blocked when not fighting |
| SC-4-7 | `quit` (any phase): sets `gs=GS_QUIT`, `phase="gameOver"`, emits `gameOver(GS_QUIT)`. | reduce.ts:257 | reduce.test.ts › quit ends the game and emits gameOver(QUIT) |
| SC-4-8 | `exitCave`: legal only in explore; on level 1 with a printed stair-up sets `gs=GS_ESCAPED`, `phase="gameOver"`, emits `gameOver(GS_ESCAPED)`; else `blocked`. | reduce.ts:260 | reduce.test.ts › exitCave escapes when on level 1…; › blocked when no stair-up |
| SC-4-9 | `move(dir)`: legal only in explore. A successful move increments `turn` by 1, clears `fellThroughTrap`, then runs area resolution; a failed move does NOT advance the turn and emits `deadEnd` or `blocked`. | reduce.ts:269 | reduce.test.ts › a successful move increments the turn…; › dead-end does not advance the turn |
| SC-4-10 | Moving out (not reversing) of a Viper Pit emits `crossedSpecial(VIPER_PIT)` then runs the viper crossing (may wipe the party); out of a Deep Pool emits `crossedSpecial(DEEP_POOL)` then the deep-pool crossing. | reduce.ts:283,292 | reduce.test.ts › crossing a Deep Pool without a Giant drops heavy treasure; › going back the way you came does NOT trigger |
| SC-4-11 | `resolveArea` emits `moved(area,level)` first, then reviveStoned; resolves special markers, then (for a chamber) draws contents and applies hazards, then sets the resting phase. | reduce.ts:121 | reduce.test.ts › emits moved + drewChamber |
| SC-4-12 | On chamber entry `enterChamber` emits `drewChamber(strangers,treasures,hazards)`; then Eye-of-God annihilation, Talisman warding, and hazards fire in order. | reduce.ts:151, chamber.ts | reduce.test.ts › emits drewChamber |
| SC-4-13 | If a hazard leaves no living/ally member: `gs=GS_DEAD`, `phase="gameOver"`, emit `gameOver(DEAD)`; if every member is stone also emit `petrifiedOut`. | reduce.ts:158 | reduce.test.ts › Medusa turning the whole party to stone ends the game |
| SC-4-14 | A trap fall parks the chamber behind, relocates the party one level down (one-way, `fellThroughTrap=true`), emits `trapSprung(level)`+`moved`, and re-enters resolution at the lower level in the same turn (may chain). | reduce.ts:165,210 | reduce.test.ts › trap fall offers no withdraw; › falling leaves strangers/treasure behind |
| SC-4-15 | After resolution: strangers present → `encounter` (or `fight` if the area is in `hostileAreas`, surprise −1); else treasure → `pickup`; else → `explore`. A pacified area is parked and returns to `explore`. | reduce.ts:187,191 | reduce.test.ts › stranger→encounter; › treasure-only→pickup; › retreated re-entry→immediate fight |
| SC-4-16 | `surpriseReady` is set only on a fresh chamber entry (unused doorway / carpet) that is NOT a trap fall; testing reaction or starting the fight clears it. | reduce.ts:198,69,448 | reduce.test.ts › attack from a fresh entry starts a fight with surprise; › attack with no fresh-entry surprise |
| SC-4-17 | `withdraw`: legal only in encounter; blocked if `fellThroughTrap` or if `prev` is earthquake-collapsed (`AF_DESTROYED`). On success parks the working set on the current tile, steps to `prev`, `phase="explore"`, emits `moved`. | reduce.ts:301 | reduce.test.ts › withdraw steps back…; › blocked after trap; › blocked when earthquake collapsed the way back |
| SC-4-18 | `test`: legal only in encounter and while `indiffStreak < 3`; forfeits surprise; rolls a reaction and emits `reaction(outcome,roll)`. | reduce.ts:444 | reduce.test.ts › testing an always-hostile leader…; › three indifferent results pacify |
| SC-4-19 | A `friendly` test recruits eligible strangers as allies (status 1, up to PARTY_CAP), emits `strangersJoined`; a womanless Unicorn stays as a guard (`unicornGuards`), pacifying the area. Cleared strangers → pickup if treasure, else explore. | reduce.ts:452 | reduce.test.ts › a friendly result recruits the strangers as allies |
| SC-4-20 | An `indifferent` test increments `indiffStreak`; on the 3rd, records the area in `pacifiedAreas`, emits `pacified`, parks strangers+treasure as guarded, returns to explore (permanently indifferent to this party). Otherwise stays in encounter. | reduce.ts:474 | reduce.test.ts › three indifferent results pacify the chamber |
| SC-4-21 | A `hostile` test starts a fight with surprise −1 (strangers gain surprise), emitting `fightStarted(-1)`. | reduce.ts:486 | reduce.test.ts › testing an always-hostile leader starts a fight with surprise to the strangers |
| SC-4-22 | `attack`: in encounter, starts a fight with surprise +1 if `surpriseReady` else 0. In explore on a pacified area with parked guards, un-parks guards+treasure and starts a fight with surprise 0. Otherwise `blocked`. Emits `fightStarted`. | reduce.ts:492 | reduce.test.ts › attack from a fresh entry…; › pacified chamber re-entry offers Attack |
| SC-4-23 | `startFight` sets `fight={surprise,round:1,focus}`, `phase="fight"`, clears `surpriseReady`/`fightDrops`, emits `fightStarted`. | reduce.ts:65 | reduce.test.ts (via arena) |
| SC-4-24 | `resolveRound(matches)`: legal only in fight, blocked if a casualty is pending. An illegal plan emits `planRejected(reason)` with no state change. A valid plan resolves one round, re-opens retreat, then pauses for `chooseCasualty` or finalises. | reduce.ts:511, combatPlan.ts | reduce.test.ts › illegal plan rejected; › legal plan clears the chamber; › blocked when not fighting |
| SC-4-25 | `finalizeRound`: a Unicorn may depart; no survivor → `gameOver(DEAD)`; strangers cleared → `fightWon`, reclaim floor-dropped treasure, then pickup/explore; else the fight continues. | reduce.ts:75 | reduce.test.ts › wipes strangers wins; › wipes party ends DEAD; › winning reclaims floor-dropped treasure |
| SC-4-26 | `chooseCasualty(idx)`: legal only in fight with a pending `casualtyQueue`; `idx` must be a losing-pair member. Rolls d6 — 4-6 honours the pick, else the other falls; emits `casualtyChosen`, `memberDied`, Eye-forsaken. Empty queue → finalise. | reduce.ts:524 | reduce.test.ts › chooseCasualty falls on the player's pick with a 4-6 |
| SC-4-27 | `retreat(dir)`: legal only in fight; blocked if `fellThroughTrap` or before ≥1 round (`round<=1`). Flee by any exit. A failed retreat emits `deadEnd`, sets `retreatBlocked=true`. | reduce.ts:548 | reduce.test.ts › blocks retreat before any round; › dead-end retreat fails; › no tile to draw |
| SC-4-28 | A successful `retreat` leaves strangers and dropped/dead-carried treasure behind, clears the working set and `fight`, marks the fled area `hostileAreas`, and resolves the area retreated into. | reduce.ts:567 | reduce.test.ts › retreat flees by a doorway; › leaves a slain member's treasure behind |
| SC-4-29 | `takeTreasure(ti,mi)`: legal only in pickup. Lost Ruby (id 11) triggers a strength-8 statue fight (unless an Eye stills it): win → `rubyTaken`; loss → wrestler slain (`memberDied`+`statueAroused`), Ruby left. Other treasure assigned. Last treasure → explore. | reduce.ts:320 | reduce.test.ts › taking the last treasure returns to explore |
| SC-4-30 | `leaveTreasure`: legal only in pickup; parks remaining treasure and returns to explore. | reduce.ts:376 | reduce.test.ts › leaving treasure parks it on the chamber |
| SC-4-31 | `retakeDropped`: legal only in pickup; returns each fighter's dropped heavy treasure in its prior distribution, skipping any whose dropper fell / can't carry; emits `droppedRetaken`; if none, `blocked`. | reduce.ts:383 | reduce.test.ts › retakeDropped returns each fighter's dropped treasure |
| SC-4-32 | `moveTreasure(from,to,idx)`: blocked in fight/gameOver, when from==to, recipient non-living, or recipient can't carry. Moving the Eye of God (13) curses the party (`curses+=1`, `eyeForsaken`). | reduce.ts:408 | reduce.test.ts › moves a treasure…; › blocks over-capacity; › blocks during a fight; › forsaking the Eye |
| SC-4-33 | `dropTreasure(mi,idx)`: blocked in fight/gameOver. In pickup the item lands back on the live floor (re-takeable this visit); else parks on the tile. Dropping the Eye curses the party. | reduce.ts:426 | reduce.test.ts › drops onto the floor; › re-offers pickup-dropped; › forsaking the Eye |
| SC-4-34 | `useArtifact(artifact,target?,dir?)`: blocked with no eligible living bearer. Per-artifact phase/target rules (Potion 8/fight; Balm 6/explore-pickup; Staff 9/explore-pickup; Lotus 5/encounter-fight; Carpet 4/explore; Flute 12/explore+dir). Emits `artifactUsed` + effect events, else `blocked`. | reduce.ts:595 | reduce.test.ts › Lotus no effect on Spectre; › Lotus weakens Sorcerer; › Balm revive in pickup; › Staff frees stone in pickup |
| SC-4-35 | `openChest`: legal only in explore with a living bearer of the Chest (14). Consumes it, rolls d6, emits `chestOpened(result)`: Curse / Spectre fight (`fightStarted(-1)`) / Sand / Silver+20 / Gold+40 / Gems+80. | reduce.ts:695 | reduce.test.ts › opening on a curse roll lays a permanent curse |
| SC-4-36 | `legalActions` in explore offers `move` per doorway/stair (level-1 stair-up → `exitCave`), `openChest` when a bearer holds it, `attack` on a pacified guarded tile, plus artifact actions. | selectors.ts:120 | selectors.test.ts › offers the Gateway's lateral moves and exitCave |
| SC-4-37 | `legalActions` in pickup offers `takeTreasure` per (treasure×member) only where living/ally and `canCarry`, `retakeDropped` when applicable, `leaveTreasure`, plus artifact actions. | selectors.ts:97 | selectors.test.ts › heavy-treasure take only to members with spare capacity; › Chest only to a big carrier |
| SC-4-38 | `legalActions` in encounter offers `withdraw` (when allowed) + `attack`, `test` (when `indiffStreak<3`), plus artifact actions. | selectors.ts:67 | reduce.test.ts › moving into a chamber with a stranger |
| SC-4-39 | `legalActions` in fight: if a casualty is pending, only the `chooseCasualty` pair; else `retreat` per exit (after round 1, not blocked, not trap) plus artifact actions. `resolveRound` is built by the fight UI, not a menu item. | selectors.ts:77 | reduce.test.ts › only that choice is offered; › retreat not offered toward a dead end |
| SC-4-40 | The Magic-Carpet landing case does NOT enforce the "no withdraw after a carpet landing into strangers" rule — a deferred, known deviation. | reduce.ts:653 | gap-contract.test.ts |
| SC-4-41 | Full `GameAction` catalog: move, quit, exitCave, withdraw, takeTreasure, leaveTreasure, retakeDropped, moveTreasure, dropTreasure, test, attack, resolveRound, chooseCasualty, retreat, useArtifact, openChest. Each is handled by `reduce`; an action type **outside** this catalog falls through the switch and returns `undefined` (a latent edge the UI never dispatches). | actions.ts:4 | gap-contract.test.ts |
| SC-4-42 | Full `GameEvent` catalog (emitted only by `reduce`): moved, deadEnd, blocked, planRejected, drewChamber, enteredSpecial, gameOver, hazardFired, mutinied, medusaGaze, viperPit, eyeForsaken, petrifiedOut, trapSprung, trapAvoided, memberDied, strangerKilled, sorcererSlain, spectreSlew, memberRevived, reaction, pacified, strangersJoined, fightStarted, combatRoll, fightWon, casualtyChosen, crossedSpecial, treasureDropped, treasureReclaimed, artifactUsed, chestOpened, rubyTaken, statueAroused, wardedOff, ghoulsWarded, medusaAverted, droppedRetaken, annihilated, statuePowerless, deathPrevented, unicornGuards, unicornDeparted, carpetUsed, dragonsLulled, vipersLulled, secretDoorRevealed. | actions.ts:25 | gap-contract.test.ts |
| SC-4-43 | Re-entering a Deep Pool with `dropped` heavy treasure enters `pickup` to reclaim it, emitting `treasureReclaimed(count)`. | reduce.ts:128 | reduce.test.ts › re-entering a Deep Pool with dropped treasure enters pickup |
| SC-4-44 | Returning to a chamber holding stone members with a living Wizard bearing the Magic Staff frees them on arrival (`reviveStoned`), emitting `memberRevived`. | reduce.ts:104 | reduce.test.ts › returning with a Wizard + Staff frees them; › without them they stay stone |

## §5 Randomness & Shuffling

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-5-1 | Party selection MUST reject an empty party and any pick whose creature id is not a selectable starter (cost null/undefined). | setup.ts:14-23 | setup.test.ts › rejects empty party; › rejects Wizard id 8 |
| SC-5-2 | Party selection MUST reject a total cost exceeding PARTY_BUDGET=6. | setup.ts:7,24 | setup.test.ts › rejects two Priests = 8 |
| SC-5-3 | Party selection MUST reject picking more copies of a creature than STARTING_STOCK allows. | setup.ts:25-27 | setup.test.ts › rejects two Heroes |
| SC-5-4 | `newGame` MUST throw on invalid picks before building any decks. | setup.ts:33 | setup.test.ts › throws on invalid picks |
| SC-5-5 | The party MUST be drawn FROM the shuffled small pack: each chosen creature's card (100+id) MUST be removed once, so a picked card can never appear as a chamber stranger. | setup.ts:41-45 | setup.test.ts › removes the chosen party cards from the small pack |
| SC-5-6 | The LCG MUST advance as seed ← (seed × 1103515245 + 12345) mod 2^31 (glibc constants), computed in BigInt to avoid 32-bit overflow. | rng.ts:4-11 | rng.test.ts › nextSeed matches the glibc LCG recurrence (nextSeed(1)=1103527590) |
| SC-5-7 | `rollDie` MUST advance the seed, extract upper bits 15..30 (`floor(s/32768) % 65536`), and return `min(5, floor(bits/10923)) + 1`, uniform on 1..6. | rng.ts:14-19 | rng.test.ts › rollDie deterministic; covers full 1..6 range |
| SC-5-8 | `randBelow(seed,n)` MUST return {seed,0} unchanged when n≤0; else advance the seed and return `bits % n`. | rng.ts:22-27 | rng.test.ts › returns [0,n); returns 0 for n≤0 without advancing |
| SC-5-9 | `shuffle` MUST be Fisher–Yates iterating i from length−1 down to 1, drawing j=randBelow(i+1), swapping arr[i]↔arr[j]; pure (new array, input unmutated) and threads the advanced seed. | rng.ts:30-42 | rng.test.ts › is a permutation; does not mutate input; deterministic |
| SC-5-10 | `buildLargePack` MUST shuffle the 60 area-card values (Gateway removed) and return the advanced seed; result is a permutation with no 175. | decks.ts:6-10 | decks.test.ts › 60 cards, no Gateway; deterministic |
| SC-5-11 | `buildSmallPack` MUST shuffle all 71 template cards and return the advanced seed, preserving the multiset. | decks.ts:13-16 | decks.test.ts › preserves the template multiset |
| SC-5-12 | `newGame` MUST consume RNG in order: large pack from the input seed → small pack from the large pack's advanced seed → store the small pack's advanced seed as `state.seed`; largeIdx/smallIdx start at 0. | setup.ts:35-36,80-85 | setup.test.ts › builds a 60-card large pack and small pack minus party |
| SC-5-13 | The engine MUST be fully deterministic from `seed`: no Math.random/Date.now; RNG state lives only in `state.seed` (the seed is a caller-supplied parameter, not clock-derived). | rng.ts:1-3 | rng.test.ts (deterministic cases) |

## §6 Map, Movement & Levels

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-6-1 | Six directions are integer constants: N=1, E=2, S=3, W=4, Up=5, Down=6. | coords.ts:1-6 | gap-data-rng.test.ts |
| SC-6-2 | A coordinate packs (level,x,y) as `level*10000 + y*100 + x`; unpack reverses it. Implies x,y ∈ 0..99. | coords.ts:8-16 | map.test.ts (uses packCoord throughout) |
| SC-6-3 | `targetCoord` steps one unit: N→y−1, S→y+1, E→x+1, W→x−1, Up→level−1, Down→level+1 (x,y kept on stair moves); unknown dir returns the same coord. | coords.ts:19-29 | map.test.ts › descending creates the area below at the same x,y |
| SC-6-4 | An area card decodes as a bitfield: N=1, E=2, S=4, W=8, chamber=16, stairUp=32, stairDown=64, special=(value>>7)&7. | decode.ts:13-24 | decode.test.ts |
| SC-6-5 | `tryMove` is pure: it clones state (`structuredClone`) and returns `{state,moved,deadEnd}`; the original is never mutated. | map.ts:56,61 | map.test.ts › places a non-matching card face-down (original untouched) |
| SC-6.1-1 | A move first decodes the current card; if the direction has no exit/stair bit, return `{moved:false,deadEnd:false}` with the unchanged state (no clone, no draw). | map.ts:57-59 | map.test.ts › returns false when the current card lacks that exit |
| SC-6.1-2 | If an area already exists at the target, a lateral move connects only if the destination card shows the matching reverse doorway (N↔S, E↔W); stair moves (Up/Down) always connect. | map.ts:30-38,76 | map.test.ts › moves into an already-placed adjacent area without drawing |
| SC-6.1-3 | On a successful move: `prev2←prev`, `prev←partyArea`, `partyArea←destination`, `level←target level`; destination flipped `faceUp=true`. | map.ts:78-83,116-119 | map.test.ts › draws and places a matching card face-up; › moves into an already-placed area |
| SC-6.1-4 | Moving into a lateral neighbour NOT showing the reverse doorway prunes that exit bit and returns `deadEnd:true, moved:false` (no draw). | map.ts:84-86 | gap-movement.test.ts |
| SC-6.1-5 | An adjacent area flagged `AF_DESTROYED` (earthquake rubble) is impassable: prune the doorway and return `deadEnd:true`; nothing drawn, cannot return. | map.ts:72-75 | map.test.ts › treats an earthquake-collapsed adjacent area as impassable rubble |
| SC-6.1-6 | If no area exists at the target and the large pack is exhausted (`largeIdx >= largePack.length`), return `{moved:false,deadEnd:false}` unchanged (no dead end). | map.ts:90 | map.test.ts › returns false when the large pack is exhausted |
| SC-6.1-7 | Otherwise draw the next card (`largePack[largeIdx]`, largeIdx++). It connects if the direction is a stair OR the drawn card shows the matching reverse doorway. | map.ts:91-94 | map.test.ts › draws and places a matching card face-up |
| SC-6.1-8 | A connecting drawn card is placed face-up as a fresh `PlacedArea` (`visited:false, contents:[], flags:0, indiffCount:0`), pushed to `areas`, and becomes the party's area. | map.ts:114-120 | map.test.ts › draws and places a matching card face-up |
| SC-6.1-9 | A non-connecting drawn card is placed face-down (still recorded, reusable later), the current card's exit bit is pruned, and `deadEnd:true` is returned. | map.ts:123-126 | map.test.ts › places a non-matching card face-down, prunes the exit, reports a dead-end |
| SC-6.1-10 | Exit-bit pruning clears the single directional bit on the current card only (N→&~1, E→&~2, S→&~4, W→&~8); stairs are never pruned. | map.ts:40-48 | map.test.ts › (asserts `.s` now false); › earthquake-collapsed |
| SC-6.1-11 | Tiles are NEVER rotated: a drawn card is placed in its printed orientation; connectivity uses the printed exits directly. | map.ts:114,123 | — (renderer: tileOrientation.test in apps/web) |
| SC-6.1-12 | Level-1 ceiling: when the target level is 1, the drawn card's stair-up bit is cleared (`drawn & ~32`), so only the Gateway's stair-up exits level 1. | map.ts:93 | map.test.ts › suppresses a stair-up on a freshly drawn level-1 card |
| SC-6.1-13 | Descent secret door: descending onto a drawn card with no printed stair-up mirrors a stair-up (bit 32), records `mirroredStairs=32`, assigns the next `secretDoor` number, increments `state.secretDoors`. | map.ts:103-113 | map.test.ts › descending creates the area below with a mirrored stair-up |
| SC-6.1-14 | Ascent secret door: ascending onto a drawn card with no printed stair-down mirrors a stair-down (bit 64), records `mirroredStairs=64`, assigns the next `secretDoor`. | map.ts:106-113 | map.test.ts › ascending onto a card with no stair down leaves a secret door |
| SC-6.1-15 | A stair move onto a card that already prints the matching stair is not a secret door: `mirroredStairs=0`, `secretDoor` undefined, `secretDoors` unchanged. | map.ts:103-114 | map.test.ts › descending onto a card that already shows a stair up is not a secret door |
| SC-6.1-16 | The mirrored (secret-door) stair is a connectivity link, not printed art: recorded in `mirroredStairs` so tile-art selection can exclude it while traversal uses the full card. | map.ts:114, state.ts:43 | — (renderer contract in apps/web) |
| SC-6.1-17 | The `move` action is legal only in explore. A successful move increments `turn` by 1 and clears `fellThroughTrap`. | reduce.ts:270,278-279 | reduce.test.ts |
| SC-6.1-18 | A failed move emits `{type:"deadEnd",dir}` when dead-end, else `{type:"blocked"}`; the (possibly pruned) state is kept. A successful move emits crossing/special events then `resolveArea` events. | reduce.ts:275-298 | reduce.test.ts |
| SC-6.2-1 | Leaving the cave: `exitCave` is legal only in explore; on level 1 with a stair-up, sets `gs=GS_ESCAPED, phase="gameOver"`, emits `gameOver`. Otherwise `blocked`. | reduce.ts:260-266 | reduce.test.ts |
| SC-6.2-2 | Once escaped there is no return; the reducer no-ops for any action once `gs !== GS_PLAYING`. | reduce.ts:254 | gap-movement.test.ts |
| SC-6.3-1 | Dead-end deadlock / forced redraw is NOT implemented: a dead-end permanently prunes the exit; there is no "return the face-down card and redraw", so a fully boxed-in tunnel can soft-lock. | map.ts (absent) | — (deliberately absent) |
| SC-6-6 | Trap fall (one-way descent): relocates the party to the same (x,y) one level down (fallback card 31 if the pack is empty), adds NO stair-up, places face-up, sets `fellThroughTrap=true`. | reduce.ts:210-226 | hazards.test.ts / trap tests |
| SC-6-7 | Carpet move: teleports one step in `dir` ignoring doors; unexplored → draw (fallback 31), face-up; descending mirrors a stair-up, ascending a stair-down, as `mirroredStairs`; level-1 target suppresses stair-up; `fellThroughTrap=false`; may not exit the cave (Up disallowed on level 1). | reduce.ts:229-251,656-664 | carpet.test.ts |
| SC-6-8 | Retreat/withdraw movement reuse `tryMove`: withdraw returns to `prev`; retreat moves by any doorway/stair; a dead-end retreat stays in place, locks retreats, emits `deadEnd`. Withdraw/retreat up a trap fall is blocked; withdraw onto an earthquake-collapsed `prev` is blocked. | reduce.ts:301-317,548-593 | reduce.test.ts; retreat tests |
| SC-6-9 | Charmed Flute reveals a concealed stairway: in explore with dir Up/Down, if the current card lacks that printed stair but the neighbouring level has the matching stair, set the reveal bit (32 up / 64 down) and emit `secretDoorRevealed`. | reduce.ts:666-683 | flute.test.ts |

## §7 Chambers, Draws, Hazards & Pickup

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-7.1-1 | Entering an area only draws a chamber if the decoded card is a chamber (non-chamber → explore, no draw). Deep Pool / Viper Pit are handled before the chamber path. | reduce.ts:146-149,128-145 | reduce.test.ts › emits moved + drewChamber |
| SC-7.1-2 | First visit: mark `area.visited=true`, then draw `min(state.level,4)` cards from the small pack. | chamber.ts:41-49 | chamber.test.ts › draws min(level,4) on first visit; › more on deeper levels |
| SC-7.1-3 | Tomb of Kings adds +1 to the draw count; Great Hall adds +2. Total is then capped at 8. | chamber.ts:44-46 | chamber.test.ts › +1 in the Tomb; › +2 in the Great Hall |
| SC-7.1-4 | The draw loop stops early when the small pack is exhausted; `smallIdx` advances only per card drawn. | chamber.ts:47-49 | chamber.test.ts › stops early when the small pack is exhausted |
| SC-7.1-5 | Classify each code: `>=400` sleeping creature (−400, cap 8); `>=300` hazard (−300, cap 4); `>=200` treasure (−200, cap 8); else `>=100` stranger (−100, cap 8). Caps MAX_STRANGERS=8, MAX_TREASURE=8, MAX_HAZARDS=4. | chamber.ts:6-22 | chamber.test.ts › classifies each kind |
| SC-7.1-6 | Revisit (`area.visited`): do NOT redraw; reload persisted `area.contents` through the same `classify`. | chamber.ts:39-40 | chamber.test.ts › does not redraw on a revisit; reloads persisted contents |
| SC-7.1-7 | On every entry the working sets and `indiffStreak` are reset (fresh reaction each visit); `lulled` recomputed from flute presence. | chamber.ts:32-37 | gap-misc.test.ts |
| SC-7.1-8 | After loading the working set, `area.contents` is cleared (working set is the live truth). `enterChamber` emits one `drewChamber` with copies of strangers/treasures/hazards. | chamber.ts:51-60 | chamber.test.ts › draws min(level,4) and classifies them |
| SC-7.1-9 | Resolution order (`resolveArea`): reviveStoned → enterChamber → Eye annihilate Spectres → Talisman ward Spectres → applyHazards → whole-party-incapacitated check → trap-fall relocate → flute-lull Dragons → pacified-area check → strangers→encounter / treasure→pickup / else persist+explore. | reduce.ts:121-206 | reduce.test.ts › treasure-only→pickup; › stranger→encounter |
| SC-7.1-10 | If a hazard leaves no living member: `gs=GS_DEAD`, `phase="gameOver"`; if every member is stone also emit `petrifiedOut`; then `gameOver`. | reduce.ts:158-164 | reduce.test.ts › Medusa turning the whole party to stone ends the game |
| SC-7.1-11 | `surpriseReady = freshEntry && !fellThroughTrap` where `freshEntry = !area.visited`. A trap fall never grants surprise. Hostile-area (retreated) entries trigger an immediate fight with surprise to the strangers. | reduce.ts:150,191-199 | reduce.test.ts › attack from a fresh entry; › retreated re-entry immediate fight |
| SC-7.2-1 | Hazards resolve in fixed priority: Earthquake(2), Medusa(3), Ghouls(4), Mutiny(0), Trap(1). Only present hazards fire. | hazards.ts:33-36 | gap-misc.test.ts |
| SC-7.2-2 | Earthquake: collapse the previous area (`prev`, only if `prev !== partyArea`): set `AF_DESTROYED`, clear its contents, append a display-only Earthquake scar to `markers`. Impassable thereafter. | hazards.ts:41-49; state.ts:11 | hazards.test.ts › collapses the previous area; › lays a display-only scar |
| SC-7.2-3 | Medusa: each living member rolls 1d6; ≤2 petrifies → `status=2`, `stoneArea=partyArea`. Emit `medusaGaze` per member. Strangers unaffected. | hazards.ts:51-63 | hazards.test.ts › turns members to stone on a roll of 1-2 |
| SC-7.2-4 | Medusa ward: a living Wizard bearing the Magic Staff makes Medusa powerless — emit `medusaAverted`, skip the gaze entirely. | hazards.ts:24-27,38 | hazards.test.ts › a Wizard bearing the Magic Staff makes Medusa powerless |
| SC-7.2-5 | Ghouls: first every living member drops all heavy treasure onto the chamber floor (into `state.treasures`), keeping weightless artifacts. | hazards.ts:65-75 | hazards.test.ts › Ghouls drop heavy treasure and roll against each member |
| SC-7.2-6 | Ghouls fight: each living member rolls `frontStrength(m,state)+1d6` vs `2+1d6`; emit `combatRoll` (enemy "Ghouls"). If enemy > party the member is slain (`status=3`) and `eyeForsakenByDeath` runs — UNLESS the member is Ring-invincible (holds The Ring, level ≥ 4, no active Eye): then `deathPrevented`, no death. No surprise. | hazards.ts:76-93 | hazards.test.ts › Ghouls drop heavy treasure and roll against each member; ring-invincibility.test.ts › a Ring-bearer at level ≥ 4 is NOT slain by the Ghouls |
| SC-7.2-7 | Ghouls ward: a living member holding the Talisman wards off Ghouls entirely — emit `ghoulsWarded`, no harm. | hazards.ts:20-22,37 | hazards.test.ts › the Talisman wards off Ghouls |
| SC-7.2-8 | Mutiny: all allies desert unless the party is entirely allies (then the first stays loyal). Deserters revert to strangers (creatureId → `strangers`, re-testable), drop all treasure, and leave the party. Emit `mutinied` if any deserted. | hazards.ts:92-108 | hazards.test.ts › reverts allies to strangers and reports it; › keeps one loyal when all allies |
| SC-7.2-9 | Trap: if any living member has FLAG_GUIDES_PAST_TRAP (Dwarf), emit `trapAvoided`; else `fell=true`. A sprung trap → `relocateDown` (one-way fall, no climb-back, `fellThroughTrap=true`) and re-resolve below. | hazards.ts:109-114; reduce.ts:165-172,210-226 | hazards.test.ts › drops one level, negated by a Dwarf; › no climb-back stair |
| SC-7.2-10 | Medusa & Ghouls lurk: after resolution they are re-parked into `area.contents` (300+id) so they reload on every re-entry. The Earthquake scar goes to `markers` and never re-fires. `state.hazards` is then cleared. | hazards.ts:117-129 | hazards.test.ts › Medusa and Ghouls lurk; › Earthquake scar not in contents |
| SC-7.2-11 | Returning to a chamber holding your petrified members with a living Wizard+Magic Staff frees them on arrival (`reviveStoned`): `status=0`, clear `stoneArea`, emit `memberRevived`. Also available at rest/pickup via the staff artifact (not consumed). | reduce.ts:102-118,124,624-629 | reduce.test.ts › returning with a Wizard+Staff frees them; › without them they stay stone |
| SC-7.2-12 | Withdraw is blocked when `prev` has AF_DESTROYED. | reduce.ts:304 | reduce.test.ts › blocked when an earthquake has collapsed the way back |
| SC-7.3-1 | `carriedWeight(member)` = Σ `TREASURES[tid].weight`; artifacts weigh 0. | pickup.ts:5-8 | pickup.test.ts › sums heavy weight, ignoring weightless artifacts |
| SC-7.3-2 | `canCarry(member,tid)` = `carriedWeight + TREASURES[tid].weight <= CREATURES[creatureId].carry`. Capacities: Hero 75, W-Hero 50, Ogre 100, Troll 75, Priest 25, Man 50, Woman 25, Dwarf 25, Wizard 0, Spectre 0, Dragon 0, Sorcerer 0, Giant 150, Unicorn 0. | pickup.ts:11-14; creatures.ts:23-36 | pickup.test.ts › canCarry respects the member's capacity |
| SC-7.3-3 | `takeTreasure(state,ti,mi)`: fails if index/member invalid or `!canCarry`; else push tid onto the member and splice from `state.treasures`. | pickup.ts:17-25 | pickup.test.ts › moves a chamber item to a member; › refuses an over-weight assignment |
| SC-7.3-4 | Pickup only offered when no stranger remains; `takeTreasure` requires the pickup phase. Taking the last treasure calls `persistAndExplore` (phase → explore). | reduce.ts:320-321,371-373 | reduce.test.ts › taking the last treasure returns to explore |
| SC-7.3-5 | `leaveTreasure` (pickup only): `persistAndExplore` — remaining floor treasure parks to `area.contents` (200+tid) and phase → explore; retrievable later. | reduce.ts:376-381,32-51 | reduce.test.ts › leaving treasure parks it and clears the working set |
| SC-7.3-6 | `dropTreasure` (blocked in fight/gameOver): remove `treasure[idx]`. In pickup it lands back on the live floor; else parks on `area.contents`. Dropping the Eye of God (13) increments `curses` and emits `eyeForsaken`. | reduce.ts:426-442 | reduce.test.ts › drops onto the floor; › re-offers pickup-dropped so a Giant can clear room; › blocks during a fight; › forsaking the Eye |
| SC-7.3-7 | `moveTreasure` (blocked in fight/gameOver, and if from===to): recipient must be living and pass `canCarry`. Moving the Eye of God (13) curses the party. | reduce.ts:408-423 | reduce.test.ts › moves when the recipient can carry it; › blocks over-capacity; › forsaking the Eye |
| SC-7.3-8 | Treasure Chest (14) is 100 kg — only a Giant (150) or Ogre (100) can lift it. A carrier may drop items during pickup to free capacity. | treasures.ts:26; pickup.ts:11-14 | reduce.test.ts › re-offers pickup-dropped so a Giant can clear room for the Chest |
| SC-7.3-9 | Lost Ruby (11) is guarded by a strength-8 statue: taking it triggers a wrestle — `frontStrength(fighter)+1d6 >= 8+1d6`. Win → take Ruby, `rubyTaken`. Loss → fighter slain, Ruby left (retryable), `statueAroused`. A living bearer of an active Eye stills the statue (take with no fight, `statuePowerless`). | reduce.ts:323-370 | ruby.test.ts |
| SC-7.3-10 | After a won fight, heavy treasure dropped to fight is reclaimed into pickup. `retakeDropped` (pickup): return each fighter's dropped item to its original holder if living and `canCarry`, else it stays; emit `droppedRetaken`; blocked if none. | reduce.ts:84-96,383-406 | reduce.test.ts › winning reclaims floor-dropped treasure; › retakeDropped returns as distributed |
| SC-7.3-11 | If all strangers stay indifferent (chamber pacified), treasure stays guarded — no pickup; the party may traverse freely (explore) but may still choose Attack. | reduce.ts:183-190 | reduce.test.ts › three indifferent results pacify; › re-entry lets you traverse AND offers Attack |

## §8 Stranger Encounters

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-8.1-1 | On a fresh chamber entry with strangers (area not already pacified/hostile), the party enters `encounter`; `surpriseReady` is set iff a fresh doorway/carpet entry AND not a trap fall. | reduce.ts:191-199 | reduce.test.ts › moving into a chamber with a stranger enters encounter |
| SC-8.1-2 | The three options are Withdraw, Attack, Test. In encounter `legalActions` offers `attack` always; `withdraw` only when legal; `test` only while `indiffStreak < 3`. | selectors.ts:67-76 | reduce.test.ts › (withdraw+test offered) |
| SC-8.1-3 | Withdraw legality: forbidden if `fellThroughTrap` or if `prev` has been destroyed (`AF_DESTROYED`). | selectors.ts:70-72, reduce.ts:301-304 | reduce.test.ts › a trap fall into strangers offers no withdraw |
| SC-8.1-4 | Withdraw parks strangers/treasures/sleeping/lulled onto the current tile's `contents`, clears the working set, moves the party to `prev`, sets `phase=explore`. | reduce.ts:305-317 | reduce.test.ts › withdraw steps back and leaves the strangers behind |
| SC-8.1-5 | Attack from encounter starts a fight; surprise = +1 iff `surpriseReady`, else 0 (NOT unconditional +1). | reduce.ts:505-508 | reduce.test.ts › attack from a fresh entry; › attack with no fresh-entry surprise |
| SC-8.1-6 | Approaching to Test forfeits surprise (`surpriseReady` cleared before the reaction roll). | reduce.ts:448 | reduce.test.ts › attack with no fresh-entry surprise (indirect) |
| SC-8.1-7 | Test is blocked when not in encounter or when `indiffStreak >= 3` (permanently indifferent). | reduce.ts:445-446 | reduce.test.ts › three indifferent results pacify (final test → blocked) |
| SC-8.1-8 | Withdraw/Attack are blocked outside encounter (Attack has a separate explore-phase pacified-guard path — SC-8.5-7). | reduce.ts:302,505 | reduce.test.ts › (blocked withdraw after trap) |
| SC-8.2-1 | Leader = the stranger with the highest `leaderPri`; ties → first in draw order. Ranks: Sorcerer 11, Spectre 10, Dragon 9, Wizard 8, Hero/W-Hero 7, Priest 6, Man/Woman 5, Giant 4, Ogre 3, Troll 2, Dwarf 1, Unicorn 0. | reaction.ts:9-15, creatures.ts:23-36 | reaction.test.ts › findLeader picks the highest leader-priority stranger (ties → first) |
| SC-8.2-2 | All strangers react as the leader (a single reaction roll governs the whole group). | reaction.ts:18-19, reduce.ts:449-489 | reaction.test.ts › (implicit) |
| SC-8.3-1 | Reaction roll = one raw d6 via `rollDie(seed)`; `roll` threaded for display; seed advanced and stored. | reaction.ts:18-34, reduce.ts:449-450 | reaction.test.ts › advances the seed |
| SC-8.3-2 | Charisma modifier: +1 if ANY living/ally member has FLAG_CHARISMA (Hero id 0, W-Hero id 1). | reaction.ts:23-26 | reaction.test.ts › (no-charisma party isolates the raw die) |
| SC-8.3-3 | Curse modifier: subtract `activeCurses(state)` (= `state.curses`, or 0 once the Sorcerer is slain) from the roll. | reaction.ts:27, effects.ts:47-49 | gap-encounters.test.ts |
| SC-8.3-4 | After modifiers the roll is clamped to [1..6]. | reaction.ts:28 | reaction.test.ts › (all 6 faces seen) |
| SC-8.3-5 | Natural-1 rule: if the raw die was 1, the effective roll is forced back to 1 AFTER all bonuses/clamp — a natural 1 always counts as 1. | reaction.ts:21,29 | reaction.test.ts › charisma +1 and curses subtract, but a natural 1 stays 1; › a natural 1 is always hostile |
| SC-8.3-6 | The Ring does NOT modify the reaction roll (only charisma +1 and curses −1 apply). | reaction.ts:18-34 | gap-encounters.test.ts |
| SC-8.4-1 | Outcome from the leader's thresholds: `roll <= hostileMax → hostile`; else `roll <= indiffMax → indifferent`; else `friendly`. Missing `hostileMax` defaults 0; missing `indiffMax` defaults 6. | reaction.ts:31-33 | reaction.test.ts › classifies the roll against the leader's thresholds |
| SC-8.4-2 | Hostile: begins a fight immediately with surprise −1 (strangers gain surprise). | reduce.ts:486-487,64-71 | reduce.test.ts › testing an always-hostile leader starts a fight with surprise to the strangers |
| SC-8.4-3 | Indifferent: increment `indiffStreak`; below 3, remain in encounter. | reduce.ts:474-485 | multi.test.ts › (per-party indifference); reduce.test.ts › three indifferent results |
| SC-8.4-4 | Indifference cap = 3: the 3rd indifferent result adds the area to `pacifiedAreas`, fires `pacified`, and `persistAndExplore` parks strangers+treasure and returns to explore. Treasure stays guarded; the party may leave by any exit. | reduce.ts:475-484,33-51 | reduce.test.ts › three indifferent results pacify the chamber for that party |
| SC-8.4-5 | `indiffStreak` resets to 0 on every chamber entry — the streak counts consecutive indifferents in the current visit only; only `pacifiedAreas` persists across visits. | chamber.ts:37 | gap-misc.test.ts |
| SC-8.4-6 | Indifference/pacification is PER-PARTY (stored on the party's `indiffStreak`/`pacifiedAreas`), so other parties are unaffected. | state.ts:112-118, reduce.ts:465-466,479-480 | multi.test.ts › (seat 0 pacified; seat 1 unaffected) |
| SC-8.4-7 | Friendly: strangers join as allies (`status:1, dragonKills:0, treasure:[]`), up to PARTY_CAP (12); `strangersJoined` event. | reduce.ts:452-460, state.ts:6 | reduce.test.ts › a friendly result recruits the strangers as allies |
| SC-8.4-8 | After a friendly join with no guard remainder: strangers cleared; treasure remaining → pickup, else `persistAndExplore` (→ explore). | reduce.ts:469-473 | reduce.test.ts › a friendly result recruits the strangers as allies |
| SC-8.5-1 | Sorcerer (11): `hostileMax 6` → every roll hostile. "May not test" is enforced by outcome, not by hiding the option. | creatures.ts:34, reaction.ts:31-33 | reaction.test.ts › (Sorcerer always hostile); reduce.test.ts › testing the Sorcerer |
| SC-8.5-2 | Dragon (10): `hostileMax 4, indiffMax 6` → 1–4 hostile, 5–6 indifferent, NEVER friendly. | creatures.ts:33 | reaction.test.ts › a Dragon is 1-4 hostile, 5-6 indifferent, never friendly |
| SC-8.5-3 | Spectre (9): `hostileMax 5, indiffMax 6, leaderPri 10`. Removed before the encounter by the Eye (annihilated, any level) or the Talisman (warded off, level ≥ 4), prior to leader determination. | creatures.ts:32, effects.ts:81-104, reduce.ts:152-153 | wards.test.ts / effects.test.ts |
| SC-8.5-4 | Unicorn (13): `hostileMax 0, indiffMax 0` → always friendly; `leaderPri 0`. On friendly it joins ONLY if a living Woman/W-Hero (FLAG_BEFRIENDS_UNICORN) is present; else it becomes a guard, the area is pacified, and the party moves on. | creatures.ts:36, reduce.ts:453-468, effects.ts:74-78 | reduce.test.ts › (Woman present, Unicorn joins) |
| SC-8.5-5 | An allied Unicorn departs if the last Woman/W-Hero falls (reconciled after each fight round). | effects.ts:107-118, reduce.ts:75-76 | gap-misc.test.ts |
| SC-8.5-6 | The Charmed Flute pre-emptively lulls every Dragon while a valid flute-bearer holds it: Dragons move from `strangers` into `lulled` on entry (before leader determination). Re-evaluated each entry. | reduce.ts:177-182, effects.ts:27-31 | flute.test.ts |
| SC-8.5-7 | Attacking a pacified chamber's guards: in explore, if the area is in `pacifiedAreas` and holds parked stranger markers, Attack un-parks strangers+guarded treasure and starts a fight with surprise 0. | selectors.ts:136-139, reduce.ts:492-504 | reduce.test.ts › a pacified chamber re-entry lets you traverse AND offers Attack |
| SC-8.5-8 | Lotus Dust may be used during the encounter (or fight) to sleep a chosen stranger (removed from `strangers`), but has no effect on a Spectre (not offered). Emptying the pool lets the party proceed past the sleepers. | selectors.ts:24-29, reduce.ts:632-654 | special.test.ts / artifact tests |
| SC-8.5-9 | Retreated-from strangers stay hostile: re-entering an area in `hostileAreas` triggers an on-sight attack with surprise −1 instead of an encounter menu. | reduce.ts:192-194,588-589 | reduce.test.ts (retreat coverage) |

## §9 Fights

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-9.1-1 | A round is resolved from a player battle plan (`{matches: PlanMatch[]}`); each match = `front[]` (1–2 living fighters), `backers[]` (caster indices), `strangers[]` (1–2 foes). Not an auto focus-fire model. | state.ts:62-72, combatPlan.ts:37-89, reduce.ts:511-522 | combatPlan.test.ts › accepts a simple 1-v-1 pairing |
| SC-9.1-2 | A plan is rejected unless `state.phase === "fight"` (`notFighting`). | combatPlan.ts:38 | combatPlan.test.ts › rejects when not in a fight |
| SC-9.1-3 | An empty plan is rejected `emptyPlan`, EXCEPT the forced-Spectre case (SC-9.4-6). | combatPlan.ts:40-48 | combatPlan.test.ts › rejects an empty plan; › still rejects when a foe COULD be engaged |
| SC-9.1-4 | Front group size 1–2; foe group size 1–2; else `groupTooBig`. | combatPlan.ts:56-57 | gap-misc.test.ts |
| SC-9.1-5 | Two-vs-two ban: `front.length===2 && strangers.length===2` is rejected `twoVsTwo`. | combatPlan.ts:58 | combatPlan.test.ts › rejects a 2-against-2 group |
| SC-9.1-6 | A match with backers but no front fighter is rejected `backerNoFront`. | combatPlan.ts:55 | combatPlan.test.ts › rejects a backer with no front fighter |
| SC-9.1-7 | A background slot must be a caster by creature type (base MP>0: Priest 4, Wizard 8), else `backerNotCaster`. By TYPE not current MP — an active Eye (0 MP) still allows a Wizard to back. | combatPlan.ts:71-73, combat.ts:9-11 | combatPlan.test.ts › rejects a non-caster in the background; › allows a Wizard while the Eye nullifies its magic |
| SC-9.1-8 | Party index must be integer, in-range, living, and not reused (`badIndex`/`deadMember`/`memberReused`); stranger index in-range, not reused (`strangerReused`). | combatPlan.ts:60-70 | combatPlan.test.ts › rejects reusing a member; › rejects reusing a stranger |
| SC-9.1-9 | Must-engage-all: every engageable stranger must be engaged unless every living fighter is committed, else `mustEngageAll`. | combatPlan.ts:83-86 | combatPlan.test.ts › rejects leaving an engageable stranger unengaged; › allows leftover when out-numbered; › allows idle fighters once all engaged |
| SC-9.1-10 | Out-numbered gang-up (§395): foes gang up only once the party has no free fighter. Each lone 1-v-1 auto-attaches one extra hand-to-hand foe (enemy MP==0), strongest FS first. While any fighter is free, leftover foes stay separate. | combatPlan.ts:142-163 | combatPlan.test.ts › a lone Hero faces the strongest combination; › does not gang while a fighter is free; › two foes gang a lone fighter |
| SC-9.1-11 | Leftover enemy casters (unengaged, MP>0, out-numbered) fold their MP into the non-Spectre focus match as `enemyBackers`, strongest first. | combatPlan.ts:145-176 | combatPlan.test.ts › a lone Hero faces the strongest combination; › two foes gang a lone fighter |
| SC-9.2-1 | Surprise applies to round 1 only: +1 to that side's die total. `surprise===1` party +1; `===-1` enemy +1; `===0` none. | combatPlan.ts:223-224,265-266 | combatPlan.test.ts › resolves the §417 book example |
| SC-9.2-2 | Party surprise (+1) is set by the Attack action or a fresh (unvisited, non-trap) doorway/carpet entry (`surpriseReady`). Approaching to test forfeits it. Trap falls never grant surprise. | reduce.ts:66,150,198,448,487,508 | gap-fights.test.ts |
| SC-9.2-3 | Strangers gain surprise (−1) when they turn hostile on a test, or on hostile-on-sight (retreated) areas. | reduce.ts:193,487,709-711 | gap-fights.test.ts |
| SC-9.3-1 | Front strength = FS + dragonKills + (if caster) casterMP + Magic-Sword + Strength-Potion. A caster fighting hand-to-hand fights at TOTAL strength (FS + magical power). | combat.ts:20-31 | combat-strength.test.ts › frontStrength is FS + dragon-kills + Magic Sword; › caster hand-to-hand uses TOTAL strength |
| SC-9.3-2 | Magic Sword (3): Hero/W-Hero +2; Man/Woman +1; else +0. Nullified by an active Eye. | combat.ts:25-28 | combat-strength.test.ts › (Man+sword=4, Troll+sword=4) |
| SC-9.3-3 | Strength Potion adds +2 while `potionActive` (consumable, NOT nullified by the Eye). Activated via `useArtifact` id 8 on a living Man/Woman/Hero/W-Hero in a fight; cleared at fight end. | combat.ts:29, reduce.ts:607-614,82,93,586 | gap-fights.test.ts |
| SC-9.3-4 | Background magical power (`casterMP`) = MP + Magic-Staff (Priest +1, Wizard +2). Zeroed by an active Eye. | combat.ts:34-43 | combat-strength.test.ts › casterMP is MP + Magic Staff; › Eye nullifies a front caster's magic |
| SC-9.3-5 | Party match strength = Σ front + Σ backer casterMP. Enemy match strength = Σ (FS + enemy MP) + Σ enemyBackers' MP. | combatPlan.ts:173-176 | combatPlan.test.ts › a party Wizard hand-to-hand matches an enemy Wizard (7/7) |
| SC-9.3-6 | Party roll bonus (added to the die): +1 if any living member holds The Ring (10), negated by an active Eye, minus `activeCurses`. Applied to every party die. | combat.ts:45-49, combatPlan.ts:222,265 | combat-strength.test.ts › partyRollBonus is +1 with The Ring, minus curses |
| SC-9.3-7 | Curses subtract from every party die (−`activeCurses`); no effect once the Sorcerer is dead. | combat.ts:48, effects.ts:47-49 | combat-strength.test.ts › a slain Sorcerer lifts the curse penalty |
| SC-9.3-8 | Match dice: one d6 per side. partyTotal = partyStr + partyRoll + rollBonus + surpriseParty; enemyTotal = enemyStr + enemyRoll + surpriseEnemy. | combatPlan.ts:263-266 | combatPlan.test.ts › resolves the §417 book example |
| SC-9.3-9 | partyTotal > enemyTotal → party wins (strongest foe slain); enemyTotal > partyTotal → enemy wins (party casualty); equal → tie, no one slain. | combatPlan.ts:272-293 | combatPlan.test.ts › a solo win removes the foe and advances the round |
| SC-9.3-10 | On a party win, the slain foe is the strongest of the match (max FS + enemy MP); removed high-index-first after all matches resolve. | combatPlan.ts:276-296 | combatPlan.test.ts › a solo win removes the foe; › a lone Hero faces the strongest combination |
| SC-9.3-11 | Combat produces a `combatRoll` event per match with names, rolls, totals, and result. | combatPlan.ts:267-273 | combatPlan.test.ts (via rolls() helper) |
| SC-9.4-1 | Spectre (9) needs magic or Magic Sword: a front fighter facing one must have casterMP>0 OR be a sword-bearing Man/Woman/Hero/W-Hero (`canSwordSpectre`), else `spectreNeedsMagic`. | combatPlan.ts:26-28,75-80 | combatPlan.test.ts › rejects an ordinary fighter vs a Spectre; › accepts a caster or a sword-bearer |
| SC-9.4-2 | Against a Spectre a caster pits magical power only (casterMP), not front strength; a sword-bearer fights with front strength. | combatPlan.ts:173 | combatPlan.test.ts › a caster pits magical power only; › a sword-bearer fights with front strength |
| SC-9.4-3 | A Spectre is never auto-attached as a gang-up foe; enemy-caster fold-in targets only non-Spectre matches. | combatPlan.ts:148,156,164 | gap-misc.test.ts |
| SC-9.4-4 | An un-fightable, unengaged Spectre left idle auto-slays the strongest living member (by frontStrength) before dice — unless the party has any caster MP or sword-bearer. | combatPlan.ts:246-258 | combatPlan.test.ts › an un-fightable, unengaged Spectre auto-slays the strongest member |
| SC-9.4-5 | Ring-invincibility (level ≥ 4, holds The Ring, no active Eye) prevents the Spectre auto-slay → `deathPrevented`. | combatPlan.ts:254, effects.ts:69-71 | gap-fights.test.ts |
| SC-9.4-6 | Forced-Spectre round: if every remaining stranger is an un-fightable Spectre and the party has no magic/sword, an EMPTY plan is legal; the round is fought and the strongest member auto-slain (avoids deadlock). | combatPlan.ts:40-47,246-258 | combatPlan.test.ts › validates an EMPTY plan when only an un-fightable Spectre remains |
| SC-9.4-7 | Dragon-slayer credit: felling a Dragon (10) single-handed (exactly one front fighter, no backers, one stranger) increments `dragonKills` (+1 FS). A caster backer voids the credit. | combatPlan.ts:282 | combatPlan.test.ts › credits a single-handed dragon slayer; › does NOT credit when a caster backed the kill |
| SC-9.4-8 | Sorcerer (11): an active Eye reduces MP by 2 (never to 0); Lotus Dust (`lotusOnSorcerer`) a further 2; floor 0. Felling him sets `sorcererKilled=true`, emits `sorcererSlain`. | combatPlan.ts:93-101,286 | combatPlan.test.ts › the Eye reduces the Sorcerer by only 2; › slaying the Sorcerer records the kill |
| SC-9.4-9 | Eye of God while held: nullifies party magic & artefact bonuses (Sword, Staff, Ring, caster MP); zeroes stranger MP (Sorcerer excepted). | combat.ts:24,35, combatPlan.ts:100,183,196,201,208, effects.ts:38-40 | combatPlan.test.ts › an active Eye zeroes a stranger Wizard's magic |
| SC-9.5-1 | Heavy-treasure drop (§387): at round resolution every front fighter drops all heavy treasures to the floor (200+tid); recorded in `state.fightDrops`. Artefacts and background casters keep theirs. | combatPlan.ts:230-241 | combatPlan.test.ts › a front fighter drops heavy treasure; › a background caster keeps its heavy treasure |
| SC-9.5-2 | On a win, heavy treasure dropped to the floor is reclaimed into pickup; dropped items are also individually returnable to their droppers via the retake path. | reduce.ts:85-91,384-402 | gap-misc.test.ts |
| SC-9.5-3 | Casualty — single fighter loses: the fighter dies (`status=3`, `memberDied`) + `eyeForsakenByDeath` if it bore the Eye. Ring-invincible → `deathPrevented`. | combatPlan.ts:287-291 | combatPlan.test.ts › curses the party when the Eye's bearer is slain |
| SC-9.5-4 | Casualty — two fighters lose together: a `casualtyQueue` pair is queued (neither dies yet); resolution pauses for `chooseCasualty`. Ring-invincible fighters are filtered out first. | combatPlan.ts:288-298, reduce.ts:519 | combatPlan.test.ts › queues a casualty choice when two front fighters lose together |
| SC-9.5-5 | `chooseCasualty` die: player names a preferred casualty; roll d6, 4–6 grants the preference, 1–3 kills the other. Victim `status=3`; emits `casualtyChosen` (roll & gotPreference), `memberDied`, Eye-forsaken. Finalise when the queue empties. | reduce.ts:524-546 | gap-fights.test.ts |
| SC-9.5-6 | Retreat legality: only in fight, only after round > 1, and NOT if `fellThroughTrap`. May retreat by ANY doorway/stairway (even unexplored). | reduce.ts:548-552 | gap-fights.test.ts |
| SC-9.5-7 | Blocked retreat: a dead-end / no-tile direction fails, sets `retreatBlocked=true`, emits `deadEnd` — the party must fight on. Cleared once a round is fought. | reduce.ts:557-565,518 | gap-fights.test.ts |
| SC-9.5-8 | Successful retreat: strangers + dropped/undropped treasure + sleeping + lulled are LEFT BEHIND; slain members' artefacts left too (§426); living retreat with theirs; the fled area becomes permanently hostile-on-sight; potions cleared; the retreated-into area is resolved fresh. | reduce.ts:567-592 | gap-fights.test.ts |
| SC-9.5-9 | Fight-end (`finalizeRound`): no living party → DEAD/gameOver; all strangers dead → `fightWon`, reclaim floor treasure, then pickup (if treasure) or explore; else the round advanced and fighting continues. A Unicorn departs if the last Woman fell. | reduce.ts:75-99, combatPlan.ts:297 | combatPlan.test.ts › a solo win removes the foe and advances the round |
| SC-9.5-10 | Multi-round flow: `resolveRound` validates → resolves → advances round → opens retreat → pauses if a casualty is queued, else finalises. A pending casualtyQueue blocks a new `resolveRound`. | reduce.ts:511-522 | gap-fights.test.ts |

## §10 Special Areas

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-10-1 | Special-type codes: 0 NONE, 1 GATEWAY, 2 DEEP_POOL, 3 VIPER_PIT, 4 TOMB, 5 GREAT_HALL, decoded via `decodeArea(card).special`. | areaCards.ts:1-6, decode.ts | decode.test.ts › (Gateway/Tomb special decode) |
| SC-10-2 | Each special area appears exactly once; the Gateway is pulled at index 21 and placed as the start. | areaCards.ts:8-9 | gap-data-rng.test.ts |
| SC-10-3 | Entry stops at the edge: on the entry turn the party lands on a Pit/Pool tile and the turn ends in explore — no crossing yet (`enteredSpecial`, phase explore); crossing happens only on the next move out. | reduce.ts:128-145,271-295 | reduce.test.ts › crossing a Deep Pool drops heavy treasure |
| SC-10-4 | Crossing fires only on a genuine crossing — moving out a different doorway than entered, not retracing (`crossing = partyArea !== oldPrev`). | reduce.ts:281-295 | reduce.test.ts › (retrace guard) |
| SC-10.1-1 | Viper Pit crossing: each living member rolls a d6; 1 or 2 is fatal → `status=3` + `memberDied`. Seed threaded per roll. | special.ts:15-37 | special.test.ts › a 1 or 2 means falling in |
| SC-10.1-2 | Fatal threshold is 1 OR 2 (`r.value <= 2`). | special.ts:25 | special.test.ts › emits a viperPit event (r.died === roll<=2) |
| SC-10.1-3 | A fallen member's treasure is lost to the pit (`m.treasure=[]`). Flute-based recovery is NOT modelled. | special.ts:31 | special.test.ts › (death, treasure lost) |
| SC-10.1-4 | Eye of God lost with its bearer curses the party: `eyeForsakenByDeath` adds a curse and emits `eyeForsaken` before clearing treasure. | special.ts:30 → effects.ts:57-61 | gap-special.test.ts |
| SC-10.1-5 | Charmed Flute lulls the vipers — the whole party crosses safely, no rolls (`fluteLulls` → `[{type:"vipersLulled"}]`). | special.ts:18-19 → effects.ts:27-31 | special.test.ts › the Charmed Flute carries everyone across safely |
| SC-10.1-6 | A flute-ineligible carrier (e.g. an Ogre) does not lull; the party rolls to cross. | special.ts:19 → effects.ts:29 | special.test.ts › the Flute does not lull when only an ineligible creature carries it |
| SC-10.1-7 | The `viperPit` event carries the per-member dice display (`rolls:[{creatureId,roll,died}]`). | special.ts:21,35 | special.test.ts › emits a viperPit event with a d6 per living member |
| SC-10.1-8 | A total wipe in the pit ends the game (`gs=GS_DEAD`, gameOver). | reduce.ts:286-291 | gap-special.test.ts |
| SC-10.1-9 | `crossedSpecial(SPECIAL_VIPER_PIT)` emitted on an actual pit crossing. | reduce.ts:283-284 | reduce.test.ts › crossing a Viper Pit with the Flute is always safe |
| SC-10.2-1 | A living Giant (`C_GIANT=12`) carries everything: `deepPoolCrossing` returns `[]`, no drop. | special.ts:44 | special.test.ts › a Giant carries all heavy treasure across |
| SC-10.2-2 | Without a Giant, heavy treasure (ids 0 Silver, 1 Gold, 2 Gems) is removed and pushed onto `area.dropped`; `treasureDropped{count}` per member. | special.ts:41-55 | special.test.ts › without a Giant, heavy treasure is dropped; reduce.test.ts › crossing a Deep Pool without a Giant |
| SC-10.2-3 | Weightless artifacts are kept across the pool (only ids 0/1/2 drop). | special.ts:48,51 | special.test.ts › artifacts are kept |
| SC-10.2-4 | Reclaim on re-entry: entering a Pool tile with non-empty `area.dropped` loads it into `state.treasures`, clears it, emits `treasureReclaimed`, enters pickup. | reduce.ts:128-136 | reduce.test.ts › re-entering a Deep Pool with dropped treasure enters pickup |
| SC-10.2-5 | `crossedSpecial(SPECIAL_DEEP_POOL)` on an actual crossing; drops record on the departed tile (`fromIdx`), not the destination. | reduce.ts:292-294 | reduce.test.ts › crossing a Deep Pool |
| SC-10.2-6 | Retrace does not drop (same `oldPrev` skips the crossing; no `crossedSpecial`). | reduce.ts:281,292 | reduce.test.ts › (no crossedSpecial when retracing) |
| SC-10.3-1 | Tomb of Kings & Great Hall have no crossing behaviour — ordinary chambers (fall through to the normal draw/encounter path). | reduce.ts:146-206 | gap-misc.test.ts |
| SC-10.3-2 | Tomb draws +1, Great Hall +2 extra small cards on first visit (base `min(level,4)`, then +1/+2, capped 8). | chamber.ts:43-46 | chamber.test.ts › +1 in the Tomb; › +2 in the Great Hall |
| SC-10.4-1 | Permanent indifference after 3 indifferent tests (per party): area added to `pacifiedAreas`, `pacified` event, strangers+treasure parked as guarded, phase → explore. | reduce.ts:474-485 | reduce.test.ts › three indifferent results pacify the chamber for that party |
| SC-10.4-2 | Testing a pacified chamber is blocked (`indiffStreak >= 3`); `legalActions` offers no `test`. | reduce.ts:446 | reduce.test.ts › a pacified chamber re-entry (no test action) |
| SC-10.4-3 | Re-entry to a pacified area → free traversal: `persistAndExplore` parks guards, returns in explore, any exit allowed; guarded treasure stays out of reach. | reduce.ts:187-190 | reduce.test.ts › a pacified chamber re-entry lets you traverse AND offers Attack |
| SC-10.4-4 | A pacified chamber still offers Attack: in explore, Attack un-parks strangers and their guarded treasure and starts the fight with no surprise. | reduce.ts:492-503 | reduce.test.ts › a pacified chamber re-entry AND offers Attack; treasure stays guarded |
| SC-10.4-5 | A womanless Unicorn pacifies too: a friendly Unicorn with no Woman guards the area, which is added to `pacifiedAreas`. | reduce.ts:461-468 | gap-special.test.ts |

## §11 Artifacts & Treasure Effects

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-11-1 | Magic Sword (id 3, 15 pts, wt 0) — passive front-strength bonus (never a `useArtifact`): Hero(0)/W-Hero(1) +2; Man(5)/Woman(6) +1; all others +0. | combat.ts:25-28, combatPlan.ts:183-185 | combat-strength.test.ts › frontStrength is FS + dragon-kills + Magic Sword |
| SC-11-2 | A Man/Woman/Hero/W-Hero bearing the Sword may fight a Spectre hand-to-hand at full front strength (satisfies `spectreNeedsMagic`). | combatPlan.ts:26-28,75-79,31-34 | combatPlan.test.ts › accepts a caster or a sword-bearer vs a Spectre; › a sword-bearer fights with front strength |
| SC-11-3 | The Sword bonus is nullified while a living member holds the Eye of God (13) → 0. | combat.ts:24-28, combatPlan.ts:183 | wards.test.ts › suppresses the Magic Sword bonus while the Eye is held |
| SC-11-4 | Magic Carpet (id 4, 5 pts, wt 0) — commanded ONLY by a living Priest(4)/Wizard(8) who carries it (`findBearer`); a Hero holding it is blocked. **This holder-must-qualify coupling is intended.** | reduce.ts:26, selectors.ts:43 | carpet.test.ts › only a Priest or Wizard may command it |
| SC-11-5 | Carpet is usable only in explore with a `dir`; teleports one step ignoring doors, then resolves the new area (drawing a face-up card if unexplored). | reduce.ts:653-664,229-251 | carpet.test.ts › teleports ignoring doors, consumed; › places a new area card |
| SC-11-6 | Valid carpet directions: N/E/S/W, DOWN always, UP only if `level > 1` (will not exit the cave). | reduce.ts:658-659, selectors.ts:44-45 | carpet.test.ts › UP blocked on level 1 |
| SC-11-7 | Carpet is single-use (consumed); blocked outside explore (cannot retreat). Links both ways (`fellThroughTrap=false`). | reduce.ts:660,662,250 | carpet.test.ts › cannot be used to retreat |
| SC-11-8 | KNOWN DEFERRAL: the "no withdraw after a carpet landing into strangers" rule is NOT enforced. | reduce.ts:654-655 | gap-contract.test.ts |
| SC-11-9 | Lotus Dust (id 5, 5 pts, wt 0) — usable by ANY living holder in encounter or fight, targeting a stranger; single-use. | reduce.ts:632-651,28, selectors.ts:25-28 | artifacts.test.ts › sleeps a stranger and is consumed |
| SC-11-10 | Lotus Dust puts the target to sleep: moved from `strangers` into `sleeping` (parked `400+id`; stays in the chamber). | reduce.ts:642-643,39 | artifacts.test.ts › sleeps a stranger; › sleeping the last stranger lets the party proceed |
| SC-11-11 | Lotus Dust has NO effect on a Spectre (9) — blocked, and not offered against a Spectre. | reduce.ts:636, selectors.ts:27 | gap-artifacts.test.ts |
| SC-11-12 | Lotus Dust on the Sorcerer (11) does not sleep him — sets `lotusOnSorcerer`, weakening his MP by −2 (floor 0), and is consumed. | reduce.ts:637-641, combatPlan.ts:94-98 | combatPlan.test.ts › (lotusOnSorcerer); › the Eye reduces the Sorcerer by only 2 |
| SC-11-13 | If Lotus Dust removes the last awake stranger the fight ends: `fight` cleared, all `potionActive` cleared, advance to pickup (if treasure) or explore. | reduce.ts:645-650 | artifacts.test.ts › sleeping the last stranger; › clears potionActive when Lotus ends the last fight-phase stranger |
| SC-11-14 | Healing Balm (id 6, 5 pts, wt 0) — usable ONLY by a living Woman(6)/W-Hero(1)/Priest(4)/Wizard(8) holder; a Hero holding it is blocked. | reduce.ts:24, selectors.ts:36 | artifacts.test.ts › a Woman/Priest/Wizard revives; › rejected when the bearer is not qualified |
| SC-11-15 | Healing Balm is usable in explore or pickup, targeting a dead (status 3) member → status 0; single-use. Blocked if the target is not dead or wrong phase. | reduce.ts:616-622, selectors.ts:35-37 | artifacts.test.ts › a Woman/Priest/Wizard revives a dead member |
| SC-11-16 | Talisman (id 7, 10 pts, wt 0) — passive party ward. At level ≥ 4, while any living member holds it, it drives off every Spectre (9) drawn on entry (`wardedOff`). Below level 4 it does nothing to Spectres. | effects.ts:63-65,80-91, reduce.ts:153 | wards.test.ts › drives off a Spectre at level ≥ 4; › control — level 3 |
| SC-11-17 | Talisman wards off Ghouls at ANY level: the ghoul fight is skipped (`ghoulsWarded`, no harm). | hazards.ts:37 | hazards.test.ts › the Talisman wards off Ghouls |
| SC-11-18 | Strength Potion (id 8, 5 pts, wt 0) — usable by ANY living holder, ONLY in fight, targeting a living Man/Woman/Hero/W-Hero; sets `potionActive`; single-use. Blocked outside a fight or on a non-boostable target. | reduce.ts:607-615, selectors.ts:18-22 | artifacts.test.ts › boosts a Man/Woman/Hero by +2; › rejected outside a fight; selectors.test.ts › offers Potion on a boostable member |
| SC-11-19 | `potionActive` adds +2 to front strength for the fight; NOT nullified by the Eye; cleared when the fight ends. | combat.ts:29, combatPlan.ts:187; cleared reduce.ts:82,93,586,647 | artifacts.test.ts › boosts (frontStrength 7); › clears potionActive |
| SC-11-20 | Magic Staff (id 9, 15 pts, wt 0) — passive caster boost: Priest holder +1, Wizard holder +2 magical power (feeds casterMP and front strength); nullified by the Eye. | combat.ts:38-42,20-31 | combat-strength.test.ts › casterMP is MP + Magic Staff; › Wizard+Staff = 9 |
| SC-11-21 | Magic Staff reanimation (`useArtifact`) — ONLY a Wizard(8) holder, in explore or pickup, targeting a stoned (status 2) member whose `stoneArea` == current area; frees them (status 0). NOT consumed. Blocked for a member stoned elsewhere. | reduce.ts:25,624-630, selectors.ts:39-40 | artifacts.test.ts › a Wizard restores a stoned member, staff NOT consumed; › cannot reach a member stoned in a different chamber |
| SC-11-22 | Passive auto-reanimation: entering/resolving an area with a living Wizard holding the Staff frees any stoned member whose `stoneArea` is that area (emits `memberRevived`). | reduce.ts:104-118,124 | gap-artifacts.test.ts |
| SC-11-23 | Magic Staff also wards Medusa: a Wizard holding it renders Medusa powerless (SC-7.2-4). | hazards.ts:24-27,38 | hazards.test.ts › a Wizard bearing the Magic Staff makes Medusa powerless |
| SC-11-24 | The Ring (id 10, 30 pts, wt 0) — +1 to every party combat die while any living member holds it (minus curses); nullified by the Eye. | combat.ts:45-49 | combat-strength.test.ts › partyRollBonus; wards.test.ts › disables The Ring's roll bonus while the Eye is held |
| SC-11-25 | The Ring makes its bearer immune to killing die-rolls at level ≥ 4 (`deathPrevented`); negated below level 4 and by an active Eye. Applies to EVERY combat die-roll: stranger-fight matches (incl. the Spectre auto-slay), the Ghouls hazard, and the Lost-Ruby statue wrestle. | effects.ts:69-71, combatPlan.ts:254,288-289, hazards.ts:88-90, reduce.ts:353-356 | wards.test.ts › ignores a killing roll at level ≥ 4; › does NOT protect below level 4; ring-invincibility.test.ts › (Ghouls & statue) |
| SC-11-26 | Lost Ruby (id 11, 20 pts, wt 0) — taking it via `takeTreasure` triggers a strength-8 statue fight: `frontStrength + d6` vs `8 + d6`; win claims it (`combatRoll` vs "Statue"), lose slays the fighter (`memberDied`, `statueAroused`) — unless the fighter is Ring-invincible (level ≥ 4): then `deathPrevented` and the Ruby is left in place (attemptable again). | reduce.ts:323-372 | ruby.test.ts › taking the Lost Ruby fights the statue; › an overwhelming fighter always wins; ring-invincibility.test.ts › a Ring-bearer at level ≥ 4 survives a lost statue wrestle |
| SC-11-27 | On a lost wrestle the Ruby is LEFT in place (re-attemptable); the statue does NOT stay aroused — `statueAroused` only labels the wrestle's dice overlay; re-entering never passively attacks. | reduce.ts:353-360 | ruby.test.ts › re-entering the ruby chamber does NOT attack the party |
| SC-11-28 | While the Eye is held the statue is stilled: the Ruby is taken with no fight (`rubyTaken` + `statuePowerless`). | reduce.ts:327-332 | wards.test.ts › the Lost Ruby is taken without a fight while the Eye is held |
| SC-11-29 | Charmed Flute (id 12, 10 pts, wt 0) — "played" only by a living Hero(0)/W-Hero(1)/Priest(4)/Man(5)/Woman(6)/Wizard(8) (`FLUTE_PLAYERS`); this gates all its effects. | effects.ts:12,27-31, reduce.ts:27, selectors.ts:47 | (indirect) |
| SC-11-30 | Passive Dragon lull: on entry, while an eligible player holds the Flute, every Dragon (10) is lulled — moved from `strangers` to `lulled`. Re-evaluated each entry; parks AWAKE (`100+id`); emits `dragonsLulled` on fresh entry. | effects.ts:27-31, reduce.ts:177-182,40 | flute.test.ts › enters a Dragon-only chamber as if empty; › fights the Dragon normally without the Flute |
| SC-11-31 | Passive Viper lull: on the pit crossing, if an eligible player holds the Flute the party crosses unharmed (`vipersLulled`), skipping the fatal-fall rolls. | special.ts:18-19, effects.ts:27 | gap-artifacts.test.ts |
| SC-11-32 | Charmed Flute secret-door reveal (`useArtifact` with dir UP/DOWN), explore only: reveals a concealed stair DOWN (bit 64) if the area below shows a matching stairUp, or UP (bit 32) if the area above shows a matching stairDown. NOT consumed. Blocked if a visible stair exists, no matching area, or during a fight. | reduce.ts:666-684, selectors.ts:48-54 | flute.test.ts › reveals a concealed stair DOWN; › blocked when no matching area; › cannot reveal during a fight |
| SC-11-33 | There is NO explicit "lull" action: `useArtifact` id 12 without a `dir` is blocked (lulling is passive). | reduce.ts:685-688 | flute.test.ts › blocked without a direction — lulling is passive |
| SC-11-34 | Eye of God (id 13, 0 pts, wt 0) — active while any living member holds it (`eyeActive`). Nullifies all party magic: zeroes caster MP, suppresses Sword & Staff, disables the Ring's roll bonus and level-4 invincibility. | effects.ts:38-40, combat.ts:24,35, combatPlan.ts:47, effects.ts:70 | wards.test.ts › zeroes caster MP; › suppresses the Sword; › disables the Ring; effects.test.ts › eyeActive only when a living member holds it |
| SC-11-35 | Eye of God annihilates every Spectre (9) in the current encounter on entry (`annihilated`) — distinct from the Talisman's `wardedOff`. | effects.ts:93-104, reduce.ts:152 | effects.test.ts › annihilateWithEye destroys Spectres when the Eye is held |
| SC-11-36 | Eye of God reduces the Sorcerer's MP by only −2 (not zero); stacks with Lotus Dust (−2), floor 0. | combatPlan.ts:94-98 | combatPlan.test.ts › the Eye reduces the Sorcerer by only 2; › zeroes a stranger Wizard's magic |
| SC-11-37 | Eye of God stills the Lost-Ruby statue (SC-11-28). | reduce.ts:327-332 | wards.test.ts › the Lost Ruby is taken without a fight while the Eye is held |
| SC-11-38 | "Keep it or be cursed": voluntarily dropping (`dropTreasure`) or transferring (`moveTreasure`) the Eye adds a permanent curse (`curses+=1`, `eyeForsaken`). | reduce.ts:421-422,439-440 | reduce.test.ts › forsaking the Eye of God (drop or transfer) curses the party |
| SC-11-39 | When the Eye's bearer is slain (any death path) the gem is left involuntarily and the party is cursed (`curses+=1`, `eyeForsaken`). Wired into casualty choice, combat, ghouls, and viper-pit deaths. | effects.ts:57-61, reduce.ts:538, combatPlan.ts, hazards.ts:88, special.ts:29-31 | combatPlan.test.ts › curses the party when the Eye's bearer is slain |
| SC-11-40 | Treasure Chest (id 14, 0 pts, wt 100, heavy) — opened via `openChest` (not `useArtifact`) by any living holder, ONLY in explore; consumed on opening. Blocked otherwise. | reduce.ts:695-701, selectors.ts:133 | chest.test.ts › rejected outside explore or with no carrier |
| SC-11-41 | Opening rolls a d6: 1 Curse (`curses+=1`); 2 a Spectre attacks one round (forced fight, surprise −1); 3 Sand; 4 Silver +20; 5 Gold +40; 6 Gems +80 `bonusScore`. | reduce.ts:702-718 | chest.test.ts › applies the rolled result across seeds; › scoreGame includes banked chest loot |

## §12 Scoring & Game Over

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-12-1 | The final score is `scoreGame(state)` = `scoreBreakdown(state).total`, a pure function of `GameState` computed on demand at game-over (not stored on `state.score`). | score.ts:70,36 | score.test.ts › sums living members' points plus carried treasure |
| SC-12-2 | Only members with status ORIGINAL(0) or ALLY(1) contribute; STONE(2)/DEAD(3) score nothing. | score.ts:38,41,46 | score.test.ts › excludes stone/dead members; › scores them zero |
| SC-12-3 | Each counting member scores its creature base points `CREATURES[creatureId].points` (Hero 10, Man 5, Priest 8, Wizard 15, Ogre 5, Troll 4, Dwarf 2, Giant 7, Unicorn 4; Spectre/Dragon/Sorcerer 0). | score.ts:40, creatures.ts:23-36 | score.test.ts › sums living members' points |
| SC-12-4 | A dragon-slayer (`dragonKills > 0`) doubles its creature points only (never treasure). | score.ts:39,41 | score.test.ts › doubles a dragon-slayer's creature points (not treasure) |
| SC-12-5 | Each counting member adds Σ `TREASURES[tid].points` for carried treasure (Silver 5, Gold 10, Gems 20, Sword 15, Ring 30, Ruby 20, Flute 10, Eye 0, Chest 0). Treasure points are never doubled. | score.ts:42-46, treasures.ts:12-26 | score.test.ts › itemises each member (Gold 10 + Sword 15) |
| SC-12-6 | Carried treasure is still listed for non-counting members but contributes 0. | score.ts:42-46,22 | score.test.ts › lists stone/dead members but scores them zero |
| SC-12-7 | Slaying the Sorcerer adds a flat +30: `sorcererBonus = sorcererKilled ? 30 : 0`. | score.ts:58, combatPlan.ts:286 | score.test.ts › adds the 30-point Sorcerer bounty |
| SC-12-8 | Banked bonus points (`state.bonusScore`) are added — source: opening a Chest (Silver +20 / Gold +40 / Gems +80). | score.ts:59,63, reduce.ts:714-716 | score.test.ts › itemises each member (bonusScore added) |
| SC-12-9 | Curse penalty is a flat 30 if the party is under ANY curse, NOT 30 per curse. | score.ts:62, effects.ts:47-49 | score.test.ts › a flat 30 curse penalty (not per-curse) |
| SC-12-10 | Slaying the Sorcerer lifts every curse: `activeCurses` returns 0 when `sorcererKilled`, so `cursePenalty` becomes 0. | effects.ts:47-49, score.ts:62 | score.test.ts › lifts every curse penalty once the Sorcerer is slain |
| SC-12-11 | Raw score = Σ(member subtotals) + sorcererBonus + bonusScore − cursePenalty. | score.ts:55,63 | score.test.ts › itemises each member (45 + 5 + 7 = 57) |
| SC-12-12 | Final total clamps at 0: `Math.max(0, raw)`. | score.ts:65 | score.test.ts › (20 − 30 clamped to 0) |
| SC-12-13 | A wiped party (`gs === GS_DEAD`) scores exactly 0, overriding the formula. | score.ts:65 | score.test.ts › a wiped party scores zero |
| SC-12-14 | The Eye of God is worth 0 points, but losing its bearer to death raises a curse → the flat −30 at scoring (unless the Sorcerer is dead). | treasures.ts:25, effects.ts:57-61 | gap-scoring.test.ts |
| SC-12-15 | `ScoreBreakdown` exposes per-member `{creatureId,name,status,counts,creaturePoints,dragonDoubled,treasures[],subtotal}` plus `sorcererBonus`, `bonusScore`, `cursePenalty`, `total` (== `scoreGame`). | score.ts:14-33,36-67 | score.test.ts › itemises each member (b.total === scoreGame(s)) |
| SC-12-16 | ESCAPE trigger: `exitCave` succeeds only in explore, level 1, current card `stairUp` → `gs=GS_ESCAPED`, gameOver. Else `blocked` (non-terminal). | reduce.ts:260-266, decode.ts:20 | reduce.test.ts › exitCave escapes on level 1 with a stair-up; › blocked with no stair-up |
| SC-12-17 | QUIT trigger: `quit` sets `gs=GS_QUIT`, gameOver; available any time (HUD button, not an in-menu explore action). | reduce.ts:257-258 | reduce.test.ts › quit ends the game and emits gameOver(QUIT) |
| SC-12-18 | TOTAL PARTY LOSS: whenever no member has status 0/1, `gs=GS_DEAD`, gameOver. Fires from combat, viper-pit, and other hazard death paths. | reduce.ts:79-83,159-162,286-290,362-364 | gap-scoring.test.ts |
| SC-12-19 | Once over, the reducer short-circuits: `if (gs !== GS_PLAYING) return {state, events:[]}`. | reduce.ts:254 | reduce.test.ts › (action on GS_QUIT state is inert) |
| SC-12-20 | Terminal enum: GS_PLAYING=0, GS_ESCAPED=1, GS_DEAD=2, GS_QUIT=3. Only ESCAPED yields a recordable/savable score in the UI; DEAD/QUIT still render a breakdown but aren't saved (UI-layer, out of engine scope). | state.ts:1-4 | (apps/web GameOverScreen.test.tsx — out of engine scope) |

## §MP Multiplayer

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| SC-MP-1 | The engine does NOT fork single-party rules: multiplayer is one shared Cave + an array of per-seat Party states; each action composes a single-party `GameState` (cave ⊕ party), runs `reduce`, then splits the result back. `reduce` stays the sole authority. | multi.ts:12-17,61-70,166-169 | multi.test.ts › shares the area deck across seats |
| SC-MP-2 | The shared `CaveState` holds exactly: `areas`, `largePack`, `largeIdx`, `smallPack`, `smallIdx`, `seed` (single-instance across seats). | multi.ts:25-33,67-70 | multi.test.ts › shares the area deck across seats |
| SC-MP-3 | Per-seat `PartyCore` = `Omit<GameState, shared-fields>` — every other field (gs, phase, turn, score, curses, partyArea, level, party, strangers, treasures, hazards, fight, pacifiedAreas, …) is private to one seat. | multi.ts:35-44 | multi.test.ts › permanent indifference is per-party |
| SC-MP-4 | `PartyState` adds `seat` (=index), `color`, `name` (required identity), `status` (SeatStatus), `kills`. `reduce` ignores seat/color/name/status. | multi.ts:38-44,61-64 | multi.test.ts › a party per seat |
| SC-MP-5 | `SeatStatus` ∈ `selecting | exploring | left | wiped | quit`. Terminal map: GS_ESCAPED→left, GS_DEAD→wiped, GS_QUIT→quit; else exploring. | multi.ts:23,59,172-173 | multi.test.ts › skips terminal parties and finishes when none remain |
| SC-MP-6 | `buildMpGame(seed, seats)` builds the large pack from `seed`, small pack from its returned seed, then `order = shuffle(small.seed, seats)`. RNG chained deck→deck→order. | multi.ts:110-126 | multi.test.ts › one shared cave with random play order |
| SC-MP-7 | Play `order` is random; `pickOrder = order` reversed (first to pick is last to move). | multi.ts:113-115 | multi.test.ts › pickOrder = order reversed; › drafts in pick order |
| SC-MP-8 | Game starts in phase `partySelect` with one Gateway area; every seat's party starts on the gateway, status selecting, gs PLAYING, phase explore, turn 1, empty roster, kills 0. | multi.ts:116-127 | multi.test.ts › one shared cave; › starts every party with zero kills |
| SC-MP-9 | Party selection is a turn-based draft from the ONE shared small pack, in `pickOrder`. `choosePartyFor` rejects: not partySelect (`not_selecting`), out of turn (`not_your_pick`), already picked (`already_picked`), invalid picks (`invalid`). | multi.ts:131-136 | multi.test.ts › drafts in pick order; out-of-turn → not_your_pick |
| SC-MP-10 | Draft availability is checked against the LIVE shared pack: each pick (`100+id`) is spliced from a copy; a missing card → `unavailable`. Picking depletes the shared pack. | multi.ts:138-147 | multi.test.ts › a card taken by one seat is unavailable to the next |
| SC-MP-11 | On a valid pick, members are built, stored on the seat, the shared pack replaced with the depleted copy, `active++` (through pickOrder). | multi.ts:145-147 | multi.test.ts › drafts in pick order |
| SC-MP-12 | When the last seat has picked, phase → `playing`, `active` resets to 0 (first mover = order[0]), every party status → exploring. | multi.ts:148-151 | multi.test.ts › last pick → play begins; active===0; all exploring |
| SC-MP-13 | In play, `mpReduce` is turn-gated: blocked if phase≠playing, if `order[active] !== seat`, or if the party's status ≠ exploring. | multi.ts:155-159 | multi.test.ts › rejects actions from the seat whose turn it isn't |
| SC-MP-14 | `MpAction` = any `GameAction` plus `{type:"endTurn"}`. `endTurn` passes the turn only while at rest (phase===explore); mid-encounter/fight it is blocked. | multi.ts:56-57,161-164 | multi.test.ts › endTurn passes at rest and is rejected mid-encounter |
| SC-MP-15 | Non-endTurn action: compose → reduce → if the sole event is `blocked` it's a no-op with NO handoff; else split, update the seat's party, and conditionally advance. | multi.ts:166-177 | multi.test.ts › rejects actions (blocked no-op) |
| SC-MP-16 | Only the acting seat's party is mutated; the shared cave (map + deck indices) updates once, others untouched. A move drawing an area consumes the shared large deck. | multi.ts:169,175 | multi.test.ts › a move into a tunnel ends the turn; › shares the area deck |
| SC-MP-17 | `kills` accrue on the acting party only, counting `strangerKilled` + `annihilated` events from that action. | multi.ts:170-173 | multi.test.ts › counts enemies slain on the acting party; › untouched party kills 0 |
| SC-MP-18 | Turn-end (`turnEnds`): passes when the party leaves play, returns to rest (phase===explore), OR completes one fight round (phase fight, empty casualtyQueue) via `resolveRound`/finishing `chooseCasualty`. A fight is one round per turn (others act between rounds). | multi.ts:72-92,176 | multi.test.ts › fights one round per turn; › a planned resolveRound ends the turn |
| SC-MP-19 | Starting a fight (attack, or a hostile test) does NOT fight a round — the turn stays. A pending casualty choice, a continuing reaction test, a blocked retreat, and pickup after a won round all stay within the one turn. | multi.ts:78-91 | multi.test.ts › attack does not yet fight a round; › a casualty choice mid-round does not pass the turn |
| SC-MP-20 | `advanceTurn` scans forward (mod order length) for the next `exploring` party, incrementing `turnCount`; if none remain, phase → `finished`. Terminal parties are skipped. | multi.ts:94-104 | multi.test.ts › skips terminal parties and finishes when none remain |
| SC-MP-21 | `partyView(mp, seat)` returns the composed single-party `GameState` (shared cave ⊕ seat party), including the cave decks so the client's optimistic move-reduce works. | multi.ts:180-184 | gap-multiplayer.test.ts |
| SC-MP-22 | `currentSeat(mp) = order[active]` while playing else null; `currentPicker(mp) = pickOrder[active]` while selecting else null. | multi.ts:186-194 | multi.test.ts › currentSeat===0 |
| SC-MP-23 | Beginner ruleset: NO party-vs-party interaction; each seat sees only the shared cave + its own party. Per-party effects (e.g. `pacifiedAreas`) stay local. | multi.ts:19-21,35-36 | multi.test.ts › permanent indifference is per-party |
| SC-MP-24 | There is NO engine-level standings/winner function: each seat's `score`/`kills` are surfaced via `partyView`; win determination is the caller's. The game reaches phase `finished` when no exploring parties remain. | multi.ts:38-44,103,180-184 | gap-multiplayer.test.ts |

---

# Part II — Rules Narrative

## §3 / §5 Data model & randomness

Sorcerer's Cave is built on two fixed card decks and one seeded random number generator, all held as plain data so a game replays identically from its starting seed. The **large pack** is a set of 61 area cards, each a single integer whose bits encode which of the four compass doorways exist, whether the card is a chamber, whether it has a stair up or down, and which of six "special" area types it is (SC-3-1, SC-3-2). One of those cards, index 21, is the Gateway (value 175) where the party starts; it is lifted out and the remaining 60 are shuffled into the exploration deck (SC-5-10). One data correction matters: card index 41 is an east–west corridor with a stair up (value 42), not the east–west-with-stair-down value the original spec listed, because the latter has no matching tile art (SC-3-3).

The cast is 14 creature types with fixed statistics — fighting strength, magical power, carry capacity, point value, behaviour flags, and reaction thresholds (SC-3-5, SC-3-6). Only the first eight (ids 0–7) can be chosen for the starting party; the rest, from Wizard through Unicorn, appear only inside the cave (SC-3-7). Fifteen treasures (three heavy metals, a heavy chest, eleven weightless artifacts) and five hazards round out the entities (SC-3-10, SC-3-12).

The **small pack** is the deck drawn inside chambers, and it is deliberately a *single finite deck* of 71 cards — 37 creatures, 27 treasures, 7 hazards (SC-3-13 … SC-3-16). Crucially, the same pack supplies both the player's starting party and the strangers met later: when the player builds a party those exact creature cards are removed from the shuffled pack, so a creature taken into the party can never also turn up as a cave stranger (SC-5-5). Party selection is validated against a 6-point budget and per-creature stock limits (SC-5-1, SC-5-2, SC-5-3).

Randomness comes from one linear-congruential generator using the classic glibc constants: the seed advances as `seed × 1103515245 + 12345 mod 2^31`, computed with big integers so nothing overflows (SC-5-6). Every random result reads the *upper* bits (15..30) of the new seed rather than the low bits; a d6 divides that 16-bit value into six equal buckets, and `randBelow(n)` takes it modulo n (SC-5-7, SC-5-8). Shuffling is Fisher–Yates walking from the last index down to the second, and it is pure (SC-5-9). Because the whole engine threads its RNG state through the single `seed` field and never calls the clock or `Math.random`, any game is perfectly reproducible (SC-5-13). Setup pins the consumption order: shuffle the large pack from the given seed, shuffle the small pack from the resulting seed, then store that final seed as the game's live RNG state (SC-5-12).

## §4 The turn lifecycle & action/event contract

The engine runs as a pure reducer: every player decision is a `GameAction`, and `reduce(state, action)` returns a fresh `{ state, events }` pair, where `events` is the authoritative record of what happened (SC-4-1). The UI never infers game facts — it renders only what the reducer emits. Once the game has ended, the reducer is inert (SC-4-2). The one field that governs everything the player can do is `phase`: explore, encounter, fight, pickup, or gameOver (SC-4-3). The interactive contract is that `legalActions(state)` and `reduce` agree exactly — the selector enumerates the actions the UI may present, and the reducer accepts precisely those, rejecting anything else with a `blocked` (or `planRejected`) event and no state change (SC-4-4, SC-4-6). Quitting is a phase-agnostic HUD action, never an in-menu item (SC-4-5, SC-4-7).

A turn begins in explore. `move` is the only turn-advancing action: a success increments `turn` and hands off to area resolution, while a dead end or blocked direction consumes no turn (SC-4-9). Area resolution always announces `moved`, then decodes the tile: a chamber draws its contents and runs hazards in fixed order, folding in Eye-of-God annihilation and Talisman warding (SC-4-11, SC-4-12). A trap fall parks the chamber behind, drops the party one level in the same turn, and can chain (SC-4-14). If the dust settles with strangers present the phase becomes encounter (or an immediate fight if the party once fled here); with only treasure it becomes pickup; otherwise the party rests back in explore (SC-4-15). Surprise is a one-shot flag set only on a genuinely fresh, non-trap entry (SC-4-16).

From encounter the party may withdraw, attack, or test (SC-4-17, SC-4-18, SC-4-22); combat lives in fight, driven by a submitted pairing (`resolveRound`) that resolves one round and either pauses for a `chooseCasualty` decision or finalises (SC-4-24 … SC-4-26); after round one the party may retreat by any exit, marking the abandoned chamber hostile (SC-4-27, SC-4-28). pickup handles `takeTreasure` (with the Lost-Ruby statue fight), `leaveTreasure`, and `retakeDropped` (SC-4-29 … SC-4-31). Treasure redistribution, `useArtifact`, and `openChest` are gated by phase and eligibility (SC-4-32 … SC-4-35). The full action catalog is 16 actions and the event catalog 47 events, both defined in `actions.ts` and produced solely by the reducer (SC-4-41, SC-4-42).

## §6 Map, movement & levels

The cave is a stack of levels, each a sparse grid addressed by a single packed integer `level*10000 + y*100 + x` (SC-6-2). A move names a direction and steps one unit (SC-6-3); it is first validated against the current card's decoded bitfield — no exit or stair in that direction means nothing happens (SC-6.1-1). `tryMove` is pure, cloning state so a rejected move never corrupts the game (SC-6-5). If the destination is already occupied, the party walks there without drawing; a lateral step still requires the destination card to show the reverse doorway, while a stair step always connects (SC-6.1-2, SC-6.1-3). An earthquake-collapsed neighbour is impassable rubble — the doorway onto it is pruned and the move dead-ends (SC-6.1-5).

When the destination is unexplored, the engine draws the next large-pack card (SC-6.1-7), or reports a bloodless failure if the pack is spent (SC-6.1-6). A connecting card is laid face-up and entered (SC-6.1-8); a non-connecting card is laid face-down but recorded (enterable later from another direction), and the doorway tried is pruned so the same doomed direction is never offered twice (SC-6.1-9, SC-6.1-10). Cards are always placed in printed orientation — the engine never rotates a tile (SC-6.1-11).

Vertical travel carries three rules. Level 1 has a ceiling: any stair-up on a card drawn onto level 1 is suppressed, so the Gateway's stair-up is the sole way off the top (SC-6.1-12). Secret doors: descending onto a card with no printed stair-up, or ascending onto one with no printed stair-down, mirrors the missing stair so the party can retrace, tags it `mirroredStairs` (a link, not drawn art), and lays a numbered secret-door marker (SC-6.1-13, SC-6.1-14, SC-6.1-16). Leaving the cave is a distinct action: on level 1 with a visible stair-up, `exitCave` ends the run as ESCAPED, with no return (SC-6.2-1, SC-6.2-2). The one rulebook feature deliberately omitted is the "forced redraw" out of a total dead-end deadlock, so a fully boxed-in tunnel can soft-lock (SC-6.3-1). Two paths bypass door checks: a trap drops the party straight down with no climb-back (SC-6-6), and the Magic Carpet teleports one tile ignoring doors but never out of the cave (SC-6-7).

## §7 Chambers, draws, hazards & pickup

On a party's first visit to a chamber, the engine draws `min(level, 4)` cards from the small pack (SC-7.1-2); the Tomb of Kings adds one and the Great Hall two, capped at eight (SC-7.1-3). Each card is sorted by its numeric band into strangers, treasure, hazards, or sleepers (SC-7.1-5). A revisit never redraws — it reloads whatever was persisted on the tile (SC-7.1-6), and every entry resets the working set and the indifference streak (SC-7.1-7).

Hazards resolve before anything else in a fixed priority: Earthquake, Medusa, Ghouls, Mutiny, Trap (SC-7.2-1). An Earthquake collapses the *previous* tile — flagged destroyed, contents wiped, a scar laid on it — sealing the way back (SC-7.2-2, SC-7.2-12). Medusa rolls 1d6 against each living member; a 1 or 2 turns that member to stone, pinned to the chamber, unless a Wizard bearing the Magic Staff averts her gaze entirely (SC-7.2-3, SC-7.2-4). Ghouls force every member to drop heavy treasure and then fight at strength 2, unless a Talisman-bearer wards them off (SC-7.2-5 … SC-7.2-7). Mutiny sends every ally deserting back into the stranger pool, except that an all-ally party keeps one loyal (SC-7.2-8). A Trap drops the whole party one level, one-way, unless a Dwarf guides them past (SC-7.2-9). Medusa and Ghouls lurk — re-parked to fire again on every re-entry — while the Earthquake scar never re-fires, and petrified members are freed on return by a staff-bearing Wizard (SC-7.2-10, SC-7.2-11).

With the room clear, the party may pick up treasure. Carrying is bounded by weight alone (heavy items 25 kg, the Chest 100 kg; artifacts weigh nothing), checked against each creature's capacity (SC-7.3-1, SC-7.3-2). Pickup is a per-item choice; taking the last item or leaving the rest parks the remainder for later (SC-7.3-4, SC-7.3-5). Members may drop items to free capacity or move them between living members (SC-7.3-6, SC-7.3-7). The Lost Ruby is guarded by a strength-8 statue that must be wrestled (SC-7.3-9), and heavy treasure dumped to fight is reclaimed after a win (SC-7.3-10). If strangers stay merely indifferent, their treasure stays guarded and no pickup is offered, though the party may still attack (SC-7.3-11).

## §8 Stranger encounters

When a party enters an occupied chamber, play stops at the encounter phase and it must commit to withdraw, attack, or test (SC-8.1-1, SC-8.1-2). Attacking immediately is the only way to seize surprise: a fresh, non-trap entry sets `surpriseReady`, and attacking then opens the fight +1; any delay, or choosing to test, forfeits that edge (SC-8.1-5, SC-8.1-6). Withdrawal steps back to the prior tile, leaving the strangers behind — but it is barred with no way back (up a trap fall, or into an earthquake-collapsed tile) (SC-8.1-3, SC-8.1-4).

To test reaction, the engine finds the group's leader — the stranger of highest leader-priority, ties to the first drawn (SC-8.2-1) — and the whole group reacts as that leader does (SC-8.2-2). One d6 is rolled, +1 for any living charismatic member and −1 per active curse, then clamped to 1–6; but a natural 1 always counts as 1 (SC-8.3-2 … SC-8.3-5). The adjusted roll is read against the leader's thresholds: hostile, indifferent, or friendly (SC-8.4-1). Hostile throws the party into a fight with surprise to the strangers (SC-8.4-2); friendly recruits every stranger as an ally up to the twelve-member cap (SC-8.4-7); an indifferent result advances a streak, and the third consecutive indifferent permanently pacifies the chamber for this party (its guards and treasure parked, the party freed to leave) (SC-8.4-3, SC-8.4-4). The streak is per-visit and the whole indifference state is tracked per party (SC-8.4-5, SC-8.4-6).

Several creatures bend the rules: the Sorcerer is hostile on every roll (SC-8.5-1); the Dragon is never friendly (SC-8.5-2); the Spectre is annihilated by the Eye or warded by the Talisman before the reaction is rolled (SC-8.5-3); the Unicorn is always friendly but only *joins* a party with a living Woman, otherwise guarding and pacifying the area (SC-8.5-4, SC-8.5-5); and a Charmed Flute lulls every Dragon on entry so a gentler creature leads (SC-8.5-6). A pacified chamber may be traversed freely but may still be attacked to win the guarded treasure, with no surprise (SC-8.5-7).

## §9 Fights

A fight is fought one round at a time, each round driven by an explicit battle plan the player submits (SC-9.1-1). A plan is a list of matches; each sends one or two living members to the front against one or two strangers, optionally with caster backers behind. The engine validates hard before dice: no empty plan (bar the forced-Spectre case), no two-against-two, backers must be casters by type, every index used once, and every engageable stranger engaged unless the party is out of fighters (SC-9.1-3 … SC-9.1-9). When out-numbered, the §395 "strongest combination" kicks in — foes gang onto lone fighters and leftover enemy casters fold their magic into the focus match (SC-9.1-10, SC-9.1-11).

Strength is the heart of resolution: a fighter's total is its fighting strength plus dragon-slayer bonus plus Magic-Sword plus an active Strength Potion, and a Priest or Wizard fighting hand-to-hand fights at its *total* strength (SC-9.3-1). Backers add magical power only. Two adjustments ride the die instead: The Ring gives +1 to every party roll and each curse subtracts one — though a curse stops biting once the Sorcerer dies (SC-9.3-6, SC-9.3-7). Surprise (+1) applies to round one only (SC-9.2-1). Each side rolls one d6; higher total slays the strongest creature in the losing group, a tie kills no one (SC-9.3-8 … SC-9.3-10).

Special rules overlay this: a Spectre can only be fought with magic or a Magic Sword, and an un-fightable idle Spectre simply slays the strongest member (SC-9.4-1, SC-9.4-4); felling a Dragon truly single-handed earns a permanent +1 (SC-9.4-7); the Sorcerer is weakened but never neutralised by the Eye and Lotus Dust (SC-9.4-8); and an active Eye of God nullifies every magic and artefact bonus on both sides, the Sorcerer excepted (SC-9.4-9). Before fighting, front-line fighters drop heavy treasure to the floor so it is not lost if they fall (SC-9.5-1). A single loser dies; when two lose together the player picks and a die decides (4-6 grants the pick) (SC-9.5-4, SC-9.5-5). After round one the party may retreat by any exit, and if that way dead-ends it is bounced back (SC-9.5-6, SC-9.5-7); a successful retreat abandons the chamber, which stays permanently hostile (SC-9.5-8). A fight ends when every stranger is dead (victory → pickup/explore) or the whole party falls (SC-9.5-9).

## §10 Special areas

The cave holds five specially-marked areas, distinguished by a numeric special-type in the card encoding (SC-10-1): the Gateway, the Deep Pool, the Viper Pit, the Tomb of Kings, and the Great Hall. When the party first turns over a Pool or Pit card it steps only onto the near edge, and the crossing is deferred to the following turn — and only if it leaves through a *different* doorway than it entered (SC-10-3, SC-10-4). Retracing is always safe.

Crossing the **Viper Pit** is resolved one member at a time: each rolls a d6, and a 1 or 2 is fatal (SC-10.1-1, SC-10.1-2). A fallen member's treasure is lost to the pit, and losing the Eye of God's bearer there curses the party (SC-10.1-3, SC-10.1-4). The one safe passage is the Charmed Flute — a member able to play it lulls the vipers so the whole party crosses with no rolls (SC-10.1-5). Crossing the **Deep Pool** tests whether the party can carry its wealth through deep water: a living Giant shoulders it all, but without one every member must abandon its heavy metals to the pool, keeping only weightless artifacts (SC-10.2-1 … SC-10.2-3); dropped treasure is offered back for reclaiming if the party returns (SC-10.2-4). The **Tomb of Kings** and **Great Hall** are ordinary chambers with no crossing, distinguished only by richer draws (SC-10.3-1, SC-10.3-2). Finally, any chamber can become **pacified** — a per-party free-traversal state after three indifferent tests or a womanless Unicorn's guardianship — walked through freely, its treasure guarded, but still open to attack (SC-10.4-1 … SC-10.4-5).

## §11 Artifacts & treasure effects

**Passive combat artifacts** change a fight's arithmetic without any action: the Magic Sword sharpens a human-shaped fighter and lets a sword-bearer face a Spectre (SC-11-1, SC-11-2); the Magic Staff deepens a caster's power (SC-11-20); the Ring blesses every party die with +1 and, from level four, makes its bearer immune to a killing roll (SC-11-24, SC-11-25) — and every one of these magics is snuffed out by the Eye of God. **Consumable aids:** the Strength Potion is a single +2 surge that alone survives the Eye (SC-11-18, SC-11-19), and Lotus Dust sends a single stranger to sleep, though a Spectre resists and the Sorcerer is merely weakened (SC-11-9 … SC-11-12).

**Restorative artifacts:** the Healing Balm revives a fallen comrade at rest or during looting (SC-11-14, SC-11-15), and the Magic Staff doubles as a Wizard's wand of reanimation for a companion turned to stone in the current chamber, freeing them automatically on return (SC-11-21, SC-11-22). **Ward artifacts:** the Talisman turns Ghouls away at any depth and drives off Spectres from level four down (SC-11-16, SC-11-17). **Movement & discovery:** the Magic Carpet answers only to a Priest or Wizard and whisks the whole party one tile in any direction save out of the cave, a one-flight relic (SC-11-4 … SC-11-7); the Charmed Flute lulls Dragons and vipers while held and reveals concealed stairways when played (SC-11-29 … SC-11-33).

**Perilous treasures:** the Lost Ruby is guarded by a strength-8 statue that strikes only the one who reaches for it (SC-11-26, SC-11-27), and the Treasure Chest is a 100-kg gamble opened on a die — sand, riches, a curse, or a Spectre (SC-11-40, SC-11-41). Both are undone by the **Eye of God**, the campaign's double-edged relic: while borne it darkens all party magic yet annihilates Spectres, stills the statue, and clips even the Sorcerer (SC-11-34 … SC-11-37). Its price is loyalty — forsake it by dropping, handing off, or dying with it, and the party is cursed, one curse per abandonment (SC-11-38, SC-11-39).

## §12 Scoring & game over

Scoring happens only at game-over and is derived purely from the final state by `scoreGame` (SC-12-1). Every surviving member — status ORIGINAL or ALLY — contributes its creature's point value plus the points of every treasure it carries out; stone and dead members score nothing (SC-12-2, SC-12-3, SC-12-5). A member who has slain a Dragon doubles its own creature points, never its treasure (SC-12-4). Three party-wide adjustments follow: +30 for slaying the Sorcerer (SC-12-7), banked Treasure-Chest loot (SC-12-8), and a **flat 30-point** deduction for being under any curse — not 30 per curse — which is lifted entirely if the Sorcerer is killed (SC-12-9, SC-12-10). The raw total is clamped so it can never go below zero (SC-12-12).

The game ends in exactly three ways: a party escapes (`GS_ESCAPED`) only by invoking `exitCave` on a level-1 area with an up-stair (SC-12-16); it may abandon at any time (`GS_QUIT`, SC-12-17); or it is wiped when the last living member is lost (`GS_DEAD`, SC-12-18). A wiped party scores exactly zero regardless of loot (SC-12-13). Once any terminal state is reached the reducer refuses all further actions (SC-12-19). Although the engine computes a positive breakdown for an escaped or even an abandoned party, only an escaped party's score is treated as recordable by the surrounding UI (SC-12-20).

## §MP Multiplayer

A multiplayer game is one **shared Cave** explored by up to four **parties**, one per seat (SC-MP-1). The Cave — the map of placed cards, both decks with their indices, and the seed — is common to everyone (SC-MP-2); everything else (roster, position, phase, score, curses, active fight, pacified chambers) is private to one seat (SC-MP-3). The engine never forks its rules: a seat's action composes a temporary single-party view, runs the ordinary `reduce`, then splits the result apart (SC-MP-1, SC-MP-15). Play order is decided at random at build time, and the pick order is that reversed — first to draft is last to move (SC-MP-6, SC-MP-7). Selection is a turn-based draft from the one shared creature pack, so a card another seat took is unavailable (SC-MP-9, SC-MP-10). In play, `mpReduce` is strictly turn-gated (SC-MP-13); a seat's move touches only its own party plus the shared cave (SC-MP-16). The turn passes when a party returns to rest, leaves play, or completes one round of a fight — because a battle is fought one round per turn, other parties acting between rounds (SC-MP-18). Turn advance skips terminal parties, and once none are exploring the game is finished (SC-MP-20). Under this beginner ruleset there is no party-vs-party interaction, and the engine tracks each party's score and kills but does not itself compute a winner (SC-MP-23, SC-MP-24).

---

# Appendix A — Data tables & constants

## A.1 Creatures (`data/creatures.ts`)

| id | name | fs | mp | carry | cost | pts | leaderPri | hostileMax / indiffMax | notable flag |
|----|------|----|----|-------|------|-----|-----------|------------------------|--------------|
| 0 | Hero | 5 | 0 | 75 | 6 | 10 | 7 | 3 / 3 | CHARISMA |
| 1 | W-Hero (Woman-Hero) | — | — | 50 | 5 | — | 7 | — | CHARISMA, BEFRIENDS_UNICORN |
| 2 | Ogre | — | 0 | 100 | 5 | 5 | 3 | — | INHUMAN |
| 3 | Troll | — | 0 | 75 | 4 | 4 | 2 | — | INHUMAN |
| 4 | Priest | — | >0 | 25 | 4 | 8 | 6 | 1 / 4 | (caster) |
| 5 | Man | — | 0 | 50 | 3 | 5 | 5 | 2 / 4 | HUMAN |
| 6 | Woman | — | 0 | 25 | 2 | 5 | 5 | 2 / 4 | HUMAN, BEFRIENDS_UNICORN |
| 7 | Dwarf | — | 0 | 25 | 1 | 2 | 1 | 0 / 4 | GUIDES_PAST_TRAP |
| 8 | Wizard | — | 5 | 0 | null | 15 | 8 | — | (caster) |
| 9 | Spectre | — | — | 0 | null | 0 | 10 | 5 / 6 | needs magic/sword |
| 10 | Dragon | 6 | — | 0 | null | 0 | 9 | 4 / 6 | never friendly |
| 11 | Sorcerer | — | 9 | 0 | null | 0 | 11 | 6 / — | always hostile |
| 12 | Giant | 7 | — | 150 | null | 7 | 4 | — | carries anything |
| 13 | Unicorn | — | — | 0 | null | 4 | 0 | 0 / 0 | joins only with a Woman |

> Fields shown as `—` are not individually pinned by a data test (see SC-3-5); consult `data/creatures.ts` for the authoritative full row. Selectable starters are exactly ids 0–7 (`cost !== null`, SC-3-7). Flags bitmask: HUMAN=1, CHARISMA=2, BEFRIENDS_UNICORN=4, GUIDES_PAST_TRAP=8, INHUMAN=16 (SC-3-6).

## A.2 Treasures (`data/treasures.ts`)

| id | name | pts | weight | kind |
|----|------|-----|--------|------|
| 0 | Silver | 5 | 25 | heavy |
| 1 | Gold | 10 | 25 | heavy |
| 2 | Gems | 20 | 25 | heavy |
| 3 | Magic Sword | 15 | 0 | artifact |
| 4 | Magic Carpet | 5 | 0 | artifact |
| 5 | Lotus Dust | 5 | 0 | artifact |
| 6 | Healing Balm | 5 | 0 | artifact |
| 7 | Talisman | 10 | 0 | artifact |
| 8 | Strength Potion | 5 | 0 | artifact |
| 9 | Magic Staff | 15 | 0 | artifact |
| 10 | The Ring | 30 | 0 | artifact |
| 11 | Lost Ruby | 20 | 0 | artifact |
| 12 | Charmed Flute | 10 | 0 | artifact |
| 13 | Eye of God | 0 | 0 | artifact |
| 14 | Treasure Chest | 0 | 100 | heavy |

## A.3 Hazards (`data/hazards.ts`) & packs

- **Hazards** (ids 0–4): Mutiny, Trap, Earthquake, Medusa, Ghouls (SC-3-12).
- **Large pack:** 61 area cards; Gateway (value 175, index 21) removed → 60 shuffled (SC-3-1, SC-5-10).
- **Small pack:** one finite 71-card deck — 37 creatures + 27 treasures + 7 hazards (SC-3-13). Creature mix Hero1 W-Hero1 Ogre3 Troll3 Priest3 Man6 Woman3 Dwarf3 Wizard3 Spectre3 Dragon3 Sorcerer1 Giant3 Unicorn1 (SC-3-14); treasures Silver6 Gold6 Gems3 + 1× each artifact 3–14 (SC-3-15); hazards Mutiny1 Trap2 Earthquake2 Medusa1 Ghouls1 (SC-3-16). Card codes: 100+creatureId, 200+treasureId, 300+hazardId, 400+creatureId (sleeping) (SC-3-17).

## A.4 Key constants (`state.ts`, `setup.ts`, `coords.ts`)

| Constant | Value | Meaning |
|----------|-------|---------|
| PARTY_BUDGET | 6 | party-selection point budget |
| PARTY_CAP | 12 | max party members |
| GS_PLAYING / ESCAPED / DEAD / QUIT | 0 / 1 / 2 / 3 | terminal game-state |
| Member status ORIGINAL / ALLY / STONE / DEAD | 0 / 1 / 2 / 3 | member lifecycle |
| AF_DESTROYED | 4 | earthquake-collapsed area flag |
| DIR_N / E / S / W / UP / DOWN | 1 / 2 / 3 / 4 / 5 / 6 | direction constants |
| GATEWAY_START_COORD | 15050 | level 1, x=50, y=50 |
| coord packing | `level*10000 + y*100 + x` | x,y ∈ 0..99 |
| Draw caps | strangers 8, treasure 8, hazards 4 | per chamber working set |
| Chamber draw | `min(level,4)` (+1 Tomb, +2 Great Hall), cap 8 | first visit |

## A.5 The RNG algorithm (`rng.ts`) — for faithful ports

```
A = 1103515245, C = 12345, M = 2^31
nextSeed(s)      = (s*A + C) mod M          # 62-bit product; only the low 31 bits matter (M = 2^31)
bits(s')         = floor(s' / 32768) mod 65536   # upper bits 15..30
rollDie(s)       -> s' = nextSeed(s); value = min(5, floor(bits(s')/10923)) + 1   # 1..6
randBelow(s, n)  -> n<=0 ? {s,0} : (s'=nextSeed(s); {s', bits(s') mod n})
shuffle(s, arr)  -> Fisher–Yates, i = len-1 .. 1, j = randBelow(i+1), swap; returns {advanced seed, new array}
```

> Port note: because `M = 2^31` is a power of two, only the low 31 bits of the product are needed — a 32-bit truncating unsigned multiply masked with `& 0x7FFFFFFF` reproduces `nextSeed` exactly; 64-bit math is not required.

---

# Appendix B — Corrections vs the v1 design-spec

The v1 `design-spec.html` predates most of the artifact, hazard, combat, and multiplayer work; its §15 "Gap Analysis" and §16 "Implementation Sketches for the Open Gaps" are almost entirely obsolete. Key corrections (code is authoritative):

**Data model (§3/§5):** the small pack is **71 cards** (one finite deck shared between party selection and chamber draws), not the old two-pool 52-card model; hazards ship **two Earthquakes** (not one); area-card index 41 is **42 (EWU)**, not 74; the seed is a **caller-supplied parameter**, not clock-derived.

**Turn model (§2.2/§4):** the engine is a **pure phase-machine reducer** (`reduce(state, action) → {state, events}`), not the old blocking keystroke loop; the five `phase` values and the full 16-action / 47-event catalogs are the real boundary and were absent from v1.

**Movement (§6):** earthquake-rubble impassability, ascent secret doors + numbered markers, the **never-rotate** tile rule, and length-driven pack-exhaustion are all real and were missing/incorrect in v1.

**Encounters (§8):** the human reaction tables are **real** (Hero 3/3, Priest 1/4, Man/Woman 2/4, Dwarf 0/4 — not em-dash); the **Dragon is 4/6** (1–4 hostile), not always-hostile; Attack is **+1 only on a fresh entry** (not unconditional); Withdraw is **not always available**; the womanless-Unicorn guard, Charmed-Flute Dragon lull, and pacified-chamber Attack are all implemented.

**Fights (§9):** combat is a **submitted battle plan** with a full validation set (two-vs-two ban, must-engage-all, gang-up, enemy-caster fold-in), not auto focus-fire; Ring invincibility, Strength Potion activation, casters-fight-at-total-strength, heavy-treasure drop, blocked-retreat, and the choose-a-casualty die are all implemented.

**Special areas (§10):** the Viper-Pit fatal threshold is **1 or 2**; Deep-Pool drops all heavy treasure to a single `dropped` list on the tile (no per-doorway model); flute-based pit-treasure recovery is **not** modelled.

**Artifacts (§11):** every "not implemented" in the v1 status table (Talisman, Healing Balm, Lotus Dust, Magic Carpet, Lost Ruby statue, Eye of God, Treasure Chest, Magic Staff reanimation) and every §16 sketch is now **shipped code**; the Lost-Ruby statue strikes **only the wrestler** (it does not stay aroused); the Eye curses on drop, transfer, **and** death.

**Scoring (§12):** the curse penalty is a **flat −30** (not −30 per curse) and is lifted entirely by slaying the Sorcerer; the formula now includes **`bonusScore`** (banked Chest loot); "no breakdown on quit" is a UI decision, not an engine rule (the engine only zeroes for `GS_DEAD`).

**Multiplayer (§MP):** entirely undocumented in v1 (which listed multiplayer as out of scope); now implemented in `multi.ts` as a shared-cave / per-seat-party model.

---

# Appendix C — Test-coverage gaps

**None.** Every requirement in Part I now carries a direct engine unit test (see its `test` column). The gaps this appendix previously tracked were closed by dedicated characterization suites under `packages/engine/src/`:

`gap-data-rng`, `gap-contract`, `gap-movement`, `gap-encounters`, `gap-fights`, `gap-special`, `gap-artifacts`, `gap-scoring`, `gap-multiplayer`, and `gap-misc` (`gap-*.test.ts`).

Full engine suite: **327 tests green**. Keep it that way — when a requirement changes, update both its `test` reference here and the test itself (see the repo `CLAUDE.md`).
