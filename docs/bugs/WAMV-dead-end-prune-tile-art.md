# Bug: dead-end pruning rewrites a placed tile's doorways, so the map draws a phantom East exit

> Reported: 2026-10-02
> Game: `WAMV` (solo, extension kit on, `forcedRedraw` off) — log: [WAMV-log.json](WAMV-log.json)
> Screenshot: [Screenshot 2026-10-02 at 08.19.32.png](Screenshot%202026-10-02%20at%2008.19.32.png)
> Status: open — dead-end logic is due a rewrite; no code changed

## Symptom

After **resuming** the game, the party stands on a tunnel tile and the map shows a corridor running
East into a chamber, but a move East is refused (`blocked`). The tiles look connected; the engine
says they are not. The same game viewed in **Replay** (and in the live session before the resume)
draws the tile correctly as an N+W tunnel, and the allowed movements match that correct tile — only
the artwork of the resumed game is wrong.

## What actually happened (replayed from the log)

| seq | action | result |
|---|---|---|
| 116 | move S from (44,39) | card 30 (chamber, doors E/S/W) has no N door → dead end, placed **face-down** at (44,40) (area 57) |
| 118 | move S from (43,39) | card 9 drawn (doors **N + W**), placed face-up at (43,40) (area 59). Art shown: `s08-3`, a real NW tunnel |
| 119 | move W | card 69 (N, S, stair-down) drawn and placed face-down at (42,40) (area 60). It has no East door → dead end. `tryMove` **prunes the W bit of area 59: card 9 → card 1** |
| 122 | — | area 60 later turned face-up when the party entered it from another direction |
| 221 | move S back into area 59 | party is on card 1 (N only) |

From the final state: N works (`moved`), E / S / W all return `blocked`.

## Root cause

1. **`tryMove` mutates the placed card.** On a dead end it calls `pruneExit` (`map.ts:191`, `:277`),
   clearing the doorway bit on the stored card. A printed card thereby changes shape mid-game
   (N+W → N). The engine conflates *"doorway printed on the card"* with *"doorway currently usable"*.
2. **The renderer draws from the mutated card.** `projectArea` (`view/projection.ts:112-118`) picks
   art from the card's *current* exits via `resolveTile` (`data/manifest.ts:100`).
3. **No art exists for the pruned shape.** The base tile set has 2–4 exits per tile (e.g. 3×`NE`,
   4×`NW`, 3×`NS`); there is no single-exit tile, nor several other pruned shapes (e.g. `ES`).
   `resolveTile` returns `null` and `projection.ts:153` falls back to `art.tiles[0]`
   (`area-tile-s01-1.png`, a **North + East** tunnel).
4. **The fallback art draws a doorway the card never had**, running straight into area 57, whose
   West door does face it. The engine is right to refuse East: area 59's card has no East door.

Net effect: the screen shows an East exit that does not exist, on the opposite side from the real
(blocked) West exit.

