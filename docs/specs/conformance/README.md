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

1. Read `SEED` and `PICKS`; run your `newGame(seed, picks)`; compare the `SETUP` line.
2. Apply each numbered move's action to your reducer, in order. After each, compare the
   post-action checkpoint. **`SEED` is the sharpest signal**: any difference in roll count, roll
   order, or LCG arithmetic (spec A.5) diverges the RNG cursor on the exact line it happens.
3. Compare the `FINAL` / `STATE` / `PARTY` / `AREA` block — full end-state equality.

A port that matches every line of every vector implements the same game.

## Line formats

```
SEED <n>                      initial LCG seed handed to newGame
PICKS <id>[,<id>…]            starting party creature ids, in pick order
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
(`EXP`=explore `ENC`=encounter `FGT`=fight `PKP`=pickup `END`=gameOver) · `GS` game state
(0 playing, 1 escaped, 2 dead, 3 quit) · `SEED` the LCG cursor (`state.seed`) ·
`LARGEIDX`/`SMALLIDX` deck cursors. `EV` lists the emitted event types in order (`-` = none).
`<list>` is comma-separated integers, `-` when empty. PARTY: `CID` creatureId, `ST` status
(0 original, 1 ally, 2 stone, 3 dead), `DK` dragonKills, `CARRY` treasure ids held, `BORNE` the
borne subset. AREA: `CARD` area-card value, `COORD` packed `level*10000+y*100+x`, `FU` faceUp,
`VIS` visited, `FLG` flags (4 = earthquake-destroyed), `MIR` mirroredStairs bits, `SD` secret-door
ordinal, `CONT` parked contents codes (100+cid / 200+tid / 300+hid / 400+cid), `DROP` Deep-Pool
dropped treasure ids.

## Action grammar

Covers the full 17-action catalog (spec SC-4-41). Indices refer to the engine's state arrays
(`party` / `strangers` / `treasures` / a member's `treasure`) **at the moment the action is
applied**. Directions: 1 N, 2 E, 3 S, 4 W, 5 up, 6 down.

| Encoding | Action |
|---|---|
| `MOVE <dir>` / `RETREAT <dir>` | move / retreat |
| `QUIT` `EXITCAVE` `WITHDRAW` `TEST` `ATTACK` `LEAVE` `RETAKE` `OPENCHEST` | quit / exitCave / withdraw / test / attack / leaveTreasure / retakeDropped / openChest |
| `TAKE <ti> <mi>` | takeTreasure: floor slot `ti` → member `mi` |
| `GIVE <from> <to> <idx>` | moveTreasure: member `from`'s slot `idx` → member `to` |
| `DROP <mi> <idx>` | dropTreasure |
| `BORNE <mi> <idx> <0|1>` | setBorne (1 bear, 0 stow) |
| `CASUALTY <idx>` | chooseCasualty |
| `USE <artifact>[ T<target>][ D<dir>]` | useArtifact |
| `FIGHT <match>[;<match>…]` | resolveRound; match = `<front>[+<front>][\|<backer>[+…]]><stranger>[+<stranger>]`; `FIGHT -` = the forced-Spectre empty plan (SC-9.4-6) |

## Coverage

Eight seed × party runs (the same set as the solo golden firewall, `solo-golden.test.ts`),
chosen to exercise combat, pickup, hazards, artifacts, deaths and escapes. They are conformance
smoke tests, not an exhaustive rules suite — the normative contract remains engine-spec Part I.
