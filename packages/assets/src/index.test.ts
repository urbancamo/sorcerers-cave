import { describe, it, expect } from "vitest";
import { ASSET_BASE, type AssetManifest } from "./index";

describe("assets package", () => {
  it("exposes a served base path", () => {
    expect(ASSET_BASE).toBe("/assets");
  });

  it("AssetManifest type is structurally usable", () => {
    const m: AssetManifest = { generated: "2026-06-12", categories: {} };
    expect(Object.keys(m.categories)).toHaveLength(0);
  });
});
