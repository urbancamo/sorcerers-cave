/** Selectable party colours (stored server-side so multiplayer can later reserve taken ones). */
export const PARTY_COLORS = ["green", "blue", "yellow", "red"] as const;
export type PartyColor = (typeof PARTY_COLORS)[number];

export const DEFAULT_PARTY_COLOR: PartyColor = "yellow";

/** Display/marker hex per colour. */
export const PARTY_COLOR_HEX: Record<PartyColor, string> = {
  green: "#5bbf63",
  blue: "#5b9be6",
  yellow: "#e6c84e",
  red: "#d65b4a",
};

export function partyColorHex(c: PartyColor | undefined | null): string {
  return PARTY_COLOR_HEX[c ?? DEFAULT_PARTY_COLOR] ?? PARTY_COLOR_HEX[DEFAULT_PARTY_COLOR];
}
