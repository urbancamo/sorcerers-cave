# @sorcerers-cave/pairing-lab

A lean, seeded fight simulator and scenario generator for stranger-pairing research (Monte Carlo search and neural-net
training). It is **not part of the engine** and is never shipped to the browser. It reuses only the engine's pure
capability table and creature data, and is parity-tested against the engine's `previewPlan`.

Design and findings: `docs/requirements/combat/2026-10-06-monte-carlo-pairing-spec.md` (Appendix C).

## Use

```ts
import { simulate, randomScenario, balancedScenario, DEFAULT_RULES } from "@sorcerers-cave/pairing-lab";

const scenario = balancedScenario(42, "kit");                       // a strength-matched fight, any size
const outcome = simulate(scenario, DEFAULT_RULES, "GRD", "GRD", 7); // party style, stranger style, seed
```

- `simulate` is pure and seeded: the same scenario, rules, styles and seed always give the same outcome.
- Every open rule is a switch on `Rules`, defaulting to the proposal in the questions for Peter.
- Limits: `MAX_PARTY` (30 base, 40 kit) and `MAX_STRANGERS` (20), the game's own ceilings.

## Commands

| Command | What it does |
|---|---|
| `pnpm --filter @sorcerers-cave/pairing-lab test` | Run the tests |
| `pnpm --filter @sorcerers-cave/pairing-lab typecheck` | Typecheck |
| `pnpm --filter @sorcerers-cave/pairing-lab bench` | Speed table (fights per second, by fight size) |
