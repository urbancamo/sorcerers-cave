export const GS_PLAYING = 0;
export const GS_ESCAPED = 1;
export const GS_DEAD = 2;
export const GS_QUIT = 3;

// No party-size cap: the original rules impose no maximum on how many creatures a party may hold
// (a friendly group is always added in full). The only natural bound is the finite small pack.
export const PARTY_BUDGET = 6;
export const GATEWAY_START_COORD = 15050; // level 1, x=50, y=50

// Area-flag (PlacedArea.flags) bits.
export const AF_DESTROYED = 4; // collapsed by an earthquake — removed from play, impassable
// Extension kit (SC-EXT-8): the Bell Rope on this area has been pulled — once per tile ever, so the
// `pullBellRope` action is never offered again here, on this visit or any later one (design US-03).
export const AF_BELL_SPENT = 8;
// Extension kit (SC-EXT-28): this area holds a card the Spell hazard remapped in — a freshly-drawn
// value swapped in for the tunnel the party just left, not yet stepped on (design US-22). Marks the
// area for the renderer to show face-down until then; carries no engine meaning of its own (the
// replaced area's `visited:false` already gates its OWN real first-visit resolution — chamber draw,
// mirrored-stair treatment on entry — through the ordinary `tryMove`/`resolveArea` path). Cleared the
// moment the party's `resolveArea` next lands on this area (whether that resolves it as a tunnel or a
// chamber) — see reduce.ts.
export const AF_UNRESOLVED = 16;

// Interactive mode: which controls the UI shows and which actions reduce accepts.
// Milestone B uses only "explore" and "gameOver"; "encounter"/"fight"/"pickup" arrive in C.
// "medusa" is the pre-hazard pause: Medusa looms and the party holds Lotus Dust — throw or proceed.
export type GamePhase = "explore" | "medusa" | "encounter" | "fight" | "pickup" | "gameOver";

// Member status: 0 original, 1 ally, 2 stone, 3 dead.
export type MemberStatus = 0 | 1 | 2 | 3;

export interface PartyMember {
  creatureId: number;
  status: MemberStatus;
  dragonKills: number;
  treasure: number[]; // treasure ids carried
  // Items the member is BEARING (wielded/worn/displayed) rather than merely carrying — a subset of
  // `treasure` by id (only the Magic Sword 3, Magic Staff 9 and The Ring 10 have a borne mode).
  // Passive combat effects stay possession-based; `borne` governs only what happens to the item when
  // the flesh fails: a borne item is petrified/lost WITH the body, a carried item spills to the floor
  // (§Medusa "anything they were carrying can be taken", multiplayer plan ④a). Absent = all carried.
  borne?: number[];
  potionActive?: boolean; // Strength Potion drunk this fight (+2 frontStrength until it ends)
  // Extension kit (SC-EXT-22, design US-19): a PERMANENT frontStrength bonus — currently only ever
  // +2, from an Elixir 4-6 draught, but kept as an accumulating number (not a boolean) in case a
  // later source stacks. Unlike `potionActive` (one fight only), this rides on the member forever —
  // read by `frontStrength` (combat.ts) so it composes into every fight, Quarrel's effective-fs
  // ranking, and the strongest-member auto-slay pick alike, for free. NOT nullified by the Eye of
  // God (it is a permanent trait of the flesh, like `dragonKills`, not an artefact's magic).
  fsBonus?: number;
  stoneArea?: number; // when petrified (status 2): the area index where Medusa struck — the member is
                      // left there until a Wizard with the Magic Staff returns to free it (§Medusa).
  // Multiplayer-only identity tag ("loan:<seat>" | "recruit:<unionId>") — lets the union layer
  // re-derive a loaned/recruited member's position after solo actions that reshape the party array
  // (Mutiny SPLICES deserters out, so stored indices go stale). Solo play never reads or writes it.
  mpTag?: string;
}

