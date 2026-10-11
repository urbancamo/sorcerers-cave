# The Sibyl (optional card) — design

> Brief: `docs/requirements/2026-10-11-sibyl.md`. Rulings from MSW (conversation, 2026-10-11):
> - "Examine" = **both**: at the start of your turn, a free look at any face-down placed tile
>   **and** the top card of the large pack.
> - Ships in **solo and multiplayer together**.
> - In multiplayer the look is visible **only to the looking seat**.
> - **Separate high-score tables per combination** of mode × extension kit × Sibyl (8 tables).
> - Stats are **all zero** (fs 0, mp 0, carry 0, points 0).

> **Amended during planning (2026-10-11).** Reading the engine changed four implementation choices; the
> visible rules are unchanged. (1) She is a **party flag** (`hasSibyl`), not a `PartyMember`: about 30
> call sites test `status === 0 || status === 1`, and a flag gives "neutral, invulnerable, never the only
> member, immune to mutiny, not scored, stays behind on exit" by construction. (2) While in a chamber she
> sits in the existing parked-awake slot **`state.lulled`**, which every leave-the-chamber path already
> saves. (3) There is **no `FLAG_SIBYL`** creature flag. (4) The look is shown as a **text readout** of the
> tile's exits and special, not tile art. Section 3 below is superseded by these points.

## Rules being implemented

From the rulebook (`docs/specs/sorcerers-cave-rules.md:603`): the Sibyl is optional; she does not
guard treasure found with her; she is not affected by mutiny; she will not be the only member of a
party. From the brief: neutral and invulnerable in fights; stranger test 1-4 Indifferent, 5-6
Friendly; tested after the other strangers have been dealt with, and only once; she will not leave
the cave; she lets you examine any area card at the beginning of your turn, including the top card
of the pack.

The rules give no stats, so she has none (all zero). `mp` is only used in the loadout strength
figure (`loadout.ts:57`), not for party movement, so zero is safe.

## Interpretation of "examine"

The Hidden Cards rule says a face-down area card "may be examined only in the normal course of
exploration, even by the player who originally drew it". The Sibyl is an exception to that rule.
"Including the top card of the pack" reads as: the set she exposes is every face-down tile on the
table plus the top of the large pack. The look is free: it does not use the move, does not change
the cave, and does not end the turn. There is no per-turn limit (looking again shows the same card).

## Design

### 1. Card, pack and variant (engine)

- New creature id **21**, code **121**, in a new table (not in `CREATURES`, whose rows
  `data.test.ts` pins) appended to `ALL_CREATURES`. Fields: fs 0, mp 0, carry 0, `cost: null` (so
  she never appears in party selection), points 0, `hostileMax` 0, `indiffMax` 4, `leaderPri`
  lowest, plus a new creature flag `FLAG_SIBYL`.
- New `variants.sibyl` (boolean). `buildSmallPack` (`decks.ts`) adds `smallPackSibyl()` (one card,
  code 121) before the shuffle when set, as `extensionKit` adds `smallPackExtension()`. `newGame`
  stores the variant on the state, as it does for the kit.
- Multiplayer: `MpGameState.variants` gains `sibyl`, and `compose` copies it into the composed
  `GameState` alongside `extensionKit`. The multiplayer lobby builds its game with it.
- Art: `docs/assets/cards/small-card-s07-7.png` already exists. Fix its manifest name from "Sybil"
  to "Sibyl" and set `entityId: 21`. Add her to the name-keyed UI tables
  (`encounter-data.js`, `memberLabels.ts`).

### 2. Meeting her (reaction and test)

- She is excluded from `findLeader` while any other stranger is in the area, so she is never
  rolled for until the others are dealt with.
- When she is the only stranger left, the test rolls once with her band: 1-4 Indifferent, 5-6
  Friendly (she can never be hostile). She is then marked tested and is never tested again, even
  on revisits. Indifferent leaves her in the chamber, inert; Friendly makes her a party member
  with status 1.
- Treasure found with her is unguarded: she does not count as a stranger when deciding whether
  treasure is guarded (`test`, `settlePacifiedArea`, the `attack` un-parking path).

### 3. As a party member

- **Fights:** neutral and invulnerable. She is skipped by `startFight`, `equipStrangers`,
  combat planning (`combat.ts`, `combatPlan.ts`, `multi-fight.ts`), target selection and wound
  handling; she contributes no strength and cannot be hit.
