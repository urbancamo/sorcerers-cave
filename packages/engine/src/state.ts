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
  // True only for the turn the party freshly enters a chamber with strangers by an unused doorway
  // or magic carpet (NOT a trap fall): the party gains the advantage of surprise if it attacks now.
  // Cleared once the party tests reaction (no longer an immediate attack) or the fight begins.
  surpriseReady?: boolean;
  // Count of secret doors discovered so far — lays them in order (A, B, C…).
  secretDoors?: number;
  // Lotus Dust has been used on the Sorcerer (he can't be slept, only weakened): −2 to his Strength.
  lotusOnSorcerer?: boolean;
  // Set while phase === "medusa": the entry is held mid-resolution (hazards not yet fired) for the
  // throw-or-proceed decision. `freshEntry` preserves the first-visit flag for the resumed tail
  // (surprise eligibility, Dragon-lull announcement) — it can't be recomputed after enterChamber.
  medusaPause?: { freshEntry: boolean };
  // Indifference (per party — NOT on the shared area, so it never affects other parties):
  // `indiffStreak` counts consecutive indifferent reaction tests in the CURRENT chamber visit
  // (reset on each chamber entry). When it reaches 3 the strangers are permanently indifferent to
  // this party: `pacifiedAreas` records that area's index so re-entry skips the encounter. A pacified
  // party may leave by any exit but still cannot loot the (guarded) treasure.
  indiffStreak?: number;
  pacifiedAreas?: number[];
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
}
