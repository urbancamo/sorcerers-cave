# Sharing the Treasure Chest load: implementation plan

Companion to `requirements.md`. Rulings from MSW (2026-11-21), which this plan follows:

1. **Minimum share is 25 kg**, the lightest weighted treasure (Silver, Gold, Gems and Crypt/Gems are 25 kg;
   artefacts weigh 0; the Idol is 50 kg; the Chest is 100 kg). A 100 kg chest therefore splits in
   **quarters**: 25/75, 50/50, 25/25/50, or 25 x 4.
2. **If a bearer dies, the chest is dropped** (the whole chest, not just that share) and has to be picked up
   again.
3. **After a fight, "retake dropped treasure" includes a shared chest**, "apportioned as before".

Rule text (`docs/rules/Expanded Consolidated Rules PV2026 V3.md`): line 789 ("Two or more creatures may join
in carrying it"), line 268 (no creature may be given more heavy treasure than it can or will carry), line 373
(creatures fighting hand-to-hand drop heavy treasure on the area card until the issue is decided), lines
466-473 (Deep Pool: only Giants carry heavy treasure through; a delay per extra load; what cannot go is left
in the doorway), line 558 (some hazards force all heavy treasure to be dropped, to be picked up at the end of
the turn).

## 1. How it works today (what changes)

- Each `PartyMember` has `treasure: number[]` (treasure ids). The Chest is id 14, 100 kg, `kind: "heavy"`.
- `canCarry(member, tid)` (`pickup.ts:21`) tests one member's `carriedWeight + weight <= carry`. Only a Giant
  (150) or an Ogre (100) can ever take a chest, and then only with an empty hand.
- Heavy treasure is set down by walking each member's `treasure` list in **five** separate places: classic and
  revised fights (`combatPlan.ts:437`, `revisedRound.ts:643`), the Ghoul attack (`hazards.ts:195`), multiplayer
  fights (`multi-fight.ts:222`), and a fallen member's spill (`loot.ts` `sweepFallen`/`spillCarried`). The
  fight drops are remembered in `state.fightDrops: { mi, tid }[]` and restored by `retakeDropped`
  (`reduce.ts:1485`).
- The Deep Pool (`special.ts` `deepPoolCrossing`) works out heavy loads from the same per-member lists.
- `openChest` is offered when any living member has `treasure.includes(14)` (`selectors.ts:321`).
- Party-array indices shift when a member is removed (`effects.ts` `reindexAfterRemoval`), a known source of
  bugs (invariant soak B-03).

## 2. Design

### 2.1 State: the share lives on the member

Add to `PartyMember` (optional, absent unless used):

```ts
chestShares?: { chest: number; kg: number }[];   // this member's share(s) of shared Treasure Chests
```

`chest` is a group id. The chest itself is **not** in anyone's `treasure` list while shared; it exists only as
the shares. A chest carried by one member stays a plain `14` in `treasure`, exactly as today.

Why on the member and not in a `state.sharedChests` registry: a registry would hold party **indices**, and
every array removal would have to re-point it. A share on the member moves with the member for free.

- **Group ids:** a small counter `state.chestSeq?: number`, allocated when a chest is first shared, so two
  chests can be shared at once. (Verify how many Chest cards the deck holds; one is the minimum.)
- **Invariants** (asserted in a state-check helper and in the soak): a group's shares sum to 100; every share
  is a multiple of 25 and at least 25; a group has at least two bearers; every bearer is alive (status 0 or 1).
- **Load:** `carriedWeight(member)` adds the member's share kg, so the party panel's remaining capacity and
  `canCarry` stay correct with no new plumbing. `canCarry` for a share tests `load + kg <= carry`.
- **No hash change** for any existing game: the field is absent unless a chest is shared, and no recorded
  action sequence contains the new actions. No variant flag is needed. (Confirm by running the solo, kit and
  multi goldens and the pinned search tests unchanged.)

### 2.2 Actions

One new action covers every way a chest gets shared, re-split or put back in one pair of hands:

```ts
{ type: "setChestShares"; source: { floor: number } | { member: number } | { chest: number };
  shares: { mi: number; kg: number }[] }
```

- `source` is the chest on the pickup floor (`state.treasures` index), a chest carried whole by one member, or
  an existing shared group.
- Validation (`planRejected`-style reasons): at least one share; every `kg` a multiple of 25 and >= 25;
  total 100; each `mi` a distinct living member (status 0 or 1); each fits (`load + kg <= carry`, counting
  that member's existing load without this chest); not allowed mid-fight or after the game.
- One bearer holding 100 converts back to a plain `14` in `treasure` (so "give it all to the Giant" and the
  old `takeTreasure`/`moveTreasure` path stay equivalent).
- `dropTreasure` on a shared chest drops the **whole** chest; `moveTreasure` is rejected for a share (it is
  re-split with `setChestShares`).
- `openChest` consumes the whole group from every bearer. The selector offers it if any living member holds
  the chest whole **or** a share.
- Events: `chestShared { bearers }`, `chestDropped` (so the log and notices can say why the chest is on the
  floor). Added to `describeEvent`, `eventCode` and the exhaustive notice switch, with the overlay-vs-notice
  lesson from the Unicorn work applied: wherever the outcome appears under a dice overlay the wording goes in
  the overlay as well.

### 2.3 One place that drops a shared chest

`dropSharedChest(state, chest, dest)` clears every bearer's share of that group and puts a single `14` on the
floor (`state.treasures` in a pickup, `area.contents` as `200 + 14` during a fight, the same two destinations
the existing code uses). **Every** path that sets heavy treasure down calls it:

| Trigger | Where | Behaviour |
|---|---|---|
| Fight begins, any bearer must set heavy treasure down (rule line 373) | `combatPlan.ts`, `revisedRound.ts`, `multi-fight.ts` | whole chest to the floor, recorded for retake (2.4) |
| Ghoul attack / hazards that force heavy drops (line 558) | `hazards.ts` | whole chest to the floor |
| A bearer dies, turns to stone, deserts (Mutiny), leaves (Unicorn, Apprentice), or is removed | `sweepFallen`, mutiny/removal in `effects.ts` | whole chest to the floor (ruling 2) |
| Player drops it | `dropTreasure` | whole chest |
| Deep Pool (below) | `special.ts` | see below |

To keep this from becoming five copies: put the "heavy items of member `m`" logic in one helper
(`heavyHeldBy(m)` returning plain heavy ids **and** share records) and have all five paths use it, then
unit-test that helper. Today each path filters `m.treasure` itself; that duplication is the main risk here.

Which bearers fight: the existing fight-drop code decides who drops; the plan does not change that. If **any**
bearer has to drop, the whole chest goes, because the remaining bearers' shares cannot carry it between them.
(To confirm with Peter, see section 6.)

### 2.4 Retake after a fight (ruling 3)

`fightDrops` entries gain an optional share: `{ mi, tid, kg? }`. A dropped shared chest records **one entry per
bearer** with their `kg`, all with `tid: 14`. `retakeDropped` handles the group as a unit:

- Restore only if the chest is still on the floor **and every bearer is still alive and can carry their
  share again**; then re-apply each bearer's `chestShares` with the original kg and remove the chest from the
  floor. "Apportioned as before."
- If any bearer fell or cannot carry their share, the whole chest stays on the floor (and in the pickup list)
  to be taken again by hand, consistent with ruling 2. The remaining entries for that group are discarded, not
  left half-applied.
- `selectors.ts:292` (`canRetake`) learns the same group test so the button is only offered when the retake
  would work.
- `reindexAfterRemoval` (`effects.ts:300`) already re-points `fightDrops` entries when a member is removed;
  it keeps working because the entries are per member.
- The multiplayer pre-drop memory (`multi-fight.ts`, `{seat, id, tid}`) gets the same optional `kg`.

### 2.5 Deep Pool

The Pool allows only Giants to carry heavy treasure through (line 466). For a shared chest: if **every**
bearer is a Giant, the chest counts as 100 kg of Giant-carried heavy treasure (once, not once per bearer) in
the `ceil(kg / (150 x Giants))` delay. If any bearer is not a Giant, the whole chest is left in the doorway
(line 473). The Pool's existing "left behind" code is reused via `dropSharedChest`. The crossing's reported
events and its `deepPoolCrossing` tests are extended, not replaced.

### 2.6 Other readers of `treasure` to audit

Search every read of `m.treasure` / `includes(14)` for a place a share would be invisible and say what it
should do: the Thief's steal (a shared chest is not stolen: decision below), scoring at game over (the
unopened chest scores nothing, as now), the Whirlpool, Chasm and Well crossings, `thiefPickup`, the
multiplayer union/seat code, and the Convex action validator in `apps/web/convex/game.ts` (the new action
must be accepted there).

## 3. UI

Your suggestion works, and I would keep it. Two additions make the picker the thing the player actually uses,
rather than something to find.

1. **Taking the chest (pickup):** in `FloorTreasureActions.tsx`, where "Who takes it?" is today, the chest
   gets a **"Share it..."** choice beside the single-member choices. It opens a small **chest picker**:
   the chest drawn as **four quarter-slots** (25 kg each), one row per living member showing their name,
   remaining capacity and a stepper `- 0 +` in 25 kg steps. Members who cannot take another 25 kg are
   greyed. A running line reads "100 of 100 kg assigned" and the Confirm button enables only when it is
   exactly 100 and has at least one bearer. One bearer with 100 simply does what the old flow did.
2. **Party panel (`PartyPanel.tsx`):** each bearer gets a small Treasure Chest card with a **SHARED** splash
   across it (your suggestion), a "50 kg" badge in the corner so the weight is visible without opening the
   card, and the existing load bar already shows remaining capacity because `carriedWeight` includes the
   share. Selecting the card offers **Adjust shares...** (reopens the picker with the current split),
   **Open chest**, and **Drop whole chest** (with a confirm that says it drops the chest for everyone).
3. **Creature card view:** a line "Bearing 50 kg of the Treasure Chest, shared with Ogre (25), Giant (25)".
4. **Fight and retake:** the existing "retake dropped treasure" button now lists the chest. No new screen.
   If a bearer fell, the chest simply appears among the floor treasure with the usual "who takes it?".
5. **Narration:** a notice when a chest drops because a bearer fell ("The Treasure Chest falls: the Ogre, who
   bore a share of it, is dead"). Dice-overlay wording where the drop happens under one.
6. **Help and layout:** a `HelpButton` on the picker, the manual topics below, and a phone-width check of the
   picker (the steppers need 44 px touch targets).

A better alternative to consider: instead of steppers, let the player **tap a quarter-slot to cycle which
member holds it**. It is quicker for 2-3 bearers, but steppers are clearer with many members and for the
capacity cap. Recommendation: steppers, with the four-slot graphic as a read-only summary.

## 4. Documentation (as required by `CLAUDE.md`)

- **Engine spec** (`docs/specs/engine-spec.md`): amend the Treasure Chest and heavy-treasure rows; new
  `SC-` rows for the shares model and its invariants, `setChestShares`, whole-chest drops, retake, and the
  Deep Pool rule; Part II prose; Appendix A (the new `PartyMember` and `GameState` fields); Appendix C
  (test coverage and gaps).
- **Player's manual** (`apps/web/src/manual/`): the `treasure` topic (the Chest can be shared, in 25 kg
  quarters), `play` (how to split it, what happens in a fight and when a bearer falls), `areas` (Deep Pool:
  a chest is carried only if all bearers are Giants), each with `brief` and `screens` tags for the new picker.
- **`apps/web/OPTIONS.md`**: no new option, no change.

## 5. Tests

- **Engine, new `shared-chest.test.ts`:** validation (not a multiple of 25, sums to 99/125, one share below
  25, dead bearer, over capacity, duplicate bearer, mid-fight); load accounting (`carriedWeight`, `canCarry`);
  conversion to and from a single bearer; `openChest` with shares; `dropTreasure` drops the whole chest;
  deaths, stone, desertion and removal each drop it; reindexing after a removal leaves the other group intact.
- **Fights:** a bearer in a classic and a revised fight drops the whole chest; `retakeDropped` re-applies the
  same kg; a bearer killed in the fight leaves the chest on the floor and `retakeDropped` leaves it alone;
  the Ghoul drop; the multiplayer drop and retake.
- **Deep Pool:** all-Giant bearers cross with the right delay; a non-Giant bearer leaves the chest in the
  doorway; two chests.
- **Invariants:** extend the invariant soak so that games with shared chests assert the share invariants
  after every action.
- **Unchanged games:** `solo-golden`, `kit-golden`, `multi-kit-golden`, the conformance vectors and the pinned
  search tests all pass **without** `-u`. If any needs updating, the change is not as additive as designed.
- **Web:** the chest picker (stepper limits, running total, capacity greying, Confirm enablement), the party
  panel's SHARED card and badge, the retake button, and the manual drift test.

## 6. Questions for Peter (defaults used until answered)

1. **If one bearer must drop heavy treasure to fight, does the whole chest go?** Default: yes, because the
   remaining shares cannot carry it. The alternative (only that bearer's share goes, and the rest of the
   party carries on at under a full chest) has no sensible meaning.
2. **Deep Pool with a non-Giant bearer.** Default: the whole chest stays in the doorway.
3. **The Thief and a shared chest.** Default: not stealable while shared.
4. **Is 25 kg the right minimum?** Taken as a ruling here; the 25 kg quarters also make the arithmetic exact.

## 7. Build order

| Step | Content | Done when |
|---|---|---|
| 1 | `chestShares`, `carriedWeight`, `canCarry`, `setChestShares`, `openChest`, `dropTreasure`, invariants, engine tests, spec rows | engine suite green; goldens unchanged |
| 2 | `heavyHeldBy` helper; `dropSharedChest` wired into the five drop paths; `fightDrops` kg and group retake; reindex check | fight, Ghoul, death, retake tests green |
| 3 | Deep Pool; audit of the other `treasure` readers (2.6); Convex action validator; multiplayer | pool and MP tests green; soak clean |
| 4 | Web: chest picker, party panel card and badge, creature card line, retake button, notices and overlays | web suite green; checked in a browser at desktop and phone width |
| 5 | Manual topics, engine spec Part II and appendices, PR | spec and manual updated in the same change |

The engine change runs inside Convex functions, so it ships with the next `vercel --prod` (which runs
`convex deploy`); games already in progress keep working because the new state is absent until a chest is
shared.

## Implementation notes (as built)

- **Deep Pool** follows the engine's R-30 rule, not the earlier draft of section 2.5: a living Giant carries all heavy treasure
  (a shared chest counts once, 100 kg); with no Giant the whole chest sinks into `pool.dropped`.
- A second action, `dropChest {chest}`, puts a whole shared chest down (the party panel's "Drop the whole chest").
- Group ids are derived (`nextChestId`: one past any id in party shares or `fightDrops`) rather than held in a counter, so
  multiplayer composed views keep working.
- Multiplayer: `PvpDrop` carries optional `kg`/`chest`; `declarePvp` drops the chest whole and `acceptStop` retakes it as a unit.
- The Convex hand-written action validators (solo and multiplayer) gained `source`, `shares` and `chest`.
