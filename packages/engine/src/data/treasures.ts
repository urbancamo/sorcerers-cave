export type TreasureKind = "heavy" | "artifact";

export interface Treasure {
  id: number;
  name: string;
  points: number;
  weight: number; // kg (0 for artifacts)
  kind: TreasureKind;
}

export const TREASURES: readonly Treasure[] = [
  { id: 0, name: "Silver", points: 5, weight: 25, kind: "heavy" },
  { id: 1, name: "Gold", points: 10, weight: 25, kind: "heavy" },
  { id: 2, name: "Gems", points: 20, weight: 25, kind: "heavy" },
  { id: 3, name: "Magic Sword", points: 15, weight: 0, kind: "artifact" },
  { id: 4, name: "Magic Carpet", points: 5, weight: 0, kind: "artifact" },
  { id: 5, name: "Lotus Dust", points: 5, weight: 0, kind: "artifact" },
  { id: 6, name: "Healing Balm", points: 5, weight: 0, kind: "artifact" },
  { id: 7, name: "Talisman", points: 10, weight: 0, kind: "artifact" },
  { id: 8, name: "Strength Potion", points: 5, weight: 0, kind: "artifact" },
  { id: 9, name: "Magic Staff", points: 15, weight: 0, kind: "artifact" },
  { id: 10, name: "The Ring", points: 30, weight: 0, kind: "artifact" },
  { id: 11, name: "Lost Ruby", points: 20, weight: 0, kind: "artifact" },
  { id: 12, name: "Charmed Flute", points: 10, weight: 0, kind: "artifact" },
  { id: 13, name: "Eye of God", points: 0, weight: 0, kind: "artifact" },
  { id: 14, name: "Treasure Chest", points: 0, weight: 100, kind: "heavy" },
];

// Extension-kit treasure rows (ids 15-21), id order normative — classifications per the official
// kit INVENTORY (Idol and Crypt/Gems are HEAVY treasure; the rest are artifacts). Kept as a
// SEPARATE table rather than appended onto `TREASURES` itself: the base array's length is pinned
// by `data.test.ts`, which must stay green unmodified (SC-EXT-2). `ALL_TREASURES` below is the
// combined, id-indexed lookup for code that needs to resolve either a base or a kit treasure.
export const KIT_TREASURES: readonly Treasure[] = [
  { id: 15, name: "Elixir", points: 0, weight: 0, kind: "artifact" },
  { id: 16, name: "Holy Water", points: 5, weight: 0, kind: "artifact" },
  { id: 17, name: "Magic Axe", points: 15, weight: 0, kind: "artifact" },
  // 50 kg (corrected 2026-08-03): the original OCR transcription of the kit leaflet omitted the
  // Idol's weight entirely; the designer's own page-12 PDF confirms 50 kg — NOT 25 kg like
  // Crypt/Gems below, despite both being the kit's only other HEAVY treasure.
  { id: 18, name: "Idol", points: 0, weight: 50, kind: "heavy" }, // scored 10×d6 at game end (Task 12)
  { id: 19, name: "Scroll", points: 0, weight: 0, kind: "artifact" },
  { id: 20, name: "Magic Shield", points: 15, weight: 0, kind: "artifact" },
  { id: 21, name: "Crypt/Gems", points: 20, weight: 25, kind: "heavy" }, // parks as the crypt when drawn (Task 8)
];

/** Combined treasure lookup, indexed by absolute id 0-21 (base ids at their own index, kit ids
 *  continuing directly after). Base game code paths keep indexing `TREASURES` directly; this
 *  exists for later kit tasks (SC-EXT-2). */
export const ALL_TREASURES: readonly Treasure[] = [...TREASURES, ...KIT_TREASURES];
