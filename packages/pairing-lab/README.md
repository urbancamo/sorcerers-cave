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

## Storing results

`report` simulates a run and writes it to `runs/` (git-ignored):

```
pnpm --filter @sorcerers-cave/pairing-lab report -- --count 5000 --deck kit --party GRD --strangers GRD --detail 50
pnpm --filter @sorcerers-cave/pairing-lab report -- --replay runs/NAME.json
```

- `NAME.json`: every scenario in full, with its outcome; replayable exactly.
- `NAME.log`: a line-printer listing, **one scenario per line**, with the creatures as the game log's 3-letter codes.
- `NAME.matches.log` (with `--detail N`): **one match per line** for the first N scenarios.

Options: `--id --deck base|kit --generator balanced|random --seed --count --party --strangers --out --detail`.

## Watching a battle

`battle` turns one scenario from a stored run into a single self-contained, interactive HTML page that replays the
fight round by round with the game's card art (thumbnails are embedded; no network requests).

```
pnpm --filter @sorcerers-cave/pairing-lab battle -- runs/NAME.json#3555 [--scenario N] [--out PATH] [--assets DIR] [--width PX] [--no-art] [--open]
```

The reference is `file.json#scenarioId` (or give `--scenario`). The battle is replayed and checked against the
recorded outcome first. Default output: `runs/battles/<runId>-<id>.html`. Keys: ←/→ step, Home/End, Space to play.
