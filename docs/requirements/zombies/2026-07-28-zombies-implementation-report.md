# The Zombies Variant — Implementation Report for the Game Designer

> Written 2026-07-28, at commit `a48cc79` (the day the lobby toggle was withdrawn).
> Purpose: a complete account of how the multiplayer **Zombies** option is currently
> implemented — every rule, every scenario it touches, and every place a decision or
> assumption was made — so the designer can rule on what to keep and what to correct.
>
> **Markers used throughout:**
> ⚖️ **DECISION** — a deliberate, documented implementation choice (rationale on record).
> 🔶 **ASSUMPTION** — behavior that exists but was never explicitly decided or documented.
> ⛔ **NOT IMPLEMENTED** — a rulebook clause the engine deliberately does not model.
> ❓ **PENDING** — explicitly awaiting the designer's ruling.

---

## 1. Current status

The variant shipped in **M7** (commit `65879fd`, 2026-07-04) and gained kit-hazard
classifications in the extension-kit MP milestone (`2c791b9`, 2026-07-27). As of
**`a48cc79` (2026-07-28) the Zombies checkbox is withdrawn from the lobby UI** while its
kit interaction is rethought — the engine, Convex backend, and all rules below remain
fully live, so a game already carrying `variants.zombies` still runs and labels itself;
no UI path can newly enable it. (`apps/web/src/game/MultiplayerLobby.tsx:52-96`)

## 2. Summary — how the modifier changes the game

Without zombies, a wiped multiplayer party is terminal: the seat is out, its corpses'
gear lies where it fell, and the game ends when nobody is left exploring. With zombies
on, **a wipe is no longer the end**: the seat forfeits one turn, then its corpses rise
as a "spoiler" party — *"he cannot win the game, but he can try to keep any other
player from winning"* (rulebook §Zombies). The risen party:

- **moves** on its player's turn like any party, but will not cross water and finds no
  secret doors (all of them, if the Sorcerer marches with it);
- **cannot interact with the cave's economy**: no treasure, no chests, no artifacts —
  anything it stumbles into drops straight back to the floor;
- **cannot interact with strangers**: they are indifferent to the dead and the dead do
  not attack them — encounters dissolve back onto the tile, unresolved and untested;
- **is immune to the hazards that prey on the living** — Medusa, vipers, Ghouls (and,
  under the kit, Desertion and Quarrel ❓) — but still falls down Traps and Crypts and
  still loses artifacts to Harpies ❓ (it never holds any, so the latter is edge-case);
- **exists to fight other players**: PvP is its only weapon. It attacks and is attacked
  normally on physical strength, its casters lending no magic. Killed again, it is gone
  for good;
- **is annihilated the instant anyone kills the Sorcerer**, and no new zombies can rise
  after that.

Practical effect on the session: elimination no longer benches a player, the endgame
gets a harasser archetype with nothing to lose, and the Sorcerer's death becomes a
board-clearing event. The variant is engine-complete and test-pinned (18 dedicated
tests) but has never had a design pass on its **presentation** (scoreboard, map, notice
wording) — most of the rough edges below live there.

## 3. The rulebook contract, clause by clause

The normative source is `docs/specs/sorcerers-cave-rules.md:575-585` (§Zombies),
implemented in `packages/engine/src/multi-zombies.ts` (339 lines, all rules in the MP
layer — the solo reducer is frozen) with hooks in `multi.ts` and `multi-fight.ts`.
Spec row: **SC-MP-37**; kit extension: **SC-EXT-33** (pending ❓).

