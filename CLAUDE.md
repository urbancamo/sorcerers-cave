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
