# Spec Requirements Document

> Spec: In-Game Bug Report Tool
> Created: 2026-11-09
> Status: Planning

## Overview

Add a "bug" icon to the top-right of the in-game title bar, available in ordinary and Test Mode games, that opens a short form. Submitting it saves a report in Convex and, immediately afterwards, creates a GitHub issue in `urbancamo/sorcerers-cave` carrying the player's description plus the game context needed to replay the problem. Reports from Test Mode games are labelled `test-mode`.

## User Stories

### Player reports a suspected bug

As a player, I want to report something that looks wrong without leaving the game, so that the developer gets the details while the situation is still on screen.

The player clicks the bug icon, describes what happened and what they expected, optionally picks a category and leaves contact details, and submits. The game is not affected: no action is dispatched, the dice and cards are untouched, and the form can be dismissed at any time. On success the player sees a reference number; the game code is shown so they can quote it.

### Developer gets a replayable issue

As the developer, I want each report to arrive as a GitHub issue with the game code, turn, level, area, variants and build, so that I can replay the game to the exact move and fix it.

The issue is created without a manual approval step. It contains the player's text, the game context read from the server (never trusted from the client), and the instruction to replay by game code. The replay log is added inside a collapsed section when it fits within GitHub's body limit.

### Tester reports from Test Mode

As a tester using Test Mode, I want my reports to be marked so they are not confused with real player reports.

A report from a game with `testMode: true` gets the `test-mode` label and a `[test-mode]` title prefix. The bug icon appears in Test Mode exactly as in a normal game, beside the existing `T` icon.

## Spec Scope

1. **Bug icon and report modal** - A `bug` glyph in `TitleBar` (ungated) opens a `BugReportModal` from `GameScreen`; the modal is independent of the right-hand slot and does not change game state.
2. **Report storage** - A `bugReports` Convex table and a public `bugReport.submit` mutation that validates, rate-limits, derives context from the game row, and stores the report before anything else happens.
3. **GitHub issue creation** - An internal action, scheduled from `submit`, that calls the GitHub REST API, with retries and a recorded outcome (issue number and URL, or the error).
4. **Test Mode labelling** - `test-mode` label and title prefix, taken from the persisted game state, not from the client.
5. **Manual and help** - A manual topic describing the tool and what it sends, with a `HelpButton` in the modal.

## Out of Scope

- Multiplayer screens, spectator view, the splash screen and party selection (no `TitleBar` there today; a follow-up).
- Screenshots or canvas capture of the 3D view.
- A manual approval or triage queue before issue creation.
- Two-way sync: comments or closing on GitHub do not flow back to the game.
- Any change under `packages/engine/src` (so no engine-spec change).
- An admin UI for reports; triage happens in GitHub, and the Convex table is the durable record.

## Expected Deliverable

1. In a solo game (normal or Test Mode), a bug icon sits in the top-right group of the title bar; clicking it opens a form that can be submitted or dismissed with no effect on the game.
2. Submitting a report creates an issue in `urbancamo/sorcerers-cave` labelled `bug-report` (plus `test-mode` for a Test Mode game), containing the description, game code, turn, level, area, variants and build.
3. If GitHub is unreachable or the token is missing, the player still gets a confirmation, the report is kept in Convex with its failure recorded, and transient failures are retried.

## Spec Documentation

- Tasks: _created after review_
- Technical Specification: @.agent-os/specs/2026-11-09-bug-report-tool/sub-specs/technical-spec.md
- API Specification: @.agent-os/specs/2026-11-09-bug-report-tool/sub-specs/api-spec.md
- Database Schema: @.agent-os/specs/2026-11-09-bug-report-tool/sub-specs/database-schema.md
- Tests Specification: @.agent-os/specs/2026-11-09-bug-report-tool/sub-specs/tests.md
