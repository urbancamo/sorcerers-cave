# Final report — for MSW (design owner)

The multiplayer extension-kit milestone is complete: nine tasks plus one interstitial fix and one
final-review fix, engine **803** / web **461** green, one deploy's worth of change behind a single
lobby switch. Five things need your eye before this is closed out. The first two are genuine design
questions; the third is a scope call I made on your behalf; the fourth is a release note; the fifth
is a pinned-but-unruled edge in the same family as the second.

### 1. Zombies × kit hazards — a proposal, not yet a ruling (Task 4, SC-EXT-33)

When a party has been wiped and risen as zombies, and the extension kit is also on, the kit's four
hazards had no defined behaviour. I implemented the **design-Part-4 proposal**:

- **Ignored** (run, then repaired away — exactly how Medusa, the vipers and the Ghouls already treat
  the dead): **Desertion** and **Quarrel**. The reasoning: these are the party turning on itself, and
  the dead have no politics left. Quarrel needed a real code change (a 2+-member zombie party
  genuinely could lose a duellist); Desertion needed only event suppression.
- **Applies normally**, no gate, no repair: a **Crypt trap fall** and **Harpies'** artifact theft —
  ordinary hazards to the dead as much as to the living. Neither needed any code; the tests exist to
  pin, not to create, that behaviour.

This is flagged as pending in three places (the `multi-zombies.ts` module doc, the SC-EXT-33 spec
row, and Task 4's report). If you rule differently the fix is local: move `HAZARD_HARPIES` into (or
out of) the same immunity pair and flip its test's expectation. The one I would most expect you to
push back on is Harpies — "*the dead cannot carry or use treasure*" can be read to cover artifacts
too, which would make the theft moot rather than applicable.

### 2. Loan-death semantics — the plan's guess was wrong, and there is a related edge (Task 5)

The milestone plan assumed "death ends the loan naturally". **It does not.** The loan model's own
documented contract (`multi-union.ts`'s module doc) is:

> casualties among loaned members are the OWNING seat's loss — they return dead (status 3) on
> leave/dissolve, and an owner whose whole roster came back dead is wiped.

So a loaned creature killed while united stays in the commander's array as a corpse with its loan
tag intact, and goes home only when the union breaks. This is not a Quarrel special case — every
death path behaves the same. The distinction that matters is **death vs. removal-from-the-game**:
death keeps the tag (the loan persists), while Desertion or a Bell-Rope vanish deletes the member
and ends the loan cleanly. Both halves are now pinned by tests, and the new MP-kit golden replays
the whole arc end to end (a loaned Man killed by a union Quarrel at step 12, his corpse returning
to seat 1 at the dissolve at step 40). **No decision needed here** — this is a correction to the
plan's record, not an open question.

**What IS open is a pre-existing edge Task 5 surfaced while pinning it.** If an owner gets back
*nothing living at all* — because its sole loaned member left the game rather than died (deserted,
or vanished on the Bell Rope's 1) — `returnLoans` early-outs *before* the wipe check, so that seat is
left as a **zero-member seat still marked "exploring"**. Its loan bookkeeping is correct; the seat
is simply empty and alive. It keeps drawing turns, and because the game only finishes when nobody is
exploring, it can keep a game from ever finishing on its own.

- Not introduced by this milestone — the identical state is reachable today via Mutiny.
- Deliberately not fixed, because the fix *is* the ruling: **should an owner who gets nothing living
  back be wiped, like the owner whose members come back dead — or should an empty seat be allowed to
  play on?** Either answer is a one-line change in `returnLoans`; I did not want to change existing
  M5 union semantics on my own authority.

### 3. A scope conflict I resolved in the design doc's favour (Task 2, SC-EXT-31)

The plan's own brief for Task 2 scoped the Apprentice's loyalty-break to the **union** stamp: a
Sorcerer killed by a union command would break every Apprentice ally. Design doc **US-14** is
unqualified — the Sorcerer's death breaks Apprentice loyalty, full stop. Per the plan's own conflict
rule (*the design doc governs*), the revert was broadened: **any** MP seat's Sorcerer kill — a
union's or an ordinary solo party's — reverts every Apprentice ally everywhere in the cave, ending a
loan and re-indexing the affected unions in the same stroke. There is one Sorcerer, so his death is
a cave-wide consequence; this is the same precedent the zombies variant's annihilation sweep already
set (SC-MP-37). Flagging it because it is broader than the plan text you signed off, and because it
is the kind of thing that is cheap to narrow now and expensive to narrow later.

The final review refined *where* she lands, without changing who reverts: a seat that is mid-chamber
(the killer, or a bystander in an encounter/fight/medusa/pickup) still gets her as a hostile stranger
in the working set it is resolving, but a bystander standing **at rest** now has her — and the items
she was carrying — laid on the shared tile she stands on, because a resting seat's working set is
wiped by its next chamber entry and both she and her loot were being deleted from the game.

### 4. Deploy sequencing — a single deploy is safe

Everything in this milestone below the lobby toggle is inert until the toggle exists: the engine
threading, the Convex `variantsV` plumbing, the MP draft and PvP surfaces. The toggle (Task 8) was
deliberately built **last, by exposure design rather than dependency order**, so at no point does a
half-built kit path become reachable in production. Ship the branch as one deploy; there is no
staged rollout to sequence and no flag to flip afterwards.

Existing multiplayer games are unaffected with the box unchecked — and it is worth being exact about
what proves that, because two different pieces of evidence carry the claim. The 300-step scripted
two-seat game that plays out identically whether the variants object is **absent, empty, or
explicitly false** proves those three kit-off *shapes* agree with each other under the code as it
now stands; it is a same-build comparison, not a comparison against the old build. What evidences
byte-identity with **pre-milestone** multiplayer is that every pre-existing multiplayer suite —
`multi`, `multi-trade`, `multi-fight`, `multi-union`, `multi-concurrent`, `multi-zombies`,
`gap-multiplayer` — is unchanged by this milestone and still green (with the one exception noted in
§3's review fix, whose two amended assertions are kit-only Apprentice cases). Together they are as
strong as this suite gets; neither alone is the whole claim.

### 5. Union Harpies stash lands on the COMMANDER's party (pinned, not fixed)

When Harpies strike a united force, the stolen artifacts go into the **commander's** `harpyStash`,
because under the loan model the commander's array *is* the combined roster — so loot stolen from a
**loaned** member is later recovered at the Lair by the commander, and stays his even after the
union dissolves. The owner who lent the creature never sees it again. The MP-kit golden replays
exactly that arc (the Flute stolen from seat 1's loaned member at step `#5`, delivered to the Lair
and into **seat 0's** hands at step `#89`, long after the dissolve), so the behaviour is pinned as
current — not fixed: it is the same family of question as §2's zero-member seat — *what
does a subordinate get back when the union ends?* — and the answer belongs to you, not to me. If
you want the stash to follow the member's owner, it is a per-member attribution at theft time rather
than a party-level stash, which is a real change to SC-EXT-15's model and wants a ruling first.
