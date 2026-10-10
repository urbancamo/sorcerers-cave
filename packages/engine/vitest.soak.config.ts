import { defineConfig } from "vitest/config";

// The long-running soak tests (`src/*.soak.ts`). Deliberately a separate config: the normal `vitest run`
// only includes `*.test.ts`, so these never run as part of the build. See `src/redraw.soak.ts`.
export default defineConfig({
  test: { globals: true, environment: "node", include: ["src/**/*.soak.ts"], testTimeout: 0, hookTimeout: 0 },
});
