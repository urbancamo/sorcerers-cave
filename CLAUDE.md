# CLAUDE.md

Project guidance for AI agents working in this repository.

## Keep the engine spec in sync with the engine code

`docs/specs/engine-spec.md` is the current, authoritative specification of the game-logic
engine (`packages/engine`). It is **traceable**: Part I requirements cite `file:line` and the
tests that pin them.

**Whenever you change anything under `packages/engine/src`, update `docs/specs/engine-spec.md`
in the same change:**

1. **Part I (requirements)** — amend the affected `SC-<§>-<n>` row(s): the normative statement,
   the `file:line`, and the `test` reference. Add a **new** `SC-<§>-<n>` row if you introduced a
   new rule; the IDs are stable, so append rather than renumber.
2. **Part II (narrative)** — reflect any behaviour change in the readable rules prose, keeping the
   `(SC-…)` cross-references correct.
3. **Appendix A** — update data tables / constants if you changed `data/*`, `state.ts`, `rng.ts`, etc.
4. **Appendix C** — if you added or removed test coverage for a requirement, update the gap list
   (and flip a `—` to a real test reference, or vice-versa).

The code is the source of truth; if a change makes the spec and code disagree, fix the spec.

A `PostToolUse` hook in `.claude/settings.json` prints a reminder after any edit under
`packages/engine/src` — but the actual spec edit is your job.

## Keep the player's manual in sync with the game

`apps/web/public/manual.html` is the player-facing manual (served at `/manual.html`). It describes the
rules **as the game actually plays them**, so it goes stale whenever a feature does.

**Whenever you add or change anything a player can see or choose — a rule, a card or creature, a
variant or party-screen switch, a server-side house rule, a fight/trap/chamber behaviour, a control, or
how scores are recorded — check the manual in the same change and update it:**

1. Find the section the change belongs to (Fights, Hazards, The Sorcerer, Treasure, Scoring, …) and
   amend the existing text, including anything the change makes untrue (e.g. a "you never get X" claim).
2. A new optional variant the player ticks (like the Extension Kit or the Sibyl) gets its own section and
   a Contents entry. A rule switched on server-side with an env flag (see `apps/web/OPTIONS.md`) is
   described under **House Rules** and flagged in place with the `House rule` pill.
3. Keep the Quick Reference (controls and tips) accurate, and bump the `Updated` date in the footer.
4. Pure engine refactors, Test Mode and developer tooling need no manual change — say so in the PR
   description if you checked and found nothing to update.

Treat a feature as unfinished until the manual reflects it, the same as the engine spec above.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
