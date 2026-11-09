import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";

// Shown in bug reports so an issue can be matched to the code that produced it.
function buildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "dev"; }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId()) },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        caveTest: "cave-test.html",
      },
    },
  },
});
