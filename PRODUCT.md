# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Fans of the original 1978 *Sorcerer's Cave* board game (Terence Donnelly) and retro
board-gamers who want a faithful way to play it again in the browser — solo or with
friends in multiplayer. Success means the game they remember, playable end-to-end
(party building → exploration → hazards → fights → escape → scoring) without owning
the physical set.

Impeccable design target in this monorepo: `apps/web` (the only user-facing UI).

## Product Purpose

An online re-imagining of the classic Sorcerer's Cave board game, live at
https://sorcerers-cave.vercel.app. The cave is built one area card at a time in a 3D
view as the player explores; a 6-point budget recruits the expedition; a global
leaderboard records scores. A full Player's Manual (`apps/web/public/manual.html`)
teaches party building, exploring, hazards, fights, treasure, and scoring.

## Positioning

A *faithful* digital port, not a loose adaptation: the complete original rule set is
implemented as a pure, deterministic TypeScript engine with a traceable normative
specification (`docs/specs/engine-spec.md`, one `SC-<§>-<n>` requirement per rule,
pinned to code and tests), and the presentation uses the original card/tile/token art
extracted from the physical game (`packages/assets`).

## Operating Context

- Played in the browser; anonymous auth (no account setup friction).
- Solo play and server-authoritative multiplayer (Convex backend); multiplayer is
  live in production as of 2026-06-17 (`VITE_MULTIPLAYER=1`).
- Sessions revolve around one expedition: recruit, descend through the Gateway,
  explore level by level, escape (or die), then score on the global leaderboard.
- Movement is available via 3D exit markers and N/E/S/W/U/D keyboard keys.

## Capabilities and Constraints

- Monorepo: `packages/engine` (pure deterministic rules, no I/O), `packages/assets`
  (typed contract for extracted art), `apps/web` (React 19 + Vite SPA, Three.js
  0.160 3D cave view, Tailwind CSS 4, Zustand, co-located Convex backend).
- The engine is the source of truth for rules; any engine change must update
  `docs/specs/engine-spec.md` in the same change (project CLAUDE.md rule). UI work
  must never fork or reinterpret rules — it surfaces engine actions/events.
- Frontend surfaces the full engine rule set as of the 2026-06-14 gap analysis
  (`docs/specs/2026-06-14-frontend-gap-analysis.md`); remaining polish items noted
  there (generic multi-target artifact labels in fights, `fightStarted` surprise and
  `charisma` flag unsurfaced).
- Game terminology is fixed by the original rules: Gateway, area cards, chambers,
  hazards (Mutiny, Trap, Earthquake, Medusa, Ghouls), strangers, party, artifacts,
  the Sorcerer, special areas (Deep Pool, Viper Pit, Tomb, Great Hall).

## Brand Commitments

- **Rules and art are both binding.** The original 1978 rules are sacred, and the
  original extracted card/tile/token art (`packages/assets`) is the committed visual
  material — the experience should feel like the physical game. Future design work
  builds around this art, not over it.
- Name: "Sorcerer's Cave" / repo `sorcerers-cave`.
- Reference material on hand: conversion-kit PDF
  (`docs/assets/sorcerers-cave-conversion-kit-extension.pdf`), original rules
  transcription (`docs/specs/sorcerers-cave-rules.md`), and the cave-view design
  handoff (`design_handoff_cave_view/` with reference shots and screenshots).

## Evidence on Hand

- Live deployment: https://sorcerers-cave.vercel.app (playable end-to-end).
- Player's Manual with in-game screenshots: `apps/web/public/manual.html`,
  `apps/web/public/manual/shot-*.png`.
- Extracted original art assets: `packages/assets`.
- Traceable engine spec with conformance vectors: `docs/specs/engine-spec.md`,
  `docs/specs/conformance/`.
- No testimonials, press, player counts, or usage metrics exist — do not fabricate
  any.

## Product Principles

1. **Fidelity first.** When a design choice conflicts with how the physical game
   plays or looks, the original game wins.
2. **The engine decides; the UI reveals.** Every control maps to a legal engine
   action; every outcome the engine emits deserves visible feedback.
3. **Honor the material.** The extracted art is the visual anchor — presentation
   should frame it like the physical components, not restyle it.
4. **Zero-friction play.** Anonymous auth, browser-only, no installs — a returning
   fan should be exploring the cave within a minute.
5. **Teach the veteran's game.** Assume affection for the original, not memory of
   its rules — the manual and in-game feedback carry rule knowledge.

## Accessibility & Inclusion

No formal standard committed; follow good general web practice. Keyboard movement
(N/E/S/W/U/D) already exists and should be preserved.