- **Living checks:** she does not count toward `partyAlive` or similar "living member" tests, so
  her presence never keeps a wiped party alive ("will not be the only member").
- **Mutiny:** carved out first in `HAZARD_MUTINY` (Wolf precedent, `hazards.ts:186-192`), with a
  notice event.
- **Leaving the cave:** filtered out of the roster in `exitCave` (Apprentice precedent,
  `reduce.ts:695-716`), with a "stays behind" notice, and never scored.
- Also excluded from the other desertion-style hazards, as the Wolf is (`hazards.ts:24`).

### 4. The free look

- New explore-phase action `examineArea` with a target of either the large-pack top or a placed
  face-down tile. It is legal only at the start of the turn in the explore phase, while a living
  Sibyl is in the examining party. It is added to `legalActions` (`selectors.ts`).
- It emits an event but changes no cave or party state, and it does not return the phase to
  explore from anywhere else, so it cannot end a multiplayer turn (`turnEnds`). It is
  deterministic, so replays stay consistent.
- The event carries **no card content**. The UI reads the card from state
  (`decodeArea(state.largePack[state.largeIdx])` for the pack top, the placed `PlacedArea.card`
  for a face-down tile) and shows it only to the looking seat. In multiplayer other seats' logs
  say only that the seat consulted the Sibyl. Enforcement is by the UI, as the existing
  fog-of-war-lite is, because the full state is already present in every client.
- UI: an "Examine" control in `ExplorePanel` (tap-twice pattern is not needed since it is free)
  and a small viewer showing the tile art for the chosen card.

### 5. Variant selection and high scores

- `variantsValidator` (`apps/web/convex/game.ts`) and the `games.variants` schema gain `sibyl`.
  Party-select, the multiplayer lobby and `PartyDraft` get a Sibyl toggle next to the kit toggle.
- `highScores` rows gain optional `sibyl` (legacy rows read as false), stamped on save from the
  final state's `variants`, next to `extensionKit`.
- `highScores.list` takes `sibyl` as a third filter next to `mode` and `extensionKit`, with the
  same read-time fallback to `state.variants.sibyl`. Multiplayer rows are stamped with it too.
- `HighScores.tsx`: a third segmented control (Sibyl off/on) in the leaderboard panel, a "Sibyl"
  flag chip on rows, and `GameOverScreen` defaults the toggle from the game's own variants.
  The kit-by-Sibyl combinations are each their own top-100 (8 tables with the mode axis).
- Game logs and replays stamp "Sibyl active" like "Extension kit active" (`gameLog.ts`).

### 6. Test Mode

- Test Mode gets a way to put the Sibyl in the next chamber and to cue her reaction roll, using
  the existing `testNextChamber` / `testNextReaction` seams. Per the 2026-09-21 note, new
  Test Mode fields must also be added to the Convex validators or they are silently dropped.

## Out of scope

- A per-turn limit on the look, or any cost for it.
- Hiding the pack contents from the client; the look stays a UI-level secret.
- Any Sibyl behaviour not in the rulebook or the brief (for example speaking, advice, or
  influencing dice).

## Testing

- **Engine unit tests:** creature table row and flag; `buildSmallPack` includes code 121 only
  with the variant; reaction excludes her from leader selection while others remain and rolls
  once with the 1-4 / 5-6 band; never hostile; never retested; treasure unguarded with her;
  fights skip her and cannot wound her; she does not keep a wiped party alive; mutiny leaves her;
  `exitCave` leaves her behind and unscored; `examineArea` legality (phase, Sibyl present) and no
  state change.
- **Replay test:** a recorded Sibyl game replays identically, including `examineArea`.
- **Multiplayer:** `compose` carries `variants.sibyl`; a look does not end the turn; the event
  carries no card content.
- **Convex:** `highScores.list` splits correctly on every kit × Sibyl combination in both modes
  and the legacy fallback reads as false; the validator accepts `sibyl`.
- **Web:** leaderboard toggle re-queries; toggles in party select and lobby; the examine control
  shows only with a living Sibyl; manifest test covers the Sibyl entity id.
- **Spec:** `docs/specs/engine-spec.md` gains new `SC-` rows (Part I), narrative (Part II),
  data table entries (Appendix A) and coverage-gap updates (Appendix C) in the same change.