| Rulebook clause | Status | Where |
|---|---|---|
| "he cannot win … can try to keep any other player from winning" | ✅ faithful (spoiler semantics; but see §4.11 on the *interim* score) | whole module |
| "forfeits one turn, then … resurrected" | ✅ faithful — ⚖️ charged *at* the rise via `forfeitTurnsOwed = +1` | multi-zombies.ts:257 |
| "the body of the **last creature to die** … along with any other bodies **in the area**" | ⚖️ simplified: ALL of the seat's corpses rise together at the wipe area (no per-corpse locations exist) | multi-zombies.ts:58-61 |
| "enters an area containing dead creatures, these … join the party" (absorption) | ⛔ NOT IMPLEMENTED — corpses are not modelled on tiles; a rival's dead stay in that rival's array | multi-zombies.ts:62-64 |
| "enters an area containing the Sorcerer, he and any companions join the party" | ⛔ NOT IMPLEMENTED (same missing corpse/NPC-location model) | multi-zombies.ts:62-64 |
| "moved by the player during his turn" | ✅ faithful | turn flow unchanged |
| "living strangers are indifferent to zombies" | ✅ faithful — encounters dissolve, working set parks back untested | multi-zombies.ts:191-211 |
| "cannot carry or use treasure" | ✅ faithful — pre-gate + post-strip + game-sweep strip (three layers) | multi-zombies.ts:99-102, 213-232, 313-337 |
| "will not attack strangers" | ✅ faithful (test AND attack barred) | multi-zombies.ts:104-105 |
| "not affected by Medusa, vipers, or ghouls" | ✅ faithful — ⚖️ via run-then-undo repair (see §4.5) | multi-zombies.ts:149-189 |
| "will fall down traps unless accompanied by a living dwarf" | ✅ faithful — a zombie party by construction has no *living* Dwarf, so Traps always apply | multi-zombies.ts:25 |
| "will not cross water" | ✅ faithful — Deep Pool tiles unenterable; from a Pool doorway only the retrace is walkable | multi-zombies.ts:106-121 |
| "Sorcerer with them: ALL secret doors; otherwise NONE" | ✅ faithful — overrides the per-seat `knownDoors` gate in both directions | multi-zombies.ts:122-127, multi.ts:476-480 |
| "can form a union with other zombies" | ✅ faithful — mixed living/zombie proposals never open | multi.ts:409-419 |
| "attack or be attacked by living creatures in the normal way" | ✅ faithful — PvP fully open (attack affordance kept in UI) | multi-fight.ts, MultiplayerPlay.tsx:268 |
| "no magical power … only normal physical strength" | ⚠️ **partially faithful** — background casters are zeroed; an engaged *front-line* caster still adds its MP (see §4.7) | multi-fight.ts:111-116, 439-450 |
| "a zombie which is 'killed' is reanimated after one full turn … provided the main party is still in the area" | ⛔ NOT IMPLEMENTED — ⚖️ a zombie party killed in PvP is terminal for good (needs the missing corpse model) | multi-zombies.ts:65-66 |
| "If the Sorcerer is killed all zombies are annihilated and no more may be created" | ✅ faithful — fires off ANY seat's kill, union or not | multi-zombies.ts:273-301 |

Trade is not mentioned by the rulebook; ⚖️ **DECISION**: trade with the risen never
opens, derived from "cannot carry or use treasure — nothing to trade" (multi.ts:376-381).

## 4. Drill-down by scenario of play

### 4.1 The wipe and the rise

When a seat's last living member falls (any route: solo hazards/fights, PvP, union loan
returns — one sweep hook covers all, `multi.ts:344`), `zombiePostSweep` auto-rises it:

- **Eligibility**: only a `wiped`/`GS_DEAD` seat, not already risen, with at least one
  fleshly corpse. Stone members are not corpses and stay down; **Dragons and Spectres
  leave no corpses** and never rise (rulebook-derived). If every member is stone or
  corpse-less, the seat stays terminally wiped. No rise once any Sorcerer-kill has
  landed. (multi-zombies.ts:242-260)
- ⚖️ **DECISION — no prompt**: the M7 design sketch had a *"Rise as zombies?"* option
  (multiplayer-interaction-specification.md:467); the MVP auto-rises with a system
  chat line instead. A player cannot decline to become a zombie.
- ⚖️ **DECISION — items**: carried items already spilled to the tile at the wipe
  (I-12); **borne items (Sword/Staff/Ring on the body) are LOST with the rising
  flesh**. Risen members carry nothing, ever. (multi-zombies.ts:67-68)
- ⚖️ **DECISION — memory wiped**: the risen party keeps its seat/name/color and map
  position but clears encounter memory (hostile/pacified areas, streaks, fleeGrace).
- **The one-turn forfeit** is charged at the rise (`forfeitTurnsOwed + 1`): strict
  rotation consumes it via `advanceTurn`'s skip-and-decrement; concurrent games via
  the existing forfeit lockout. ⚖️ Same net timing as the rulebook's "forfeits one
  turn, then rises", implemented as rise-now-skip-next.
