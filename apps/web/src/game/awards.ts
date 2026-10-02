/** A permanent mark a member has earned — shown on them in the full party panel and the compressed
 *  roster alike (both draw from `awardsOf`, so a new award can't be added to one and forgotten in the
 *  other). Carried items (the Ruby, a sword) are not awards: they can be traded or lost. */
export type Award =
  | { kind: "dragon-slayer"; count: number; title: string }
  | { kind: "elixir"; bonus: number; title: string };

export function awardsOf(m: { dragonKills: number; fsBonus?: number }): Award[] {
  const out: Award[] = [];
  if (m.dragonKills > 0) out.push({ kind: "dragon-slayer", count: m.dragonKills, title: "Dragon-slayer — +1 fighting strength" });
  if (m.fsBonus) out.push({ kind: "elixir", bonus: m.fsBonus, title: `Elixir — +${m.fsBonus} fighting strength, for ever` });
  return out;
}
