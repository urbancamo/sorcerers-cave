# Extension Kit Engine Integration (Solo Milestone) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the extension kit as an opt-in solo variant per the approved design
[2026-07-26-engine-integration-design.md](2026-07-26-engine-integration-design.md) — kit off is
byte-identical to today; kit on shuffles 30 new area tiles and 30 small cards into the decks with
full rules and player-facing UI.

**Architecture:** Deck-as-gate: `variants.extensionKit` alters only deck composition; new rules
are ordinary new cases in the existing dispatch switches (kit ids can never be drawn when off).
See the design doc's Part 1 for foundations and Part 2 (US-01..27) for per-card behavior — every
task below cites its US stories; the design doc is the requirements authority.

**Tech Stack:** TypeScript, vitest, existing engine reducer (`packages/engine/src`), React web app
(`apps/web`), no new dependencies.

## Global Constraints

- Branch `add-extension-kit`. Design doc = spec; on conflict between this plan and the design doc, the design doc wins — report the conflict.
- **Byte-identity:** with `variants` absent/false, every existing test (engine 503, web 281, assets 4) and the solo golden replay must pass unchanged. Never edit an existing base data row, SC row, or golden fixture.
- **CLAUDE.md spec-sync:** every task that touches `packages/engine/src` MUST update `docs/specs/engine-spec.md` in the same commit: add its `SC-EXT-<n>` Part I rows (new table section, stable ids, cite file:line + test), and A.7 data where noted. Part II narrative is consolidated in Task 17.
- **TDD:** every task writes failing tests first. Type-level changes need `pnpm --filter <pkg> exec tsc --noEmit` for RED/GREEN — **vitest alone does not type-check** (esbuild strips types).
- Test code in this plan states REQUIRED behavior: keep the assertions verbatim, but build test fixtures with the same helpers the neighbouring existing tests use (e.g. how `solo-golden.test.ts` / `gap-*.test.ts` construct states) rather than inventing new scaffolding.
- New engine events must each get a notice in `apps/web/src/game/eventNotices.ts` (exhaustive after Task 2) — engine tasks add their event types AND the UI notice text (from the design doc's Feedback lines) in the same commit to keep the web build green.
- Kit entity ids: creatures 14–20, treasures 15–21 (Idol 18 and Crypt/Gems 21 are HEAVY 25 kg; Shield is 20), hazards 5–8 (Desertion, Harpies, Quarrel, Spell), specials 6–11 — exactly as the design doc §1.3 tables (Apprentice points 0/female/cost null, Demon fs 0 points 0 cost null; kit starters + Ogre/Troll cost revision are kit-on only, per docs/specs/extension-kit-rules.md).
- RNG discipline: all rolls via the seeded `rng.ts` helpers, threaded through `state.seed`; every roll emits a roll-shaped event (visible dice).

## File Structure

- `packages/engine/src/data/`: `creatures.ts`, `treasures.ts`, `hazards.ts` (append rows), `areaCards.ts` (+`EXT_AREA_CARDS`, +6 SPECIAL consts), `smallPack.ts` (+`smallPackExtension()`)
- `packages/engine/src/`: `decode.ts` (widen mask), `decks.ts` (variant param), `state.ts` (variants field + kit state: harpyStash, stone-stranger codes, fsBonus, noWithdrawTurn), `reduce.ts` (new actions/cases), `hazards.ts`, `special.ts`, `selectors.ts`, `effects.ts`, `reaction.ts`, `loot.ts` (BORNEABLE), `score.ts` (Idol)
- New tests: `packages/engine/src/kit-*.test.ts` (one per task area), `kit-golden.test.ts`
- `apps/web/src/game/`: `eventNotices.ts`, action surfaces (`ExplorePanel`/`EncounterPanel`), `PartySelect.tsx` (toggle), `GameOverScreen` (Idol), `gameLog.ts` (TYPE3 map)
- `apps/web/src/data/manifest.ts` (art merge + kit-copy art), `tileOrientation.test.ts` extension
- `docs/specs/engine-spec.md` (SC-EXT section, A.7), `docs/specs/conformance/` (kit vector)

---

### Task 1: Solo variant plumbing + byte-identity guarantee

**Files:** Modify `state.ts` (GameState + `variants?: { extensionKit?: boolean }`), `setup.ts`/`newGame` (accept + store optional variants), `decks.ts` (optional variants param, unused for now). Test: `packages/engine/src/kit-variant.test.ts`.

**Interfaces:** Produces `newGame(seed, picks, variants?)` and `buildSmallPack(seed, variants?)` / `buildLargePack(seed, variants?)`; later tasks rely on these exact optional params. `state.variants` survives serialization untouched (it is plain state).

- [ ] **Step 1: Failing tests** — `kit-variant.test.ts`:
  - `newGame(seed, picks)` (no variants) produces a state deep-equal to before (pin: JSON of a fresh game for a fixed seed matches a snapshot taken from current `main` behavior — construct by calling newGame twice, once via old signature semantics).
  - `newGame(seed, picks, { extensionKit: true }).variants.extensionKit === true` and the field round-trips `JSON.parse(JSON.stringify(state))`.
  - `buildSmallPack(seed)` ≡ `buildSmallPack(seed, undefined)` ≡ `buildSmallPack(seed, {})` (identical packs).
- [ ] **Step 2: Run, expect FAIL** (`pnpm --filter @sorcerers-cave/engine test kit-variant`) — variants param unknown.
- [ ] **Step 3: Implement** — optional param threading only; no behavior change.
- [ ] **Step 4: Run kit-variant + FULL engine suite, expect all green** (byte-identity check).
- [ ] **Step 5: Spec** — add SC-EXT-1 (variant stored at creation, immutable, absent ⇒ identical behavior) to a new "§EXT Extension kit" Part I table; add §EXT row to the Section map.
- [ ] **Step 6: Commit** `feat(engine): solo variants field + deck-builder threading (SC-EXT-1)`

### Task 2: eventNotices exhaustiveness (base hardening)

**Files:** Modify `apps/web/src/game/eventNotices.ts`; test `apps/web/src/game/eventNotices.test.ts`.

**Interfaces:** Produces a compile-time-exhaustive notice switch; every later engine event type forces a notice here (build breaks otherwise) — this is the mechanism that guarantees "no silent gameplay".

- [ ] **Step 1: Failing check** — replace `default: break` with `default: assertNever(ev)` (`const assertNever = (x: never): void => {}` local helper applied to the event's type after all cases). RED: `pnpm --filter web exec tsc --noEmit` fails if any current `GameEvent` member lacks a case (add plain, accurate one-line notices for any it reveals); GREEN when exhaustive.
- [ ] **Step 2: Tests** — for each newly-covered event type, one test asserting a non-empty notice string.
- [ ] **Step 3: Full web suite green; commit** `fix(web): eventNotices exhaustive over GameEvent — no silently dropped events`

### Task 3: Kit data tables + decode widening + deck integration

**Files:** Modify `data/creatures.ts`, `data/treasures.ts`, `data/hazards.ts`, `data/areaCards.ts`, `data/smallPack.ts`, `decode.ts`, `decks.ts`. Test: `kit-data.test.ts` (+ update `decode.test.ts` expectations only by ADDING cases).

**Interfaces:** Produces the exact ids/consts every later task dispatches on. Exact data (design §1.3 authority):

```ts
// creatures.ts — append (id order normative; costs per official SELECTION TABLE,
// docs/specs/extension-kit-rules.md — Apprentice/Demon never selectable):
{ id: 14, name: "Apprentice", fs: 2, mp: 7, carry: 0, cost: null, points: 0, flags: FLAG_HUMAN, hostileMax: 5, indiffMax: 5, leaderPri: 10 }, // custom reaction: US-14 (6=friendly only while Sorcerer lives; no indifferent band)
{ id: 15, name: "Demon", fs: 0, mp: 6, carry: 0, cost: null, points: 0, flags: FLAG_INHUMAN, hostileMax: 6, indiffMax: 6, leaderPri: 10 },
{ id: 16, name: "Lion", fs: 3, mp: 0, carry: 0, cost: 2, points: 3, flags: FLAG_INHUMAN, hostileMax: 4, indiffMax: 5, leaderPri: 3 },
{ id: 17, name: "Scholar", fs: 2, mp: 1, carry: 25, cost: 3, points: 5, flags: FLAG_HUMAN, hostileMax: 1, indiffMax: 4, leaderPri: 6 },
{ id: 18, name: "Witch", fs: 1, mp: 4, carry: 0, cost: 5, points: 10, flags: FLAG_HUMAN, hostileMax: 2, indiffMax: 4, leaderPri: 6 },
{ id: 19, name: "Thief", fs: 2, mp: 0, carry: 25, cost: 3, points: 5, flags: FLAG_HUMAN, hostileMax: 2, indiffMax: 4, leaderPri: 5 },
{ id: 20, name: "Wolf", fs: 2, mp: 0, carry: 0, cost: 1, points: 2, flags: FLAG_INHUMAN, hostileMax: 4, indiffMax: 5, leaderPri: 2 },
// creatures.ts — kit selection (base game MUST be unaffected: base code paths never read these):
// stock additions when kit on, and the official Ogre/Troll cost revision (kit-on ONLY):
export const KIT_STARTING_STOCK: Readonly<Record<number, number>> = {
  16: 1, 17: 1, 18: 3, 19: 1, 20: 1, // Lion, Scholar, Witch×3, Thief, Wolf
  6: 1, 7: 1,                        // +1 Woman, +1 Dwarf (kit copies) → 4 each
};
export const KIT_COST_OVERRIDES: Readonly<Record<number, number>> = { 2: 4, 3: 3 }; // Ogre 5→4, Troll 4→3
// selection helpers (variant-aware; used by setup validation + PartySelect):
//   selectionCost(id, variants) — CREATURES[id].cost, overridden by KIT_COST_OVERRIDES when kit on
//   startingStock(variants) — STARTING_STOCK merged with KIT_STARTING_STOCK counts when kit on
// treasures.ts — append (classifications per official INVENTORY: Idol & Crypt/Gems are HEAVY):
{ id: 15, name: "Elixir", points: 0, weight: 0, kind: "artifact" },
{ id: 16, name: "Holy Water", points: 5, weight: 0, kind: "artifact" },
{ id: 17, name: "Magic Axe", points: 15, weight: 0, kind: "artifact" },
{ id: 18, name: "Idol", points: 0, weight: 25, kind: "heavy" }, // scored 10×d6 at game end (Task 12)
{ id: 19, name: "Scroll", points: 0, weight: 0, kind: "artifact" },
{ id: 20, name: "Magic Shield", points: 15, weight: 0, kind: "artifact" },
{ id: 21, name: "Crypt/Gems", points: 20, weight: 25, kind: "heavy" }, // parks as the crypt when drawn (Task 8)
// hazards.ts — extend HAZARD_NAMES tuple and add (Spell IS a hazard per official INVENTORY):
export const HAZARD_DESERTION = 5; export const HAZARD_HARPIES = 6;
export const HAZARD_QUARREL = 7; export const HAZARD_SPELL = 8;
// areaCards.ts — add consts + array:
export const SPECIAL_CHASM = 6; export const SPECIAL_BELL_ROPE = 7;
export const SPECIAL_LAIR = 8; export const SPECIAL_WHIRLPOOL = 9;
export const SPECIAL_GALLERY = 10; export const SPECIAL_WELL = 11;
// 30 extension tiles x01-1..x08-2 (manifest tilesExtension order; encoding: bits 0-3 NESW,
// 16 chamber, 32 stairUp, 64 stairDown, special<<7):
export const EXT_AREA_CARDS: readonly number[] = [
  3, 23, 3, 23,            // x01: NE t, NES c, NE t, NES c
  39, 31, 87, 27,          // x02: NES t+U, NESW c, NES c+D, NEW c
  31, 31, 31, 31,          // x03: NESW chambers
  25, 61, 31, 13,          // x04: NW c, NSW c+U, NESW c, NSW t
  30, 94, 6, 30,           // x05: ESW c, ESW c+D, ES t, ESW c
  12, 799, 62, 927,        // x06: SW t, chasm, ESW c+U, bell-rope
  1055, 1183, 1311, 1439,  // x07: lair, whirlpool, gallery, well
  10, 10,                  // x08: EW tunnels
];
// smallPack.ts — add smallPackExtension(): number[] with (design §1.3, official INVENTORY):
// creatures: 114,115,116,117, 118×3, 119,120, 107,106  (Apprentice, Demon, Lion, Scholar,
//   Witch×3, Thief, Wolf, dup Dwarf, dup Woman)
// treasures: 201×3, 200×3, 202, 205, 215,216,217,218,219,220,221  (Gold×3, Silver×3, Gems,
//   Lotus Dust, Elixir, Holy Water, Magic Axe, Idol, Scroll, Magic Shield, Crypt/Gems)
// hazards: 305,306,307,308  (Desertion, Harpies, Quarrel, Spell)
// decode.ts: special: (value >> 7) & 15  (field widened; DecodedArea comment 0..11)
// decks.ts: when variants?.extensionKit, concat EXT_AREA_CARDS / smallPackExtension() before shuffle
```

- [ ] **Step 1: Failing tests** — `kit-data.test.ts`:
  - decode identity: `AREA_CARDS.map(decodeArea)` deep-equals the same map captured with the old `&7` mask (hardcode the pre-change expectation via `(v >> 7) & 7` inline in the test).
  - `EXT_AREA_CARDS.length === 30`; `decodeArea(799)` = NESW chamber special 6; `decodeArea(1439)` = NESW chamber special 11; `decodeArea(39)` = NES stairUp tunnel.
  - `smallPackTemplate().length === 71` (unchanged); `smallPackExtension().length === 30` with exactly 3× code 118, 3× 201, 3× 200.
  - `buildSmallPack(seed, { extensionKit: true }).pack.length === 101`; `buildLargePack(seed, { extensionKit: true }).pack.length === 90`; both without variants: 71/60 and equal to pre-change output for the same seed.
  - selection helpers: `selectionCost(2)` = 5 and `selectionCost(3)` = 4 (base unchanged); with `{ extensionKit: true }` they return 4 and 3; `selectionCost(18, kit)` = 5, `selectionCost(14, kit)` = null; `startingStock()` equals `STARTING_STOCK`; `startingStock(kit)` adds Lion/Scholar/Thief/Wolf 1, Witch 3, and raises Woman/Dwarf to 4.
- [ ] **Step 2: RED**, **Step 3: implement**, **Step 4: GREEN + full engine suite** (existing `data.test.ts` pins base rows — must stay green unmodified).
- [ ] **Step 5: Spec** — SC-EXT-2 (ids/tables), SC-EXT-3 (decode widening, base identity), SC-EXT-4 (deck composition 101/90); new **Appendix A.7** with the three tables + EXT_AREA_CARDS + special codes, marked "verbatim, pinned by kit-data.test.ts".
- [ ] **Step 6: Commit** `feat(engine): extension-kit data tables, 4-bit special field, deck-as-gate (SC-EXT-2..4)`

### Task 4: Art pipeline — manifest entityIds, kit art merge, rot-0 coverage

**Files:** Modify `docs/assets/manifest.json` (backfill `entityId` in cardsExtension per Task 3 ids; duplicates get base ids), `apps/web/src/data/manifest.ts` (merge `tilesExtension`/`cardsExtension` into art tables; kit-copy art: `resolveCard` prefers kit art when the draw is flagged kit-sourced per US-26), `apps/web/src/data/tileOrientation.test.ts` (kit mode). Sync mirror (`rm -rf apps/web/public/assets/{tiles,cards} && pnpm --filter web sync-assets` — manifest changed).

**Interfaces:** Consumes Task 3's `EXT_AREA_CARDS`. Produces: `parseManifest` returns merged tiles/cards including `x…` ids; a `kitArt?: true` marker on extension card entries later UI tasks use for US-26/US-08 art overrides.

- [ ] **Step 1: Failing tests** — extend `manifest.test.ts` fixture with a `tilesExtension` category and assert merged `tileId "x06-2"` resolves for topology `{exits NESW, chamber, special "chasm"}` at rot 0; extend `tileOrientation.test.ts`: for every `EXT_AREA_CARDS` value (and stair-pruned forms), `resolveTile` returns rot 0 against the real manifest.
- [ ] **Step 2-4: RED → implement → GREEN** (plus full web suite).
- [ ] **Step 5: Commit** `feat(web): merge extension art; entityId backfill; rot-0 over 90 tiles` (no engine change ⇒ no spec edit; manifest description already cites the design).

### Task 5: Chasm + Whirlpool (US-02, US-05)

**Files:** Modify `reduce.ts` (new action `descendChasm`; whirlpool crossing hook in `case "move"` beside deep-pool/viper, reduce.ts:362-374), `special.ts` (`whirlpoolCrossing`), `selectors.ts` (offer `descendChasm` on SPECIAL_CHASM in explore/encounter). Test: `kit-descents.test.ts`. Notices in `eventNotices.ts` (design Feedback lines).

**Interfaces:** Both reuse `relocateDown` (reduce.ts:288-305) verbatim — one-way, no mirrored stair-up, `fellThroughTrap` blocks withdraw at the landing (design Resolved-12). New events: `{ type: "chasmDescend" }`, `{ type: "whirlpoolRoll", roll, dragged }`.

- [ ] **Step 1: Failing tests** (fixtures per existing gap-test patterns; force-place the special via a crafted pack or direct state construction as `gap-*.test.ts` do):
  - descendChasm from a chasm area: party lands level+1 on a fresh card, no stair-up mirrored, `fellThroughTrap` true, withdraw illegal at landing; action absent on non-chasm tiles.
  - whirlpool: leaving by the entry direction ⇒ no roll; leaving by a different exit rolls d6 — seed chosen so roll ≤2 in one test (whole party relocates down, lateral move cancelled) and ≥3 in another (move completes); repeated crossings re-roll.
- [ ] **Step 2-4: RED → implement → GREEN + full suites.**
- [ ] **Step 5: Spec** — SC-EXT-5 (chasm one-way descent), SC-EXT-6 (whirlpool crossing roll 1-2 party descends).
- [ ] **Step 6: Commit** `feat(engine): Chasm descent + Whirlpool crossings (SC-EXT-5..6)`

### Task 6: Well + Bell Rope (US-03, US-07)

**Files:** Modify `state.ts` (`noWithdrawTurn?: number` — turn number when withdraw is blocked), `reduce.ts` (actions `drawFromWell`, `pullBellRope(memberId)`; withdraw legality gains `state.noWithdrawTurn === state.turn` alongside fellThroughTrap, reduce.ts:380-383), `selectors.ts` (offers + Bell Rope per-area spent flag), `chamber.ts` reuse for the draws. Test: `kit-well-bell.test.ts`.

**Interfaces:** Consumes chamber draw path (chamber.ts:29-61) for 1 (Well) / 2 (Bell) cards. Events: `{ type: "wellDraw" }`, `{ type: "bellRoll", roll, outcome: "vanish" | "toll" | "stir" , memberId }`. Bell puller removal = Desertion semantics (removed with carried items, not dead — Resolved-3).

- [ ] **Step 1: Failing tests:**
  - Well: `drawFromWell` legal only on SPECIAL_WELL with non-empty pack; draws exactly 1 code into the area (strangers/hazards resolve normally); withdraw illegal same turn, legal next turn; repeatable each turn.
  - Bell: member picker required; seeds pinned for the three bands — 1: member gone from party, carried treasure gone from game, not on floor; 2-3: state unchanged except events; 4-6: two codes drawn + withdraw blocked this turn; action absent after use (spent per area).
- [ ] **Step 2-4: RED → implement → GREEN.**  
- [ ] **Step 5: Spec** — SC-EXT-7 (well), SC-EXT-8 (bell bands + unrevivable removal), SC-EXT-9 (no-withdraw turn condition).
- [ ] **Step 6: Commit** `feat(engine): Well draws + Bell Rope (SC-EXT-7..9)`

### Task 7: Lair + Gallery (US-04, US-06)

**Files:** Modify `state.ts` (`lairCoord?: number`, `harpyStash: number[]`), `chamber.ts` (Gallery draw-classify: creatures → stone codes `500+id`, except ids 9/11/15; Lair placement registers coord + spills pending stash), `reduce.ts` (Staff-Wizard auto-wake on entry extending `reviveStoned` reduce.ts:127-143 to stone strangers in SPECIAL_GALLERY; woken group gets the standard reaction flow). Test: `kit-lair-gallery.test.ts`.

**Interfaces:** Produces stone-stranger codes `500+creatureId` (persist in `area.contents` like sleeping's 400-codes) and the `harpyStash` consumed by Task 9. Events: `{ type: "galleryStone", creatureIds }`, `{ type: "staffWake", creatureIds }`, `{ type: "lairStash", treasureIds }`.

- [ ] **Step 1: Failing tests:**
  - Gallery draw with a mixed pack: ordinary creatures arrive as 500-codes (no reaction test fires, phase proceeds as if no strangers), Sorcerer/Spectre arrive as normal strangers (standard chamber flow), treasure freely collectible.
  - Statues persist across exit/re-entry.
  - Party with Wizard bearing Staff enters: all 500-codes convert to strangers, single group reaction test fires, `staffWake` event emitted.
  - Lair placed after a stash exists: stash treasures appear on Lair floor; Lair placed first: later stashes land directly.
- [ ] **Step 2-4: RED → implement → GREEN.**
- [ ] **Step 5: Spec** — SC-EXT-10 (gallery stone strangers + exemptions), SC-EXT-11 (staff auto-wake), SC-EXT-12 (lair stash landing).
- [ ] **Step 6: Commit** `feat(engine): Gallery statues + Staff wake; Lair stash (SC-EXT-10..12)`

### Task 8: Crypt + Desertion (US-08, US-09)

**Files:** Modify `hazards.ts` (Desertion case, id 5, in `applyHazards` after TRAP), `chamber.ts`/draw-classify (treasure id 21 parks as a crypt instead of lying on the floor), `reduce.ts` (`enterCrypt` action at turn start in the area), `selectors.ts`. Test: `kit-crypt-desertion.test.ts`.

**Interfaces:** The Crypt is **treasure 21 (heavy, 25 kg, 20 pts)** per the official INVENTORY: drawn ⇒ parks; on a 3-6 find, the parked content converts to floor treasure id 21 (the card IS the gems — Resolved-13, no art override needed). Events: `{ type: "cryptRoll", roll, outcome }`, `{ type: "desertionRoll", memberId, roll, deserted }`. Wolf (id 20) skipped by Desertion (Resolved US-18).

- [ ] **Step 1: Failing tests:**
  - Crypt: drawn ⇒ parks, never lies as floor treasure (no immediate effect); `enterCrypt` only at turn start in-area; seed-pinned 1-2 ⇒ whole party `relocateDown` even WITH a living Dwarf, withdraw blocked at landing; 3-6 ⇒ treasure 21 on floor (25 kg — pickup gated by carry capacity, worth 20 pts); either way the parked crypt is removed (no second entry).
  - Desertion: fires immediately; one roll per status-1 ally in roster order; 1-2 ⇒ ally and their carried items removed from game (not on floor); original members never roll; Wolf ally present ⇒ no roll for it; all-stay path emits rolls only.
- [ ] **Step 2-4: RED → implement → GREEN.**
- [ ] **Step 5: Spec** — SC-EXT-13 (crypt park + bands + dwarf-proof trap), SC-EXT-14 (desertion per-ally rolls, removal, wolf immunity).
- [ ] **Step 6: Commit** `feat(engine): Crypt + Desertion (SC-EXT-13..14)`

### Task 9: Harpies + Quarrel + Spell hazards (US-10, US-11, US-22)

**Files:** Modify `hazards.ts` (all three cases; ids 6, 7, 8), `state.ts` (uses Task 7's `harpyStash`; `unresolved` face-down flag on placed areas), `effects.ts` (Talisman-ward reuse for Harpies park condition), map/pack splice for Spell. Test: `kit-harpies-quarrel-spell.test.ts`.

**Interfaces:** Harpies: steals ALL party artifacts (borne + carried, every member) → `harpyStash`/Lair floor; parks (lurk) when party has no artifacts or holds Talisman; **Eye of God theft invokes the forsaken curse with notice** (Resolved-8) — reuse the forsaken path (`curses += 1`, event). Quarrel: two highest effective-fs members (Wolf id 20 / Lion id 16 excluded; ties by roster order) fight one round: each rolls fs+d6 with standard modifiers (Sword/Axe bonus, curse −1); lower total dies (normal death: items spill); tie harmless. Spell (hazard 8, fires once): if `prev` is an un-destroyed non-gateway tunnel, its card value splices into `floor(remaining/2)` of the large pack and the cell is replaced by the next pack draw placed **unexplored** (face-down; resolves with a normal entry beat when stepped on; old tile's secret doors/mirrored stairs gone); otherwise, or with an empty pack, narrated fizzle. Events: `{ type: "harpiesSteal", treasureIds, cursed }`, `{ type: "quarrel", aId, bId, aRoll, bRoll, loserId | null }`, `{ type: "spellRemap", fizzled }`.

- [ ] **Step 1: Failing tests:**
  - Harpies with artifacts incl. Eye: all artifacts leave members, land in stash/Lair, `curses` incremented once, hazard discarded. Without artifacts: parks, re-checks on re-entry (steals then). With Talisman: parks even with artifacts.
  - Quarrel: picks the two highest fs (asserts exclusions and tie-break); seed-pinned loser dies with items spilled to floor; tie case harmless; hazard discarded; turn continues to normal phase.
  - Spell: prev tunnel ⇒ old value found mid-pack, cell holds an unexplored area that resolves normally on entry, secret door gone; prev chamber/gateway/collapsed or empty pack ⇒ fizzle event, no state change.
- [ ] **Step 2-4: RED → implement → GREEN.**
- [ ] **Step 5: Spec** — SC-EXT-15 (harpies steal/park/Eye-curse), SC-EXT-16 (quarrel round), SC-EXT-28 (spell remap-on-draw).
- [ ] **Step 6: Commit** `feat(engine): Harpies + Quarrel + Spell (SC-EXT-15..16, 28)`

### Task 10: Creature behaviors — artifact classes, immunities, Thief (US-12, US-15..18)

**Files:** Modify the artifact-eligibility lists (Carpet/Balm/Staff/Flute constants and `findBearer` reduce.ts:33-42, selectors.ts:15-61): add Apprentice(14) wherever Wizard(8) appears; Scholar(17)+Witch(18) wherever Priest(4) appears; Thief(19) wherever Man(5) appears (Sword/Axe named-bonus lists excepted). Wolf immunities: skip id 20 in Medusa petrify loop (hazards.ts:60-84) and Mutiny desertion (hazards.ts:119-135) with a visible "unmoved" event; (Quarrel/Desertion skips landed in Tasks 8-9). Thief pickup: `takeTreasure` legality allows guarded treasure in indifference-pacified areas when a living Thief ally is present. Test: `kit-creatures.test.ts`.

- [ ] **Step 1: Failing tests:** eligibility per the class rule — a creature "using artifacts as X" joins every list X appears in: FLUTE_PLAYERS contains Priest and Man, so Scholar, Witch (as Priest) and Thief (as Man) join it; Apprentice (as Wizard) gains Carpet and Staff-reanimation; Witch/Scholar (as Priest) gain Carpet and Balm. One assertion per (creature, artifact-list) pair, plus negative cases (Lion/Wolf/Demon in none). Wolf survives Medusa (no roll for it, event emitted) and stays through Mutiny. Thief unlock: pacified area + Thief ⇒ takeTreasure legal, without Thief ⇒ illegal (base behavior pinned).
- [ ] **Step 2-4: RED → implement → GREEN.**
- [ ] **Step 5: Spec** — SC-EXT-17 (class-based artifact eligibility), SC-EXT-18 (wolf immunities), SC-EXT-19 (thief pickup).
- [ ] **Step 6: Commit** `feat(engine): kit creature classes, Wolf immunities, Thief pickup (SC-EXT-17..19)`

### Task 11: Apprentice + Demon behaviors (US-13, US-14)

**Files:** Modify `reaction.ts`/`reduce.ts case "test"` (Apprentice custom band: leader id 14 ⇒ 6=friendly iff `!sorcererKilled`, else hostile; no indifferent), `reduce.ts` (Sorcerer-death hook: ally Apprentices revert to hostile strangers in their current area; `exitCave` drops Apprentice with event; Demon draw-classify: spawns into `prev` contents as hostile lurker, `AF_DESTROYED` prev ⇒ discard + `demonDispersed` event, no-prev fallback ⇒ current area), `combatPlan.ts` (Demon engageable only by mp>0 members or Magic Axe bearer — extend the Spectre predicate SC-9.4-1; unfightable-unengaged Demon auto-slays strongest per Spectre rule). Test: `kit-apprentice-demon.test.ts`.

- [ ] **Step 1: Failing tests:** Apprentice reaction bands (seed-pinned 6 with Sorcerer alive ⇒ ally; 6 after sorcererKilled ⇒ hostile); ally reverts on Sorcerer death (present in strangers of her area, gone from party); exitCave with Apprentice ally ⇒ escape succeeds, she is not in the scored party, event emitted; Demon draw ⇒ appears in prev's contents not the chamber; earthquake-collapsed prev ⇒ discarded + event; entry into demon area with no mage and no Axe ⇒ auto-slay strongest; with Axe bearer ⇒ fight legal.
- [ ] **Step 2-4: RED → implement → GREEN.**
- [ ] **Step 5: Spec** — SC-EXT-20 (apprentice reaction/revert/exit), SC-EXT-21 (demon spawn/disperse/magic-only+Axe).
- [ ] **Step 6: Commit** `feat(engine): Apprentice + Demon (SC-EXT-20..21)`

### Task 12: Elixir + Idol (US-19, US-25)

**Files:** Modify `state.ts` (`PartyMember.fsBonus?: number`), `reduce.ts` `case "useArtifact"` (case 15 Elixir: target any living member, d6 1 death/2-3 nothing/4-6 fsBonus+2, consumed), `combatPlan.ts` (fsBonus added wherever member fs is read), `score.ts` (Idol id 18 — now HEAVY, 25 kg, so pickup/carry is weight-gated like Silver — carried by a surviving member scores `10 × d6` drawn deterministically from the final state's seed inside `scoreBreakdown`; breakdown line carries the roll), `selectors.ts` (Elixir offer with member targets). Test: `kit-elixir-idol.test.ts`.

- [ ] **Step 1: Failing tests:** Elixir seed-pinned three bands (death spills items; nothing; permanent fsBonus visible in a subsequent fight's rolls); consumed in all bands; Idol: 25 kg counts toward `carriedWeight` (a carry-0 member cannot take it); same final state ⇒ same score (determinism), breakdown includes `idolRoll` 1-6 and 10× contribution; Idol on a dead member scores 0; base scoring without Idol byte-identical.
- [ ] **Step 2-4: RED → implement → GREEN.**
- [ ] **Step 5: Spec** — SC-EXT-22 (elixir), SC-EXT-23 (idol deferred valuation, pure/deterministic).
- [ ] **Step 6: Commit** `feat(engine): Elixir + Idol (SC-EXT-22..23)`

### Task 13: Holy Water + Scroll (US-20, US-21)

**Files:** Modify `reduce.ts` `case "useArtifact"` (case 16 Holy Water: target enumeration — stone member (revive), stone stranger 500-code (wake + immediate reaction test), Medusa in area (remove permanently, stops lurking), Spectre/Demon stranger (remove), Sorcerer/Apprentice (−2 mp counter, stacking, floor 0); case 19 Scroll: legal with a living HUMAN-flag member and strangers present — removes all strangers with mp 0, survivors remain, `curses += 1`), `selectors.ts` (target offers), `combatPlan.ts` (mp-weaken counter read beside `lotusOnSorcerer`). Test: `kit-holywater-scroll.test.ts`.

- [ ] **Step 1: Failing tests:** each Holy Water mode (one test per target class; Medusa destroyed ⇒ hazard gone on re-entry; weaken stacks with lotusOnSorcerer to floor 0); consumed once; Scroll: mp-0 strangers removed with no score change, mp>0 remain, curse applied (reaction/combat −1 visible next roll), illegal without a human.
- [ ] **Step 2-4: RED → implement → GREEN.**
- [ ] **Step 5: Spec** — SC-EXT-24 (holy water modes), SC-EXT-25 (scroll destroy+curse).
- [ ] **Step 6: Commit** `feat(engine): Holy Water + Scroll (SC-EXT-24..25)`

### Task 14: Magic Axe + Magic Shield (US-23, US-24)

**Files:** Modify `loot.ts` (BORNEABLE += 17, 20), `combatPlan.ts` (Axe fs bonus: +1 ids 0/1/5/6, +3 id 7, mirroring Sword's table; Shield id 20 pairing-scoped ward: the enemy paired against the bearer contributes 0 mp, Sorcerer/Apprentice −2 instead — bearer eligible ids 0/1/5/6 only, holdable by anyone), `effects.ts` (shield predicate; Eye nullifies both, Sword precedent), `selectors.ts`. Test: `kit-axe-shield.test.ts`. (Spell moved to Task 9 — it is a hazard.)

- [ ] **Step 1: Failing tests:** Axe borne bonuses per creature class (and none for e.g. Ogre); Axe petrifies with bearer; Shield held by Wizard ⇒ ward inert; by Woman ⇒ paired enemy mp 0 while an unpaired enemy's mp still counts; vs Sorcerer −2 stacking; Eye held ⇒ both nullified.
- [ ] **Step 2-4: RED → implement → GREEN.**
- [ ] **Step 5: Spec** — SC-EXT-26 (axe), SC-EXT-27 (shield pairing ward).
- [ ] **Step 6: Commit** `feat(engine): Magic Axe + Magic Shield (SC-EXT-26..27)`

### Task 15: Setup UI + persistence surfaces (US-01)

**Files:** Modify `apps/web/src/game/PartySelect.tsx` (Extension kit switch + caption; when on, the selectable roster extends via `startingStock`/`selectionCost` — Witch 5, Scholar 3, Thief 3, Lion 2, Wolf 1 join, Woman/Dwarf stock shows 4, and Ogre/Troll display their revised kit costs 4/3), HUD (an "EXT" chip), save/load serialization (variants already in state — verify round-trip), replay-code encoder/decoder (kit flag; old codes decode as kit-off), high-score submission/table (kit label). Test: extend the existing replay/save/high-score tests.

- [ ] **Step 1: Failing tests:** replay code with kit flag round-trips and reproduces a kit game deterministically; codes without the flag decode kit-off; save/load preserves `variants`; score record carries `extensionKit`; PartySelect kit-on shows the five kit starters at official costs and Ogre/Troll at 4/3 (base view unchanged at 5/4); selection validation accepts a kit pick (e.g. Witch+Wolf under budget 6) only when the kit is on.
- [ ] **Step 2-4: RED → implement → GREEN + full web suite.**
- [ ] **Step 5: Commit** `feat(web): extension-kit toggle, replay/save/score persistence`

### Task 16: Gameplay UI wiring (US-02..25 surfaces)

**Files:** Modify `apps/web/src/game/` action surfaces: new action buttons/confirms (descendChasm, pullBellRope + member picker, drawFromWell, enterCrypt, Elixir/Holy Water/Scroll/Spell offers with target pickers — reuse EncounterPanel dropdown + showConfirm patterns), DiceRoll wiring for every kit roll event (rollView.ts `rollFromEvents`), `gameLog.ts` TYPE3 map += specials 6-11, FightSurface: Quarrel dress, Demon doom-banner reason, Shield glyph on paired enemy, Axe/Shield/Elixir chips, dimmed-shield icon for ineligible holders, Gallery stone overlays + Crypt/kit-copy card art (Task 4 marker), GameOverScreen Idol reveal (visible d6 + animated line). All notice texts verbatim from the design doc Feedback lines (already enforced present by Task 2's exhaustiveness as engine tasks added them — this task covers the *interactive* surfaces beyond notices).

- [ ] **Step 1: Failing tests** — component tests per existing patterns (EncounterPanel.test / rollView.test / GameOverScreen.test): each new action renders when legal & dispatches the right action shape; every kit roll event produces a DiceRoll; Idol line renders 10×roll.
- [ ] **Step 2-4: RED → implement → GREEN + full web suite. Manual smoke:** one seeded kit game in the browser touching a special, a kit hazard, and an artifact (run `pnpm --filter web dev`); verify mobile portrait layout on the new buttons (sticky bottom row).
- [ ] **Step 5: Commit** `feat(web): extension-kit gameplay surfaces (US-02..25)`

### Task 17: Kit golden replay, conformance vector, spec narrative

**Files:** Create `packages/engine/src/kit-golden.test.ts` (scripted seeded kit game pinning the full event stream — solo-golden pattern), a kit conformance vector in `docs/specs/conformance/` (+ generator hook in `conformance-vectors.test.ts`), finish `docs/specs/engine-spec.md`: §EXT Part II narrative prose (cross-referencing SC-EXT-1..28), A.7 completeness check, Appendix C/D updates.

- [ ] **Step 1:** Script a deterministic kit game (choose a seed exercising ≥1 special, ≥2 kit hazards, ≥2 kit artifacts — search seeds programmatically); pin it as the golden + vector.
- [ ] **Step 2:** Full repo suite (`pnpm test`) green; byte-identity spot-check: base golden untouched.
- [ ] **Step 3:** Spec self-check: every SC-EXT row cites real file:line + test; Part II reads as rules prose.
- [ ] **Step 4: Commit** `test(engine): kit golden replay + conformance vector; spec §EXT narrative complete`

---

## Out of scope (later milestones)

Multiplayer wiring (design Part 4): lobby/schema/variants, masks, zombie classifications, PvP
Shield/Quarrel semantics. Do not add MP code in this plan's tasks.
