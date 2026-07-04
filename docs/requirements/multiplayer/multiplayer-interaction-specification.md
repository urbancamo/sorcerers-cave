# The Sorcerer's Cave — Multiplayer Interaction Specification

> Status: Draft · Created 2026-07-03 · Scope: how two or more parties interact in one shared Cave.
> Companion to the implementation plan (`2026-06-15-multiplayer-plan.html`, esp. §2.5 and §12). This
> document is the authoritative, self-contained definition of **inter-party interaction**: what may
> happen when parties meet, the exact engine mechanics, the UI each player sees, and — critically —
> which moments run **asynchronously** and which require a **synchronous block**.

Out of scope: communication between players (handled by the existing chat feed) and the single-party
solitaire/turn mechanics (covered by the engine spec and the base plan). References: the rulebook
`docs/specs/sorcerers-cave-rules.md` (§Player Interaction, §Fights, §Options), Peter's notes
(`sorcerers-cave-notes-from-peter.md`, `additional-notes-from-peter.md`), and the designer's essay
(`docs/other/the-sorcerers-cave-and-its-sequel.md`).

---

## 0. Design principles

1. **Async by default; block only where two parties genuinely touch.** The designer's own verdict is
   that "the labyrinth is usually too widespread and tortuous to allow much contact" — parties spend
   the overwhelming majority of the game exploring alone. So the baseline is **concurrent exploration**
   (plan revision ①): every party acts in real time on its own turn-thread; nobody waits for anybody.
   Synchronisation is introduced **only** for the brief, deliberate moments when parties interact
   (trade, union, PvP), and even then it is **scoped to the participants** — the rest of the table
   keeps playing.

2. **"It is always a player's privilege to roll the die for his own scores, regardless of whose turn
   it is."** (rulebook §Player Interaction.) Every side's rolls come from **that party's own RNG
   substream** (plan revision ②), never the actor's. This both honours the rule and keeps the game
   deterministic/replayable.

