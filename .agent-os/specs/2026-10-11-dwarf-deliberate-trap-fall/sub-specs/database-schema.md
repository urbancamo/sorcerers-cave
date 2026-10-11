# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2026-10-11-dwarf-deliberate-trap-fall/spec.md

> Created: 2026-10-11
> Version: 1.0.0

## Changes

No new tables or columns. One optional key is added to the existing `variants` object validator in `apps/web/convex/schema.ts:41`:

```ts
variants: v.optional(v.object({
  zombies: v.optional(v.boolean()),
  fogLite: v.optional(v.boolean()),
  concurrent: v.optional(v.boolean()),
  extensionKit: v.optional(v.boolean()),
  forcedRedraw: v.optional(v.boolean()),
  sorcererTeleport: v.optional(v.boolean()),
  trapRules: v.optional(v.boolean()),
})),
```

## Rationale

- The Convex validator drops unknown keys (a previous bug lost `testForceDie`/`testAllDice` this way), so `trapRules` must be added here or a stamped flag never reaches storage or the log export.
- `game.ts`'s client-facing `variantsValidator` deliberately gets no `trapRules` key: it is server-stamped only.
- No migration needed; the key is optional and absent on every existing game. `highScores` rows may carry `trapRules` for information, as with `forcedRedraw`, without filtering on it.
