# Engine conformance vectors (V1)

Fixed playthroughs of the solo engine, rendered as plain 7-bit-ASCII, LF-terminated text, for
verifying that a **foreign implementation** (e.g. the VAX Macro-32 port) reproduces this engine
exactly. Everything a port needs is in the file: the initial conditions, the ordered action log to
drive its reducer, and a checkpoint after every action. The contract they pin is
`docs/specs/engine-spec.md` Part I (see its **Appendix D**); the RNG they exercise is Appendix A.5.

These files are **generated and guarded** by `packages/engine/src/conformance-vectors.test.ts`:
the engine test suite fails if the engine drifts from what is committed here. Never hand-edit a
vector; regenerate deliberately (with the rules-change commit that caused the drift):

```bash
pnpm --filter engine exec vitest run -u src/conformance-vectors.test.ts
```

## How a port consumes a vector

1. Read `SEED` and `PICKS`, and check for an optional `KIT 1` line (extension kit ON — SC-EXT-1);
   run your `newGame(seed, picks)` (or, with `KIT 1`, `newGame(seed, picks, {extensionKit: true})`
   — building the 90-card/101-card kit decks instead of the base 60/71, SC-EXT-4); compare the
   `SETUP` line.
2. Apply each numbered move's action to your reducer, in order. After each, compare the
   post-action checkpoint. **`SEED` is the sharpest signal**: any difference in roll count, roll
   order, or LCG arithmetic (spec A.5) diverges the RNG cursor on the exact line it happens.
3. Compare the `FINAL` / `STATE` / `PARTY` / `AREA` block — full end-state equality.

A port that matches every line of every vector implements the same game.

## Line formats

```
SEED <n>                      initial LCG seed handed to newGame
PICKS <id>[,<id>…]            starting party creature ids, in pick order
KIT 1                         OPTIONAL — present only when the run is extension-kit-on (SC-EXT-1)
SETUP …                       state straight after newGame (see checkpoint fields below)
BEGIN MOVES / END MOVES <n>   the action log; <n> = number of actions applied
<step> <ACTION> -> <checkpoint> EV <ev>[,<ev>…]     one applied action + post-action state
FINAL … SCORE <n>             end-of-run summary; SCORE = scoreBreakdown(state).total (spec §12)
STATE CURSES <n> BONUS <n> SORCKILLED <0|1> STRANGERS <list> TREASURES <list> HAZARDS <list>
PARTY <i> CID <n> ST <n> DK <n> CARRY <list> BORNE <list>
AREA <i> CARD <n> COORD <n> FU <0|1> VIS <0|1> FLG <n> MIR <n> SD <n|-> CONT <list> DROP <list>
END
```

Checkpoint fields: `TRN` turn · `LVL` level · `ARA` partyArea index · `PH` phase
(`EXP`=explore `MDS`=medusa `ENC`=encounter `FGT`=fight `PKP`=pickup `END`=gameOver) · `GS` game state
(0 playing, 1 escaped, 2 dead, 3 quit) · `SEED` the LCG cursor (`state.seed`) ·
`LARGEIDX`/`SMALLIDX` deck cursors. `EV` lists the emitted event types in order (`-` = none).
`<list>` is comma-separated integers, `-` when empty. PARTY: `CID` creatureId, `ST` status
(0 original, 1 ally, 2 stone, 3 dead), `DK` dragonKills, `CARRY` treasure ids held, `BORNE` the
borne subset. AREA: `CARD` area-card value, `COORD` packed `level*10000+y*100+x`, `FU` faceUp,
`VIS` visited, `FLG` flags (4 = earthquake-destroyed), `MIR` mirroredStairs bits, `SD` secret-door
ordinal, `CONT` parked contents codes (100+cid / 200+tid / 300+hid / 400+cid, and — kit-on runs only,
SC-EXT-10 — 500+cid for a parked Gallery statue), `DROP` Deep-Pool dropped treasure ids, `SUNK`
Precise Locations' per-sub-location cast treasure (SC-10.5-9): `<at>:<item>[,<item>…]` per non-empty
bucket, `;`-joined, `-` when there are none — `at` is `island` or a doorway direction (1 N, 2 E, 3
S, 4 W, same numbering as `MOVE`/`RETREAT`).

## Action grammar

Covers the full 23-action catalog (spec SC-4-41 — 18 base + 4 kit-only (SC-EXT-5/7/8/13) + 1
kit-independent house rule (SC-10.5-5)). Indices
refer to the engine's state arrays (`party` / `strangers` / `treasures` / a member's `treasure`) **at
the moment the action is applied**. Directions: 1 N, 2 E, 3 S, 4 W, 5 up, 6 down.