3. **Reaction windows, never dead stops.** Where the rules require a non-active player to act (a
   defender's combat round, a trade/union consent), we open a **bounded reaction window** with a
   sensible **auto-default** on timeout, so an idle or disconnected player can never freeze the game
   for others (ties to plan revision ⑧). "Minimise wait delays to where absolutely required" is the
   governing constraint.

4. **The engine stays the sole rules authority; Convex stays the sole authority for identity, turn
   ownership and interaction locks; Convex reactivity is the transport.** No new realtime infra.

5. **Faithful to the board rules first.** PvP, unions, trading and hidden-cards are the rulebook's own
   "serious play" layer (Phase 6–7 in the plan); the MVP (Phase 1–4) ships the **beginner ruleset**:
   parties co-exist and share chambers but do **not** fight, unite, or trade. This spec defines the
   full model so the MVP's data shapes don't foreclose it.

---

## 1. Foundations

### 1.1 Vocabulary & shared state

| Term | Meaning |
|---|---|
| **Seat / party** | One player's exploring party (`PartyState` in the plan). Seats are stable 0–3. |
| **Cave** | The one shared map + area (large) deck + small deck + secret-door registry (`CaveState`). |
| **Co-located** | Two or more parties whose `partyArea` is the same area id. Derived: `occupants(area)`. |
| **Working set** | A party's *transient* chamber contents while it is resolving an area (strangers/treasure/hazards). Private to that party's turn; parked to `PlacedArea.contents` when it leaves. |
| **Terminal state** | `left` (escaped), `wiped` (all dead/stone), `abandoned` (quit). Frozen score; skipped in turn rotation. |
| **Borne vs carried** | Per-holding flag on each carried item (plan ④a): *borne* = wielded/worn/displayed; *carried* = stashed. Governs petrification/death loot. |
| **Secret-door knowledge** | Per-seat set of area coords whose stairway that seat may use (rulebook §Secret Doors). |

### 1.2 The concurrency model

Three concentric tiers, from fully parallel to fully serialised. A party is only ever in **one** tier
at a time, and moving inward is always a deliberate act by a player.

**Tier A — Free roam (fully async).** A party not co-located with any other party explores on its own
thread. The only shared resource is the **decks**: drawing an area card (large pack) or chamber cards
(small pack) is a single transactional Convex mutation, so concurrent draws serialise **atomically and
invisibly** (first commit wins; the cursor advances once). No player perceives a wait. This is the
common case and the bulk of play.

**Tier B — Shared occupancy (async with reactive awareness).** Two+ parties in the same area still
"continue to act independently" (rulebook §Player Interaction). **No lock.** Each still resolves its
own turn (fights its own strangers, loots what's left, moves on) on its own thread. The only added
behaviour is **reactive awareness**: each co-located party sees the others' coloured tokens and a
"parties here: …" chip, updated live. Interaction is *offered* (Trade / Unite / Attack buttons appear)
but never forced.

**Tier C — Interaction session (scoped synchronous sub-game).** When a player commits to Trade, Union
or Attack, the involved seats enter a short-lived **interaction session** — a synchronised state
machine (like the solo fight surface, but multi-sided) that runs **beside** the main async flow.
Only the session's participants are gated; every other seat keeps playing in Tiers A/B. Sessions use
**reaction windows** (§1.3) so no participant can stall the others indefinitely.

```
                       ┌─────────────────────────────────────────────┐
   all other seats →   │  Tier A / B  (async, concurrent, no waiting) │
                       └─────────────────────────────────────────────┘
   participants only → ┌─────────────────────────────────────────────┐
                       │  Tier C session (trade | union | PvP fight)  │
                       │  serialised *within* the session, reaction   │
                       │  windows + timeouts, others unaffected       │
                       └─────────────────────────────────────────────┘
```

### 1.3 Reaction windows & timeouts

A **reaction window** is a bounded interval during which a specific seat may respond to an interaction
event (a fight round aimed at them, a trade/union offer). Properties:

- **Duration:** default 45 s for a combat round, 60 s for a trade/union offer (tunable per game).
- **Presence-aware:** the window only counts down while the target is connected (`lastSeen`); a
  disconnected target's window is paused up to a grace cap, then auto-defaults.
- **Auto-default on timeout** (never a dead stop):
  - *Defender's combat round* → auto-deploy **strongest-fights-strongest** and roll from the
    defender's own RNG substream. The fight advances; the defender can re-engage next round.
  - *Trade / union offer* → **expires** (declined); the offerer is told, no state changes.
  - *Union member's forfeit prompt* → treated as **refuse** (stays independent).
- **Interruptible:** the target may respond early to close the window immediately.

This is the single most important lever for "minimise wait delays": the only time a player waits on
another human is inside a Tier-C session, and even there the wait is bounded and self-healing.

### 1.4 Interaction taxonomy

| # | Interaction | Category | Sync class | Who is blocked |
|---|---|---|---|---|
| I-1 | Shared occupancy (baseline) | Presence | **Async** (Tier B) | nobody |
| I-2 | Multiple parties via the Gateway | Presence | **Async** | nobody |
| I-3 | Entering a chamber holding other parties | Presence | **Async** | nobody |
| I-4 | Entering a chamber with dropped loot | Environment | **Async** | nobody |
| I-5 | Trading cards | Cooperative | **Sync (2 seats)** | the two traders only |
| I-6 | Forming a union | Cooperative | **Sync (N seats)** | union members only |
| I-7 | Operating / dissolving a union | Cooperative | **Sync (union)** | union members only |
| I-8 | Division & guards | Structural | **Async** (guard trigger is Sync) | nobody until a guard fires |
| I-9 | Declaring a PvP attack | Competitive | **Sync (2 seats)** | attacker + defender |
| I-10 | Multi-party combat rounds | Competitive | **Sync (combatants)** | combatants only |
| I-11 | Retreat from a party | Competitive | **Async** (two-turn grace) | nobody |
| I-12 | Post-combat treasure/artifacts | Environment | **Async** | nobody |
| I-13 | Multiple parties + strangers | Mixed | **Async**, fight is per-party | nobody |
| I-14 | Special chambers, multi-party | Environment | **Async** (constraints) | nobody |
| I-15 | A party wiped (+ zombies option) | Terminal | **Async** | nobody |
| I-16 | A party petrified | Terminal/partial | **Async** | nobody |
| I-17 | A party escapes to the surface | Terminal | **Async** | nobody |
| I-18 | Secret-door knowledge sharing | Information | **Async** (share is a 1-way grant) | nobody |
| I-19 | Sorcerer bonus split | Scoring | **Async** (settled at scoring) | nobody |

The table's headline: **only I-5, I-6, I-7, I-9, I-10 ever block a human on another human**, and each
blocks **only the participants**, bounded by a reaction window.

---

## 2. The interactions

Each entry: **Category · Plain English · Engine mechanics · UI (per role) · Sync class · UX notes.**
"Per role" = the *initiator*, the *other party/parties*, and *uninvolved* players.

### I-1 · Shared occupancy (the baseline)

- **Category:** Presence. **Sync:** Async (Tier B).
- **Plain English:** Any number of parties may stand in the same area at once and keep playing
  independently. The first party to have entered a fresh chamber already drew and dealt with its
  contents; later arrivals inherit whatever remains.
- **Engine:** occupancy is derived (`occupants(area) = parties with partyArea === area`). No lock, no
  turn coupling. A party's working set is private to its own turn; anything it leaves behind is parked
  to `PlacedArea.contents` and is what the next party sees (this already works in the shared-cave
  model). Hostility/pacification/secret-door knowledge are **per-seat** (`hostileAreas`,
  `pacifiedAreas`, per-seat known-doors), so one party's history never leaks into another's options.
- **UI:** every occupant renders each other's coloured token on the tile, plus a small "Also here:
  «Verdant Few», «Red Talons»" chip and (if enabled) the Trade / Unite / Attack affordances. Updates
  are reactive — no refresh, no turn hand-off.
- **UX:** this is the atmosphere Peter wants — you *see* rivals arrive and leave without either of you
  losing tempo. Nothing blocks.

### I-2 · Multiple parties entering through the Gateway

- **Category:** Presence. **Sync:** Async.
- **Plain English:** All parties start at (and may pass back through) the Gateway. Several parties can
  occupy or transit it at once.
- **Engine:** the Gateway is a normal shared area (special, non-chamber). Party selection already
  seated everyone; on `startGame` each party's `partyArea` is the Gateway. Movement out is Tier-A
  concurrent. The Gateway is **also the primary exit** (any level-1 up-stair): leaving is per-party
  (I-17) and never blocks others.
- **UI:** at game start the Gateway shows all four tokens stacked at the entrance steps (Peter's
  doorway model, plan ③); a subtle fan-out keeps them legible. As parties move off, tokens disperse
  live.
- **UX:** a strong shared opening image ("four bands descend together") with zero coordination cost —
  everyone can move on their first turn simultaneously.

### I-3 · Entering a chamber that already contains other parties

- **Category:** Presence. **Sync:** Async (interaction is opt-in).
- **Plain English:** You walk into a chamber where a rival already stands. You act normally; you may
  additionally *choose* to trade, unite, or attack (if enabled and legal).
- **Engine:** entry resolves the area for **your** party as usual (reload parked `contents`, run your
  own hazards/strangers). Co-location is recorded; it unlocks the interaction affordances but forces
  nothing. **Following rule** is captured here: your entry records `arrivedFrom` (the doorway/prev
  area) so a later attack can test surprise (I-9).
- **UI:** *initiator (you):* your normal area panel + a banner "«Red Talons» are here" with
  Trade/Unite/Attack. *Occupant(s):* a reactive toast "«You» entered the chamber" (no interruption to
  their turn). *Uninvolved:* two tokens converge on the map.
- **UX:** discovery is delightful and consequence-free until someone opts in. No modal, no lock.

### I-4 · Entering a chamber with treasure/artifacts dropped by another party

- **Category:** Environment. **Sync:** Async.
- **Plain English:** A rival left treasure on a chamber floor (dropped to fight, fled from, or spilled
  from its fallen). You find it exactly as if it had been there all along and may pick it up.
- **Engine:** dropped items already live on `PlacedArea.contents` as `200+tid` and reload on entry into
  the pickup flow (this is the tunnel-drop / floor-treasure work already in the engine, generalised).
  **Ownership is not tracked on the floor** — once in `contents`, treasure is finders-keepers, matching
  "other parties entering the chamber have the usual options." Two nuances:
  - *Guarded loot:* items a party deliberately left **guarded** by a rear-guard (I-8) are **not** free
    — they belong to the guarding party and are only yielded by defeating the guards.
  - *The Eye of God on the floor* may be taken by anyone; taking it binds it (curse-if-forsaken) to the
    new holder; trading it later is curse-free only via I-5.
- **UI:** the loot renders as ordinary floor cards in your pickup panel; a faint "left by «Red Talons»"
  tooltip is flavour only. Guarded loot shows a coloured guard ring and an "guarded by «Red Talons»"
  label with no take button until the guards fall.
- **UX:** scavenging a battlefield is a satisfying async reward with no coordination.

### I-5 · Trading cards

- **Category:** Cooperative. **Sync:** Synchronous, **two seats only**.
- **Plain English:** Two parties in the same area agree to swap any cards they hold (creatures,
  treasure, artifacts). The Eye of God may be traded with no curse on the giver.
- **Engine:** a **trade session** (Tier C) between exactly the two co-located seats. State machine:
  `offer → counter/accept → atomic-commit | expire`. Both baskets are assembled, both must confirm,
  then a single transactional mutation moves the cards (validating carry capacity on each side). The
  Eye special-case suppresses the forsaken-curse **only** on a completed trade (not on a mere drop).
  Members (creature cards) may be traded too — this is how allies change hands (rulebook allows trading
  "any cards"); a traded creature keeps its dragon-kills/status. Trading is **blocked** while either
  party is in a fight.
- **UI:** *both traders:* a two-column trade modal (your cards | their cards) with drag-to-offer,
  live "their proposal" mirroring, and a two-phase **both-confirm** button; a countdown shows the
  reaction window. *Uninvolved:* nothing (or a tiny "«A» and «B» are trading" chip). *Either trader can
  keep exploring only after closing/expiring the trade.*
- **UX:** the only wait is on your chosen trading partner, bounded by the window; decline/expire is one
  click and frees both. Others never wait.

### I-6 · Forming a union

- **Category:** Cooperative. **Sync:** Synchronous, **union members only**.
- **Plain English:** At the start of a turn, two+ co-located parties place themselves under one
  **commander**. The commander thereafter moves the combined force on the commander's turn; each other
  member **forfeits a turn** to join. A union is required to co-operate in any fight (vs strangers or a
  rival).
- **Engine:** a **union** is a first-class object `{ id, commander: seat, members: seat[], area }`.
  Formation: any member proposes at the start of their turn; each prospective member must **accept**
  (a reaction window; timeout = refuse). On formation each non-commander is flagged
  `forfeitedTurnFor: unionId` for their next turn. Turn rotation still visits each member's seat, but a
  forfeited seat's turn is consumed by the union (the member may instead **defend** if attacked, or
  **refuse to move**, per rules). The engine enforces **strongest-fights-strongest** so the commander
  can't sacrifice a partner's creatures.
- **UI:** *proposer:* "Propose union — choose commander" picker. *Invitees:* an accept/decline prompt
  with the countdown. *Commander (on their turn):* controls the **combined** roster (all members'
  creatures), labelled by owning party colour (Peter's "show which party each creature belongs to").
  *Members while under command:* a read-only "You are in «Commander»'s union — [Leave] [Refuse move]"
  banner; they still act if the union is attacked. *Uninvolved:* the union's tokens render **doubled**
  (Peter's paired-pawn cue).
- **UX:** joining costs a forfeited turn (rules-mandated) but the commander then plays for everyone, so
  members aren't idle-watching a rival — they're watching *their own* combined force act, and can leave
  at will. Blocks only the union.

### I-7 · Operating and dissolving a union

- **Category:** Cooperative. **Sync:** Synchronous within the union.
- **Plain English:** Once moving as a union it acts as one party under the commander until end of turn
  or end of any fight. A member may leave by retaking their turn slot (not mid-fight). Allies recruited
  while united are split by agreement when the union dissolves.
- **Engine:** during the commander's turn the union is a single logical party (shared working set,
  combined line of battle). `leaveUnion(seat)` is legal at a turn boundary and not during a fight;
  `refuseMove(seat)` keeps that member's creatures stationary for the commander's move. On dissolution,
  **recruited allies** (creatures that joined via `test`→friendly while united) are distributed by an
  **allocation handshake**; if members disagree and fight instead, recruited allies are held
  **neutral** until that fight resolves, then join the victor (rulebook). Members' **own original
  creatures and treasure never transfer** by union — only jointly-won new allies are negotiable.
- **UI:** a compact "Union — «Cmdr» commanding: «A», «B»" HUD with per-member Leave. On dissolution
  with unallocated allies, an allocation modal (drag each new ally to a party) with both-confirm;
  unresolved → neutral-until-fight banner.
- **UX:** cooperative play feels like a genuine team turn; leaving is friction-free at boundaries.

### I-8 · Division of a party & rear-guards

- **Category:** Structural. **Sync:** Async, except a guard's defence (Tier C when triggered).
- **Plain English:** A player may split their party, moving only one part and leaving the rest behind
  (e.g. to guard treasure), with orders to attack any party that enters. Guards can't move except to
  retreat; they rejoin when the main party returns.
- **Engine:** a party may spawn a **detachment** `{ ownerSeat, area, members[], stance: "guard" }`
  pinned to an area. The mobile part keeps the seat's turn. A guard detachment: (a) makes the treasure
  it sits on **guarded** (not free-loot, see I-4); (b) triggers a **defence session** (I-9/I-10, as
  defender) when a rival attempts to attack/loot; (c) may only `retreat`. On the main party's return to
  the area, the detachment auto-merges (subject to carry limits).
- **UI:** *owner:* a "Leave a guard here" action → pick members → they render as a dimmed, pinned
  sub-token in the owner's colour. *Rival entering:* sees guarded loot (I-4) and, if they attack, faces
  the guards. *Owner while away:* a notification if their guards are attacked, with a jump-to-defend
  link (the defence still runs on reaction-window auto-defaults if they don't respond).
- **UX:** enables territorial play and treasure denial without pinning the owner in place — they roam
  while the guard holds, and only get pulled into a (bounded) session if someone actually attacks.

### I-9 · Declaring a PvP attack

- **Category:** Competitive. **Sync:** Synchronous, **attacker + defender**.
- **Plain English:** A player attacks a co-located rival. Legal **only** if neither party is in the
  viper pit, the deep pool, or a chamber that still contains strangers, Medusa, a trap, or ghouls. You
  may move in and attack in the same turn. You gain **surprise** only if you arrived by a different way
  than the defender entered — you can't surprise a party you were following.
- **Engine:** `declareAttack(attacker, defender)` validated against the legality mask
  (`area.special ∉ {pit, pool}`, `working/parked strangers == 0`, no active Medusa/trap/ghoul marker).
  Opens a **PvP fight session** (Tier C) with `surprise = arrivedFrom(attacker) !== arrivedFrom(defender) ? +1 : 0`
  (never when following). The defender is pulled into the session via a reaction window; **the rest of
  the table keeps playing.** A party may also attack a **rear-guard** detachment (I-8) the same way.
- **UI:** *attacker:* an "Attack «Red Talons»" confirm showing the surprise state and the legality
  (greyed with a reason if illegal — "can't attack across the Deep Pool", "clear the strangers first").
  *Defender:* a prominent but **dismissible-to-auto-defend** alert "«You» are under attack in Chamber
  L2! [Defend] (auto-defends in 0:45)". *Uninvolved:* a no-detail "⚔ a fight has broken out nearby"
  hint (Peter's fog-of-war-lite, plan ⑦) — colour/where, not who-wins.
- **UX:** the aggressor acts immediately; the defender is engaged within seconds, not a full global
  round later; everyone else is untouched.

### I-10 · Multi-party combat dynamics

- **Category:** Competitive. **Sync:** Synchronous among combatants; **alternating reaction rounds.**
- **Plain English:** Party fights run like stranger-fights but two-sided and across turns: **round 1 in
  the attacker's turn, round 2 in the defender's, and so on**, until one side is wiped or retreats, or
  both agree to stop. Deployment order each round: the **defender lays out their battle line first**
  (casters behind, direction unspecified, only if they have the numerical edge); the **attacker then
  engages every front creature** (1-vs-2 if needed) and places casters with **specified** direction;
  the **defender then assigns their casters' power**. Uncommitted forces may be shifted between rounds
  and may strike enemy **background** casters once the front line is fully engaged. Each side rolls its
  **own** dice.
- **Engine:** the PvP session is a state machine of **rounds**, each round a mini-turn owned by the
  side whose "turn" it is, with a reaction window for the responder:

  ```
  round(k):
    layout phase:  defender.lineOfBattle()  →  attacker.engage()  →  defender.assignCasters()
    resolve phase: for each match  →  roll(each side's own RNG substream) + strengths + surprise(round 1 only, attacker) + Ring/curse mods
                                   →  higher total slays the strongest of the losing side (tie = no death)
    post phase:    owner-of-next-round may { retreat | fight another round | propose stop }
  ```

  - **Strengths** reuse the solo combat math (front strength, caster background magic, Magic Sword,
    dragon-kills, Strength Potion, Ring +1, curse −1) — no new arithmetic, just two commanded sides.
  - **Surprise** applies to **round 1 only** and only to the attacker who didn't follow (I-9).
  - **Roll-your-own-dice:** every die is drawn from the **rolling party's** substream (principle 2).
  - **Shifting forces:** between rounds the active side may re-pair uncommitted creatures; must keep
    every enemy front creature engaged before any background attack.
  - **3+ sides / unions:** more than two parties fight *only* through **unions** (I-6) — a fight is
    always **two commands** (each possibly a union). Two parties already fighting may, at a round
    boundary, **stop and unite** against a common enemy (rulebook). A newcomer may only join the fight
    by **union** (forfeit a turn, under command) — otherwise it can't interfere, loot, or pass (I-13).
  - **Casualties** set `status = 3` and run `eyeForsakenByDeath`; a losing pair's specific victim uses
    the existing casualty-choice roll.
- **UI:** a **two-sided fight surface** (extends the solo one): your creatures on your side, the rival's
  line opposite, drag-to-engage, live preview of totals per match. When it's the other side's round you
  see a "«Red Talons» are deploying… (0:38)" state with your line locked but your **own dice still
  yours to roll** when a match resolves. A running round log ("R2: your Hero (11) slew their Ogre").
  *Uninvolved:* still just the no-detail nearby-fight hint.
- **Sync detail — where the block is and isn't:** the block is **only** between the two commands, and
  only for the duration of **each round's reaction window**. Between rounds each side is free (the
  rules literally alternate turns while "other players continue as usual"). A non-responding side
  auto-deploys strongest-fights-strongest and rolls, so the fight always progresses.
- **UX:** this is the tense centrepiece Peter wants turn-based — but scoped so two duellists trade blows
  in near-real-time while the other two players raid chambers elsewhere, oblivious except for a distant
  clash of steel.

### I-11 · Retreat from another party

- **Category:** Competitive. **Sync:** Async grace (the retreater gains tempo).
- **Plain English:** A party may retreat from a party-fight after a round; if it retreats it may take
  **two turns in a row** to flee pursuit, *provided* its first flight-turn hits no strangers, no other
  party, no hazard, and not the pit/pool, and it doesn't stop for unguarded treasure. You can't chase a
  party that's cleanly disengaged.
- **Engine:** `retreatFromParty(seat, dir)` at a round boundary ends the PvP session for that seat,
  leaves behind any dropped treasure and its fallen members' carried items (I-12), and grants a
  **double-move token** consumed only if the first flight-turn stays "clean" (guard-checked against the
  provisos). The pursuer gets **no** free follow-up; if it wants to give chase it must spend its own
  turns and re-establish co-location (and can't claim surprise — it's following). Peter's RTS analogue
  (a brief invisibility/untargetable timer) maps onto the double-move grace.
- **UI:** *retreater:* "Retreat ▾ (by any exit)"; on a clean escape a "You broke away — extra move
  granted" banner. *Pursuer:* the fight surface closes with "«Red Talons» fled north"; no auto-chase.
- **UX:** disengagement is decisive and low-friction; nobody is trapped in an endless duel.

### I-12 · Treasure & artifacts after multi-party combat

- **Category:** Environment. **Sync:** Async (post-fight pickup / persisted loot).
- **Plain English:** Heavy treasure dropped to fight sits on the floor for the victor. A slain member's
  gear follows the **borne/carried** rule; the winners recover what they can, and anything left stays
  in the chamber for whoever comes next.
- **Engine (unifies the earlier loot analysis with borne/carried, plan ④/④a):**
  - **Heavy treasure** was dropped at fight start (`fightDrops`) and stays on the area; the **winning
    command** reclaims it into a post-fight pickup; a wiped side's share simply remains in `contents`.
  - **A slain member's items:** *carried* items **spill to the chamber floor** (`contents`, `200+tid`)
    and are lootable by the victor now and by any later party; *borne* items (Sword/Staff/Ring) go
    **down with the body** (locked; recoverable only if that member is somehow revived — not applicable
    once dead).
  - **If the whole losing party is wiped,** all its floor-spilled loot persists in the chamber (I-4);
    the victor may loot immediately, later parties find the rest.
  - **The Eye of God** left on a fallen carrier **curses** the losing party (already modelled via
    `eyeForsakenByDeath`); the winner may take the Eye from the floor (binding it to them) — this is the
    canonical way the Eye changes hands violently.
  - **Consumables** spent in the fight are discarded (not on the floor).
  - **Recruited-ally division** on a union win follows I-7.
- **UI:** the victor drops into the familiar pickup panel showing the spoils (own reclaimed heavy
  treasure + the fallen's carried items + any chamber treasure), each tagged by origin. Borne items on a
  corpse are shown greyed/locked ("borne — lost with «Hero»"). Later visitors see the residue as
  ordinary floor loot (I-4).
- **UX:** winning a fight *feels* rewarding (immediate spoils) without a fiddly redistribution chore —
  the backpack/slots model (④) does the sorting.

### I-13 · Multiple parties in a chamber that contains strangers

- **Category:** Mixed (the key permutation). **Sync:** Async; any fight is per-party unless unioned.
- **Plain English:** The **first** party to enter a fresh chamber draws and deals with the strangers;
  later parties inherit whatever remains. While a party is mid-fight with strangers, **no rival may
  attack it, trade, loot, or pass** through that chamber — the only way to get involved is to **union**
  with the fighting party (forfeit a turn, under its command).
- **Engine:** stranger encounters/fights are **per-party** against the shared area. A party's active
  stranger-fight sets an **area interaction guard** (`fightInProgress(area, seat)`) that: blocks PvP
  attacks on that seat (I-9 legality mask already excludes stranger-chambers), blocks trades/loot by
  others in the area, and blocks pass-through — **except** a `joinFight(newSeat)` that forms a union
  with the combatant. Strangers pacified/retreated-from are **per-seat** relationships (`pacifiedAreas`,
  `hostileAreas`), so a chamber one party found "permanently indifferent" may still be hostile to
  another. Unresolved strangers left by a departed party remain parked and are re-encountered fresh by
  the next party.
- **UI:** *fighting party:* the normal stranger fight surface. *Co-located rival:* the chamber shows
  "«Red Talons» are fighting the Ogres — [Join their union] or wait"; loot/pass buttons are disabled
  with a reason. *Uninvolved:* nothing.
- **UX:** avoids chaotic free-for-alls (rules-faithful) while still offering the dramatic "ride to the
  rescue" via union. Only the co-located rival is even mildly gated, and only from *interacting* — they
  can still leave the way they came.

### I-14 · Special chamber cards, multi-party consistency

- **Category:** Environment. **Sync:** Async, with per-card constraints.
- **Plain English:** The special areas behave for every party exactly as in solo, with a few
  inter-party constraints made explicit.
- **Engine, card by card:**
  - **Gateway** — shared entry/exit (I-2, I-17). Multiple occupants fine. PvP allowed here (not a
    pit/pool/stranger chamber) — a dramatic "brawl at the threshold."
  - **Deep Pool** — each party crosses independently; a party stands on the island/doorway per its own
    crossing state (Peter's precise positioning, plan ③). **PvP is illegal** while either party is in
    the pool. Heavy treasure cast in is on the shared `dropped` pile, **Giant-only** to recover — for
    *any* party with a Giant, first-come. Voluntarily-dropped floor items on the pool tile follow I-4.
  - **Viper Pit** — as the pool: independent crossings, island/doorway positioning, **PvP illegal**
    inside.
  - **Great Hall / Tomb of Kings** — extra small-card draws happen **once**, for the first party to
    enter (like any chamber); later parties inherit the remainder. Otherwise normal; PvP legal only if
    no strangers/Medusa/trap/ghouls remain.
  - **Trap chambers** — a trap that has already sprung for one party doesn't re-drop others unless
    freshly drawn; PvP is illegal while a trap marker is live in the area.
- **UI:** special-area affordances (cross/withdraw) are per-party; the map shows each party's exact
  spot (island vs doorway). Illegal-PvP tiles grey the Attack button with the reason.
- **UX:** consistent, legible, no surprises; the positioning precision removes the "who is where on the
  Deep Pool?" ambiguity Peter flagged.

### I-15 · A party is fully killed (wiped)

- **Category:** Terminal. **Sync:** Async.
- **Plain English:** When every creature in a party is dead (or stone), that party is out — but its
  gear and corpses remain in the Cave for others, and (optional variant) it may return as spoiler
  zombies.
- **Engine:** on wipe the seat goes `status: "wiped"`, score frozen (0 or its escaped-only value —
  wiped scores 0), turn rotation **skips** it, the game-end check runs (all seats terminal → finished).
  Its **carried** loot has already spilled to the chamber(s) (I-12); **borne** items rest on the
  corpses in the area (for the zombies variant, corpses matter; otherwise borne items are simply lost).
  Other parties entering find the spilled loot (I-4).
  - **Zombies option (Phase 7):** instead of removal, the wiped player forfeits one turn, then their
    last-fallen creature reanimates as a **zombie party** (spoiler): moves on the player's turn, absorbs
    corpses it enters, can't carry/use treasure, ignores Medusa/vipers/ghouls, can't cross water, uses
    only physical strength, may union with other zombies, and is annihilated if the Sorcerer dies.
    Zombies re-animate one full controller-turn after being "killed" if the main zombie body is still in
    the area.
- **UI:** *wiped player:* the per-party game-over/score screen → the multiplayer scoreboard (spectate
  read-only or leave), and — if zombies are on — a "Rise as zombies?" option. *Others:* the rival's
  tokens vanish (or turn to zombie tokens); its dropped loot lights up as lootable. *Turn banner* never
  stalls — the dead seat is skipped instantly.
- **UX:** elimination doesn't bench a player (scoreboard + spectate + optional zombie mischief), and
  never delays the survivors.

### I-16 · A party is petrified (Medusa) — multi-party facets

- **Category:** Terminal/partial. **Sync:** Async.
- **Plain English:** Medusa turns living flesh to stone; only *carried* goods are salvageable. In
  multiplayer a rival can loot a downed party's carried items, and only the owning party's Wizard+Staff
  (in that chamber) can restore the stone members.
- **Engine (extends plan ④a and the petrification model):**
  - On petrification, a member's **carried** items drop to **Medusa's chamber floor** (`contents`), its
    **borne** items petrify with it (locked); `moveTreasure`/`dropTreasure` from a `status:2` member are
    blocked, so the party can't cart a stone comrade's goods away.
  - **Inter-party looting:** because carried items are now on the shared floor, a **rival** in the
    chamber may pick them up (I-4) — this is how a downed rival's Charmed Flute or Lost Ruby changes
    hands. The stone bodies themselves cannot be moved (rulebook: "her victims cannot be moved").
  - **Revival is owner-scoped and chamber-scoped:** only the **owning party's** living Wizard bearing
    the Magic Staff, **in that chamber** (`stoneArea === partyArea`), revives its stone members
    (`reviveStoned` / Magic-Staff action — both already gate on the chamber, verified). A rival's Wizard
    does **not** auto-revive another party's members (they're not that Wizard's party); a rescue would
    have to route through a **union** (I-6) so the members share a command. On revival the member's
    **borne** items un-petrify with it (they never left `m.treasure`).
  - If a whole party is petrified with no revival route, it is terminal (`wiped`) at game end.
- **UI:** *victim party:* stone members shown greyed on the tile with a "borne items locked · carried
  items on the floor" note and, if a Wizard+Staff is present in-chamber, a Revive action. *Rival in
  chamber:* the petrified party's carried items appear as floor loot to take. *Others:* map shows stone
  tokens.
- **UX:** petrification becomes a genuine multiplayer event — rivals scavenge the fallen, allies (via
  union) mount rescues — without any turn-blocking.

### I-17 · A party escapes to the surface

- **Category:** Terminal. **Sync:** Async.
- **Plain English:** A party climbing out via a level-1 up-stair leaves for good and banks its score;
  everyone else plays on until all parties are terminal.
- **Engine:** `exitCave` sets `status: "left"`, freezes the score, records it to the multiplayer
  high-score table, and **removes the seat from turn rotation**; the game-end check runs. Departure is a
  pure per-party terminal event — **it never blocks or hurries anyone**. Loot the escaping party carried
  is gone with them (scored); anything it left in chambers stays (I-4).
- **UI:** *leaver:* the confirm ("once you leave you cannot return") → personal score → scoreboard
  (spectate/leave). *Others:* the token exits at the Gateway/up-stair; the turn banner simply stops
  offering that seat. *Live scoreboard* (Phase 5) shows them "escaped — final N pts" while the rest
  play on.
- **UX:** the Counter-Strike-style finish (plan §8): finishing early drops you to a live scoreboard with
  read-only free-roam spectating, so leaving isn't leaving the *social* game.

### I-18 · Secret-door knowledge sharing

- **Category:** Information. **Sync:** Async (a one-way grant).
- **Plain English:** Knowing a secret door is **per party**. You learn one by exploring its stairway,
  by being shown it by a knowledgeable party in the same area, by being present when another party uses
  it, or via the Charmed Flute. (Plan ⑥ additionally proposes a house-rule variant that makes a visible
  secret door usable by anyone who can see it.)
- **Engine:** secret-door knowledge is a **per-seat set** of area coords. Granting is a one-way,
  non-blocking mutation: `showSecretDoor(fromSeat, toSeat, coord)` (both co-located) adds to `toSeat`'s
  set; using a door while a rival is co-located auto-grants it to that rival; the Flute grants on use.
  No consent handshake needed (it's a gift, harmless to the giver). Under the plan-⑥ variant this whole
  per-seat gating is replaced by "visible ⇒ usable."
- **UI:** *shower:* a "Show «Red Talons» the secret door" action when co-located on a known secret-door
  tile. *Recipient:* a toast "«You» were shown a secret stair here" and the stair becomes usable on
  their map. *Others:* unaffected.
- **UX:** a cheap, friendly cooperative gesture with zero wait.

### I-19 · Sorcerer bonus split

- **Category:** Scoring. **Sync:** Async (settled at scoring).
- **Plain English:** The 30-point Sorcerer bounty is split equally among parties that **combined** (via
  union) to defeat him.
- **Engine:** when the Sorcerer is slain in a **union** fight, record the contributing seats; at scoring
  divide the 30 equally among them (extends `sorcererKilled` to a `sorcererSlainBy: seat[]`). A solo
  slayer keeps the full 30. Curses from a failed Sorcerer attack fall on the attacking command's
  members as today.
- **UI:** the results screen shows "Sorcerer bounty +15 (shared)" on each contributing party's
  breakdown. No in-play interaction.
- **UX:** rewards cooperation transparently at the end; nothing to coordinate live.

---

## 3. Synchronisation matrix (wait-minimisation summary)

| Interaction | Runs on | Who waits on a human | Bound / timeout default |
|---|---|---|---|
| Explore, move, draw (Tier A) | own thread | nobody | deck draw is atomic, sub-perceptible |
| Shared occupancy / entering (I-1..I-4) | own thread | nobody | — |
| Trade (I-5) | 2-seat session | the two traders | 60 s → offer expires (declined) |
| Union form (I-6) | union session | invitees | 60 s → refuse |
| Union operate (I-7) | union, commander's turn | members (by choice) | leave at any boundary |
| Division guard defence (I-8) | triggered session | owner (optional) | 45 s → guards auto-defend |
| PvP attack (I-9) | 2-command session | defender | 45 s → auto-defend |
| PvP round (I-10) | combatants | the responding side | 45 s/round → strongest-fights-strongest + auto-roll |
| Retreat (I-11) | own thread | nobody | — (grants tempo, no chase) |
| Post-combat loot (I-12) | own thread | nobody | — |
| Strangers + rivals (I-13) | per-party | nobody (rival opts in) | — |
| Special chambers (I-14) | own thread | nobody | — |
| Wiped / petrified / escaped (I-15..I-17) | own thread | nobody | dead seats skipped instantly |
| Secret-door share (I-18) | own thread | nobody | — |
| Sorcerer split (I-19) | scoring | nobody | — |

**Rule of thumb:** a player only ever waits on another player inside a session they *chose* to enter
(trade/union/PvP), the wait is capped by a reaction window, and every window has a safe auto-default.
Everything else — the vast majority of play — is fully concurrent.

---

## 4. Core state machines

**Interaction session (generic).** `PROPOSED → (ACCEPTED | EXPIRED/DECLINED) → ACTIVE → (COMMITTED | ABORTED)`.
Membership is fixed at creation to the participating seats; the session holds an area-scoped lock on
those seats' ability to *wander off mid-interaction* only — not their existence, not other seats.

**PvP fight loop (I-9/I-10).**
```
declareAttack → session(ACTIVE, surprise?) 
repeat:
   round(active side):
     layout(defender-line → attacker-engage → defender-casters)
     resolve(matches, each side rolls own RNG; apply mods; slay strongest of loser; tie=none)
     handle casualties (eyeForsakenByDeath, casualty-choice roll)
   check end: side wiped → terminal(loser); side retreats(I-11) → session ends, tempo grant;
              both agree stop → session ends; else swap active side, open reaction window
```

**Union (I-6/I-7).**
```
propose(commander) → each invitee: accept(window)|refuse
on all-accept: members.forfeitNextTurn; union.active
commander turn: move/act combined (strongest-fights-strongest enforced)
member: leave(at boundary, not mid-fight) | refuseMove | defendIfAttacked
dissolve: allocate recruited allies (handshake) | disagreement→allies neutral until fight→join victor
```

---

## 5. Staging & open questions

- **MVP (plan Phase 1–4, beginner ruleset):** implement I-1, I-2, I-3, I-4, I-13 (co-existence only —
  no PvP/union/trade), I-14, I-15 (removal, no zombies), I-16 (own-party petrification/loot), I-17, and
  I-19 as a no-op (solo Sorcerer only). This is a complete, fun competitive race with zero
  human-on-human blocking.
- **Phase 6 (advanced):** I-5 trading, I-9/I-10 PvP, I-11 retreat, I-12 violent loot, I-13 join-fight,
  I-18 knowledge sharing, I-8 guards, I-19 shared Sorcerer bounty.
- **Phase 7 (optional):** I-6/I-7 unions, division proper, zombies (I-15), and the hidden-cards
  fog-of-war variation (with Peter's fog-of-war-lite, plan ⑦, as an earlier cheaper option).
- **Open questions (for confirmation):**
  1. Reaction-window durations and the disconnect grace cap (defaults proposed above).
  2. Whether the plan-⑥ "visible secret door is usable" variant is the default (simpler) or the strict
     per-discoverer rule (I-18) is.
  3. Whether trading creatures (allies) is allowed in the MVP or held to Phase 6 with the rest of trade.
  4. Concurrency granularity: is exploration fully concurrent (Tier A, plan ①) from Phase 4, or does the
     MVP keep a strict round-robin and introduce concurrency in a later pass? (Recommendation: ship
     concurrent from Phase 4 — it's the whole point of answering Peter's tedium objection.)
  5. PvP in the Gateway — allowed (dramatic) vs. barred as a "safe zone"? (Rules allow it; proposed:
     allow.)
