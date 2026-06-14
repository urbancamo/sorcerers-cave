// Copy the canonical asset set into apps/web/public/assets so Vite serves it at /assets.
// PNGs are gitignored (not committed); run `pnpm --filter web sync-assets` after checkout.
import { cpSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const src = resolve(repoRoot, "docs/assets");
const dest = resolve(here, "../public/assets");

mkdirSync(dest, { recursive: true });
// manifest is tiny — always refresh it.
cpSync(resolve(src, "manifest.json"), resolve(dest, "manifest.json"));
// PNG dirs are large — copy only if the target is missing/empty (idempotent, fast re-runs).
for (const dir of ["tiles", "cards", "tokens"]) {
  const from = resolve(src, dir);
  const to = resolve(dest, dir);
  if (!existsSync(from)) continue;
  if (existsSync(to) && readdirSync(to).length > 0) continue;
  cpSync(from, to, { recursive: true });
}
console.log(`Synced assets → ${dest}`);