- **A game already finished stays finished** — the last party's fall ends the game;
  zombies raise no curtain calls. 🔶 ASSUMPTION: the rulebook doesn't address whether
  the final wipe of the last living seat should instead rise and keep spoiling; the
  engine rules the game over (there is nobody left to spoil, so this seems right, but
  it was never explicitly decided).

### 4.2 Movement

- **Water**: a zombie party never steps ONTO a Deep Pool tile; standing at a Pool's
  doorway (a fresh draw can land it there), only the retrace back the way it came is
  walkable — every other exit "would mean crossing the water". ⚖️ This doorway
  asymmetry is an interpretation; the rulebook says only "will not cross water".
- **Secret doors**: with the Sorcerer aboard (living, in the risen party — only
  possible if the seat's own Sorcerer… see 🔶 below) ALL secret stairs open; without,
  NONE — the normal per-seat `knownDoors` knowledge gate is overridden both ways.
  Printed stairs are ordinary and stay open to the dead; a mirrored (unprinted) stair
  end IS the secret door (I-18).
  - 🔶 ASSUMPTION: `hasSorcerer` checks for a *living* Sorcerer member of the risen
    party. Since the Sorcerer-joins-the-dead clause is not implemented (§3) and the
    Sorcerer is never a party member, **this branch is currently unreachable** — the
    "ALL doors" arm exists and is tested at the gate level but cannot occur in play.
- **Kit terrain**: the Whirlpool's crossing-drag applies to zombies exactly as to the
  living (it runs inside the solo reducer's move case — no zombie carve-out); Chasm
  descents, Well draws, Bell pulls etc. are *actions*, all barred by the artifact/loot
  gates only where they touch treasure — see §4.6.

### 4.3 Treasure and artifacts — three enforcement layers

1. **Pre-gate**: `takeTreasure`, `retakeDropped`, `openChest`, `useArtifact` are all
   rejected before dispatch ("zombies cannot carry or use treasure"). `leaveTreasure`
   stays legal as the escape hatch.
2. **Post-repair**: anything a chamber entry swept into the working set — or any path
   that handed treasure to a member — goes straight back onto the tile's floor.
3. **Game sweep (belt-and-braces)**: covers non-solo paths (e.g. a PvP victor's
   automatic floor reclaim) by stripping any zombie-held treasure back to the tile.

⚖️ **DECISION**: the strip preserves the items on the tile (nothing is destroyed) —
the cave's economy is conserved; zombies just can't participate in it.

### 4.4 Strangers and encounters

Strangers a zombie entry uncovers are parked back onto the tile **untested** (100+id
codes; sleeping creatures re-park as 400+id), the working set clears, and the party
stands at rest — the turn ends as a settled entry. Rationale: strangers are
indifferent to zombies and zombies will not attack, so the encounter cannot resolve.
⚖️ **DECISION**: "parked exactly as a retreat would leave it" — the creatures remain
for living parties to meet later; no reaction dice are ever rolled.

### 4.5 Hazards

Medusa's gaze, the Viper Pit, and Ghouls fire *inside* the composed solo reducer
(which is frozen), so immunity is enforced by **run-then-undo repair**: the hazard
runs, then petrifications/deaths are reverted member-by-member against the pre-action
snapshot, and the hazard's events are filtered from the returned set. A "wipe" such a
hazard caused is undone with its victims. ⚖️ **DECISION** (documented enforcement
point): this repair pattern is the module's core mechanism — the alternative
(patching the solo reducer) was ruled out by the solo-frozen constraint.

- 🔶 ASSUMPTION baked into the repair: members are **index-matched** against the
  snapshot, valid because "a zombie party array is stable across one action (no
  allies to desert, no trades, appends only)". Any future change letting a zombie
  roster mutate mid-action would silently break the repair.
- **Traps apply normally** — a zombie party has no *living* Dwarf to guide it past.

**Kit hazards — ❓ PENDING (SC-EXT-33, the design-Part-4 proposal, adopted as
default, awaiting your ruling — flagged in the module doc, the spec row, and the
milestone report §1):**

| Kit hazard | Classification | Reasoning on record |
|---|---|---|
| Desertion (5) | **Ignored** (repaired) | "the party turning on itself — the dead have no politics left"; the per-ally roll is structurally inert anyway (a zombie party can never have status-1 allies), so only the announcement is suppressed |
| Quarrel (7) | **Ignored** (repaired) | same social-hazard logic; this one needed real code — a 2+-member zombie party genuinely could lose a duellist |
| Crypt fall (8) | **Applies** | an unavoidable trap by design — same "no living Dwarf" logic as an ordinary Trap |
| Harpies (6) | **Applies** | theft targets *artifacts*, not "treasure" in the cannot-carry sense — but see the milestone report's own caveat: *"the one I would most expect you to push back on is Harpies — 'the dead cannot carry or use treasure' can be read to cover artifacts too, which would make the theft moot rather than applicable."* In practice a zombie never holds an artifact (§4.3), so the applied case is nearly unreachable. |

If you rule differently, the fix is local: move `HAZARD_HARPIES` in or out of the
immunity set and flip one test expectation.

### 4.6 Kit specials

The kit's six specials (Chasm, Bell Rope, Lair, Whirlpool, Gallery, Well) are ordinary
**chambers** — zombies enter them like any chamber with no gate entries. Their
*actions* fall out naturally: Well draws and Bell pulls resolve as extra draws whose
strangers/treasure then park/strip per §4.3-4.4; a Gallery's statues are stone (not
corpses) and never interact; the Lair's stash is treasure (strippable). ⚖️ DECISION:
no special-case code was added for any of them — behavior is whatever the generic
gates and repairs produce. No dedicated tests exercise a zombie party ON each kit
special; only Whirlpool composition was reasoned through explicitly (Task 4 VERIFY).

