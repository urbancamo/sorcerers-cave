import type { ViewPartyMember } from "./cave3d";

/** Escape a value for use inside an HTML attribute / text node. */
export function escAttr(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** The compressed roster's carried-items row for one member: a thumbnail per carried item, then each
 *  earned award (awards.ts): an inverted Dragon card per dragon felled single-handed (as in the full
 *  party panel — the boxed game's upside-down dragon card), and a "+N" chip for the Elixir's permanent
 *  bonus. "empty-handed" only when there are neither items nor awards. */
export function carryRowHtml(m: Pick<ViewPartyMember, "items" | "awards" | "dragonCard">): string {
  const items = m.items.map((it) => {
    const t = escAttr(it.name + (it.artifact ? " · artifact" : ` · ${it.weight}kg`));
    return it.file
      ? `<img class="tre${it.artifact ? " art" : ""}" src="${escAttr(it.file)}" alt="${escAttr(it.name)}" title="${t}">`
      : `<span class="tre ph${it.artifact ? " art" : ""}" title="${t}">${escAttr(it.name[0] || "?")}</span>`;
  });
  const awards = m.awards.flatMap((a) => {
    if (a.kind === "elixir") return [`<span class="tre award fs" title="${escAttr(a.title)}">+${a.bonus}</span>`];
    return Array.from({ length: a.count }, () =>
      m.dragonCard
        ? `<img class="tre dragon-slain" src="${escAttr(m.dragonCard)}" alt="Dragon slain" title="${escAttr(a.title)}">`
        : `<span class="tre ph dragon-slain" title="${escAttr(a.title)}">🐉</span>`);
  });
  const all = [...items, ...awards];
  return all.length
    ? `<div class="carry">${all.join("")}</div>`
    : '<div class="carry"><span class="empty">empty-handed</span></div>';
}
