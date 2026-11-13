import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          // The revised combat is on by default in production; the backend tests keep the original battle plan as their baseline
          // unless a test says otherwise (game.test.ts › combatRevision tests the default itself).
          env: { REVISED_COMBAT_ENABLED: "0" },
          server: { deps: { inline: ["convex-test"] } },
        },
      },
    ],
  },
});
