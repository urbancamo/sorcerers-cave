// The game's card art for the battle viewer: find the asset folder, map creature and treasure ids to card files (through the
// asset manifest), and make small thumbnails so a standalone page stays light (a card is about 900 KB as shipped).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface Manifest {
  categories: Record<string, { dir: string; items: { file: string; name?: string; category?: string; entityId?: number | null }[] }>;
}
export interface CardFiles { creature: Record<number, string>; treasure: Record<number, string> }
export interface CardArt { creature: Record<number, string>; treasure: Record<number, string> }   // data URIs
export type Thumbnailer = (src: string, dest: string, width: number) => boolean;

/** Walk up from `start` to find `docs/assets` (the folder holding manifest.json). */
export function findAssetDir(start: string = process.cwd()): string | null {
  let dir = resolve(start);
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, "docs", "assets");
    if (existsSync(join(candidate, "manifest.json"))) return candidate;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** The first card that depicts each creature and each treasure, from the base and the extension-kit sheets. */
export function cardFiles(manifest: Manifest, assetDir: string): CardFiles {
  const out: CardFiles = { creature: {}, treasure: {} };
  for (const key of ["cards", "cardsExtension"]) {
    const cat = manifest.categories[key];
    if (!cat) continue;
    for (const it of cat.items) {
      if (typeof it.entityId !== "number") continue;
      const kind = it.category === "creature" ? out.creature : it.category === "treasure" ? out.treasure : null;
      if (kind && kind[it.entityId] === undefined) kind[it.entityId] = join(assetDir, cat.dir, it.file);
    }
  }
  return out;
}

/** Make a small JPEG with whatever image tool the machine has: macOS `sips`, or ImageMagick. */
export const defaultThumbnailer: Thumbnailer = (src, dest, width) => {
  const attempts: [string, string[]][] = [
    ["sips", ["-s", "format", "jpeg", "-s", "formatOptions", "68", "--resampleWidth", String(width), src, "--out", dest]],
    ["magick", [src, "-resize", `${width}x`, "-quality", "68", dest]],
    ["convert", [src, "-resize", `${width}x`, "-quality", "68", dest]],
  ];
  for (const [cmd, args] of attempts) {
    try { execFileSync(cmd, args, { stdio: "ignore" }); if (existsSync(dest)) return true; } catch { /* try the next tool */ }
  }
  return false;
};

export interface LoadArtOptions {
  assetDir?: string | null;      // default: found by walking up from the current folder
  cacheDir?: string;             // thumbnails are kept here and reused (default: runs/.card-cache)
  width?: number;                // thumbnail width in pixels (default 240)
  thumbnailer?: Thumbnailer;
}

/** Data URIs for the creature and treasure cards asked for. Cards that cannot be found or thumbnailed are left out, and the
 *  viewer draws a plain card for them. */
export function loadArt(needed: { creature: number[]; treasure: number[] }, o: LoadArtOptions = {}): CardArt {
  const out: CardArt = { creature: {}, treasure: {} };
  const assetDir = o.assetDir === undefined ? findAssetDir() : o.assetDir;
  if (!assetDir) return out;
  const manifestPath = join(assetDir, "manifest.json");
  if (!existsSync(manifestPath)) return out;
  const files = cardFiles(JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest, assetDir);
  const width = o.width ?? 240, cacheDir = o.cacheDir ?? join("runs", ".card-cache"), thumb = o.thumbnailer ?? defaultThumbnailer;
  mkdirSync(cacheDir, { recursive: true });

  const one = (src: string | undefined): string | undefined => {
    if (!src || !existsSync(src)) return undefined;
    const dest = join(cacheDir, `${src.split("/").pop()!.replace(/\.png$/, "")}.${width}.jpg`);
    if (!existsSync(dest) && !thumb(src, dest, width)) return undefined;
    return existsSync(dest) ? `data:image/jpeg;base64,${readFileSync(dest).toString("base64")}` : undefined;
  };
  for (const id of needed.creature) { const d = one(files.creature[id]); if (d) out.creature[id] = d; }
  for (const id of needed.treasure) { const d = one(files.treasure[id]); if (d) out.treasure[id] = d; }
  return out;
}
