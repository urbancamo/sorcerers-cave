import { defineConfig } from "vitest/config";

// The offline golden-game search (`src/*.search.ts`). Like the soak tests it is a separate config: the normal `vitest run`
// only includes `*.test.ts`, so a long search never runs as part of the build. See `src/goldenSearch.search.ts`.
export default defineConfig({
  test: { globals: true, environment: "node", include: ["src/**/*.search.ts"], testTimeout: 0, hookTimeout: 0 },
});
