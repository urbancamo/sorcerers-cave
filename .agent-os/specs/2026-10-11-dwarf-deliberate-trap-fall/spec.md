# Spec Requirements Document

> Spec: Standing Traps and the Dwarf's Deliberate Fall
> Created: 2026-10-11
> Status: Planning

## Overview

Make a trap a standing feature of its chamber ("continues in effect") and let a party with a Dwarf choose, through a popup, between being guided past the trap and falling through it on purpose. A deliberate fall, including a knowing return by a trap and a return by a retreated party, gains the advantage of surprise.

It also enforces the rule that a Dwarf's guidance can be lost: if the Dwarf dies (or is otherwise gone) while the party is in a trap chamber, the party falls as soon as it tries to leave.

Rulings and reasoning: `docs/requirements/2026-10-09-dwarfs-and-surprise-rule-debate.md` (Q1 allowed; Q2 rejected, no house rule; 11-OCT-2026 ruling on retreated parties).

## User Stories

### Dwarf party chooses to fall

As a player whose party includes a Dwarf, I want to be asked whether to be guided past a trap or fall through it, so that I can use the trap as a route down instead of having it silently negated.

When a chamber's trap resolves for a party with a Dwarf (when the trap is drawn, and on every later entry to the chamber), play pauses and a popup offers two buttons: "Guided past the trap" and "Fall through the trap". Guided past carries on as today. Fall drops the whole party one level, one-way, as any trap fall does, but counts as deliberate.

### Knowing return by a trap gains surprise

As a player, I want a party that deliberately uses a trap to arrive with the advantage of surprise, so that going back down to attack known strangers is worth the risk.

A party that falls on purpose (the Dwarf's choice) or that re-enters a chamber it knows holds a trap gets the +1 first-round surprise on the chamber below, even if it has visited that chamber before, and even if it retreated from the strangers there. A fall from a trap drawn on that entry stays accidental and gains none.

### A trap stays a trap

As a player, I want a trap to remain in its chamber after it fires or is avoided, so that the board matches the rule text ("Continues in effect") and other parties and later visits meet it.

A party guided past a trap that loses its Dwarf (killed in a fight in the chamber, or otherwise gone) is no longer guided: the first time it tries to leave the chamber, by a doorway, a stairway, a withdrawal or a retreat, it falls down the trap instead. That fall is accidental and gains no surprise.

## Spec Scope

1. **Standing trap and variant gate** - A drawn trap is parked on its chamber and reloads on every re-entry; two traps in one chamber cannot be avoided by a Dwarf; everything sits behind a server-stamped `variants.trapRules` flag (env `TRAP_RULES_ENABLED`), off by default, so recorded games replay unchanged.
2. **Dwarf choice popup** - A new `trap` pause phase with two actions (avoid, fall) shown as a popup in the web UI, resolving after the earlier hazards in the fixed order.
3. **Deliberate-fall flag and surprise** - A `deliberateFall` marker set by a Dwarf's choice or a knowing re-entry, granting surprise on arrival (including visited chambers and hostile, retreated-from chambers).
4. **Guide lost** - A party standing in a chamber with a standing trap and no living Dwarf falls (accidentally) when it tries to leave by `move`, `withdraw` or `retreat`.
5. **Presentation and docs** - Notices, game-log lines and mnemonics for the new actions and events; engine spec, rules text and tests updated.

## Out of Scope

- Any "first fall has no surprise, later falls do" rule (Q2). Rejected; no house rule.
- Leaving a trap chamber by magic (Magic Carpet, the Sorcerer's teleport) or by the Chasm: these do not trigger the guide-lost fall.
- Making the Chasm descent or the Crypt trap deliberate-for-surprise; they are unchanged.
- Changes to withdraw and retreat: both stay blocked after any trap fall.
- Multiplayer-only trap visibility to other parties beyond reusing the parked marker (see technical spec, open point).

## Expected Deliverable

1. With `trapRules` on, a Dwarf party that draws or re-enters a trap chamber sees a popup with two buttons; "Fall through the trap" lands the party one level down and an attack there starts with the +1 surprise, "Guided past the trap" leaves the party in the chamber.
2. With `trapRules` on, a party without a Dwarf that re-enters a chamber where a trap already sits falls again and gains surprise below; a trap drawn on the current entry gains none. A Dwarf-guided party whose Dwarf dies in that chamber falls, with no surprise, when it next tries to leave.
3. With `trapRules` off, behaviour and recorded games are byte-identical to today.

## Spec Documentation

- Technical Specification: @.agent-os/specs/2026-10-11-dwarf-deliberate-trap-fall/sub-specs/technical-spec.md
- Database Schema: @.agent-os/specs/2026-10-11-dwarf-deliberate-trap-fall/sub-specs/database-schema.md
- Tests Specification: @.agent-os/specs/2026-10-11-dwarf-deliberate-trap-fall/sub-specs/tests.md
