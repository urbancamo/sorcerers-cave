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