export interface PlacedArea {
  card: number; // area-card value
  coord: number; // packed level*10000 + y*100 + x
  faceUp: boolean; // entered (true) vs dead-end face-down (false)
  visited: boolean; // chamber already drawn
  contents: number[]; // leftover 100+cid / 200+tid (Milestone C)
  flags: number; // AF bits (Milestone C)
  indiffCount: number; // AI permanent-indifference counter (Milestone C)
  dropped?: number[]; // heavy treasure ids left in a Deep Pool, reclaimable on return (§10.2)
  // Precise Locations (§10.5): treasure deliberately CAST onto any of the four special areas (Deep
  // Pool, Viper Pit, Whirlpool, Chasm), bucketed by the sub-location it was cast from — a doorway
  // direction (DIR_N..DIR_W) or the island (subLocation.ts). Distinct from `dropped` above (Deep
  // Pool's automatic, un-bucketed heavy-treasure-left-behind-on-crossing pile, §10.2) — this is the
  // separate voluntary-drop mechanic (§8.3 fix: `dropTreasure` never special-cased these tiles at
  // all before). Recovery is gated per area: Giant-only for Deep Pool (mirrors `dropped`), a
  // Charmed-Flute-eligible carrier for Viper Pit, unrestricted for Whirlpool/Chasm (the rulebook
  // names no creature gate for either) — see reduce.ts's resolveAreaLoop and chamber.ts's
  // enterChamber.
  sunkTreasure?: { at: "island" | 1 | 2 | 3 | 4; items: number[] }[];
  markers?: number[]; // display-only hazard cards left on the tile (300+hid), e.g. an Earthquake scar — never re-fire
  // Stair bits (32=up, 64=down) added for level connectivity on descent/carpet, NOT printed on
  // the card. They keep `card` traversable both ways but are excluded from rendering, so the tile
  // is always drawn in its printed orientation (the original game links levels with markers).
  mirroredStairs?: number;
  // Set when the party descended onto this area and it shows no printed stair up: its end of the
  // stairway is a secret door (§"Secret Doors"). The 0-based value is its discovery order (→ A, B, C…).
  secretDoor?: number;
  // Lotus Dust was thrown at this chamber's Medusa: she sleeps while the thrower's `turn` counter is
  // <= this value ("asleep for 2 turns of the player who uses it", §Lotus Dust) — entries meanwhile
  // draw no gaze. Cleared (she wakes) on the first entry after it lapses.
  medusaAsleepUntil?: number;
}

// surprise: +1 party, -1 strangers, 0 none (applies to round 1 only). focus indexes `strangers`.
export interface FightState {
  surprise: number;
  round: number;
  focus: number;
  // Pending casualty choices from the round just fought: each entry is a pair of party indices
  // who lost a match together; the player picks which of the two falls (§"A Round of Fighting").
  casualtyQueue?: number[][];
  // A retreat this round hit a dead end (§Retreat): no further retreat may be tried — the party must
  // fight another round. Cleared when a round is actually fought.
  retreatBlocked?: boolean;
}

/** One pairing in a battle plan: party fighters (front), supporting casters (backers), and the
 *  stranger(s) they engage. `strangers` holds two only for a 1-against-2 (a lone front fighter). */
export interface PlanMatch {
  front: number[];     // 1–2 living party indices fighting hand-to-hand
  backers: number[];   // caster party indices lending magical power to this match
  strangers: number[]; // 1–2 stranger indices engaged
}

/** A player's pairing for one round of fighting (§FIGHTS "Setting up the Fight"). */
export interface BattlePlan {
  matches: PlanMatch[];
}

