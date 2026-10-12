// The built-in strategies, registered when the driver is loaded. Kept apart from strategy.ts (the registry and `standard`) so
// a strategy can build on `standard` without a circular import.
import { registerStrategy } from "./strategy";
import { smartStrategy } from "./smartLoadout";

registerStrategy(smartStrategy);