### 4.7 PvP — the zombie's only weapon

- A zombie command attacks and is attacked **normally**: engagement layout, surprise
  (`prev`-based, no carve-out), retreat + fleeGrace, and "slay the strongest of the
  losing group" casualty selection are all identical to the living.
- **Magic**: `backerMP` returns 0 for a zombie command's *background* casters — each
  side checked independently (zombie-vs-zombie zeroes both benches).
- ⚠️ **KNOWN GAP (undocumented until the kit milestone's review)**: an engaged
  **front-line** zombie caster still contributes its MP through `frontStrength`,
  which adds `casterMP` unconditionally (combat.ts:25-31; multi-fight.ts:139-146).
  The only pin exercises a Wizard as a backer, never as a fighter. A risen Wizard
  fighting in the line is therefore worth 2+5 rather than 2 — **contrary to "no
  magical power … only normal physical strength."** Fix would be a zombie check in
  the PvP strength path mirroring the backer check.
- ⚖️ **DECISION**: a zombie command wiped in PvP is **terminal for good** — the
  rulebook's one-turn re-animation ("provided the main party is still in the area")
  needs a corpse-location model the engine doesn't have.
- 🔶 ASSUMPTION: the victor's automatic floor-reclaim of a slain zombie party's
  spoils works normally (there are never items to reclaim, since zombies carry
  nothing — the sweep's strip is the safety net if that ever changes).

### 4.8 Unions and trade

- **Unions**: proposals mixing zombie and living seats never open; zombie-with-zombie
  unions form normally (loans, commander moves, dissolution all inherited unchanged).
  🔶 ASSUMPTION: *nothing* inside union mechanics is zombie-aware beyond the gate —
  e.g. a zombie union's Quarrel repair, loan bookkeeping, and bounty logic are
  whatever the generic layers produce. Zombie-union play is essentially untested
  beyond formation.
- **Trade**: never opens with a risen party, in either direction.

### 4.9 The Sorcerer

- **Annihilation**: the moment ANY seat's `sorcererKilled` lands — union kill or solo
  kill alike (this union-agnostic shape was later cited as precedent for SC-EXT-31's
  Apprentice ruling) — every exploring zombie party is wiped terminally
  (`status: "wiped"`, `GS_DEAD`, score 0), any live session involving one ends where
  it stands, the turn cursor is advanced off an annihilated seat, and the game
  finishes if nobody is left exploring. **No further rises, ever.**
- 🔶 ASSUMPTION (inferred, not coded): a zombie party can never itself kill the
  Sorcerer — it cannot test or attack strangers — so the annihilation trigger is
  always another (living) seat's act. No code depends on this, but no test covers a
  hypothetical zombie-caused Sorcerer death either.
- ⛔ The rulebook's "Sorcerer joins the dead" clause is not implemented (§3).

### 4.10 Turn flow and game end

The rise's forfeit integrates with both timing models (strict rotation:
skip-and-decrement; concurrent: forfeit lockout). A repaired (dissolved) zombie
encounter still **ends the turn** like a settled entry. Annihilation never leaves the
turn cursor on a dead seat. The Convex reaction-window expiry path (PvP auto-resolve
bypasses `mpReduce`) re-runs the sweep explicitly, so timer-driven wipes rise exactly
like action-driven ones — including posting the rise line.

### 4.11 Scoring and leaderboards

- **Terminal**: a finally-terminal zombie seat records outcome *wiped*, **score 0**
  (the standard `gs === GS_DEAD` zero rule). ⚖️ documented and tested.
- ⚠️ **UNDOCUMENTED GAP — the interim score**: while it walks, a risen party's live
  score is **nonzero** — `riseAsZombies` resets members to `status: 0` (alive) and
  does not touch `bonusScore`, and `scoreBreakdown` counts living members'
  creature points plus banked `bonusScore`. The Scoreboard **sorts by and displays
  this number**, so a spoiler that "cannot win the game" can sit mid-table with a
  positive score and "In maze" status until its final death. No code comment, spec
  row, or test addresses the interim state — the module doc covers only the terminal
  case. Options: zero the score at the rise; display "—"/"risen" instead of a number;
  or keep it (it does approximate the seat's pre-death standing).
- **Leaderboards** (as of the 2026-07-28 four-table split): multiplayer tables list
  **escaped seats only**, so zombie terminal rows (all wipes) never appear on any
  leaderboard — they exist only in the archive. 🔶 The `highScores` schema carries
  **no zombie marker**; a former-zombie row is distinguishable only by inspecting its
  stored state snapshot.
- Bounty-split scoring (`sorcererSharedWith`) has no zombie path — see §4.9.

### 4.12 Presentation (UI, notices, log)

- **Lobby**: toggle withdrawn (§1). Guests of a game already carrying the flag see a
  "Zombies ✓" chip; there is no "Zombies —" chip anymore — the withdrawn option is
  not advertised.
- **In play**: your own risen party loses the Trade/Unite affordances (Attack stays —
  "a zombie party is exactly a PvP spoiler"); co-located rival zombie parties show a
  *risen* badge in the "Also here" chip list and hide Trade/Unite toward them. The
  **Scoreboard** shows "☠ risen — a spoiler, out of the running" beside the name
  (while ranking it by its nonzero score, per §4.11).
- ⚠️ **GAP — the map**: the 3D cave map's party tokens carry **no zombie signal at
  all** (`OtherPartyToken` has no zombie field) — a risen party's pawn looks exactly
  like a living one. The "risen" signal exists only in text surfaces.
- ⚠️ **WORDING**: zombie action denials reuse the PvP rejection frame — a zombie
  trying to loot sees *"The battle plan is rejected: zombies cannot carry or use
  treasure."* The underlying reason strings are good; the "battle plan" wrapper is
  wrong for them.
- Minor copy: the rise system line reads "*{party} rise from the dead…*"
  (subject-verb agreement whenever the party name is singular); the PvP battle-end
  narration doesn't distinguish "wiped" from "wiped-but-rose" (the separate rise line
  is the only signal); a former zombie's final chat line is the generic "perished in
  the cave (score 0)".

### 4.13 Interaction with the other variants

- **Fog-of-war-lite**: no special interplay — a risen party records seenAreas and is
  fog-filtered like any other. Its rise is announced in the shared chat regardless of
  fog. 🔶 Never explicitly considered.
- **Concurrent exploration**: the forfeit uses the concurrent lockout path; zombies
  otherwise play by concurrent rules unchanged. Zombie trade/union bars are timing-
  model-independent.
- **Extension kit**: the SC-EXT-33 matrix (§4.5) plus the shared-content generics
  (§4.6). This is the interaction that prompted the UI withdrawal.

## 5. Decision & assumption register

| # | Area | Item | Status | Recorded where |
|---|---|---|---|---|
| D1 | Rise | All corpses rise together at the wipe area (not "last creature + bodies in the area") | ⚖️ decided | multi-zombies.ts:58-61 |
| D2 | Rise | Auto-rise, no "Rise as zombies?" prompt | ⚖️ decided (MVP) | multi-zombies.ts:46-47 vs design spec §I-15 UI note |
| D3 | Rise | Borne items lost with the rising flesh; risen carry nothing | ⚖️ decided | multi-zombies.ts:67-68 |
| D4 | Rise | Forfeit charged at the rise (`forfeitTurnsOwed+1`) | ⚖️ decided | multi-zombies.ts:69-71,257 |
| D5 | Corpses | No absorption; no Sorcerer-joins; no PvP re-animation (no corpse-location model) | ⛔ decided omissions | multi-zombies.ts:62-66; engine-spec.md "deliberate omissions" |
| D6 | Hazards | Immunity via run-then-undo repair (solo reducer frozen) | ⚖️ decided | multi-zombies.ts:19-25 |
| D7 | Trade | No trading with the risen (derived from cannot-carry) | ⚖️ decided | multi.ts:376-381 |
| D8 | Kit | Desertion/Quarrel ignored; Crypt/Harpies apply | ❓ **PENDING your ruling** | SC-EXT-33; milestone report §1 |
| D9 | PvP | Zombie command killed in PvP is terminal for good | ⚖️ decided | multi-zombies.ts:65-66 |
| A1 | PvP | Front-line zombie casters still add MP (only backers zeroed) | ⚠️ **defect vs rulebook**, known, unfixed | multi-fight.ts:139-146 vs 439-450; deferred-minor ledger |
| A2 | Scoring | Interim (walking) score is nonzero and ranked on the Scoreboard | 🔶 undocumented assumption | this report §4.11 |
| A3 | Movement | Deep-Pool doorway: only the retrace is walkable | 🔶 interpretation of "will not cross water" | multi-zombies.ts:111-121 |
| A4 | Movement | The Sorcerer-aboard secret-door arm is unreachable in play (no join mechanic) | 🔶 latent code | multi-zombies.ts:87-88,122-127 |
| A5 | Repair | Index-matched member restore assumes stable zombie rosters | 🔶 fragility note | multi-zombies.ts:151-153 |
| A6 | Unions | Zombie-union internals rely wholly on generic layers; untested beyond formation | 🔶 coverage gap | this report §4.8 |
| A7 | Game end | Last living seat's wipe ends the game rather than rising | 🔶 undecided edge | multi-zombies.ts:303-304 |
| A8 | Data | No zombie marker in highScores rows or map tokens | 🔶 presentation gaps | schema.ts:76-94; CaveCanvas.tsx:14 |
| A9 | Wording | "Battle plan rejected" frame on zombie denials; "rise from the dead" grammar | 🔶 copy defects | eventNotices.ts:70-74; convex/multiplayer.ts:724 |

## 6. Test coverage

18 dedicated tests in `multi-zombies.test.ts` across five describes: the rise (5),
action gates (5), post-action repair (3), wider game — annihilation/unions/trade/PvP
backers (4, plus fog tests sharing the file), and the kit matrix (4, each with a
living-party control). The MP-kit golden deliberately plays a *living* party through
the kit hazards to pin the baseline the classifications are measured against. Known
holes: front-line PvP caster (A1), interim score (A2), zombie parties ON each kit
special (§4.6), zombie-union play beyond formation (A6).

## 7. Questions for the designer

1. **D8 (the blocker for re-exposing the toggle)**: confirm or amend the kit-hazard
   matrix — in particular whether Harpies should be moot ("the dead cannot carry or
   use treasure" read broadly) rather than applicable.
2. **A1**: should the front-line MP leak be fixed so zombie fighters are physical-only
   (the rulebook reading), before the toggle returns?
3. **A2**: what should a walking zombie party's displayed score be — 0, "—", or its
   current pre-death standing?
4. **D2/D5**: are the MVP simplifications (auto-rise, no absorption, no re-animation,
   all-corpses-rise) acceptable as the permanent shape of the variant, or is a corpse
   model worth building?
5. **Presentation**: is a map-token distinction for risen parties (A8) and a notice
   wording pass (A9) wanted as part of the re-exposure?
