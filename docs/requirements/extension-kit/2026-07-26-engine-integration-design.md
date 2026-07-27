# Extension Kit — Engine & UI Integration Design

> Status: Draft for review
> Source requirements: [2026-07-26-engine-integration.md](2026-07-26-engine-integration.md), [2026-07-25-asset-conversion.md](2026-07-25-asset-conversion.md)
> Assets: `docs/assets/manifest.json` → `tilesExtension` (30 tiles), `cardsExtension` (30 cards)

This document translates the extension kit's board-game card texts into rules for the computer
game, and specifies the player-facing interaction for every card. It is the input to a later
implementation plan; nothing here is code yet.

## Decisions locked (agreed 2026-07-26)

1. **Opt-in variant, default off.** An "Extension kit" toggle at game setup. Off = byte-identical
   to today (golden replays, saves, replay codes, high scores all unaffected).
2. **Design solo + multiplayer; build solo first.** Every story carries an MP note; MP wiring is a
   follow-on milestone.
3. **Full shuffle-in.** All 30 small cards and 30 area tiles join the decks when the kit is on:
   101-card small pack (71+30), 90-card area deck (60+30).
4. **Deck-as-gate + inline rules.** `variants.extensionKit` gates deck composition only; new rules
   are ordinary new cases in the existing dispatch switches, because kit-off games can never draw
   a kit id. Targeted mini-refactors only where reuse demands (petrify helper, notice exhaustiveness).

## Part 1: Foundations

### 1.1 Variant threading

- Solo `GameState` gains `variants?: { extensionKit?: boolean }`, mirroring `MpGameState.variants`
  (multi.ts:133). `newGame(seed, picks, variants)` stores it; it is immutable for the life of the game.
- `buildSmallPack` / `buildLargePack` (decks.ts) take the variant and append the extension entries
  to the template **before the shuffle**. Absent/false ⇒ identical arrays ⇒ identical shuffles for
  the same seed — the byte-identity guarantee.
