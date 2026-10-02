import { describe, it, expect } from "vitest";
import { carryRowHtml, escAttr } from "./rosterCarry";

const item = (name: string, over: Partial<{ file: string | null; weight: number; artifact: boolean }> = {}) =>
  ({ name, file: `/assets/${name}.png`, weight: 0, artifact: true, ...over });
const dragons = (count: number) => [{ kind: "dragon-slayer" as const, count, title: "Dragon-slayer — +1 fighting strength" }];
const elixir = (bonus: number) => [{ kind: "elixir" as const, bonus, title: `Elixir — +${bonus} fighting strength, for ever` }];
const member = (over: Partial<Parameters<typeof carryRowHtml>[0]> = {}) =>
  ({ items: [], awards: [], dragonCard: "/assets/dragon.png", ...over });

describe("carryRowHtml — the compressed roster's carried-items row", () => {
  it("shows each carried item, artifacts highlighted", () => {
    const html = carryRowHtml(member({ items: [item("Magic Sword"), item("Gold", { artifact: false, weight: 25 })] }));
    expect(html).toContain('<img class="tre art" src="/assets/Magic Sword.png" alt="Magic Sword" title="Magic Sword · artifact">');
    expect(html).toContain('<img class="tre" src="/assets/Gold.png" alt="Gold" title="Gold · 25kg">');
    expect(html).not.toContain("empty-handed");
  });

  it("says empty-handed only when there are no items and no dragons slain", () => {
    expect(carryRowHtml(member())).toContain("empty-handed");
  });

  // The bug: a Dragon-slayer's inverted card showed in the full party panel but never in this roster.
  it("shows one inverted dragon card per dragon slain, after the items", () => {
    const html = carryRowHtml(member({ items: [item("Magic Sword")], awards: dragons(2) }));
    const cards = html.match(/class="tre dragon-slain"/g) ?? [];
    expect(cards).toHaveLength(2);
    expect(html).toContain('src="/assets/dragon.png" alt="Dragon slain" title="Dragon-slayer — +1 fighting strength"');
    expect(html.indexOf("Magic Sword")).toBeLessThan(html.indexOf("dragon-slain")); // loot first, then the slain dragons
    expect(html).not.toContain("empty-handed");
  });

  it("shows a slayer who carries nothing (no 'empty-handed' beside a dragon card)", () => {
    const html = carryRowHtml(member({ awards: dragons(1) }));
    expect(html).toContain("dragon-slain");
    expect(html).not.toContain("empty-handed");
  });

  it("falls back to a dragon glyph when the card art is unresolved", () => {
    const html = carryRowHtml(member({ awards: dragons(1), dragonCard: null }));
    expect(html).toContain('<span class="tre ph dragon-slain"');
    expect(html).toContain("🐉");
  });

  it("shows the Elixir's permanent bonus as a chip, after the items", () => {
    const html = carryRowHtml(member({ items: [item("Magic Sword")], awards: elixir(2) }));
    expect(html).toContain('<span class="tre award fs" title="Elixir — +2 fighting strength, for ever">+2</span>');
    expect(html.indexOf("Magic Sword")).toBeLessThan(html.indexOf("award fs"));
    expect(html).not.toContain("empty-handed");
  });

  it("shows every award together: dragons, then the Elixir chip", () => {
    const html = carryRowHtml(member({ awards: [...dragons(1), ...elixir(2)] }));
    expect(html.indexOf("dragon-slain")).toBeLessThan(html.indexOf("award fs"));
  });

  it("escapes names and paths placed in attributes", () => {
    expect(escAttr(`a"b<c>&'d`)).toBe("a&quot;b&lt;c&gt;&amp;&#39;d");
  });
});
