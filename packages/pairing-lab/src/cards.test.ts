import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardFiles, findAssetDir, loadArt, type Manifest } from "./cards";

const manifest: Manifest = {
  categories: {
    cards: { dir: "cards", items: [
      { file: "a.png", name: "Dragon", category: "creature", entityId: 10 },
      { file: "b.png", name: "Dragon", category: "creature", entityId: 10 },
      { file: "c.png", name: "Magic Sword", category: "treasure", entityId: 3 },
      { file: "d.png", name: "Sybil", category: "creature", entityId: null },
      { file: "e.png", name: "Earthquake", category: "hazard", entityId: 2 },
    ] },
    cardsExtension: { dir: "cards", items: [
      { file: "x.png", name: "Witch", category: "creature", entityId: 18 },
      { file: "y.png", name: "Magic Axe", category: "treasure", entityId: 17 },
    ] },
    tiles: { dir: "tiles", items: [{ file: "t.png" }] },
  },
};

describe("cardFiles", () => {
  it("maps each creature and treasure id to the first card that depicts it, in the base and kit sheets", () => {
    const f = cardFiles(manifest, "/assets");
    expect(f.creature).toEqual({ 10: "/assets/cards/a.png", 18: "/assets/cards/x.png" });
    expect(f.treasure).toEqual({ 3: "/assets/cards/c.png", 17: "/assets/cards/y.png" });
  });
});

describe("findAssetDir", () => {
  it("walks up from a folder to find docs/assets/manifest.json", () => {
    const root = mkdtempSync(join(tmpdir(), "assets-"));
    mkdirSync(join(root, "docs", "assets"), { recursive: true });
    writeFileSync(join(root, "docs", "assets", "manifest.json"), "{}");
    mkdirSync(join(root, "packages", "x", "y"), { recursive: true });
    expect(findAssetDir(join(root, "packages", "x", "y"))).toBe(join(root, "docs", "assets"));
    expect(findAssetDir(tmpdir() + "/nonexistent-folder-xyz")).toBeNull();
  });
});

describe("loadArt", () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), "art-"));
    mkdirSync(join(root, "cards"), { recursive: true });
    for (const n of ["a.png", "c.png", "x.png"]) writeFileSync(join(root, "cards", n), "PNGDATA-" + n);
    writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
    return root;
  };
  it("returns data URIs for the cards asked for, skipping any it cannot find", () => {
    const root = setup();
    const calls: string[] = [];
    const art = loadArt({ creature: [10, 18, 99], treasure: [3] }, {
      assetDir: root, cacheDir: join(root, "cache"), width: 200,
      thumbnailer: (src, dest) => { calls.push(src); writeFileSync(dest, "JPEG-" + src); return true; },
    });
    expect(Object.keys(art.creature).sort()).toEqual(["10", "18"]);
    expect(Object.keys(art.treasure)).toEqual(["3"]);
    expect(art.creature[10]).toMatch(/^data:image\/jpeg;base64,/);
    expect(Buffer.from(art.creature[10]!.split(",")[1]!, "base64").toString()).toContain("JPEG-");
    expect(calls.length).toBe(3);
  });
  it("makes each thumbnail once and reuses the cache", () => {
    const root = setup();
    let n = 0;
    const o = { assetDir: root, cacheDir: join(root, "cache"), width: 200, thumbnailer: (_s: string, d: string) => { n++; writeFileSync(d, "J"); return true; } };
    loadArt({ creature: [10], treasure: [] }, o);
    loadArt({ creature: [10], treasure: [] }, o);
    expect(n).toBe(1);
    expect(existsSync(join(root, "cache"))).toBe(true);
  });
  it("leaves a card out when the thumbnailer fails (the viewer then draws a plain card)", () => {
    const root = setup();
    const art = loadArt({ creature: [10], treasure: [3] }, { assetDir: root, cacheDir: join(root, "cache"), width: 200, thumbnailer: () => false });
    expect(art).toEqual({ creature: {}, treasure: {} });
  });
  it("returns nothing when there is no asset folder", () => {
    expect(loadArt({ creature: [10], treasure: [] }, { assetDir: null, width: 200 })).toEqual({ creature: {}, treasure: {} });
  });
});

describe("the real card art (skipped where the assets or an image tool are missing)", () => {
  const dir = findAssetDir();
  it.skipIf(!dir)("makes a small JPEG of the Dragon card", () => {
    const art = loadArt({ creature: [10], treasure: [3] }, { width: 160 });
    if (!art.creature[10]) return;   // no sips or ImageMagick on this machine
    expect(art.creature[10]).toMatch(/^data:image\/jpeg;base64,/);
    expect(art.creature[10]!.length).toBeGreaterThan(2000);
    expect(art.creature[10]!.length).toBeLessThan(120_000);
    expect(art.treasure[3]).toBeTruthy();
  });
});