export interface GameState {
  gs: number; // GS_*
  phase: GamePhase; // interactive mode (UI controls + valid actions)
  turn: number;
  score: number;
  curses: number;
  bonusScore: number; // banked points (e.g. Treasure Chest loot) added at scoring
  sorcererKilled: boolean;
  areas: PlacedArea[];
  partyArea: number; // index into areas
  level: number;
  prev: number; // previous area index
  prev2: number; // area two moves back (earthquake)
  party: PartyMember[];
  largePack: number[];
  largeIdx: number;
  smallPack: number[];
  smallIdx: number;
  strangers: number[]; // chamber working set (Milestone C)
  treasures: number[];
  hazards: number[];
  sleeping?: number[]; // creatures put to sleep by Lotus Dust — inert, no longer block the party
  lulled?: number[]; // Dragons lulled by the Charmed Flute — asleep ONLY while the party holds it,
  // so they're re-evaluated on each chamber entry (parked awake; re-lulled if the flute is still held)
  seed: number; // LCG state (spec §5)
  fight: FightState | null;
  // True while the party's current position was reached by a one-way trap fall: prev is the level
  // above, which is unreachable, so withdraw/retreat are disallowed. Cleared on the next move.
  fellThroughTrap?: boolean;
  // Precise Locations (§10.5): an explicit override for the one same-tile sub-location shift the
  // engine can't derive from geometry alone — the party jumped from a doorway onto a Viper-Pit/
  // Deep-Pool island (Peter's house rule, `jumpToIsland`) without partyArea/prev changing. Valid
  // only while `area === partyArea`; every real move invalidates it (cleared in the "move" case,
  // relocateDown and carpetMove) so a stale entry never survives a later revisit. See
  // subLocation.ts's `getSubLocation`, which everything else reads through.
  subLocation?: { area: number; at: "island" };
  // True only for the turn the party freshly enters a chamber with strangers by an unused doorway
  // or magic carpet (NOT a trap fall): the party gains the advantage of surprise if it attacks now.
  // Cleared once the party tests reaction (no longer an immediate attack) or the fight begins.
  surpriseReady?: boolean;
  // Count of secret doors discovered so far — lays them in order (A, B, C…).
  secretDoors?: number;
  // Lotus Dust has been used on the Sorcerer (he can't be slept, only weakened): −2 to his Strength.
  lotusOnSorcerer?: boolean;
  // Extension kit (SC-EXT-24, design US-20): Holy Water's WEAKEN mode has been used on the Sorcerer
  // or an Apprentice — −2 mp for the rest of the game, stacking with Lotus Dust/Eye of God (each a
  // separate flag summed by `enemyMP`, combatPlan.ts, mirroring how Eye+Lotus already stack today),
  // floored at 0. Two separate flags (not one) because Holy Water can weaken EITHER target, but only
  // once ever — it is a single-use artifact — so at most one of the pair is ever true in a game.
  holyWaterOnSorcerer?: boolean;
  holyWaterOnApprentice?: boolean;
  // Set while phase === "medusa": the entry is held mid-resolution (hazards not yet fired) for the
  // throw-or-proceed decision. `freshEntry` preserves the first-visit flag for the resumed tail
  // (surprise eligibility, Dragon-lull announcement) — it can't be recomputed after enterChamber.
  // Extension kit (SC-EXT-7/8, SC-4-16 fix): `extraDraw` is set instead when the pause was opened by
  // a Well/Bell draw into an ALREADY-entered chamber (never a fresh entry) — it carries the
  // `surpriseReady` captured before the draw, so the resumed tail can restore it rather than let
  // `finishChamber`'s default recompute clobber it, and forces the Dragon-lull notice on regardless
  // of chamber freshness (a drawn Dragon is new information either way).
  medusaPause?: { freshEntry: boolean; extraDraw?: { hadSurprise?: boolean } };
  // Indifference (per party — NOT on the shared area, so it never affects other parties; §Encountering
  // Strangers, SC-4-18a, bug fix 2026-08-04). `indiffCounts` is the DURABLE count of indifferent
  // results this party has gotten from this area's strangers, keyed by area index — it persists
  // across visits ("they remember forever how many times your party has approached them ... even if
  // you went away in between," Peter's clarification) up to the permanent-indifference cap of 3.
  // `indiffStreak` is the LIVE working copy for the CURRENT chamber visit, restored from
  // `indiffCounts` on every entry (chamber.ts's `enterChamber`) the same way `strangers`/`treasures`
  // are restored from `area.contents` — so a party that tests indifferent once, leaves, and comes
  // back later resumes counting from where it left off, rather than starting over at 0. When the
  // count reaches 3 the strangers become permanently indifferent to this party: `pacifiedAreas`
  // records that area's index so re-entry skips the encounter entirely. A pacified party may leave by
  // any exit but still cannot loot the (guarded) treasure without attacking.
  indiffStreak?: number;
  indiffCounts?: Record<number, number>;
  // The one-shot "may leave by any doorway, forfeiting treasure" privilege (§Encountering Strangers,
  // SC-4-18a): set true only by a `test` that resolves indifferent with the count still under 3, and
  // consumed/forfeited by the next thing that happens — a successful leave (moot, the party has left),
  // a dead-end leave attempt (explicitly cleared — "finds itself delayed by a dead end ... must in the
  // same turn either test the strangers again or attack them"), or a fresh `test`/re-entry (which
  // recomputes it from scratch). NOT a standing condition of `indiffStreak >= 1` — mirrors
  // `surpriseReady`'s existing one-shot-flag precedent (SC-4-16). Reset false on every chamber entry,
  // fresh or reload alike — re-entering an area always requires a fresh test/attack first, however
  // high its durable count already is.
  indiffLeaveOpen?: boolean;
  pacifiedAreas?: number[];
  // Extension kit (SC-EXT-19, review fix): the SUBSET of `pacifiedAreas` pacified by the
  // womanless-Unicorn-guard case (§Unicorn) rather than by indifference. Design US-17 is explicit —
  // "pacified BY INDIFFERENCE" — so the Thief's pickup-unlock (`settlePacifiedArea`, reduce.ts) must
  // exclude these areas even though they share the same generic `pacifiedAreas` re-entry gate;
  // recorded only at the one site that sets it (the `test` action's friendly-Unicorn branch), so a
  // kit-off or Unicorn-less game never gains this field. Default absent/`[]` = none.
  unicornGuardAreas?: number[];
  // Areas this party retreated from: those strangers stay hostile to it for the rest of the game
  // (§Retreat) and attack on sight if the party returns. Per-party; other parties are unaffected.
  hostileAreas?: number[];
  // Heavy treasure dropped to the floor by front-line fighters this fight (§387), with the member that
  // dropped each — lets the won-fight pickup offer "retake as distributed before" in one step.
  fightDrops?: { mi: number; tid: number }[];
  // Solo game variants (§EXT), fixed at `newGame` for the whole game — mirrors `MpGameState.variants`
  // (multi.ts:133). Absent/false ⇒ today's behaviour, byte-identical (SC-EXT-1). Immutable thereafter;
  // no reducer path ever writes it.
  variants?: { extensionKit?: boolean };
  // Extension kit (SC-EXT-9): the turn number `withdraw` is blocked for — set by a Well draw or a
  // Bell Rope 4-6 roll (design US-03/US-07), alongside `fellThroughTrap` on the same legality check.
  // `turn` only advances on `move`, so this self-invalidates once the party moves on — no explicit
  // reset needed, and it re-arms cleanly if the SAME turn draws again.
  noWithdrawTurn?: number;
  // Extension kit (SC-EXT-10): the Gallery's chamber working set of creatures drawn there as
  // statues — inert scenery (no reaction test) unless woken (Staff auto-wake, SC-EXT-11; Holy
  // Water single-statue wake, Task 13). Persists across exit/re-entry as 500+creatureId content
  // codes on the area (pattern: `sleeping`'s 400+id). Reset to `[]` only on a Gallery entry — stays
  // undefined for every other chamber, so a kit-off (or Gallery-less) game never gains this field
  // (SC-EXT-1 byte-identity).
  statues?: number[];
  // Extension kit (SC-EXT-12): the coordinate of the Lair once its tile has been placed AND
  // entered (design US-04) — the permanent destination for all Harpies thefts, past and future.
  // Undefined until then; set once, in `chamber.ts`'s `enterChamber`.
  lairCoord?: number;
  // Extension kit (SC-EXT-12): treasure ids stolen by Harpies (Task 9), queued here until the Lair
  // itself turns up on the map. Spilled onto the Lair's floor (as ordinary 200+tid contents) the
  // moment it is placed and entered, or delivered straight there via `stashOrDeliver` if the Lair
  // already exists (`chamber.ts`). Empty/absent ⇒ no pending stash.
  harpyStash?: number[];
  // Special-areas revision (2026-08-08, SC-10.5-16): treasure dropped into a Chasm or Whirlpool
  // falls through to the level below rather than sinking in place — keyed by the TARGET area's
  // packed coordinate (unlike `harpyStash`'s single well-known Lair destination, any number of
  // distinct Chasm/Whirlpool tiles can each have their own pending target). Delivered onto that
  // area's `contents` (as ordinary 200+tid codes) the moment it is genuinely entered — placed
  // doesn't count on its own, matching `lairCoord`'s own "placed AND entered" bar — whether that
  // happens via the party's own exploration or because the drop is delivered immediately (the
  // target was already visited at drop time). Absent/`{}` ⇒ nothing pending. In this solo-shaped
  // type it's per-GameState like every other field here — but MULTIPLAYER threads it as a
  // CAVE-SHARED field (multi.ts's `CaveState.pendingDrops`), matching `sunkTreasure`'s own
  // cave-shared precedent for Deep Pool/Viper Pit (SC-10.5-12): a drop is a fact about a specific
  // physical map coordinate, so whichever seat reaches it first should find it, unlike the
  // genuinely per-seat Lair/Harpies bookkeeping `harpyStash` represents.
  pendingDrops?: Record<number, number[]>;
  // Extension kit (SC-EXT-13): the packed coord of the area holding an unresolved, parked Crypt
  // (design US-08) — set once, the moment the Crypt/Gems treasure card (id 21) is freshly drawn
  // from the small pack (`chamber.ts`'s `classify`), and cleared the instant `enterCrypt` resolves
  // it (either outcome — no second entry). There is exactly one Crypt/Gems card in the kit's small
  // pack, so at most one crypt ever exists in a game; tracking it as a single coordinate (mirroring
  // `lairCoord`) rather than a chamber-working-set bucket means it needs no persistence dance across
  // visits — `enterCrypt`'s legality is simply "am I standing where `cryptCoord` points, at rest".
  // Undefined ⇒ no crypt has been drawn yet, or the one that was has already been resolved.
  cryptCoord?: number;
  // Extension kit (SC-EXT-19): true while `phase === "pickup"` is a Thief-unlocked session over
  // treasure an indifference-pacified area's strangers would otherwise still guard (design US-17)
  // — set by `reduce.ts`'s `settlePacifiedArea`, read by `takeTreasure` to narrate each lift
  // ("The Thief palms the [item]."), and cleared (`delete`) the moment `persistAndExplore` next
  // runs. Undefined for every ordinary pickup (won fight, floor find, Deep Pool, Lost Ruby, …) and
  // for every kit-off game (SC-EXT-1 byte-identity).
  thiefPickup?: boolean;
  // Test Mode (§Test Mode): set only by `newGame(..., testMode: true)`; never toggled mid-game.
  // Gates the four test-* actions (reduce.ts) — every other game rejects them with `blocked`.
  testMode?: true;
  // Armed by `testPlaceArea`; consumed by the next fresh-draw `move` in this exact direction
  // (map.ts's `tryMove`), which always connects regardless of the special's printed orientation.
  testNextArea?: { dir: number; special: number };
  // Armed by `testSetChamber`; consumed by the next chamber freshly entered by any means (an
  // ordinary move, the Magic Carpet, a trap fall, a Chasm descent — chamber.ts's `enterChamber`).
  // Replaces the normal smallPack draw; smallIdx is left untouched.
  testNextChamber?: { strangers: number[]; treasures: number[]; hazards: number[] };
  // Armed by `testForceReaction`; consumed by the next `test` (reaction) action in place of
  // reactionRoll's die.
  testNextReaction?: "friendly" | "indifferent" | "hostile";
}
