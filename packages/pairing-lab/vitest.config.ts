import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@engine-testkit": fileURLToPath(new URL("../engine/src/testkit.ts", import.meta.url)) },
  },
  // Long-running speed measurements live in *.perf.test.ts and only run with PERF=1 (see `pnpm bench`).
  test: { globals: true, environment: "node", testTimeout: 120_000 },
});