- **Persistence:** save-load serializes `variants` with the state. Replay codes gain a kit flag; a
  code without the flag is a base-game replay, so all existing codes remain valid. High-score
  entries record `extensionKit`; the leaderboard keeps entirely SEPARATE base/kit tables behind a segmented toggle (revised 2026-07-27 by MSW — scores aren't comparable across deck compositions; supersedes the original single-labeled-table design), defaulting to the mode just played.
- **Multiplayer (later):** `extensionKit` joins the MP variants shape (schema.ts:33 `variantsV`,
  MultiplayerLobby host-only checkbox pattern, `buildMpGame` pass-through). The solo reducer
  reads the same field from the composed state — no MP fork.

### 1.2 Area-card encoding: widening the special field

`decodeArea` (decode.ts:13-24) packs `special` into bits 7–9 (3 bits, values 0–5 used, max 7).
Six new specials don't fit. The field widens to bits 7–10 (mask 15). The highest base
`AREA_CARDS` value is 671 (bit 10 clear on every base card), so **all 61 base values decode
identically** under the wider mask — verified as part of implementation by asserting
`decodeArea` output over `AREA_CARDS` is unchanged.

New special codes (data/areaCards.ts):

| Const | Value | Tile |
|---|---|---|
| SPECIAL_CHASM | 6 | area-tile-x06-2 |
| SPECIAL_BELL_ROPE | 7 | area-tile-x06-4 |
| SPECIAL_LAIR | 8 | area-tile-x07-1 |
| SPECIAL_WHIRLPOOL | 9 | area-tile-x07-2 |
| SPECIAL_GALLERY | 10 | area-tile-x07-3 |
| SPECIAL_WELL | 11 | area-tile-x07-4 |

A new `EXT_AREA_CARDS` array encodes the 30 extension tiles (exits/chamber/stairs from the
manifest's verified `tilesExtension` data, specials as above). `buildLargePack` appends it when
the kit is on. A kit-mode extension of `tileOrientation.test.ts` asserts every `EXT_AREA_CARDS`
value (and its stair-pruned forms) resolves to a tile at rot 0 across the 90-tile art set.

### 1.3 New entity ids

All ids append after existing ranges; existing tables are untouched. Kit duplicates map to
existing ids — treasures: Gold (treasure 1) ×3, Silver (treasure 0) ×3, Gems (treasure 2) ×1,
**Lotus Dust (treasure 5) ×1 — already a base artifact; the kit copy is simply a second deck
entry with identical rules**; creatures: Dwarf (creature 7) ×1 and Woman (creature 6) ×1.

**Creatures (ids 14–20)** — costs per the official kit SELECTION TABLE
([extension-kit-rules.md](../../specs/extension-kit-rules.md)); Apprentice and Demon are never
selectable. Wolf's fs 2 and the Witch/Scholar/Lion stat lines are confirmed by that table.

| Id | Name | fs | mp | carry | cost | points | Flags / reaction | Uses artifacts as |
|---|---|---|---|---|---|---|---|---|
| 14 | Apprentice | 2 | 7 | 0 | null | 0 | HUMAN; custom reaction (US-14); female — she/her in all copy | Wizard |
| 15 | Demon | 0 | 6 | 0 | null | 0 | INHUMAN; never tests — always hostile; magic-only foe | — (none) |
| 16 | Lion | 3 | 0 | 0 | 2 | 3 | INHUMAN; thresholds: hostile ≤4, indiff ≤5 † | — (none) |
| 17 | Scholar | 2 | 1 | 25 | 3 | 5 | HUMAN; reaction thresholds = Priest † | Priest |
| 18 | Witch | 1 | 4 | 0 | 5 | 10 | HUMAN; reaction thresholds = Woman † | Priest |
| 19 | Thief | 2 | 0 | 25 | 3 | 5 | HUMAN; reaction thresholds = Man † | Man |
| 20 | Wolf | 2 | 0 | 0 | 1 | 2 | INHUMAN; thresholds = Lion †; immune Medusa/Quarrel/Mutiny/Desertion | — (none) |

† = value not printed on the card or table; accepted as proposed (Resolved interpretations, item 1).

**Kit-on party selection** (official SELECTION TABLE): the selectable pool gains Witch, Scholar,
Thief, Lion, Wolf at the costs above, with stock Witch 3, Scholar 1, Thief 1, Lion 1, Wolf 1;
Dwarf and Woman stock rises 3 → 4 (the kit copies). **Ogre's selection cost is revised 5 → 4 and
Troll's 4 → 3 in kit-on games only — the base game keeps 5/4** (MSW ruling). The engine resolves
selection costs and stock through the variant; `PARTY_BUDGET` stays 6.

"Uses artifacts as X" means the creature is added to every artifact-eligibility list X appears in
(Sword/Axe bonuses excepted — those name specific creatures).

**Treasures (ids 15–21)** — classifications per the official INVENTORY (artefacts: Elixir, Holy
Water, Magic Axe, Scroll, Magic Shield; **heavy treasure: Idol and Crypt/Gems**):

| Id | Name | Kind / weight | Points | One-use? | Summary |
|---|---|---|---|---|---|
| 15 | Elixir | artifact / 0 | 0 | yes | Any member drinks: d6 → 1 dies, 2–3 nothing, 4–6 +2 fs permanently |
| 16 | Holy Water | artifact / 0 | 5 | yes | Reanimate STONE; or destroy Medusa/Spectre/Demon; or weaken Sorcerer/Apprentice −2 MP |
| 17 | Magic Axe | artifact / 0 | 15 | no (borne) | +1 fs Man/Woman/Hero/W-Hero, +3 Dwarf; bearer may fight a Demon |
| 18 | Idol | **heavy / 25 kg** | 10×d6 at end | — | Value determined at game end (US-25); a real haul to carry out |
| 19 | Scroll | artifact / 0 | 0 | yes | Read by a HUMAN: destroys all non-magical enemies in the area; party CURSED |
| 20 | Magic Shield | artifact / 0 | 15 | no (borne) | Bearer Man/Woman/Hero/W-Hero: nullifies the paired enemy's MP; Sorcerer/Apprentice −2 instead |
| 21 | Crypt/Gems | **heavy / 25 kg** | 20 | — | Drawn: parks as the crypt (US-08); on a find, the card itself becomes the carried gems |

**Hazards (ids 5–8)**, appended to data/hazards.ts and the `applyHazards` order (after TRAP):
Desertion(5), Harpies(6), Quarrel(7), **Spell(8)** — Spell is a hazard per the official
INVENTORY, not a usable artifact: it fires when drawn (US-22). Harpies parks (lurk-style);
Desertion, Quarrel and Spell fire once and discard. The Crypt is no longer a hazard id — its
card is treasure 21, which parks as the crypt location when drawn.

**Small-pack additions (30 codes):** creatures ×11 (Apprentice, Demon, Lion, Scholar, Witch ×3,
Thief, Wolf, plus duplicate-copy Dwarf and Woman), treasures ×15 (Gold ×3, Silver ×3, Gems,
Lotus Dust, Elixir, Holy Water, Magic Axe, Idol, Scroll, Magic Shield, Crypt/Gems), hazards ×4
(Desertion, Harpies, Quarrel, Spell). Matches the official INVENTORY exactly (9 heavy treasure
+ 6 artefacts + 11 creatures + 4 hazards).

### 1.4 Manifest & art

- Backfill `entityId` in `cardsExtension` with the new ids (duplicates get their base ids).
- `parseManifest` merges `tilesExtension`/`cardsExtension` into the art tables when the game's
  variant is on (kit-off games never request kit art, but the merge is unconditional and safe —
  resolution is driven by what the engine actually places/draws).
- The mirrored-stair fallback (commit e4ed3a2's noted gap): with 30 more tiles the synthetic
  stair-up topologies gain more coverage, but any unresolvable topology must render the base-game
  level-marker fallback rather than a wrong tile. This is a stated acceptance criterion, not new
  design.

### 1.5 Systemic UI changes (the "poorly relayed" fix)

1. **Notice exhaustiveness.** `eventNotices.ts` currently drops unknown event types
   (`default: break`) — new engine events silently vanish from live play. The switch becomes
   exhaustive over the `GameEvent` union (compile-time `never` check), so adding an engine event
   without a player-facing notice is a type error. Every kit event defined in Part 2 lists its
   notice text.
2. **Visible dice.** Every kit rule that rolls fires a roll-shaped event consumed by the existing
   `DiceRoll` overlay (rollView.ts) — no silent rolls.
3. **Setup toggle.** Solo: an "Extension kit" switch on the party-select screen (alongside seed
   entry), shown as a HUD chip in-game. MP: lobby checkbox (existing pattern).
4. **Card-draw beat.** Kit small cards use the existing lay-down + card-zoom presentation
   (cave3d layContents/showCard) with their real extension art — no new mechanism.
5. Mobile: all new panels reuse the sticky bottom action row / stacked HUD chip patterns from the
   portrait-support work; no new layout primitives.

## Part 2: User stories

**Standard format** (used by every story):

- **Trigger** — when and how the card enters play.
- **On screen** — what the player sees the moment it happens.
- **Interaction** — every choice offered, named by existing UI pattern.
- **Dice** — which rolls are shown (all rolls are shown).
- **Feedback** — the immediate notice/log lines.
- **Aftermath** — lasting state, future events, and score impact.
- **Build notes** — engine hooks (from research), MP note.

Stories: US-01 setup · US-02..07 special areas · US-08..11 hazards · US-12..18 creatures ·
US-19..25 artifacts · US-26 duplicates · US-27 plain tiles.

---

### US-01: Enabling the kit

- **Trigger:** New game screen. The player flips "Extension kit" on (default off).
- **On screen:** The toggle sits with the seed/party controls; a short caption: "Adds 30 area
  tiles and 30 cards to the decks." Once in-game, a HUD chip "EXT" marks the session.
- **Interaction:** One switch. In MP, host-only lobby checkbox, locked once the game starts.
- **Dice:** none.
- **Feedback:** Game log's opening line records "Extension kit active"; replay codes and saves
  round-trip the flag; high-score entries are labeled.
- **Aftermath:** 101-card small pack, 90-card area deck for this game only.
- **Build notes:** §1.1. Replay-code format gains a flag; loading an old save without the field
  behaves as base game.

### US-02: The Chasm (tile x06-2, special 6)

- **Trigger:** The party enters the Chasm chamber (NESW). Draws resolve as a normal chamber.
- **On screen:** The chasm tile with its swirling void; after the chamber resolves, the action
  row offers "Descend the chasm".
- **Interaction:** Optional action button, available whenever the party is in this area in the
  explore/encounter phase. A blocking confirm popup (Trap-fall pattern, cave3d showConfirm):
  "Descend? You cannot return this way."
- **Dice:** none — the descent is certain.
- **Feedback:** Notice: "The party climbs down into the chasm." The landing chamber then resolves
  normally (its own draws, hazards, notices).
- **Aftermath:** Party relocates one level down onto a fresh card with **no return stair** (trap
  semantics: `relocateDown`, no mirrored stair-up, withdraw blocked from the landing area). The
  chasm remains usable by later visits (it is terrain, not a one-shot).
- **Build notes:** Reuses `relocateDown` (reduce.ts:288-305) triggered by a new `descendChasm`
  action legal only on SPECIAL_CHASM. MP: landing follows the same rules as trap falls already do
  under compose/split; interaction mask needs no special entry (it is a chamber).

### US-03: The Bell Rope (tile x06-4, special 7)

- **Trigger:** Party in the Bell Rope chamber; the rope has not been pulled (once per game per tile).
- **On screen:** The winch-and-bell art; action row offers "Pull the bell rope" with a member
  picker.
- **Interaction:** Assignment dropdown (EncounterPanel pattern) to choose the puller, then a
  confirm. Declining is always allowed; the option remains on later visits until used.
- **Dice:** One visible d6.
- **Feedback:** 1 — "The rope yanks [name] upward. They are never seen again." 2–3 — "A bell
  tolls once, far above — and is answered by silence. Something, somewhere, now knows you are
  here." (foreboding narration; no mechanical effect). 4–6 — "The bell's echo shakes something
  loose — two cards are drawn. The party cannot withdraw this turn."
- **Aftermath:** 1: the puller is removed from the game with everything they carried (not
  revivable — Desertion semantics). 2–3: no mechanical effect (confirmed — narration only).
  4–6: two small cards resolve into this area immediately (strangers test/fight as usual) and
  `withdraw` is illegal this turn (a new condition alongside `fellThroughTrap` on the same
  legality check, reduce.ts:380-383 / selectors.ts:77-79). The rope is then spent (per-area flag).
- **Build notes:** New action `pullBellRope(memberId)`; draw-2 reuses `enterChamber`'s draw path.
  MP: the no-withdraw flag is per-seat turn state; unions — the commander's roll binds the union.


### US-04: The Lair (tile x07-1, special 8)

- **Trigger:** The Lair chamber is placed and entered. "Draw as usual."
- **On screen:** The insect-crawled lair art; an ordinary chamber beat — plus, if the Harpies
  have struck earlier (US-10), the stolen artifact pile is revealed on its floor.
- **Interaction:** Standard pickup panel for whatever lies here (including any Harpies stash).
- **Dice:** none of its own.
- **Feedback:** If a stash lands: "The harpies' hoard glitters among the bones — the stolen
  artifacts are here." Log lists each item.
- **Aftermath:** The Lair is the permanent destination for all Harpies thefts (past and future).
  Recovered artifacts behave normally.
- **Build notes:** Chamber with no draw modifier. State: `lairCoord` once placed; `harpyStash[]`
  (treasure ids) spills onto its floor on placement/next entry. MP: the stash is cave-shared —
  any seat may recover it.

### US-05: The Whirlpool (tile x07-2, special 9)

- **Trigger:** Each time the party **crosses the shallows** — leaves the Whirlpool tile in any
  direction other than the one it entered by (Deep-Pool/Viper crossing semantics).
- **On screen:** On entering, a warning notice: "Dark water churns here — crossing the shallows
  risks the pull of the whirlpool." On crossing, the roll fires before movement resolves.
- **Interaction:** None beyond choosing to move — the risk is ambient, like the Viper Pit. The
  move buttons show the standard directions; no extra confirmation (the warning notice on entry
  is the telegraph).
- **Dice:** One visible d6 per crossing.
- **Feedback:** 1–2 — "The whirlpool drags the whole party under!" then the landing chamber's
  own beat. 3–6 — "The party wades the shallows safely."
- **Aftermath:** 1–2: entire party relocates one level down (one-way, `relocateDown`, no return
  stair); the intended lateral move is cancelled. **Withdraw is not offered from the landing
  area** — if the chamber below holds creatures, the party must face them (trap-fall semantics).
  3–6: movement completes normally. The tile remains dangerous forever.
- **Build notes:** New crossing hook beside `viperCrossing`/`deepPoolCrossing`
  (reduce.ts:362-374, special.ts). Chamber draws still occur on first entry (it is a chamber,
  unlike Deep Pool). The landing reuses the `fellThroughTrap` withdraw block. MP: crossing rolls
  use the shared cave stream (solo-composed action); interaction-mask entry not needed.

### US-06: The Gallery (tile x07-3, special 10)

- **Trigger:** First entry draws as usual, but every creature drawn here arrives **as stone** —
  except the **Sorcerer, Spectre, and Demon**: those are drawn un-petrified and the interaction
  proceeds as in a standard chamber (the Demon still relocates per US-13).
- **On screen:** The six-statues art; drawn creatures lay down with a stone overlay (the STONE
  marker token art) instead of standing strangers. Notice: "The strangers here are stone — silent,
  waiting."
- **Interaction:** No reaction test fires for statues — they are scenery. Treasure drawn here is
  freely collectible (statues guard nothing). Two reanimation routes:
  1. **Magic Staff borne by a Wizard:** on the party's entry, ALL stone creatures in the chamber
     are automatically reanimated (the member-revival pattern, US precedent: `reviveStoned`).
     They become normal strangers and the full standard chamber interaction follows — reaction
     test, fight/recruit, the lot.
  2. **Holy Water** (US-20): targets one statue; it wakes for an immediate, normal reaction test.
- **Dice:** The standard reaction d6 whenever statues wake (Staff wakes the group → one group
  test as in any chamber).
- **Feedback:** Staff: "The Magic Staff blazes — every stone figure in the gallery cracks and
  stirs!" Holy Water: "The stone cracks — the [creature] stirs!" Then the usual
  hostile/indifferent/friendly notice.
- **Aftermath:** Un-reanimated statues persist in the area indefinitely. They score nothing and
  threaten nothing while stone. Reanimated-friendly creatures join as allies like any stranger.
- **Build notes:** Stone strangers persist as `500+creatureId` content codes (pattern:
  sleeping's `400+id`, chamber.ts:11-14). Sorcerer/Spectre/Demon exempt at draw-classify time.
  The Staff auto-wake extends the existing `reviveStoned` entry hook (reduce.ts:127-143) to
  cover stone strangers in a Gallery. The Medusa member-petrify logic is otherwise untouched.
  MP: statues are cave-shared area content; the entering seat's Staff triggers the wake.

### US-07: The Well (tile x07-4, special 11)

- **Trigger:** Party in the Well chamber, any turn, small pack not empty.
- **On screen:** The rope-and-bucket well art; action row offers "Draw from the well".
- **Interaction:** One action button + confirm ("Draw 1 card — you cannot withdraw this turn").
  Available every turn spent at the Well (not once-only — the card text sets no limit; accepted
  interpretation).
- **Dice:** none for the draw itself (subsequent strangers/hazards roll as usual).
- **Feedback:** "The bucket rises from the dark…" then the drawn card's normal reveal beat.
- **Aftermath:** One small card resolves into this area; withdraw is illegal this turn (same
  mechanism as US-03). Risk/reward loop for hunting treasure late in the pack.
- **Build notes:** New action `drawFromWell`; reuses the chamber draw path for 1 card; shares the
  no-withdraw turn flag with Bell Rope. MP: per-seat turn flag.

---

### US-08: Crypt (treasure 21 "Crypt/Gems", card x01-1 — heavy treasure per the official INVENTORY)

- **Trigger:** Drawn like a treasure card, but it does not lie on the floor — it **parks**: the
  chamber now contains a crypt (draw-classify special case on treasure id 21).
- **On screen:** The crypt card lays down and stays visible in the area (lurk presentation, like
  Medusa's parked card). Notice: "A sealed crypt squats in the corner of this chamber."
- **Interaction:** At the **start of any turn** in this area, the action row offers "Enter the
  crypt" (optional). Confirm popup: "Enter? A trap here cannot be avoided."
- **Dice:** One visible d6.
- **Feedback:** 1–2 — "The floor gives way! The party plunges into darkness." 3–6 — "Within the
  crypt: gems!"
- **Aftermath:** 1–2: unavoidable trap — the whole party falls one level (`relocateDown`), **a
  Dwarf does not guide past this one**, and **withdraw is not offered from the landing area**
  (trap-fall semantics — creatures below must be faced). 3–6: **the crypt card itself becomes
  the found gems** — treasure id 21 (heavy, 25 kg, 20 pts) drops onto the area floor for normal
  pickup, carried under the Crypt/Gems card art, marking these gems as claimed from the crypt.
  Either way the crypt is spent (no second entry).
- **Build notes:** Treasure-classified draw that parks as a crypt (contents re-entry like
  Medusa/Ghouls, hazards.ts:147-154) + an `enterCrypt` action gated to turn start in the area;
  on a find the parked content converts to floor treasure id 21 — no separate art override
  needed, it is its own treasure. Landing reuses `fellThroughTrap`. MP: the crypt is area
  content; whichever seat enters rolls on the shared stream.

### US-09: Desertion (hazard 6, card x01-2)

- **Trigger:** Fires immediately when drawn, during the hazard phase (after Trap in the fixed
  order).
- **On screen:** The desertion card flashes up; then one visible d6 per **ally** in the party,
  rolled in sequence down the party roster (DiceRoll lanes, one per ally, wrapping on mobile).
- **Interaction:** None — like Mutiny, it simply happens.
- **Dice:** d6 per ally, all shown. **Wolves are skipped** (immune).
- **Feedback:** Per ally: 1–2 — "[Name] slips away into the dark, taking [treasure list]." 3–6 —
  "[Name] wavers… but stays." Summary notice if nobody deserts: "The party holds together."
- **Aftermath:** Deserters are removed from the game **with everything they carry** (treasure
  and artifacts leave the game — they are not dropped). Original party members are untouched.
  Score: whatever left, left.
- **Build notes:** New `applyHazards` case; iterates `status===1` members, skips Wolf (id 20).
  Distinct from Mutiny (allies revert to strangers and drop loot) — Desertion removes outright.
  MP: fires on the drawing seat's party only; union loans desert like any ally (note for the MP
  milestone: a loaned ally deserting ends the loan).

### US-10: Harpies (hazard 7, card x02-6)

- **Trigger:** Fires when drawn — unless the party has **no artifacts** or holds the
  **Talisman**, in which case it parks instead.
- **On screen:** Fired: the harpies card rears up; every artifact icon in the party panel
  visibly leaves (items strip from member rows); notice names each stolen artifact. Parked: the
  card stays lurking in the area — "Harpies circle overhead, eyeing your baggage" — and re-checks
  on every re-entry (Medusa lurk pattern).
- **Interaction:** None — theft is instant. (The defense is what you carry: no artifacts, or the
  Talisman.)
- **Dice:** none.
- **Feedback:** "Harpies swoop! They snatch [list] and wheel away toward their lair." If the
  Lair is not yet on the map: "…toward a lair you have not yet found."
- **Aftermath:** All party-held artifacts (borne and carried, from every member) move to the
  Lair's floor if placed, else into the pending `harpyStash` that lands when the Lair appears
  (US-04). The harpies card then leaves the game. Curse note: the **Eye of God** carried off by
  harpies counts as forsaken — **the curse falls on the party**, with an explicit notice: "The
  Eye of God is torn away — its curse descends upon you."
- **Build notes:** New hazard case + park condition; stash state per §US-04. Talisman check
  reuses the effects.ts ward-predicate pattern. MP: artifacts stolen from the drawing seat only;
  stash recoverable by any seat (shared cave).

### US-11: Quarrel (hazard 8, card x03-1)

- **Trigger:** Fires when drawn: the two strongest party members turn on each other for one
  round; then the turn continues as usual.
- **On screen:** The quarrel card, then a one-round mini-fight presented on the FightSurface in
  a special "Quarrel" dress: the two members face off, their fs + modifiers shown as the usual
  chips.
- **Interaction:** None — the pairing is forced (the two highest effective fs; Wolves and Lions
  are immune and never picked; ties broken by roster order). The player watches the round.
- **Dice:** Both combatants' d6s, shown side by side.
- **Feedback:** "Tempers flare — [A] and [B] come to blows!" Then: loser dies — "[loser] falls
  to [winner]'s fury." Tie — "They are pulled apart, fuming but unhurt."
- **Aftermath:** The loser is dead (normal death: carried items spill to the floor, Healing Balm
  can revive). Winner unmarked. Turn continues into the normal encounter/pickup flow.
- **Build notes:** One round resolved with the standard fs + d6 + modifiers (Sword/Axe bonuses
  and curse penalties apply — they are "the party's dice"). New event type with its own notice.
  MP: within one seat's party only; under a union, quarrel picks from the combined force
  (commander's problem — MP milestone note).

---

### US-12: Witch (creature 18, ×3 in deck)

- **Trigger:** Drawn as a stranger; standard reaction test (thresholds = Woman, proposed).
- **On screen:** Standard stranger beat: card lay-down, reaction roll, EncounterPanel.
- **Interaction:** Standard test/fight/withdraw choices. As an ally she uses artifacts **as a
  Priest** (Carpet, Balm eligibility, etc.) — the artifact dropdowns simply list her where a
  Priest would appear.
- **Dice:** Standard reaction d6; fight dice as usual (fs 1, mp 4 — she fights from the "behind"
  magic slots well).
- **Feedback:** Standard stranger notices.
- **Aftermath:** Ally worth 10 points if brought out alive. Three copies in the deck make covens
  possible.
- **Build notes:** Pure data row + artifact-class list additions. MP: nothing special.

### US-13: Demon (creature 15)

- **Trigger:** Drawn — but it never joins the chamber. It **materializes in the area the party
  just left** (`prev`).
- **On screen:** The demon card rises and visibly slides toward the exit the party came from;
  the previous tile gains a lurking-demon marker. Notice: "Something vast and wrong now waits on
  your back-trail."
- **Interaction:** None at draw time. Thereafter, entering (or withdrawing into) the demon's
  area forces an encounter: **only magical power can touch it** — members with mp > 0, plus a
  **Magic Axe** bearer (US-24). The FightSurface's Spectre-style doom banner shows when the
  party cannot legally engage it; an unfightable, unengaged Demon follows Spectre rules
  (slays the strongest — confirmed).
- **Dice:** Standard fight dice when engaged.
- **Feedback:** Entering its area: "The Demon unfolds from the shadows." Kill: "The Demon
  collapses into ash." Doom: the banner names why nobody can fight it.
- **Aftermath:** While it waits on the back-trail, `withdraw` leads into a demon fight — the
  card turns retreat into a threat, exactly its board-game role. The Demon has **no fighting
  strength and no points** (fs 0, mp 6): it is a pure magical obstacle, never a recruit (it
  never tests friendly). Edge cases: if the previous area was **collapsed by an Earthquake**,
  the Demon cannot take form — special notice: "The Demon claws at fallen rock, finds no
  purchase in the ruined dark, and disperses." (card discarded, no effect). A party with no
  valid `prev` at all cannot occur (every game starts at the Gateway), but as a defensive
  fallback the Demon would materialize in the current area.
- **Build notes:** Draw-classify special case (like Gallery's stone exemption); spawns into
  `prev`'s contents as a hostile lurker; `AF_DESTROYED` prev ⇒ discard + notice. Fight gating
  extends the Spectre magic-only predicate (SC-9.4-1) with the Axe-bearer clause. MP: the demon
  is cave-shared area content — it haunts whoever enters.

### US-14: Apprentice (creature 14)

- **Trigger:** Drawn as a stranger. Custom reaction: **d6 = 6 → friendly, but only while the
  Sorcerer is alive; anything else → hostile. If the Sorcerer is dead, always hostile.** (No
  indifferent band.)
- **On screen:** Standard stranger beat; the reaction roll shows with a caption when relevant:
  "The Apprentice serves the Sorcerer still…"
- **Interaction:** Standard encounter choices. The Apprentice is **female** (per the card art) —
  all copy uses she/her. As an ally she uses artifacts **as a Wizard** (Staff reanimation,
  Carpet, etc.). At `exitCave`, a confirm popup warns: "The Apprentice will not leave the cave.
  She stays behind."
- **Dice:** Reaction d6 (custom bands), fight dice as usual (fs 2, mp 7 — a major magic ally).
- **Feedback:** Recruit: "The Apprentice bows — for now." Sorcerer dies while she's an ally:
  "The Apprentice's eyes go cold." — she immediately **deserts to stranger** in the current
  area, hostile. Exit: "The Apprentice melts back into the dark."
- **Aftermath:** Powerful but conditional: killing the Sorcerer (the +30 bounty) costs you the
  Apprentice. She is worth **0 points** — she never leaves the cave, so she can never be
  brought out to score.
- **Build notes:** Custom reaction branch keyed on `sorcererKilled`; Sorcerer-death hook adds
  the ally-reverts step; `exitCave` filter drops her. MP: Sorcerer death is cave-global — every
  seat's Apprentice reverts.

### US-15: Lion (creature 16)

- **Trigger:** Standard stranger; proposed thresholds hostile ≤4, indiff ≤5 (a wild animal —
  mostly hostile, never truly indifferent for long).
- **On screen / Interaction / Dice / Feedback:** Entirely standard stranger flow. As an ally it
  appears in no artifact dropdown (uses nothing) and the Quarrel picker skips it.
- **Aftermath:** fs 3 muscle worth 3 points; carries nothing.
- **Build notes:** Data row + immunity list entries (Quarrel). MP: nothing special.

### US-16: Scholar (creature 17)

- **Trigger:** Standard stranger; thresholds = Priest (proposed).
- **On screen / Interaction:** Standard; uses artifacts **as a Priest**; carries 25 kg.
- **Dice / Feedback:** Standard.
- **Aftermath:** A modest utility ally (fs 2, mp 1, 5 pts).
- **Build notes:** Data row + Priest-class lists. MP: nothing special.

### US-17: Thief (creature 19)

- **Trigger:** Standard stranger; thresholds = Man (proposed).
- **On screen:** Standard — plus, in any area **pacified by indifference** where treasure lies
  under the strangers' watch, the pickup panel unlocks with a caption: "The Thief works while
  they look away."
- **Interaction:** With a Thief ally present, treasure in indifferent-pacified areas becomes
  collectible via the normal pickup panel (base game: indifferent strangers still guard it).
  Uses artifacts **as a Man**.
- **Dice:** none beyond standard.
- **Feedback:** Each lifted item: "The Thief palms the [item]."
- **Aftermath:** Opens a non-violent treasure route; 5 pts himself.
- **Build notes:** Pickup-legality relaxation predicated on a living Thief ally + area pacified
  state. MP: the Thief steals for his own seat only.

### US-18: Wolf (creature 20)

- **Trigger:** Standard stranger; thresholds = Lion (proposed); fs 2 (proposed — card blank).
- **On screen / Interaction / Dice / Feedback:** Standard stranger flow; appears in no artifact
  dropdown; skipped by Quarrel picker; **skipped by Medusa's petrify dice, Mutiny's desertion,
  and Desertion's rolls** — each skip gets a notice line ("The Wolf is unmoved.") so the
  immunity is visible, not silent.
- **Aftermath:** A cheap (2 pts), stubborn ally that survives the kit's worst social hazards.
- **Build notes:** Immunity checks at four existing sites (Medusa loop, Mutiny, Quarrel picker,
  Desertion loop). MP: nothing special.

---

### US-19: Elixir (artifact 15)

- **Trigger:** Picked up like any artifact; usable any time the party is not mid-fight.
- **On screen:** Appears in the artifact action list ("Drink the Elixir") with a member picker.
- **Interaction:** Assignment dropdown chooses the drinker (any living member — "any creature");
  confirm popup: "One draught. 1: death. 2–3: nothing. 4–6: +2 strength, forever."
- **Dice:** One visible d6.
- **Feedback:** 1 — "[Name] convulses — poison!" (death, items spill). 2–3 — "It tastes of
  pond water. Nothing happens." 4–6 — "[Name] feels power settle into their bones. (+2 fs)"
- **Aftermath:** Permanent +2 fs rides on the member (a per-member fs bonus field — survives
  fights, shows in the FightSurface chips). Consumed on use, whatever the outcome.
- **Build notes:** `useArtifact` case + `artifactActions` offer + a per-member `fsBonus` the
  combat plan already-style modifiers read. MP: per-member state, composes cleanly.

### US-20: Holy Water (artifact 16)

- **Trigger:** Picked up; one use, three modes depending on target.
- **On screen:** "Use the Holy Water" with a target picker listing every legal target in the
  current area: petrified party members, Gallery statues (US-06), a lurking/present Medusa,
  a Spectre or Demon, the Sorcerer or an Apprentice.
- **Interaction:** Single target choice + confirm. Modes: **Reanimate** (stone member → alive;
  stone stranger → wakes + immediate reaction test), **Destroy** (Medusa/Spectre/Demon removed
  outright, no fight, no dice), **Weaken** (Sorcerer or Apprentice −2 mp for the rest of the
  game, stacking with Lotus Dust/Eye effects, floor 0).
- **Dice:** Only a woken statue's reaction d6.
- **Feedback:** "The water sears the [Medusa/Spectre/Demon] into mist." / "The stone sloughs
  away — [name] breathes again." / "The [Sorcerer/Apprentice] recoils, diminished."
- **Aftermath:** Consumed. Worth 5 pts if instead carried out unspent — the classic use-it-or-
  bank-it artifact tension. A destroyed Medusa stops lurking forever.
- **Build notes:** `useArtifact` case with target enumeration in `artifactActions`; Sorcerer
  weaken parallels `lotusOnSorcerer` (a counter, not a boolean, to stack sources). MP: destroy
  affects shared cave content; weaken is cave-global on the Sorcerer.

### US-21: Scroll (artifact 19)

- **Trigger:** Picked up; usable when a living **HUMAN** party member is present and enemies are
  in the area (encounter or fight phase).
- **On screen:** "Read the Scroll" appears only when legal; confirm popup: "Destroys every enemy
  here save the magical — and curses the party."
- **Interaction:** One confirm; the reader is any human (no picker needed — confirmed simplification).
- **Dice:** none.
- **Feedback:** "The words burn the air. [list of destroyed] crumble to dust. The survivors —
  [list with mp > 0] — laugh." Then the standing curse notice: "A curse settles on the party."
- **Aftermath:** All strangers with mp = 0 in the area are removed (no score — this engine only
  scores creatures you bring out). Strangers with mp > 0 remain (fight continues if one was on).
  `curses += 1` — −1 on every party die and the flat −30 at scoring until the Sorcerer falls.
  Consumed.
- **Build notes:** `useArtifact` case; curse reuses the existing counter verbatim. MP: destroys
  the current area's shared strangers; curses only the reading seat.

### US-22: Spell (hazard 8 — a hazard per the official INVENTORY, not a usable artifact)

- **Trigger:** Fires when drawn, in the hazard phase: the **last occupied tunnel** (the party's
  `prev`, if it is an un-destroyed non-gateway tunnel) is snatched back into the pack.
- **On screen:** The spell card flashes up; the map visibly swaps the previous tile for a
  face-down card back.
- **Interaction:** None — it simply happens (hazard semantics).
- **Dice:** none.
- **Feedback:** "A spell takes hold — the tunnel behind you folds in on itself and is
  elsewhere. Its secret doors are gone." If `prev` is not an eligible tunnel (chamber, gateway,
  collapsed, or none): "A spell crackles through the cave… and finds nothing to grip." (no
  effect, card discarded).
- **Aftermath:** The previous tunnel's card value returns to the **middle of the remaining
  large pack**; the map cell is replaced by the next card off the pack, placed **unexplored**
  (revealed with a normal entry beat when next stepped on — mirrored stairs/secret doors of the
  old tile are gone; the new card gets the standard mirrored-stair treatment only when entered).
  If the large pack is empty, the spell fizzles (narrated no-effect).
- **Build notes:** New `applyHazards` case (fires once, discards). The most map-invasive card:
  needs a place-face-down state (a placed area with `unresolved` flag the renderer shows as a
  card back — the engine already resolves areas on entry, so the flag mainly suppresses art
  until then). Deck splice at `floor(remaining/2)`. MP: changes shared cave on the drawing
  seat's turn; fog-lite hides it naturally from others.

### US-23: Magic Shield (artifact 20, borne)

- **Trigger:** Picked up and **borne** (Sword/Staff/Ring pattern) by a Man, Woman, Hero, or
  W-Hero.
- **On screen:** Shield icon on the bearer's party row; in fights, enemy magic-power chips
  render struck-through with a shield glyph.
- **Interaction:** None once borne — it is a passive ward. **Any member may pick up, carry, or
  receive the Shield** via the normal item panel; the ward is simply inert unless the current
  holder is an eligible bearer (Man, Woman, Hero, W-Hero). The party-row icon renders dimmed
  when held by an ineligible member.
- **Dice:** none of its own.
- **Feedback:** Fight-plan notice when it bites: "The Magic Shield turns the [creature]'s power
  aside." / vs Sorcerer or Apprentice: "The Shield dims the [Sorcerer]'s power (−2)."
- **Aftermath:** The ward is **pairing-scoped**: it affects only the creature slotted against
  the Shield's bearer on the FightSurface — that one opponent contributes 0 magic power (or,
  if it is the Sorcerer or Apprentice, fights the bearer at −2 mp, stacking with Lotus Dust /
  Holy Water / Eye, floor 0). Enemies paired against other members are unaffected. Worth 15 pts
  at scoring. Petrifies with a stoned bearer like other borne items.
- **Build notes:** BORNEABLE addition (loot.ts:15) + an effects.ts ward predicate read at the
  **pairing level** of the combat plan (per-matchup mp contribution), not the global `enemyMP`
  aggregate. MP note: in PvP fights the shield nullifies the magic of the enemy fighter paired
  against the bearer — explicit MP-milestone decision, flagged.

### US-24: Magic Axe (artifact 17, borne)

- **Trigger:** Picked up and borne by any member (bonus applies only to some).
- **On screen:** Axe icon on the bearer's row; FightSurface strength chips show +1 (Man, Woman,
  Hero, W-Hero) or +3 (Dwarf) exactly as the Magic Sword's chips do today.
- **Interaction:** Passive; transfer via item panel. Against a Demon, the bearer appears in the
  engageable list even with mp 0.
- **Dice / Feedback:** Standard fight presentation; the Demon-engagement caption: "[Name] hefts
  the Axe — it can bite the Demon."
- **Aftermath:** A Sword-class stat item worth 15 pts; the Dwarf's +3 makes the kit's extra
  Dwarf card suddenly interesting.
- **Build notes:** Mirrors Magic Sword end-to-end (bonus table, BORNEABLE, Eye nullification
  applies). Demon-fight predicate per US-13. MP: as Sword.
- **Note:** the kit card is untitled in the requirements table; the printed banner (verified
  during asset conversion) is "MAGIC AXE".

### US-25: Idol (treasure 18 — heavy per the official INVENTORY)

- **Trigger:** Picked up; no in-game use at all — its mystery is its value.
- **On screen:** In the party panel its score shows as "10×?". At game over, the reveal: a
  visible d6 rolls on the game-over screen and the Idol's line animates to its final value.
- **Interaction:** Carry, transfer, drop — nothing else. It is **heavy treasure (25 kg)**:
  it consumes carry capacity like Silver/Gold/Gems, so hauling the mystery out is a real
  logistics decision.
- **Dice:** One d6 at scoring, shown on the game-over/score-breakdown screen (seeded — replays
  reproduce it).
- **Feedback:** Game-over line: "The Idol's eyes open: it is worth [10×d6]."
- **Aftermath:** 10–60 pts if carried out by a surviving member. A new deferred-valuation
  pattern: the roll draws from the game seed at terminal scoring so `scoreGame` stays pure and
  deterministic.
- **Build notes:** Score-time roll folded into `scoreBreakdown` (seeded from final state — no
  stored roll needed); game-over UI already renders breakdown lines. MP: rolled per the carrying
  seat at their scoring.

### US-26: The familiar faces (duplicates — treasures Gold ×3, Silver ×3, Gems, Lotus Dust; creatures Dwarf, Woman)

- **Trigger/Interaction/etc.:** Identical to their base-game counterparts in every respect —
  same ids, same rules, same UI. They are simply more copies in the pack.
- **On screen:** The **extension art** is shown for these draws (the deck entry knows it came
  from the kit), so the new illustrations appear even for familiar cards.
- **Build notes:** Deck entries carry a kit-art marker (or: art keyed by deck index range) so
  `resolveCard` can prefer `cardsExtension` art for kit copies. Zero rules impact.

### US-27: The wider cave (24 plain extension tiles)

- **Trigger:** With the kit on, the area deck holds 90 cards; new corridor and chamber shapes
  (including the kit's distinctive NESW junctions and the twin EW zigzags) appear throughout.
- **On screen:** Extension tiles render at rot 0 like all tiles; the mirrored-stair
  level-marker fallback covers any synthetic topology with no art (§1.4).
- **Aftermath:** Longer explorations, more level-spanning play (the kit skews toward open
  four-way chambers).
- **Build notes:** `EXT_AREA_CARDS` + widened decode + resolveTile over the merged art set +
  extended rot-0 test. MP: nothing special — the cave is already shared.

## Part 3: Spec & test plan

- **Spec:** new `SC-EXT-<n>` Part I section (precedent: `SC-MP`), a Part II narrative chapter,
  and **Appendix A.7** (extension data tables: creatures 14–20, treasures 15–21, hazards 5–8,
  `EXT_AREA_CARDS`, special codes 6–11, deck composition 101/90). Existing SC rows are not
  renumbered; the decode-width change amends the touched row(s) in place with unchanged-decoding
  noted.
- **Tests:** `kit-*.test.ts` suites per subsystem; a kit-on golden replay (`solo-golden`
  pattern) pinned from a scripted full game; conformance vectors for a kit game (Appendix D);
  the widened-decode identity assertion over base `AREA_CARDS`; rot-0 tile resolution over the
  90-tile set; byte-identity test — same seed, kit off, before/after the change ⇒ identical
  event streams.
- **Notices:** the `eventNotices` exhaustiveness change lands **first** (it is a base-game
  hardening), then every kit event compiles against it.

## Part 4: Multiplayer design notes (build-later milestone)

- `extensionKit` in `variantsV` / lobby checkbox / `buildMpGame` — the flag must match for all
  seats (cave-shared decks).
- New specials: no `areaInteractionMask` entries needed for chambers (Chasm/Bell/Lair/Gallery/
  Well); Whirlpool crossings compose like Deep Pool.
- Zombie variant: classify each new hazard for zombie immunity (proposal: zombies ignore
  Desertion and Quarrel — social hazards; Crypt and Harpies apply).
- PvP/unions: Quarrel within a union picks from the combined force; a loaned ally deserting
  (US-09) ends its loan; Magic Shield in PvP nullifies the opposing seat's magic (flagged).
- Harpies stash, Gallery statues, Demon, and the Crypt are shared cave content — first seat to
  act takes the risk/reward.

## Resolved interpretations (reviewed by MSW, 2026-07-26)

1. **Stats:** Apprentice 0 points (she never leaves the cave); Demon fs 0, 0 points (a purely
   magical obstacle). Wolf fs 2; Lion thresholds hostile ≤4 / indiff ≤5; Wolf = Lion;
   Scholar = Priest, Witch = Woman, Thief = Man threshold mappings — accepted as proposed.
2. Bell Rope 2–3 "Bell Rings" = narration only, in foreboding terms (US-03).
3. Bell Rope puller & Desertion deserters are removed unrevivably (not "dead") — confirmed.
4. Well draws are unlimited (one per turn at the tile) — accepted as proposed.
5. Quarrel loser dies (tie harmless); Wolf/Lion exempt — confirmed.
6. Unfightable Demon follows the Spectre auto-slay rule — confirmed. A Demon with no valid
   `prev` cannot occur (all games start at the Gateway); current-area materialization is a
   defensive fallback only. A prev collapsed by Earthquake disperses the Demon with a special
   message (US-13).
7. Apprentice reverts to hostile stranger the moment the Sorcerer dies; never exits the cave —
   confirmed. She is female per the card art (US-14).
8. Harpies stealing the Eye of God **does invoke the forsaken-curse**, with an explicit notice
   to the player (US-10).
9. Magic Axe / Magic Shield "HERO" includes the W-Hero (Sword precedent) — confirmed.
10. Scroll needs any living human, no reader selection — confirmed.
11. Kit-copy draws show extension art for duplicate cards (US-26) — confirmed.
12. Descents into occupied chambers (Whirlpool, Crypt fall, Chasm) never offer withdraw —
    trap-fall semantics throughout (US-02/05/08).
13. Crypt gems are carried as the Crypt/Gems card (art override) to mark their provenance (US-08).
14. Gallery: Sorcerer/Spectre/Demon draw un-petrified (standard interaction); a Wizard bearing
    the Magic Staff auto-reanimates all statues on entry, with a notice (US-06).
15. Magic Shield: holdable by anyone, ward active only for eligible bearers, and scoped to the
    creature paired against the bearer (US-23).
16. **Official kit rules** ([extension-kit-rules.md](../../specs/extension-kit-rules.md), OCR'd
    2026-07-26) govern classifications: Spell is a **hazard**; Crypt/Gems and Idol are **heavy
    treasure** (25 kg each; Idol keeps its 10×d6 end-game value).
17. Witch (5), Scholar (3), Thief (3), Lion (2), Wolf (1) join the selectable starter pool in
    kit-on games (stock 3/1/1/1/1); Dwarf and Woman stock rises to 4.
18. Ogre 5→4 and Troll 4→3 selection costs apply in **kit-on games only**; the base game keeps
    the original values (MSW ruling).
19. The rules' "remove a third to half of the large pack" short-game suggestion is NOT adopted:
    all 30 extension tiles always join the 90-card area deck (MSW ruling).
