# Structured Manual — Plan

Source: `requirements.md` in this folder. Status: all phases built; `manual.html` retired (see `help-placement.md`).

## Goal

The player's manual (`apps/web/public/manual.html`) is going away as a separate document. Its content must live
in the UI as contextual help. Step one is to hold the manual as **structured data** the UI can query, and to use it
for the first consumer: an expandable help section at the bottom of the card panel.

## Design

### Data model (`apps/web/src/manual/`)

- `types.ts` — `Section` (numbered like the printed manual) → `Topic` (one idea, a few blocks) → `Block`
  (`p`, `list`, `note`). Text carries only `**bold**` / `*italic*` inline markup; the UI renders it as React nodes
  (never `dangerouslySetInnerHTML`).
- A `Topic` declares which **cards** it explains (`cards: [{ category, name }]`). Categories: `area`, `hazard`,
  `creature`, `artifact`, `treasure`. `name: '*'` marks a *general* topic (e.g. how reactions work) shown for every
  card of that category when the card is met on the floor.
- A `Topic` may carry a `variant` (`kit`, `sibyl`, `house`) so the UI can badge it ("Extension Kit", "House rule").
- Content files, one per manual theme: `areas.ts`, `hazards.ts`, `creatures.ts`, `treasure.ts`; `index.ts` assembles
  `MANUAL` and exports the lookup `topicsForCard(category, name, { general })`.
- Card names are the engine's/projection's own (`W-Hero`, `The Gateway`, `Crypt/Gems`, …). A test asserts every
  engine hazard, creature and treasure name resolves to a topic, so a new card cannot silently ship without help.

### First consumer: card help

`CardHelp` (in `game/shell/`) renders a `<details>` "Help" disclosure at the bottom of every `CardPanel` view
(floor card, area, party member, item). It is closed by default, hidden when the manual has nothing for the card, and
reopens closed when the selection changes.

## Phase 1 (this change)

1. Structured manual schema + lookup + drift test.
2. Content for the card-bearing sections: IV Special Areas, V Hazards, VI Strangers (creatures, Unicorn), VII Fights
   (Dragon/Spectre and the general fight summary), VIII Sorcerer, IX Treasure & Artefacts, XIII Extension Kit cards
   (areas, hazards, creatures, treasure, artefacts), XIV Sibyl.
3. `CardHelp` in the card panel + styles + tests.
4. `CLAUDE.md`: the structured manual is now a second place to keep in sync with the game.

`manual.html` stays in place until the standalone manual is removed; until then the two are maintained together
(CLAUDE.md says so). The long-term plan is to **generate** the HTML (or drop it) from the structured data so there
is one source.

## Later phases — other places that want contextual help

> Superseded in detail by `help-placement.md`, which maps every remaining manual section to a screen, a help form
> and proposed topic ids, and re-sequences the phases. The table below is the original sketch.

| Phase | Where | Manual content | Notes |
|---|---|---|---|
| 2 | Fight surfaces (`FightSurface`, `RevisedFightSurface`, `PvpFightSurface`, `FightHand`) | VII Fights: surprise, pairing, casters, retreat, "they remember"; house-rule revised combat | Highest value: the most rule-dense screen. A "?" per panel section (modifiers list, retreat button). |
| 2 | Encounter / reaction panel (`EncounterPanel`) | VI: withdraw / attack / test, leader order, reaction results, three-indifferent rule | Help keyed to the three choices. |
| 3 | Party selection / draft (`PartySelect`, `PartyDraft`) | II Building Your Party, Extension Kit and Sibyl switches | Replaces the creature table; per-recruit help can reuse creature topics now. |
| 3 | Settings panel + HUD (title bar icons) | III HUD, controls, game code, verbose descriptions | Tooltips with a link to the topic. |
| 3 | Inventory / item actions (`InventoryPanel`, `ItemActions`) | IX redistribution, status colours | Item cards already get help in phase 1; add help on the status words. |
| 4 | Special-area interaction panels (Trap choice, Sorcerer terms, Sibyl look, Chamber pickup) | V Trap, VIII Sorcerer terms, XIV the look, house rules | Reuse the same `Topic` by id (`<HelpTopic id="…"/>`). |
| 4 | Game over / scoreboard / high scores | XI Leaving & Scoring | Score breakdown explained from the manual. |
| 4 | Multiplayer lobby, trading, unions, spectate | XII Multiplayer | |
| 5 | Retire `manual.html`; generate any printable version from `MANUAL`; add a searchable "Help" overlay | all | Needs the remaining sections (I, III, X, XI, XII, XV, XVI) transcribed. |

Phase 2+ need a by-id accessor (`topicById`) and a small `<HelpTopic>` component; phase 1 already stores stable
topic ids to make that free.

## Out of scope for phase 1

- Transcribing sections with no card to attach to (I, II, III, X, XI, XII, XV, XVI).
- Removing `manual.html` or the splash-screen link to it.
- Screenshots/figures.
