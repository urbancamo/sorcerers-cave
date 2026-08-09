# Special Areas Revision — Analysis

> Companion to [2026-08-08-special-areas.md](2026-08-08-special-areas.md) (the designer's rules
> revision). This maps each REVISED clause against what the engine actually does today, verified
> by reading the code — not assumed. **No code changes made yet.** Written to scope the work and
> surface clarifications before implementation starts.

## Headline finding

More of this is already implemented than the revision doc assumes. Several REVISED clauses
already match the current engine byte-for-byte — the ORIGINAL rulebook text is what's out of
date, not the code. The remaining gaps cluster into a small number of genuinely open decisions,
listed in §6.

## 1. Deep Pool

| Revised clause | Status |
|---|---|
| Forced auto-drop (non-Giant crossing) and voluntary drop both sink, Giant-only recoverable | **Already true.** Two different fields (`area.dropped` for the auto-drop, `area.sunkTreasure` for a deliberate `dropTreasure`), but both gated by the identical `giantCanRecover` predicate (`reduce.ts`, `special.ts`) — functionally indistinguishable to the player. `SC-10.2-4`/`SC-10.5-10`. |
| Island exemption removed ("treasure may be left on this island" no longer implies free recovery) | **Already true.** `sunkKey` treats `"island"` as just another bucket key, identical in kind to a doorway direction — no code anywhere special-cases the island as exempt from the Giant gate. The engine already implements the REVISED behavior, not the ORIGINAL rulebook's free-island exemption. |
| Leave via a secret door discovered on the island | **Believed already fine, please confirm.** Secret doors are a whole-AREA property (one letter per tile), not tracked per sub-location, and solo play never gates movement on door "discovery" at all (only multiplayer's `knownDoors` does, also per-area not per-sub-location). Since sub-location never restricts which exit you can use at a Deep Pool (only Viper Pit/Whirlpool get the adjacency restriction), leaving the island via any exit — mirrored stair included — already works with no extra code. I can't find a way this clause is currently violated, but I also can't 100% rule out an edge case I haven't found. |

**Deep Pool needs no engine changes**, pending your confirmation on the secret-door point.

## 2. Viper Pit

| Revised clause | Status |
|---|---|
| Jump risk (fatal fall, treasure lost) matches an ordinary ledge crossing | **Already true.** `jumpToIsland` calls the exact same `viperCrossing` function an ordinary crossing uses — same 1-or-2 fatal roll, same "lost to the pit" treasure handling, can even wipe the party. |
| "Cross another segment (or jump from the island) ... requires another turn" | **Already true** for leaving the island — there's no dedicated reverse action, you just `move`, which already costs a turn and is unrestricted from the island (only doorway-sourced crossings get the adjacency block). |
| "**If** you have discovered a secret doorway on the island, you may jump across" | **Open question — see §6.1.** Today `jumpToIsland` is unconditional: no discovery check of any kind gates it. |

One thing I noticed while checking this, not asked about but worth flagging: `jumpToIsland` doesn't
currently consume a turn at all (only the ordinary `move` used to leave the island does). Given the
design intent was "at exactly the ordinary crossing's own risk," this looks like an inconsistency —
happy to fix it alongside whatever you decide on §6.1, or leave it if it's intentional.

## 3. Whirlpool

| Revised clause | Status |
|---|---|
| Cross one segment per turn, adjacency-restricted like the Viper Pit | **Already true.** Whirlpool shares the same adjacency gating as the Viper Pit; only the roll mechanic differs (one shared party roll vs. per-member), which both the original and revised text preserve deliberately ("basically like the viper pit, except..."). |
| "Any stairway leading to this area is considered blocked. A trap ... sends you down another level." | **Not implemented — and this text is unchanged from the ORIGINAL, not new.** No code blocks a vertical connection into/out of a Whirlpool tile, and a trap fall never skips past one to the level below. See §6.3 — is this actually in scope for this pass? |
| Voluntary drop ("you may not drop treasure into the Whirlpool") | **Currently allowed and ungated** — sinks freely, freely recoverable by anyone on return. See §6.1 (same question as Chasm). |

## 4. Chasm

| Revised clause | Status |
|---|---|
| "You move your token onto it, but not across" (arrival telegraph) | **Partial gap.** Deep Pool, Viper Pit, and Whirlpool all emit an `enteredSpecial` event on arrival (the ambient "you've reached the edge of..." notice); the Chasm never does — it falls straight into the ordinary chamber path with no special-area telegraph at all. Recommend adding it for consistency; flagging rather than just doing it since it's a small scope call, not a hard blocker. |
| Voluntary drop ("you may not drop treasure into the chasm") | **Currently allowed and ungated** — same as Whirlpool. See §6.1. |

## 5. Multiplayer fight restriction (your "Unresolved Issues" note)

You wrote: *"In multiplayer, you can't fight ... in the Chasm or the Deep Pool – but Whirlpool is
not mentioned."*

**Correction:** the actual implemented pair is **Viper Pit + Deep Pool**, not Chasm — `Chasm` never
appears anywhere in the PvP-legality code or the multiplayer interaction spec. This is easy to
mix up (both pit-shaped hazards), so worth double-checking whether you meant Viper Pit. It's also
narrower than it might read: this restriction only blocks **multiplayer PvP declarations**
(`declarePvp`), not solo combat against hazard-drawn strangers, which has no special-area
restriction of any kind.

This still leaves your underlying point standing — the four areas are inconsistent on this axis.
See §6.4.

## 6. Open questions — resolved 2026-08-08

### 6.1 Chasm/Whirlpool treasure drops — block, or fall through?

**Resolved: fall through, but only once the area below has been explored** (option 3) — closer to
the Lair's own spirit than a straight fall-through. This needs a genuinely new mechanism: dropped
treasure is held pending (not auto-drawing the area below), and delivered the moment the party's
own exploration places AND enters that specific coordinate.

You said you're "not at all happy with simply prohibiting" this, and proposed reusing the
Harpies/Lair holding-pen pattern (`harpyStash`): fall to the level below, held in a temporary area
if that level isn't in play yet.

I checked how that pattern actually works, and it doesn't map over as cleanly as it looks. The
Lair needs a holding pen because its card is a single, unique tile independently shuffled into the
deck — its coordinate is genuinely unknowable until someone happens to draw and walk into it
elsewhere on the map. A Chasm or Whirlpool's "level below," by contrast, is **never** in that kind
of limbo: the engine's existing `relocateDown` (already used by ordinary trap falls, `descendChasm`,
and the Whirlpool's own drag-down) always finds-or-draws the area directly below in the same
reducer call. There's no scenario where "the area below" doesn't exist yet the way the Lair's tile
can genuinely not exist yet.

So the real choice is between three options, not two:

1. **Block outright**, as literally written in the revision doc.
2. **Fall through immediately**, drawing a fresh area below on the spot if none exists there yet
   (the engine already does this for every other kind of descent).
3. **Fall through, but only once the party's own exploration reaches that area** — closer to the
   *spirit* of your Lair proposal, at the cost of a genuinely new "pending drop" mechanism (since,
   unlike the Lair, there's no natural reason for the level below a Chasm to stay undrawn — you'd
   be deliberately withholding a draw that the engine would otherwise make immediately).

Option 2 gets you the "not arbitrary, it falls somewhere real" outcome you're after without
inventing new state, since the machinery already exists. Option 3 preserves "the map is only
revealed by walking there," at the cost of real new complexity for a case that may not need it.
I'd lean towards 2, but this is a genuine design call.

### 6.2 Viper Pit: should `jumpToIsland` require prior discovery?

**Resolved: keep it unconditional.** No behavior change — the revised text describes one
motivating use of the existing action, not a restriction on it.

### 6.3 Whirlpool's stairway-block / extra-level trap rule — in scope now?

**Resolved: build it now, in this pass**, even though the text itself predates this revision.

### 6.4 Should the no-PvP-fight restriction extend to all four areas?

**Resolved: extend to all four.** Whirlpool and Chasm join Viper Pit and Deep Pool in the
no-PvP-fighting set.

### 6.5 Additional item noticed during analysis, not yet decided

`jumpToIsland` doesn't currently consume a turn (only the `move` used to leave the island does),
despite the design intent being "at exactly the ordinary crossing's own risk." Since §6.2 keeps the
action's gating unchanged, I'll fix this turn-cost inconsistency alongside the other Viper Pit work
unless told otherwise — it's a one-line change with no behavioral downside.

## 7. Resulting scope of work

With §6 resolved, the concrete engine changes are:

1. **New pending-drop mechanism for Chasm/Whirlpool** (§6.1): `dropTreasure` at either special
   parks the item in a new durable, per-area pending queue (mirroring `harpyStash`'s shape) rather
   than sinking into `area.sunkTreasure` as it does today; delivered onto the level-below area's
   `contents` the moment that specific coordinate is placed AND entered by ordinary exploration.
   This is the largest single piece of new work — needs its own state field, a delivery hook
   analogous to `stashOrDeliver`, and a decision on what happens if the party never goes there at
   all before the game ends (almost certainly nothing — same as an unclaimed Harpies stash).
2. **Whirlpool stairway block + trap-skip** (§6.3): vertical connections into/out of a Whirlpool
   tile are blocked; a trap fall that would land on one instead continues down to the next level.
3. **Extend the no-PvP-fight mask to all four specials** (§6.4): `areaInteractionMask` in
   `multi.ts` gains `SPECIAL_WHIRLPOOL`/`SPECIAL_CHASM` alongside the existing
   `SPECIAL_VIPER_PIT`/`SPECIAL_DEEP_POOL` check.
4. **Chasm's missing `enteredSpecial` arrival telegraph** (§4) — small, low-risk addition for
   consistency with the other three specials.
5. **`jumpToIsland` turn-cost fix** (§6.5) — make it consume a turn like an ordinary crossing.

Deep Pool needs no changes. Viper Pit needs only the turn-cost fix (item 5).
