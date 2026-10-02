# Bug: dead-end pruning rewrites a placed tile's doorways, so the map draws a phantom East exit

> Reported: 2026-10-02
> Game: `WAMV` (solo, extension kit on, `forcedRedraw` off) — log: [WAMV-log.json](WAMV-log.json)
> Screenshot: [Screenshot 2026-10-02 at 08.19.32.png](Screenshot%202026-10-02%20at%2008.19.32.png)
> Status: open — dead-end logic is due a rewrite; no code changed

## Symptom

The party stands on a tunnel tile. The map shows a corridor running East into a chamber, but a
move East is refused (`blocked`). The tiles look connected; the engine says they are not.

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

## Things that are NOT the cause

- **Resuming the game.** The saved Convex state matches an engine replay of the log exactly
  (area 57 `faceUp:false`, area 59 `card:1`).
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

- **Preferred (part of the dead-end rewrite):** stop mutating `card`. Derive "can I go this way?"
  from the neighbouring tile each time (none → draw; matching reverse door → open; otherwise
  blocked; `AF_DESTROYED` → blocked). Nothing then needs to be stored on the card. About 15
  call sites read exits from `card` (`map.ts`, `selectors.ts`, `reduce.ts`, `multi*.ts`).
- **Stopgap (not recommended while the rewrite is pending):** save the printed card on first prune
  (optional `printedCard`, absent when never pruned) and render from it; existing saves keep the
  old fallback.
- Replace the silent `art.tiles[0]` fallback with a visible error/log so an unmatched shape is
  never drawn as a plausible wrong tile.
- Any engine change must update `docs/specs/engine-spec.md` (SC-6.1-4, 6.1-9, 6.1-10, 6.3-1).

## Regression test

Replay `WAMV-log.json` through `seq 119`. Assert area 59 still has doorways N+W, projects to a
NW tile (not `s01-1`), a West move is `blocked`/dead-end without altering area 59's card, and no
East exit is drawn. Full replay: a move East from the final state returns `blocked`.

## Repro

```
replay(seed 1790884542946, picks [1,7], variants {extensionKit:true}, moves from WAMV-log.json)
# final state: partyArea 59, areas[59].card === 1 (should be 9), projectArea(59).tileId === "s01-1"
```
