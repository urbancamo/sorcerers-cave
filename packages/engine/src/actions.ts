import type { PlanMatch } from "./state";

// Player decisions. Multiplayer will later wrap these with a playerId.
export type GameAction =
  | { type: "move"; dir: number }
  | { type: "quit" }
  | { type: "exitCave" }
  | { type: "withdraw" }
  | { type: "takeTreasure"; ti: number; mi: number }
  | { type: "leaveTreasure" }
  | { type: "retakeDropped" } // (pickup, after a win) give each fighter back the heavy treasure it dropped to fight
  // Redistribute carried treasure (spec §"keep holdings… A player may redistribute treasure"):
  | { type: "moveTreasure"; from: number; to: number; idx: number } // give party[from].treasure[idx] to party[to]
  | { type: "dropTreasure"; mi: number; idx: number }               // drop party[mi].treasure[idx] onto the floor
  // Bear (wield/wear/display) or stow a borneable item — Sword/Staff/Ring only (plan ④a). Dispatched
  // by the party panel like moveTreasure/dropTreasure; never offered via legalActions.
  | { type: "setBorne"; mi: number; idx: number; borne: boolean }
  | { type: "test" }
  | { type: "attack" }
  | { type: "resolveRound"; matches: PlanMatch[] } // resolve one round from a player-supplied pairing
  | { type: "chooseCasualty"; idx: number } // pick which of a losing pair falls (§"A Round of Fighting")
  | { type: "retreat"; dir: number } // flee a fight by any doorway/stair; a dead end means fight on
  | { type: "useArtifact"; artifact: number; target?: number; dir?: number }
  | { type: "proceed" } // decline the Medusa-pause throw: let her gaze (and the other hazards) fire
  | { type: "openChest" }
  // Extension kit (SC-EXT-5): descend the Chasm — legal only on a SPECIAL_CHASM tile, in explore or
  // encounter phase (design US-02). No dice; reuses `relocateDown` (one-way, no mirrored stair-up).
  | { type: "descendChasm" }
  // Extension kit (SC-EXT-7): draw one small card into the Well's chamber (design US-07). Legal on
  // a SPECIAL_WELL tile with a non-empty small pack, in explore OR encounter phase; repeatable every
  // turn (Resolved interpretation 4) — no spent flag.
  | { type: "drawFromWell" }
  // Extension kit (SC-EXT-8): pull the Bell Rope (design US-03), naming the puller by party index
  // (the "member picker" — same `mi` convention as takeTreasure/dropTreasure/setBorne). Legal on a
  // SPECIAL_BELL_ROPE tile in explore OR encounter phase, for a living member, ONCE per tile ever
  // (AF_BELL_SPENT on the area).
  | { type: "pullBellRope"; mi: number }
  // Extension kit (SC-EXT-13): enter the parked Crypt (design US-08). Legal only at rest (`explore`
  // phase — "the start of any turn", not the Chasm/Well/Bell Rope's mid-encounter escape-hatch
  // latitude, since the design gives the Crypt no "legal mid-encounter too" note) while standing on
  // the area `state.cryptCoord` names. No target/dir — the crypt is a per-area singleton.
  | { type: "enterCrypt" };

