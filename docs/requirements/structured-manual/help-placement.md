# Structured Manual — Where each section's help goes

Companion to `plan.md`. Phase 1 (card help) is done. This decides, for every manual section not yet in the UI,
**which screen shows it, in what form, and under which topic ids**, and what shared machinery that needs.

## Principles

1. **Show the rule where the decision is made.** Help sits next to the control or number it explains, not in a
   separate place the player must go and look for.
2. **Short by default, full on demand.** Each topic gets a one-sentence `brief` (tooltip / inline hint) and its full
   `blocks`. The long manual prose is split into small topics; nothing is shown as a wall of text.
3. **One topic, many homes.** A topic is addressed by id and can appear in several places (e.g. "reaction roll" in
   the encounter panel *and* on every creature's card help). Content is written once.
4. **A catch-all home for everything else.** Sections with no natural screen (Quest, tips, controls, house-rule
   overview) live in a browsable Help panel. This is also what finally lets `manual.html` be retired.
5. **Never nag.** Help is pull, not push: closed disclosures, "?" buttons, tooltips. No first-run tours in this plan
   (see open questions).

## The four help surfaces

| # | Surface | Used for | Status |
|---|---|---|---|
| A | **Card help** — folded *Help* at the foot of the card panel | anything that is a card | done |
| B | **`<HelpButton topic="id">`** — a small "?" beside a control/heading; opens the topic in a popover (in-game) or sheet (pre-game screens, phones) | decision points: encounter choices, fight steps, party select, score lines, multiplayer actions | new |
| C | **Help panel** — a "?" icon in the title bar opening a right-hand slot: *Help for this screen* (topics tagged with the current context) above a browsable list of all sections with search | catch-all; replaces `manual.html` | new |
| D | **Tooltips from `brief`** — title-bar icons, buttons, badges | controls, status words, badges | new (tiny) |

Pre-game screens (splash, party select, lobby, high scores) are outside the in-game shell, so they use B (sheet)
and a plain "How to play" link that opens C in a modal.

### Machinery to add (once, in phase 2)

- `Topic.brief?: string` and `Topic.contexts?: HelpContext[]`, where `HelpContext` is a closed union
  (`'explore' | 'encounter' | 'fight' | 'fight-revised' | 'fight-pvp' | 'inventory' | 'party-select' | 'draft' |
  'lobby' | 'play-mp' | 'standings' | 'game-over' | 'high-scores' | 'splash' | 'settings' | 'trap' | 'sorcerer-terms'`).
- `topicsForContext(ctx)` beside `topicsForCard`; `topicById` already exists.
- `<HelpButton topic>` / `<HelpTopic id>` components; `useHelpContext(ctx)` so each screen declares what it is and
  the Help panel (C) can list "for this screen".
- Drift tests: every `topic="…"` literal in `src` resolves; every `HelpContext` has at least one topic; every topic in
  a section is reachable from the Help panel's browse list.
- Ordinary vs revised combat are separated by **context**, not `variant`, so the fight screen only offers the rules
  that screen actually plays.

## Section-by-section

Topic ids are proposed (`kebab-case`, stable). "New" content = prose still to transcribe from `manual.html`.

### I. The Quest
| Content | Where | Form |
|---|---|---|
| What the game is, how it's won | Help panel intro (`quest-overview`); splash **How to play** link | C |
| The four-letter game code and resume | Settings panel next to the CODE field (`game-code`); splash *Resume* field | B |
| Epigraph, "Play the game" CTA | Splash screen only (no help needed) | — |

### II. Building Your Party
| Content | Where | Form |
|---|---|---|
| The 6-point budget, up to 12 members | `PartySelect` heading (`party-budget`) | B |
| Per-creature facts (cost, points, specials) | Each recruit row opens its existing creature topic (phase 1 content) | B reusing A's topics |
| Charisma, Dwarf, Priest explanations | Already in creature topics; add `brief` for row tooltips | D |
| Party colour | Needs none | — |
| Shared-pack draft in multiplayer | `PartyDraft` heading (`mp-draft`) | B |

### III. Exploring the Cave
| Content | Where | Form |
|---|---|---|
| Moving (keys, markers, orbit/zoom) | Title bar and compass tooltips; full list in Help panel *Controls* (`controls`) | D, C |
| Dead ends | `DeadEndSwapBadge`, "no viable exits" notice, exit marker tooltip (`dead-end`) | B, D |
| Fog cards | Area card help for fog tiles (`fog-card`) | A |
| Cards drawn by depth | Already in chamber/tunnel area help | A |
| HUD at a glance (title bar, settings, area cards, compass, card panel) | Title bar icon tooltips (`brief`) + *Interface tour* topic (`hud-tour`) in Help panel | D, C |
| Verbose descriptions option | Settings checkbox (`verbose-descriptions`) | B |

### VI. Strangers & Reactions (the parts not on a card)
| Content | Where | Form |
|---|---|---|
| Withdraw / Attack / Test their reaction | `EncounterPanel` heading and each action's tooltip (`encounter-choices`) | B, D |
| Leader order, charisma/curse modifiers, natural 1 | `EncounterPanel` beside the test button (`reaction-roll`, `leader-order`) | B |
| Friendly / indifferent / hostile; three indifferents | `EncounterPanel` result line (`reaction-results`, `permanent-indifference`) | B |
| Tip: attack on entry for surprise | `EncounterPanel` hint (`tip-surprise`) | D |

Split the current `creature-reactions` general topic into these ids; creature card help keeps including them.

### VII. Fights (plus XV revised combat)
| Content | Where | Form |
|---|---|---|
| Surprise, pairing, casters, outnumbering | `FightSurface` header "?" (`fight-overview`, `fight-surprise`, `fight-pairing`) | B |
| Strangers come armed; modifier tags | The modifiers list on `FightSurface`/`RevisedFightSurface` (`fight-armed`, `fight-tags`) | B, D |
| Choosing who falls (4–6 roll) | The prompt that asks it (`fight-who-falls`) | B |
| Retreat; dead-end retreat; "they remember" | Retreat button/menu (`fight-retreat`, `strangers-remember`) | B |
| Dragon, Spectre/Demon warnings | The existing soft-lock warning text links to the creature topic (replace its `§Spectre` reference) | B |
| Revised combat, each step: Scroll, front line, pairings/spares, tags, party panel, extra creatures, look before dice, rolling, Ghoul/Spectre/Apprentice changes | `RevisedFightSurface`, one "?" per step heading (`rc-scroll`, `rc-front-line`, `rc-pairing`, `rc-tags`, `rc-extras`, `rc-look`, `rc-roll`, `rc-end`) | B, context `fight-revised` |
| Fighting another party | `PvpFightSurface` (see XII) | B |

Highest-value phase: the most rule-dense screens. The revised-combat text is the longest; it is already numbered, so it
maps cleanly onto steps.

### VIII. The Sorcerer
Creature help done. **Sorcerer's terms** (slay vs spare, teleport, restrictions, Eye of God) → `SorcererTerms` panel
(`sorcerer-terms`). The "if you can fell him" note stays on the creature card.

### IX. Treasure & Artefacts (the parts not on a card)
| Content | Where | Form |
|---|---|---|
| Carrying capacity; who is offered a pickup | `ChamberPickup` heading (`pickup-capacity`) | B |
| Inventory status colours (usable now / wielded / passive…) | `InventoryPanel` legend (`inventory-status`) | B, D |
| Give to / Drop here / use / wield | `ItemActions` (`item-actions`) | B |
| Scroll reading under revised combat | Scroll item card (extend its artifact topic with a house-rule block) | A |

### X. Secret Doors
Already a general area topic. Also: the notice when a secret door is discovered, and the lettered door token, link to
`secret-doors`; multiplayer knowledge rule appended as a note (see XII).

### XI. Leaving the Cave & Scoring
| Content | Where | Form |
|---|---|---|
| How the score is reckoned (6 lines) | `GameOverScreen` breakdown — a "?" per line (`score-members`, `score-treasure`, `score-dragon-slayer`, `score-bounty`, `score-curse`) and one overview (`scoring`) | B |
| All-or-nothing | Wiped-out outcome text and the Quit confirmation (`all-or-nothing`) | B |
| Leaving = one-way; Quit abandons | Quit confirmation (`quit-abandon`) | B |
| The eight high-score tables | `HighScores` table switcher (`high-score-tables`); revised-combat games not recorded | B |
| Great feats | `FeatCelebration` caption links (`feats`) | D |

### XII. Multiplayer
| Content | Where | Form |
|---|---|---|
| Create / join / code / colours | `MultiplayerSetup` (`mp-create-join`) | B |
| Game options (fog of war, concurrent, kit, Sibyl) | One "?" per lobby chip (`mp-opt-fog`, `mp-opt-concurrent`; kit and Sibyl reuse their overview topics) | B, D |
| Turn by turn, "Now" marker, shared cave | `MultiplayerPlay` top bar (`mp-turns`) | B |
| Toasts and chat | Chat tab and toast area (`mp-chat`) | D |
| When a party finishes; standings; dip/follow/my run/leave vs abandon | `Scoreboard`/standings page (`mp-standings`, `mp-leave-vs-abandon`) | B |
| Also-here strip: Trade / Attack / Unite | Each button's tooltip carries its `brief`; the disabled-reason text already there stays (`mp-meeting`) | D |
| Trading rules (all-or-nothing swap, limits, timers) | `TradeModal` (`mp-trade`) | B |
| Fighting another party (surprise, layout, rounds, retreat/stop) | `PvpFightSurface` (`mp-pvp`, `mp-pvp-layout`, `mp-pvp-retreat`) | B, context `fight-pvp` |
| Unions | `UnionPanel` (`mp-union`) | B |
| Secret-door knowledge is personal | Appended note on `secret-doors` | A |

### XIII. Extension Kit and XIV. The Sibyl (overviews)
Cards are done. Add **overview** topics (`kit-overview`, `sibyl-overview`: what ticking the box does, scoring in its own
tables) shown by a "?" beside the party-select checkbox and the lobby option; the Sibyl look's own instructions go
beside the look buttons (`sibyl-look`).

### XV. House Rules
| Rule | Where | Form |
|---|---|---|
| Dead End rule | `DeadEndSwapBadge` + exits-exhausted notice (`house-dead-end`) | B |
| Sorcerer's terms | `SorcererTerms` (see VIII) | B |
| Standing traps / Dwarf's choice | `TrapChoice`; Dwarf creature card (`house-standing-traps`, already partly in hazard topic) | B, A |
| Revised combat | See VII | B |
| Overview: "which rules are on in this game" | Settings panel list with a "?" per rule (`house-overview`) | B, C |

Open item: confirm the client knows which flags a game runs under (see `apps/web/OPTIONS.md`); if not, expose them in
the game view before this overview can say what is in force.

### XVI. Quick Reference
| Content | Where | Form |
|---|---|---|
| Controls table | Help panel *Controls* + title-bar tooltips (`controls`) | C, D |
| Eight tips | Surface each beside what it advises (`tip-strong-back` on party select, `tip-unicorn`, `tip-dwarf`, `tip-armed` in fights, `tip-surprise` in encounter, `tip-befriend`, `tip-depth`, `tip-turn-back` on game-over/settings); all listed in Help panel | D, C |

## Phasing

| Phase | Deliver | Why this order |
|---|---|---|
| 2 | Machinery (`brief`, `contexts`, `HelpButton`, **Help panel**), then Encounter (VI) and Fights (VII, ordinary) | Most rule-dense, most frequent decisions; proves B and C |
| 3 | Revised combat steps (XV), Sorcerer terms, Trap choice, Dead End | Same screens family; house-rule contexts |
| 4 | Party select and kit/Sibyl overviews (II, XIII, XIV), Inventory/Pickup (IX), Scoring and High scores (XI) | Pre-game and end-game screens; needs the sheet variant of B |
| 5 | Multiplayer (XII) | Largest set of screens; lowest solo impact |
| 6 | Quest, Controls, tips, House-rule overview (I, III, XVI, XV); retire `manual.html` | Fills the Help panel; only then is the HTML redundant |

Every phase ends with: topics transcribed, drift tests green, `manual.html` updated until phase 6, and `CLAUDE.md`
guidance unchanged (it already says to update both).

## Decisions (owner, 2026-11-01)

1. **Help panel: yes.** A "?" title-bar icon with *this screen* + browse + search.
2. **House rules: show only the rules in force for the game being played.** Feasible without new plumbing: each game
   fixes its flags in `state.variants` at creation (`trapRules`, `sorcererTeleport`, `combatRevision`, the Dead End
   rule, …; server env flags are folded in there, see `apps/web/OPTIONS.md`). Consequences:
   - `Topic` gets `requires?: VariantKey` (the `state.variants` key that must be on). `topicsFor…` takes the game's
     variants and drops topics whose rule is off; this applies to *every* surface, including card help — e.g. the Ghoul,
     Trap, Scroll and Apprentice house-rule notes must be split into their own `requires` topics rather than sit inside
     base-rule topics (a **phase 2 refactor of the phase 1 content**).
   - Same filter for the Extension Kit and Sibyl topics: help for kit/Sibyl cards shows only when that option is on.
     (Card help appears when such a card is on the table, so it is on by definition; the Help panel browse list is
     the place the filter matters.)
   - The *house-rule overview* (XV) lists only the rules in force, so it doubles as "what is on in this game".
3. **First-run nudge: yes.** A one-time dismissible "How to play" prompt on the splash screen that opens the Help panel
   in a modal. Remembered per device (localStorage, wrapped in try/catch); no tours, no per-screen coaching.
4. **Standalone manual: yes — see the follow-up below** (the answer was a bare "yes" to an either/or).
5. **Tips: context only.** No rotating tip on the game-over screen.

### Question 4 — answered
**Retire `manual.html` and keep the structured manual only.** No generated static page. Retirement happens in phase 6,
once every section is transcribed (deleting it earlier would lose content): delete `apps/web/public/manual.html` and
its screenshots, remove the splash "Full Manual" link, and replace the `CLAUDE.md` "keep the player's manual in sync"
section with "keep `apps/web/src/manual/` in sync" (same triggers, new location).

## Phase 2 scope as now decided

1. Split house-rule text out of base topics into `requires` topics; add `brief`, `contexts`, `requires` to `Topic`.
2. `topicsForContext`, variant filtering, `HelpButton`/`HelpTopic`, `useHelpContext`.
3. Help panel (right slot, title-bar "?", browse + search, "for this screen").
4. Encounter panel (VI) and ordinary fight surface (VII) help.
5. Splash "How to play" first-run nudge (opens the Help panel in a modal).
6. Tests: drift checks from this doc, plus variant filtering.

## Phase 2 — status (built)

Done: `Topic.brief/requires/screens`, block-level `requires`, `topicsForScreen`, `searchTopics`, `manualFor`;
`HelpProvider`/`useVariants` fed from `state.variants`; `HelpButton`, `HelpBrowser`, `HelpPanel` (title-bar "?"
slot), `HelpModal` and the one-time splash nudge (`scv.howto.seen` in localStorage); "?" buttons on the encounter panel,
the ordinary fight and the revised fight headings and both "who is lost?" prompts; new `play` section (Quest, game code,
controls, moving, dead ends, drawing a chamber, reading the screen, tips); the encounter and fight topics split out of
the old general creature topics; house-rule wording tied to its option.

Changes from the plan as first written:
- No `useHelpScreen` hook. `GameScreen` derives the current `HelpScreen[]` from the game phase (`fight.rev` → revised
  fight) and passes it to the Help panel, which is simpler and cannot get out of step with the game.
- Pre-game (splash modal) help has no game, so it shows every rule, each badged (Extension Kit / Sibyl / House rule).
- Title-bar icon tooltips from `brief` are not done yet (only the new Help icon); folded into phase 4.
- The splash keeps a *Full Manual* link to `manual.html` until phase 6.

## Phase 3 — status (built)

Done: new `house` section (XV) with `house-overview`, `house-dead-end`, `house-sorcerer-terms`,
`house-standing-traps` and the revised-combat steps `rc-overview`, `rc-scroll`, `rc-front-line`, `rc-pairing`,
`rc-extras`, `rc-tags`, `rc-look`, `rc-roll`. Each is gated by its option (`requires` now accepts a list, "any of", used
by the overview, which lists only the rules in force). "?" buttons: a step-aware button beside the revised fight's action
buttons (opens upward; topic chosen from the engine's current decision: scroll, front line, pairing, extras, look,
stalemate), plus the Ghouls intro, the Sorcerer's terms, the trap choice and the Dead End badge. New help screen
`sorcerer`; the Help panel leads with the matching topic for each.

Notes: the Apprentice stay/leave prompt and the Treasure Chest Spectre wording live in their creature/`rc-roll` topics
rather than on a separate button. Phase 4 is next.

## Phase 4 — status (built)

Done: new sections `party` (II: `party-budget`, `kit-overview`, `sibyl-overview`) and `scoring` (XI: `scoring`,
`score-dragon-slayer`, `score-bounty`, `score-chest`, `score-curse`, `all-or-nothing`, `quit-abandon`,
`high-score-tables`, `feats`); `pickup-capacity`, `inventory-status`, `item-actions` in the treasure section; one-line
`brief`s on every recruitable creature. Surfaces: "?" on the party screen heading and beside the Extension kit and
Sibyl checkboxes (outside the labels, so using it never ticks a box); creature-card tooltips from `brief`; Inventory and
chamber-pickup headings; the item card (when it has actions); the game-over score total, each award/penalty line, the
dragon-slayer tag and the can't-record message; the high-score table choosers; title-bar icon tooltips. New help screens
`party-select`, `inventory`, `game-over`, `high-scores`.

Not done: `feats` has no button (the celebration is a transient overlay; it is reachable from the Help panel). The
solo game has no Quit button in the new shell, so `quit-abandon` is surfaced from the abandoned game-over message;
the multiplayer Quit confirm gets it in phase 5. Phase 5 (multiplayer) is next.

## Phase 5 — status (built)

Done: new `multiplayer` section (XII) with `mp-overview`, `mp-create-join`, `mp-options`, `mp-opt-fog`,
`mp-opt-concurrent`, `mp-draft`, `mp-turns`, `mp-chat`, `mp-finish`, `mp-standings`, `mp-leave-vs-abandon`,
`mp-meeting`, `mp-trade`, `mp-pvp`, `mp-union`; the multiplayer secret-door rule added to `area-secret-door`. New help
screens `mp-setup`, `mp-lobby`, `mp-draft`, `mp-play`, `mp-standings`, `mp-trade`, `mp-pvp`, `mp-union`. Surfaces: "?" on
the setup/join heading; the lobby heading and beside every option (host checkboxes and guest chips; outside the labels
so it never toggles an option); the draft (extends the party-budget help); the "Also here" strip; the Leave/Abandon
confirm; the standings heading; the trade, union (both panels) and fight-another-party headings; and, because
multiplayer still uses the older HUD with no title bar, a round "?" button at the top right that opens the manual in a
modal, leading with the topics for what is on screen (fight, trade, union, or play) and filtered by the game's options.

Notes: Fog of war and Concurrent are not gated (their help is only shown on the lobby, where the option is being
chosen). Rear-guard detachments and the Zombies variant exist in the multiplayer code but are not in the printed
manual, so have no topic. Phase 6 is next: transcribe what is still missing, then retire `manual.html`.

## Phase 6 — status (built)

`manual.html` is retired. Checked section by section against the old page: every rule in §I–XVI already had a topic
(phases 1–5); the only extras on the page were presentation (section ledes, figure captions, the epigraph, the
click-to-zoom lightbox), which the in-game surfaces replace. The credits (original game, Peter Vodden's artwork)
already live on the splash screen.

- Deleted `apps/web/public/manual.html` and the three screenshots only it used. `shot-cave.png` and `shot-party.png`
  stay for the README.
- Removed the splash "Full Manual" link; "How to Play" is the entry point.
- `CLAUDE.md`: the manual-sync rule now points at `apps/web/src/manual/` (no footer date, no Contents entry).
- README, `PRODUCT.md`, `docs/specs/architecture.html` and two code comments no longer name `manual.html`.

Still open: the `feats` topic has no button; rear-guard detachments and Zombies have no topic (not in the printed
manual); the UI has not been checked in a browser.
