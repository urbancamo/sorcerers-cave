import { describe, it, expect } from "vitest";
import { ASSET_BASE, type AssetItem, type AssetManifest } from "./index";

describe("assets package", () => {
  it("exposes a served base path", () => {
    expect(ASSET_BASE).toBe("/assets");
  });

  it("AssetManifest type is structurally usable", () => {
    const m: AssetManifest = { generated: "2026-06-12", categories: {} };
    expect(Object.keys(m.categories)).toHaveLength(0);
  });

  it("small-card items carry name/category/entityId identification", () => {
    const dragon: AssetItem = {
      file: "small-card-s01-2.png", w: 700, h: 1000,
      name: "Dragon", category: "creature", entityId: 10,
    };
    expect(dragon.category).toBe("creature");
    expect(dragon.entityId).toBe(10);
  });
});