| Encoding | Action |
|---|---|
| `MOVE <dir>` / `RETREAT <dir>` | move / retreat |
| `QUIT` `EXITCAVE` `WITHDRAW` `TEST` `ATTACK` `LEAVE` `RETAKE` `OPENCHEST` | quit / exitCave / withdraw / test / attack / leaveTreasure / retakeDropped / openChest |
| `TAKE <ti> <mi>` | takeTreasure: floor slot `ti` → member `mi` |
| `GIVE <from> <to> <idx>` | moveTreasure: member `from`'s slot `idx` → member `to` |
| `DROP <mi> <idx>` | dropTreasure |
| `BORNE <mi> <idx> <0|1>` | setBorne (1 bear, 0 stow) |
| `CASUALTY <idx>` | chooseCasualty |
| `PROCEED` | proceed (decline the Medusa-pause Lotus throw — the held hazards fire) |
| `USE <artifact>[ T<target>][ D<dir>]` | useArtifact (`USE 5` with no `T` = the Medusa-pause throw; kit artifacts 15 Elixir/16 Holy Water/19 Scroll add their own target ranges, SC-EXT-22/24/25) |
| `FIGHT <match>[;<match>…]` | resolveRound; match = `<front>[+<front>][\|<backer>[+…]]><stranger>[+<stranger>]`; `FIGHT -` = the forced-Spectre-or-Demon empty plan (SC-9.4-6, SC-EXT-21) |
| `DESCENDCHASM` | descendChasm — kit-only, Chasm tile (SC-EXT-5) |
| `DRAWFROMWELL` | drawFromWell — kit-only, Well tile (SC-EXT-7) |
| `PULLBELLROPE <mi>` | pullBellRope: living member `mi` pulls it — kit-only, Bell Rope tile (SC-EXT-8) |
| `ENTERCRYPT` | enterCrypt — kit-only, on the area a parked Crypt/Gems names (SC-EXT-13) |
| `JUMPISLAND` | jumpToIsland — Viper Pit/Deep Pool only, kit-independent; Peter's house rule, not the printed rulebook (SC-10.5-5) |

## Coverage

Twenty runs. The eight untagged files mirror the solo golden firewall's seed × party set
(`solo-golden.test.ts`) and exercise combat, pickup, hazards and deaths. The eleven base-game TAGGED
files are targeted fixtures found by seed sweep, driven by steered policies committed in the
generator; the final TAGGED file is the extension kit's own vector:

| File tag | Pins |
|---|---|
| `-escape` (seed 225) | `exitCave` → `gameOver(ESCAPED)` with a laden party — valid final score 131 (§12) |
| `-sorcerer` (seed 174) | `sorcererSlain` (+ the `SORCKILLED 1` curse-lift flag) before a party wipe |
| `-artifacts` (seeds 257, 1237, 2678, 2355) | together, every usable artifact — Carpet 4, Lotus 5, Balm 6, Potion 8, Staff 9, Flute 12 (`USE` actions + effects) — plus the Lost-Ruby statue wrestle (×3) and the Treasure Chest (`OPENCHEST`) |
| `-chest2` (seed 53) | `openChest` → a Spectre attacks |
| `-ring` (seed 30) | the Ring shrugs off a killing blow (`deathPrevented`) |
| `-reclaim` (seed 148) | Deep-Pool dropped treasure reclaimed by a Giant |
| `-medusaavert` (seed 330) | a staff-Wizard averts Medusa (`medusaAverted`) |
| `-petrified` (seed 24) | whole-party petrification (`petrifiedOut`) — and the Medusa pause: `MDS` phase, the no-target `USE 5` throw, `medusaSlept` + `medusaAsleep` |
| `-kit` (seed 397, `KIT 1`) | the ONE extension-kit-on vector (Task 17), party `18,20` (Witch, Wolf), driven by the generator's "kit" policy — a byte-for-byte port of `kit-golden.test.ts`'s own decision logic, so it replays that golden's identical action sequence. Pins: `DESCENDCHASM`×2, `WHIRLPOOLROLL`, `DRAWFROMWELL`, and a parked Crypt (`cryptParked`); all four kit hazards firing — Quarrel fizzles (too few eligible duelists, SC-EXT-16), Spell remaps a tunnel, Desertion, and Harpies actually striking; two kit artifact `USE`s — Holy Water destroying a stranger (`USE 16 T3000`) and the Scroll (`USE 19`); reactions to kit-creature stranger groups (a Witch; a Giant+Lion pair that joins; a final mixed group including the Apprentice and the Thief); and a Demon materializing (`demonSpawned`). Ends `GS 2` (a full party wipe) at move 197 — a natural end, not a step-cap truncation. |

Note two truncation shapes a replayer must accept: a run may end at the step cap with `GS 0`
(`END MOVES 300`, game still live), and seed 2678 stops early when no legal action remains (the
deliberate SC-6.3-1 soft-lock). They are conformance smoke tests, not an exhaustive rules suite —
the normative contract remains engine-spec Part I.
