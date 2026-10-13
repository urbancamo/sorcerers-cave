// The built-in strategies, registered when the driver is loaded. Kept apart from strategy.ts (the registry and `standard`) so
// a strategy can build on `standard` without a circular import.
import { registerStrategy } from "./strategy";
import { smartStrategy } from "./smartLoadout";
import { expertStrategy, noviceStrategy } from "./levelStrategies";
import { EXTERNAL_LEVELS, externalStrategy } from "./externalLevels";

registerStrategy(smartStrategy);
registerStrategy(noviceStrategy);
registerStrategy(expertStrategy);

// The external levels (stage 6): registered so a deployment can select one, but never run in process; the driver waits for the answer.
for (const [id, def] of Object.entries(EXTERNAL_LEVELS)) registerStrategy(externalStrategy({ id, version: def.version, budget: { deadlineMs: def.deadlineMs } }));
