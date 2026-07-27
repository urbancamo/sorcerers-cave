import { ALL_CREATURES } from "@sorcerers-cave/engine";

/**
 * Party-wide, stable disambiguation labels. When the party holds more than one member of the same
 * creature class, each such member is numbered by party order — "Priest #1", "Priest #2", … — so a
 * given member reads identically everywhere: the roster, the party panel, and every dropdown / fight
 * card. A class with a single member keeps its plain name. Numbering is by index in `state.party`
 * (the authoritative order), so the same member always carries the same number.
 */
export function memberLabels(party: readonly { creatureId: number }[]): string[] {
  const total = new Map<number, number>();
  for (const m of party) total.set(m.creatureId, (total.get(m.creatureId) ?? 0) + 1);
  const seen = new Map<number, number>();
  return party.map((m) => {
    const name = ALL_CREATURES[m.creatureId]?.name ?? "?";
    if ((total.get(m.creatureId) ?? 0) <= 1) return name;
    const n = (seen.get(m.creatureId) ?? 0) + 1;
    seen.set(m.creatureId, n);
    return `${name} #${n}`;
  });
}

/** The stable label for one member by its index in `state.party`. */
export function memberLabel(party: readonly { creatureId: number }[], index: number): string {
  return memberLabels(party)[index] ?? "a companion";
}