Special areas already had a subset-match patch for this ("found live: a Whirlpool tile pruned by an
earlier dead-end draw", `manifest.ts` comment); ordinary tiles were never given one.

## Secondary finding: face-down tiles are drawn face-up

Area 57 is `faceUp: false` in the engine and `projectArea` sets `faceDown: true`, but `cave3d.js`
only uses `faceDown` for Spell remaps (≈ line 363). There is no card-back / hidden-art path, so the
dead-end chamber is rendered with its full art. By the rules (§Exploring the Cave) a dead-end card
stays face-down until a party enters it from another direction. Not yet confirmed in a browser.

## Replay vs resume (2nd screenshot) — why only a resumed game looks wrong

Screenshot: [Screenshot 2026-10-02 at 08.49.09.png](Screenshot%202026-10-02%20at%2008.49.09.png) —
the same area viewed in Replay mode, showing the tile as the correct **NW tunnel** (curve from North
to West), while the resumed game (first screenshot) shows the NE fallback tile.

Both use the same engine state and the same `projectArea`. Projecting every replay frame:

| frame | party | `projectArea` art for area 59 |
|---|---|---|
| 118 | on area 59 (just entered) | `s08-3` — NW tunnel |
| 119 onward (incl. 221, the final/resumed state) | 119 and 221 on area 59 | `s01-1` — NE fallback |

So the *data* says NE from frame 119 on, yet the replay looks right. The difference is in the 3D view:
`reconcileTiles` (`view/cave3d.js:362-370`) **deliberately does not redraw an existing tile whose art
changes because of a prune** — an earlier fix, because swapping the mesh "redrew the tile the party
is standing on". A tile mesh is therefore built once, from the card as it was when the tile was
placed, and later prunes are ignored.

- **Live play and replay stepping:** area 59's mesh was built at frame 118 from the N+W card (NW art)
  and is never rebuilt, so the tile keeps looking correct.
- **Resume (and any fresh load / a replay jump past frame 119 without stepping through 118):** every
  mesh is built from the *saved* state, where the card has already been pruned to N-only. No art
  matches, `projection.ts:153` falls back to `art.tiles[0]` (`s01-1`, NE), and the tile is drawn
  wrong.

So the engine's movement is correct throughout and matches the correct (replay) rendering — only the
artwork for a tile built from a pruned card is wrong. **Resuming is what exposes the bug.**

**Repro:** (a) resume `WAMV` — the party's tile is the NE corridor; or (b) in the replay, drag the
slider straight from the start to ~move 150 without stepping through move 118 — area 59 is first
built from a pruned state and appears as NE.

## Things that are NOT the cause

- **Corrupt saved data.** The saved Convex state matches an engine replay of the log exactly
  (area 57 `faceUp:false`, area 59 `card:1`). The data is right; resuming merely rebuilds every tile
  mesh from it, which is what exposes the art bug (see above).
- **`forcedRedraw`.** Convex `FORCED_REDRAW_ENABLED` is `0` and WAMV's variants are
  `{extensionKit:true}`. Pruning is the *default* dead-end behaviour (spec SC-6.1-9 / SC-6.1-10);
  `forcedRedraw` only adds an optional rescue when the party is completely stuck (SC-6.3-2). The
  party was not stuck (North was open), so this prune would occur with the flag on too.
- **A redraw or card swap.** The failed West move drew the *neighbour* (card 69) but did not redraw
  or swap the party's tile; only its door bits changed, and the art followed.

## Expected behaviour

- A card's doorways are fixed by its printed layout; **a placed card is never changed, redrawn or
  swapped** because an exit was tried and found blocked.
- A doorway is usable only if the tile beyond it is absent (draw a card) or shows the matching
  reverse door. A neighbour with no matching door (or rubble) blocks it — visibly, via the
  neighbouring tile. The party simply has fewer ways out.
- Here: area 59 stays N+W, rendered with the NW art, West visibly blocked by area 60, North the
  only exit; East is not shown as open.
- Face-down dead-end cards are drawn as card backs until revealed.

## Suggested fix direction

Movement is correct; only the art for a pruned tile is wrong, so the fix can be small and does not
need the dead-end rewrite:

1. **Engine:** on the first prune of a tile, record its original card in a new optional
   `PlacedArea.printedCard` (cleared again if the forced-redraw rescue undoes the prune; absent for
   tiles that never lose a door). Precedent: `PlacedArea.mirroredStairs` ("always drawn in its
   printed orientation"). Edits at `map.ts:191`, `:277` (prune) and `:290` (restore).
2. **Renderer:** `projectArea` uses `printedCard ?? card` for tile selection, so a fresh build gets the
   real NW art. Keep the `reconcileTiles` no-swap behaviour.
3. **Existing saves (WAMV):** no `printedCard`, so infer the printed shape from the live exits plus
   the directions whose neighbour exists and does not connect back; use it only when exactly one
   catalogue tile fits, otherwise keep today's fallback. For area 59 the only fit is NW (W blocked by
   the card with no East door; E not blocked, since area 57 has a matching West door; no S neighbour).
4. Replace the silent `art.tiles[0]` fallback with a visible error/log.
5. Update `docs/specs/engine-spec.md` (SC-6.1-9, SC-6.1-10, state table) and add tests.

The broader dead-end rewrite (stop mutating `card`; derive blocked doorways from the neighbouring
tile) remains a separate, optional follow-up.

## Regression test

Replay `WAMV-log.json` to the final state. Assert `projectArea` for area 59 returns the NW tile
(`s08-3`, not `s01-1`) even though its live card is N-only, and that a move East from the final
state is still `blocked`. Also assert a never-pruned tile is unaffected (`printedCard` absent).

## Repro

```
replay(seed 1790884542946, picks [1,7], variants {extensionKit:true}, moves from WAMV-log.json)
# final state: partyArea 59, areas[59].card === 1 (should be 9), projectArea(59).tileId === "s01-1"
```
