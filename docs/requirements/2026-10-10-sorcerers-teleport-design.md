# Sorcerer's Teleport: Design and Decisions

`DATE: 10-OCT-2026`
`IMPLEMENTS: [2026-10-10-sorcerers-teleport.md](2026-10-10-sorcerers-teleport.md)`
`RULE: Expanded Consolidated Rules PV2026 V2, "The Sorcerer"`
`SPEC: docs/specs/engine-spec.md SC-12-21 to SC-12-23`

## The rule

> A player who defeats the Sorcerer and his companions has the option of sparing the Sorcerer's life on condition that
> he immediately transport the party and any treasure in the chamber, by magical means, to an area of the player's
> choice. This option must be taken up in the first turn after the fight is over. It cannot be done if the Eye of God
> is present. The Sorcerer remains in the chamber.

## What was built

- **Engine** (`variants.sorcererTeleport`): defeating the Sorcerer no longer slays him at the killing blow. When the fight is
  won the game pauses in a new `sorcerer` phase with two choices: `slaySorcerer` (the old ending) or `spareSorcerer{area}`.
- **Server**: the variant is switched on per new game by `SORCERER_TELEPORT_ENABLED=1` (`apps/web/OPTIONS.md`), like the
  Dead End rule's flag. Off by default, so existing games, replays and the golden vectors are unchanged.
- **UI**: a dialog (slay or spare), then the existing 3D cave view in free-orbit with every allowed area ringed (click one; a bar offers Back / Teleport), then
  a full-screen effect (vortex, contracting rings, sparks, a flash at the moment the party moves). Reduced-motion users
  get a short fade.

## Decisions taken (change any of them if the rules intend otherwise)

| # | Decision | Why |
|---|---|---|
| 1 | The default is to slay him; the pause is taken before anything else | "The first turn after the fight" holds by construction, and there is no way to forget the option |
| 2 | **Destinations:** any discovered, standing area on any level, except the party's own, collapsed areas, and the Whirlpool, Deep Pool and Viper Pit | The Whirlpool never takes an arrival, and the pits sink or reserve floor treasure, which would strand what the party carries |
| 3 | The chamber's treasure goes to the destination's floor, to be picked up as after any fight | Reuses the existing pickup rules and weight limits |
| 4 | He stays in the chamber as a parked stranger, so he waits if the party returns | "The Sorcerer remains in the chamber" |
| 5 | Sparing forfeits the +30 bounty, lifts no curse, and Apprentice allies stay loyal | Those all follow from his death |
| 6 | The Eye of God slays him at the killing blow, as the rule forbids sparing | Peter's "always on in the area" reading of the Eye |
| 7 | A wipe-out or a retreat while he is felled slays him | There is no later chance to spare him |
| 8 | No surprise bonus for the landing, and no withdrawing from it | Same as a trap fall (`fellThroughTrap`). Peter's reformulated rules list the Sorcerer's Teleport as a route that gives surprise; that draft is not final |

## Not done

- **Multiplayer.** The variant is solo-only (like the Dead End rule). In a shared cave a teleport moves one party
  across other parties' positions, and a union's bounty split would need to account for a spared Sorcerer.
- **High-score segmentation.** Scores from games with the option are not separated, since sparing only gives up points.

## To try it

```bash
cd apps/web
npx convex env set SORCERER_TELEPORT_ENABLED 1
```

then start a **new** game and defeat the Sorcerer (Test Mode can place him).