// What happened — the reducer is the only producer; the UI never infers game facts.
// Encounter-resolution and fight events arrive with combat (Milestone C-2).
export type GameEvent =
  | { type: "moved"; area: number; level: number }
  | { type: "deadEnd"; dir: number }
  | { type: "blocked" }
  | { type: "planRejected"; reason: string } // the submitted battle plan broke a pairing rule
  | { type: "drewChamber"; strangers: number[]; treasures: number[]; hazards: number[] }
  | { type: "enteredSpecial"; special: number }
  | { type: "gameOver"; gs: number }
  | { type: "hazardFired"; hazard: number }
  // Allies deserted (Mutiny): they revert to strangers and drop their treasure into the chamber.
  | { type: "mutinied"; deserters: number[]; treasures: number[] }
  | { type: "medusaGaze"; rolls: { creatureId: number; roll: number; petrified: boolean }[] } // a d6 per member
  | { type: "viperPit"; rolls: { creatureId: number; roll: number; died: boolean }[] } // a d6 per member crossing
  | { type: "eyeForsaken" } // the Eye of God was dropped or handed off — a curse falls on the party
  | { type: "petrifiedOut" } // Medusa's gaze turned the WHOLE party to stone — the game ends
  | { type: "trapSprung"; level: number } // party fell through a trap to `level` (no climb back)
  | { type: "trapAvoided" } // a dwarf guided the party safely past a trap
  | { type: "memberDied"; creatureId: number }
  | { type: "strangerKilled"; creatureId: number }
  | { type: "sorcererSlain" } // the Sorcerer himself has been defeated — the cave's master is no more
  | { type: "spectreSlew"; creatureId: number }
  | { type: "memberRevived"; creatureId: number } // a stoned member freed by a returning Wizard's Magic Staff
  | { type: "reaction"; outcome: "hostile" | "indifferent" | "friendly"; roll: number }
  | { type: "pacified" } // a 3rd indifferent test — the strangers are now permanently indifferent to this party
  | { type: "strangersJoined"; count: number }
  | { type: "fightStarted"; surprise: number }
  // One resolved pairing in a fight round: the party side and the enemy side, each with its
  // raw d6 (`*Roll`) and modified total (`*Total`). The UI shows both rolls side by side.
  | {
      type: "combatRoll";
      party: string;
      enemy: string;
      partyRoll: number;
      enemyRoll: number;
      partyTotal: number;
      enemyTotal: number;
      result: "partyWon" | "enemyWon" | "tie";
    }
  | { type: "fightWon" }
  // A losing pair's casualty was decided: `roll` is the d6, `gotPreference` whether 4-6 honoured the choice.
  | { type: "casualtyChosen"; creatureId: number; roll: number; gotPreference: boolean }
  | { type: "crossedSpecial"; special: number }
  | { type: "treasureDropped"; count: number }
  | { type: "treasureReclaimed"; count: number }
  | { type: "artifactUsed"; artifact: number }
  | { type: "chestOpened"; result: number }
  | { type: "rubyTaken" }
  | { type: "statueAroused" } // the Lost-Ruby statue slew the member who tried to wrest it (labels the dice overlay)
  | { type: "wardedOff"; creatureId: number }
  | { type: "ghoulsWarded" } // a party member's Talisman turned the Ghouls away (card)
  | { type: "medusaAverted" } // a Wizard's Magic Staff turned Medusa's gaze aside — no one stoned (card)
  // The Medusa pause (§Lotus Dust "Works on MEDUSA"): the party entered her lair holding Lotus Dust,
  // so the hazards are held while the player decides to throw the dust at her or proceed.
  | { type: "medusaLooms" }
  | { type: "medusaSlept"; until: number } // the dust is thrown — she sleeps while the thrower's turn <= until
  | { type: "medusaAsleep" } // entered while she sleeps — no gaze this entry
  | { type: "droppedRetaken"; count: number } // fighters reclaimed the heavy treasure they dropped to fight
  | { type: "annihilated"; creatureId: number }
  | { type: "statuePowerless" }
  | { type: "deathPrevented"; creatureId: number }
  | { type: "unicornGuards"; creatureId: number }
  | { type: "unicornDeparted"; creatureId: number }
  | { type: "carpetUsed"; dir: number }
  | { type: "dragonsLulled"; count: number }
  | { type: "vipersLulled" }
  | { type: "secretDoorRevealed"; dir: number }
  // A downed (slain or petrified) member's CARRIED items spilled onto the chamber floor — borne items
  // stay with the body (§Medusa "anything they were carrying can be taken", plan ④a / I-12).
  | { type: "itemsSpilled"; creatureId: number; items: number[] }
  // Heavy treasure cast down at a PvP declaration (§388 "left on the area card until the issue is
  // decided", spec I-9). Distinct from treasureDropped, which is the DEEP POOL sinking — reusing
  // that type made the UI announce a pool where there was only a brawl. Emitted only by multi-fight.
  | { type: "heavyDownForFight"; count: number }
  // Extension kit special-area events (design US-02/US-05, SC-EXT-5/SC-EXT-6):
  | { type: "chasmDescend" } // the party chose to climb down the Chasm — a fresh card one level down
  | { type: "whirlpoolRoll"; roll: number; dragged: boolean } // crossing the Whirlpool's shallows: 1-2 drags the party down
  // Extension kit (SC-EXT-7): the Well drew one small card into the current chamber (design US-07).
  | { type: "wellDraw" }
  // Extension kit (SC-EXT-8): the Bell Rope's visible d6 and its band outcome (design US-03).
  // `creatureId` is the PULLER's creature id (not a party index — the index may go stale for
  // "vanish", where the puller is spliced out of `party` entirely). Deviates from the design brief's
  // literal `memberId` field name for consistency with every other id-reporting event in this union
  // (memberDied/memberRevived/itemsSpilled all key off `creatureId`); the VALUE is exactly what that
  // name described. 1 = vanish (Desertion semantics: removed with everything carried, not dead, not
  // revivable); 2-3 = toll (foreboding narration only, no mechanical effect); 4-6 = stir (two cards
  // drawn into the area, withdraw blocked this turn).
  | { type: "bellRoll"; roll: number; outcome: "vanish" | "toll" | "stir"; creatureId: number }
  // Extension kit (SC-EXT-10): the Gallery petrified some of THIS entry's freshly-drawn creatures
  // on sight (design US-06) — `creatureIds` lists only the newly-stoned ones, not statues reloaded
  // from an earlier visit (those produce no fresh notice).
  | { type: "galleryStone"; creatureIds: number[] }
  // Extension kit (SC-EXT-11): a living Wizard bearing the Magic Staff cracked every Gallery statue
  // awake on entry (design US-06 / Resolved-14) — they rejoin `strangers` as ordinary creatures.
  | { type: "staffWake"; creatureIds: number[] }
  // Extension kit (SC-EXT-12): Harpies-stolen treasure landed on the Lair's floor — either spilled
  // on the Lair's own placement/entry, or delivered straight there by a later theft (design US-04).
  | { type: "lairStash"; treasureIds: number[] }
  // Extension kit (SC-EXT-13): a Crypt/Gems card was freshly drawn and parked in this area (design
  // US-08 on-screen text: "A sealed crypt squats in the corner of this chamber."). Fired once, the
  // moment `classify` sets `cryptCoord` for a genuinely new draw — never on a reload/revisit.
  | { type: "cryptParked" }
  // Extension kit (SC-EXT-13): the Crypt's visible d6 and its band outcome (design US-08). 1-2 is an
  // unavoidable trap (whole-party `relocateDown`, no Dwarf exemption); 3-6 converts the parked crypt
  // into ordinary floor treasure id 21 (Crypt/Gems, ready for a normal carry-gated pickup).
  | { type: "cryptRoll"; roll: number; outcome: "trap" | "find" }
  // Extension kit (SC-EXT-14): one visible d6 for a status-1 ALLY rolled by Desertion (design US-09).
  // `creatureId` (not a party index — deliberately deviates from the design brief's literal
  // `memberId`, for the same post-splice-safety reason as `bellRoll.creatureId`, SC-EXT-8: a
  // deserting ally is spliced out of `party`, so an index would go stale). `deserted` true = removed
  // from the game outright, with everything carried (Bell Rope vanish semantics, SC-EXT-8). `items`
  // is a snapshot of the ally's carried treasure ids at roll time (design US-09 Feedback: "taking
  // [treasure list]") — present whatever the outcome, but only meaningful (and only ever shown) when
  // `deserted` is true; `[]` when they carried nothing.
  | { type: "desertionRoll"; creatureId: number; roll: number; deserted: boolean; items: number[] }
  // Extension kit (SC-EXT-14/18, design US-18): a Wolf was skipped by a hazard it's immune to —
  // Desertion's rolls, Medusa's petrify dice, or Mutiny's desertion — with its own visible notice
  // ("The Wolf is unmoved.") so the immunity is seen, not silent. `hazard` (a HAZARD_* id) names
  // WHICH hazard skipped it — review fix (Task 10): reusing the SAME bare event for all three
  // sites let a Medusa- or Mutiny-sourced skip masquerade as Desertion activity in the presentation
  // layer's derived "The party holds together." summary (`apps/web/eventNotices.ts`), which must
  // count only a Desertion-caused skip.
  | { type: "wolfUnmoved"; hazard: number }
  // Extension kit (SC-EXT-15): Harpies actually struck (design US-10) — every living member's
  // artifacts (borne AND carried alike) are gone. `treasureIds` is the full stolen list (never
  // empty — this only fires when the party DOES hold artifacts, the mirror image of the park
  // condition below); `cursed` is true when the Eye of God (13) was among them, invoking the
  // forsaken curse (`state.curses += 1`, design Resolved-8) — carried on this event, rather than
  // the base game's `eyeForsaken`, because the design mandates its OWN wording here ("The Eye of
  // God is torn away — its curse descends upon you."), distinct from a bearer's death.
  | { type: "harpiesSteal"; treasureIds: number[]; cursed: boolean }
  // Extension kit (SC-EXT-15): Harpies parked instead of striking — the party holds no artifacts,
  // or holds the Talisman (design US-10). The card keeps lurking in the area (Medusa/Ghouls
  // pattern, hazards.ts) and re-checks on every re-entry.
  | { type: "harpiesLurk" }
  // Extension kit (SC-EXT-16): Quarrel's one-round mini-fight (design US-11) between the two
  // highest effective-fs living members (Wolf 20 / Lion 16 excluded; ties by roster order). Both
  // dice are always shown, win or tie. `aId`/`bId`/`loserId` are creature ids, not party indices —
  // the loser's own death never removes them from `party` (status flips to 3, same as any other
  // death), so an index would stay valid too, but creature id keeps this event self-describing and
  // consistent with `bellRoll`/`desertionRoll`'s convention. `loserId` is null on a tie (no harm).
  | { type: "quarrel"; aId: number; bId: number; aRoll: number; bRoll: number; loserId: number | null }
  // Extension kit (SC-EXT-16): Quarrel drew but found fewer than two eligible combatants (Wolf/Lion
  // excluded, dead/stone members ineligible) — it fizzles with no roll and no effect.
  | { type: "quarrelFizzled" }
  // Extension kit (SC-EXT-28): the Spell hazard's remap-on-draw (design US-22). `fizzled` is true
  // when `prev` wasn't an eligible un-destroyed, non-gateway tunnel (chamber/gateway/collapsed/no
  // prev) or the large pack was empty — no state change. False means `prev`'s card value was
  // spliced back into the remaining large pack and the area replaced with a freshly-drawn,
  // `AF_UNRESOLVED` (face-down) card, mirrored-stairs/secret-door history gone.
  | { type: "spellRemap"; fizzled: boolean }
  // Extension kit (SC-EXT-19, design US-17): a `takeTreasure` lift during a Thief-unlocked pickup
  // (`state.thiefPickup`, reduce.ts's `settlePacifiedArea`) — treasure an indifference-pacified
  // area's strangers would otherwise still guard. `tid` is the lifted treasure id (design Feedback:
  // "The Thief palms the [item]."); fires once per successful lift, never for an ordinary pickup.
  | { type: "thiefPalmed"; tid: number }
  // Extension kit (SC-EXT-20, design US-14/Resolved-7): the Sorcerer's death instantly breaks
  // every Apprentice ally's loyalty — `count` how many turned (normally one), `items` the pooled
  // treasure ids dropped into the chamber floor (`revertApprenticesOnSorcererDeath`, effects.ts).
  | { type: "apprenticeTurned"; count: number; items: number[] }
  // Extension kit (SC-EXT-20, design US-14): an Apprentice ally never leaves the cave — a
  // successful `exitCave` drops her from the scored party (`count`, normally one) rather than
  // let her escape with the rest.
  | { type: "apprenticeStaysBehind"; count: number }
  // Extension kit (SC-EXT-21, design US-13/Resolved-6): a freshly-drawn Demon materializes into
  // `prev`'s contents instead of joining the chamber it was drawn in (`spawnDemon`, chamber.ts).
  | { type: "demonSpawned" }
  // Extension kit (SC-EXT-21): the area the Demon would have materialized into was collapsed by
  // an Earthquake (`AF_DESTROYED`) — it can't take form there and disperses outright, no state
  // change beyond this notice (design US-13/Resolved-6).
  | { type: "demonDispersed" }
  // Extension kit (SC-EXT-21): the party has (re-)entered — or withdrawn back into — the Demon's
  // area: a forced hostile encounter, no reaction test, "like always-hostile" (design US-13).
  | { type: "demonUnfolds" }
  // Extension kit (SC-EXT-21): an unfightable, unengaged Demon follows the Spectre's own
  // auto-slay rule (Resolved-6) — `creatureId` is the slain PARTY member (mirrors `spectreSlew`'s
  // own field, a separate event only because the design's flavour text is Demon-specific).
  | { type: "demonSlew"; creatureId: number }
  // Extension kit (SC-EXT-22, design US-19): the Elixir's outcome — `creatureId` the drinker,
  // `roll` the visible d6 (1 death, 2-3 nothing, 4-6 permanent +2 fs). `outcome` mirrors the
  // roll band as a discriminant for the presentation layer, so it needn't re-derive it from
  // `roll`. Fires alongside the generic `artifactUsed{artifact:15}` and, on the death band, the
  // ordinary death machinery's own events (`deathPrevented` if the Ring saves the drinker, else
  // `eyeForsaken`/`itemsSpilled`) exactly as any other "killing die-roll" site.
  | { type: "elixirDrunk"; creatureId: number; roll: number; outcome: "death" | "nothing" | "strength" }
  // Extension kit (SC-EXT-24, design US-20): Holy Water's four outcomes, one event per mode —
  // `holyWaterTargets` (effects.ts) is the shared source of truth both `selectors.ts` and
  // `reduce.ts`'s useArtifact case 16 read to build/interpret the target picker (design "target
  // picker listing every legal target in the current area").
  // REANIMATE a stone PARTY member: "The stone sloughs away — [name] breathes again."
  | { type: "holyWaterRevived"; creatureId: number }
  // REANIMATE a Gallery statue: wakes into `state.strangers` for an immediate, normal reaction test
  // (mirrors the Staff's group wake, SC-EXT-11, for a single creature). "The stone cracks — the
  // [creature] stirs!" (design US-06's own wording for this same action).
  | { type: "holyWaterStatueWoke"; creatureId: number }
  // DESTROY the area's lurking Medusa marker outright — no dice, stops lurking forever. No
  // `creatureId`: Medusa is a hazard (HAZARD_MEDUSA), not a creature with an id of her own.
  | { type: "holyWaterMedusaDestroyed" }
  // DESTROY a Spectre (9) or Demon (15) stranger/lurker in the area outright — no fight, no score.
  | { type: "holyWaterFoeDestroyed"; creatureId: number }
  // WEAKEN the Sorcerer (11) or an Apprentice (14) present in the area — −2 mp for the rest of the
  // game (`state.holyWaterOnSorcerer`/`holyWaterOnApprentice`, combatPlan.ts's `enemyMP`), stacking
  // with Lotus Dust/Eye of God, floor 0.
  | { type: "holyWaterWeakened"; creatureId: number }
  // Extension kit (SC-EXT-25, design US-21): the Scroll, read by any living human present — no
  // reader selection (Resolved-10). `destroyed` are the area's strangers with mp===0 (creature ids,
  // duplicates allowed), removed with no score; `survivors` are the mp>0 strangers left standing
  // (a fight already on continues against them). Always curses the party (`state.curses += 1`) —
  // the presentation layer's own "A curse settles on the party." notice follows unconditionally.
  | { type: "scrollRead"; destroyed: number[]; survivors: number[] };
