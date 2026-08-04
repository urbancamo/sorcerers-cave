# Indifference Testing — Rules Definition

> Companion to [2026-08-04-indifference-testing.md](2026-08-04-indifference-testing.md) (the bug
> report). This document defines the intended behaviour precisely enough to implement and test,
> per that document's own instruction: *"I think it will be worth defining the rules for
> indifference testing in a separate document so that all scenarios are captured. This is the
> first requirement, before implementing these changes."*
>
> **No code changes are proposed here.** This is for designer sign-off; implementation follows in
> a separate plan once this is agreed.

## 1. Source rules

Base rulebook, [`docs/specs/sorcerers-cave-rules.md:350`](../../specs/sorcerers-cave-rules.md#L350)
(§Encountering Strangers):

> If the strangers are indifferent (*), in its next turn the party may test them again, or attack
> them, or leave the chamber by any doorway without picking up any treasure found there. If the
> party chooses to remain in the chamber, or finds itself delayed by a dead end, or if at any time
> it re-enters the chamber, it must in the same turn either test the strangers again or attack
> them. Meanwhile other parties entering the chamber have the usual options.

Solitaire Play, [`docs/specs/sorcerers-cave-rules.md:589`](../../specs/sorcerers-cave-rules.md#L589):

> Strangers which remain indifferent after three rolls of the die stay indifferent for the rest of
> the game.

Peter's clarification (quoted in full in the bug report) confirms: the "leave freely" grant is a
**one-shot privilege for the very next turn only**, is **forfeited** by a dead end or by choosing
to do anything else, and strangers "remember forever how many times your party has approached
them" — i.e. the indifference count is durable per area, not just per visit, up to the
permanent-indifference cap of 3.

The "No Way Out" redraw rule (rulebook line 321) is explicitly **out of scope** for this pass, per
the bug report's own note.

## 2. Terms

| Term | Meaning in this doc | Existing engine name |
|---|---|---|
| Indifference count | How many times this party has tested this area's strangers and gotten "indifferent" | `PlacedArea`/party's `indiffStreak` (per visit) — see gap below |
| Permanently indifferent | Indifference count has reached 3: guards + treasure park, the party may pass freely forever, for THIS party | `pacifiedAreas` (already implemented) |
| Leave window | The one-turn privilege to walk out by any doorway, forfeiting treasure, without testing/attacking first | Currently implemented as "any time indiffStreak≥1" — **too permissive**, see §4 |
| Re-encounter | Returning to a chamber whose strangers are not yet permanently indifferent and not currently hostile-on-sight | Handled correctly for ordinary `move`, **not handled** for `withdraw` — see §4 |

**Correction (caught after the sign-off round, flagged separately below):** an earlier draft of
this document claimed the per-visit reset of `indiffStreak` "already matches" Peter's "remember
forever... even if you went away in between." On closer reading of `chamber.ts`'s `enterChamber`,
that's not right — see §4a.

## 3. Four gaps (three reported, one found while tracing the code)

### Gap A — `withdraw` into an abandoned, not-yet-permanent encounter

Today, `withdraw` unconditionally sets `phase = "explore"` on arrival at its destination (`prev`),
regardless of what is sitting there. It only special-cases a parked Demon
(`pullParkedDemon`/`ambushIfDemon`, extension kit). Everywhere else in the engine, arriving at an
area re-runs a shared resolution: permanently-indifferent → settle/attack-only; hostile-on-sight
(`hostileAreas`) → immediate fight; strangers present → **encounter**; treasure only → pickup;
otherwise → explore (`finishChamber`'s tail, `reduce.ts` ~lines 307–330). `withdraw` is the one
landing path that skips this — a comment already flags the general version of this as a known gap
("every landing path here funnels through `resolveArea` except `withdraw`", `reduce.ts:356`, which
is why a Spell-remapped tile currently fails to reveal itself if you withdraw back into it).

This gap was invisible before the SC-4-18a fix, because before it, `prev` (withdraw's destination)
could never legitimately hold an abandoned, not-yet-permanent stranger group — the only way to
leave one behind used to be via `withdraw` itself (from a *fresh*, untested encounter, whose `prev`
is always an already-resolved ordinary tile) or via full pacification (which doesn't move the party
away from the area at all). SC-4-18a introduced a new way to abandon an *unresolved* encounter by
walking to a different doorway, so `prev` can now genuinely be that abandoned chamber the next time
the party withdraws.

**Fix direction:** route `withdraw`'s destination through the same resolution `finishChamber`
already uses for every other landing path, instead of the hand-rolled Demon-only check + hardcoded
`explore`. This closes gap A and, as a side effect, the same pre-existing `hostileAreas`-on-withdraw
gap and the Spell-remap-reveal-on-withdraw gap noted above — see §7's open question.

### Gap B — permanently indifferent re-entry (already correct)

Once the indifference count reaches 3, `pacifiedAreas` records it, guards + treasure park onto the
tile, and every future visit (this party only) is ordinary `explore`: all doorways are open, no
`test` is ever offered again, and `attack` is offered to fight the guards for their treasure
(`settlePacifiedArea`, SC-8.5-7). **This already matches the requested behaviour** ("indicate
they're permanently indifferent, offer attack, no retest, offer move") and needs no code change —
included here so the designer can confirm it's understood and won't be disturbed by the Gap A/C fix.

The one addition worth calling out: the UI does not currently narrate *why* no test is offered on
a permanently-indifferent re-entry (i.e. there's no "these strangers are known to be permanently
indifferent" notice). Whether to add that notice is a presentation question, not a rules question —
flagged in §7, not decided here.

### Gap C — a dead end while trying to leave should close the leave window

The current implementation offers `move` (the free-leave option) continuously for as long as
`indiffStreak >= 1`, with no memory of *when* that test happened. So today, after a leave attempt
dead-ends and the party is dropped back into the same live encounter, `move` is still offered
immediately again — the party can keep trying doorways without ever re-testing, which contradicts
"finds itself delayed by a dead end... it must in the same turn either test the strangers again or
attack them."

**Fix direction:** the leave window is a one-shot grant, not a standing condition of
`indiffStreak >= 1`. It should behave like the engine's existing `surpriseReady` flag (SC-4-16): set
the instant the qualifying event happens (there: a fresh chamber entry; here: a `test` resolving to
indifferent with the count still under 3), and explicitly cleared by the actions that consume or
forfeit it (there: `test` clears it, `attack`/fight-start bakes it in; here: a *successful* `move`
consumes it by definition — the party has left — and a dead-end `move` should clear it, reopening
the same live encounter with `test`/`attack`/`withdraw` only, no `move`, until a fresh test
re-earns it).

### Gap D — the indifference count does not actually persist across visits (found while tracing the code, NOT one of the three reported)

Peter's clarification is explicit: strangers "remember forever how many times your party has
approached them - even if you went away in between." An earlier draft of this document
misread the code and claimed this already worked. It does not: `chamber.ts`'s `enterChamber` runs

```
state.indiffStreak = 0; // a fresh visit re-tests from scratch (only permanent indifference persists)
```

unconditionally, on *every* entry — fresh or revisit alike, not gated on `area.visited`. So today,
leaving a chamber after one or two indifferent results (Gap C's leave window, or a plain successful
retreat) and later coming back gives the party a **brand new count starting at 0**, not a
continuation of 1 or 2. The only way to reach permanent indifference today is three indifferent
results **without ever actually leaving the tile** (dead-ends and re-tests while stuck don't count
as leaving) — Peter's own worked example (§4 below) happens to be exactly this case, which is
presumably why it wasn't caught sooner. Approaching, leaving successfully, and coming back always
restarts at 0 today, contradicting the rule as written.

This already matches the currently-shipped design decision recorded at SC-8.4-5 in
`docs/specs/engine-spec.md` ("the streak counts consecutive indifferents in the current visit
only") — so it is a *deliberate*, spec'd simplification, not an accident introduced by SC-4-18a.
It predates this bug report entirely.

Note for context, not a proposal: `PlacedArea` already carries an `indiffCount` field
(`state.ts:67`, `// AI permanent-indifference counter (Milestone C)`) that is set to `0` at every
area-creation site and never read or incremented anywhere. Tracing it back to
`docs/requirements/2026-06-12-milestone-c2-encounters-fights-plan.md`, it was the *original*
Milestone C design for exactly this durable counter — living on the shared `PlacedArea`, not per
party. That design was superseded before shipping by the current per-party `indiffStreak` +
`pacifiedAreas` model (correctly so: a counter shared on the area would leak one party's
indifference history onto another party's fresh encounter, contradicting "other parties entering
the chamber have the usual options"), and the field was left behind, unused. Wiring it back up
would reintroduce that exact leak — a genuine cross-visit counter would need to live per-party
(e.g. keyed by area index on the `GameState`/party view), not revive `indiffCount`.

**This is a separate, pre-existing gap from the three reported ones, and is not yet in scope** —
raised here so it isn't silently mis-recorded as "already fine" the way the first draft of this
document had it. See §8 for the sign-off question on whether to fix it now or track it separately.

## 4. Full decision table

Per party, per area. "Count" = this party's indifference-test count for this specific area, **as
currently implemented** — i.e. per-*visit* (Gap D), not the durable, cross-visit count the rulebook
actually describes. Below, "persists across visits" describes the *intended* rule; read it as
"persists across dead-ends/re-tests within one continuous stay" until Gap D is resolved.

| State | Withdraw | Attack | Test | Move (leave, forfeit treasure) |
|---|---|---|---|---|
| Fresh entry, count 0 | ✅ (if the way back is open) | ✅ | ✅ | ❌ |
| Just tested → hostile | — (fight starts; menu moot) | | | |
| Just tested → friendly | — (strangers join/guard; menu moot) | | | |
| Just tested → indifferent, count → 1 or 2 | ✅ | ✅ | ✅ | ✅ (one-shot, see below) |
| Took the leave option → succeeded | — (party has left) | | | |
| Took the leave option → dead end | ✅ | ✅ | ✅ | ❌ (window closed — must test/attack again) |
| Took the leave option → not attempted this turn (tested/attacked/withdrew instead) | *(re-evaluate from that action's own outcome — the leave grant from the previous test is spent either way)* | | | |
| Just tested → indifferent, count → 3 (permanent) | n/a — party is now in `explore`, not `encounter` | ✅ (fight the guards) | ❌ (never offered again, this party) | ✅ (any doorway, always) |
| Re-enters an area at count 1 or 2 (via ordinary move OR withdraw) | ✅ | ✅ | ✅ | ❌ (fresh re-encounter — must test/attack again, exactly like a first entry) |
| Re-enters a `hostileAreas` area (retreated from mid-fight) | n/a — fight starts immediately, surprise −1 | | | |
| Re-enters a permanently-indifferent area | n/a — ordinary `explore` | ✅ | ❌ | ✅ (always) |

Worked example (Peter's, from the bug report), all now correctly forcing a fresh test each time:

1. Enter chamber, N/E/S/W doorways, Earthquake collapses the entry (N). Test → indifferent (count 1).
2. Try to leave E → dead end. Window closes; must test/attack. Test → indifferent (count 2).
3. Try to leave W → dead end. Window closes; must test/attack. Test → indifferent (count 3 →
   **permanent**). Guards + treasure park; party is now in `explore`.
4. Leave by S — an ordinary `explore`-phase move (the "No Way Out" redraw rule is out of scope, so
   a dead end here is just an ordinary dead end, handled by existing exploration rules).

## 5. Multiplayer

Indifference state (`indiffStreak`, `pacifiedAreas`, `hostileAreas`) already lives on the
per-party/per-seat composed view (`partyView`), the same as every other solo mechanic multiplayer
reuses (SC-8.4-6: pacification is per-party; "other parties entering the chamber have the usual
options" per the rulebook). No new multiplayer-specific design is anticipated — this should
generalize for free once the solo fix lands — but it needs its own test coverage to confirm,
since `withdraw` in particular has its own multiplayer wiring worth double-checking.

## 6. Explicitly out of scope for this pass

- The "No Way Out" redraw rule (rulebook line 321), per the bug report's own instruction.
- Any change to `pacifiedAreas`/permanent-indifference behaviour (Gap B) — it's already correct.
- UI/notice wording for "these strangers are permanently indifferent" — a presentation follow-up,
  not a rules question.

## 7. Open questions — resolved 2026-08-04

1. **Does using an artifact mid-encounter close the leave window?** Resolved: no — recommendation
   accepted. The leave window is unaffected by an artifact use, closed only by a dead-end `move` or
   a fresh `test`, exactly like `surpriseReady`'s existing precedent.
2. **Is `withdraw` itself still offered during the "must test or attack" follow-up states?**
   Resolved: **yes, `withdraw` stays available** in every encounter state (subject to its own
   existing gates: not after a trap fall, not if `prev` collapsed), including the "must retest"
   follow-up states. The rulebook's omission of `withdraw` from that sentence is incomplete
   enumeration, not a deliberate exclusion.
3. **Should the `withdraw` destination-resolution fix also pick up the `hostileAreas` and
   Spell-remap-reveal gaps?** Resolved: yes — recommendation accepted. All three are fixed together
   as one change to `withdraw`'s landing resolution.

## 8. New question raised after sign-off — Gap D

Gap D (§3) was found while tracing the code for the already-signed-off fix, not among the three
originally reported bugs. It needs its own decision:

4. **Should Gap D (the indifference count resetting every visit instead of persisting "even if you
   went away in between") be fixed in this same pass, or tracked separately?**
   - **Fix now**, alongside Gaps A/C: most faithful to the rulebook and Peter's clarification, but
     is architecturally bigger than the other three — it needs a genuinely new, durable, per-party,
     per-area counter (Gaps A/B/C only touch existing per-visit state), and it changes when
     permanent indifference is reachable at all (today: only by getting stuck at one tile; fixed:
     also by repeated separate approaches), which is a bigger behavioural shift than "when is `move`
     legal this visit."
   - **Track separately** (recommended): land Gaps A/B/C now — they're what was actually reported
     and are self-contained — and file Gap D as its own follow-up bug report with its own design
     pass, since it deserves the same "define the rules first" treatment this whole document exists
     to give the other three, not a rushed addition to an already-agreed scope.

**Resolved 2026-08-04: fix now, rolled into this same pass**, alongside Gaps A/B/C.
