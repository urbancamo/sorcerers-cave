import type { CaveEngine } from "./ports";
import type { TileArt } from "../data/manifest";

/** A treasure or artifact a member is carrying, with its small-card art (if resolved). */
export interface ViewItem {
  name: string;
  file: string | null;  // small-card image URL, or null when unresolved (e.g. under test)
  weight: number;        // kg (0 for artifacts)
  artifact: boolean;
}
export interface ViewPartyMember {
  sig: string; name: string; lead?: boolean;
  items: ViewItem[];
  carry: number;  // capacity (kg)
  load: number;   // carried heavy weight (kg)
  fs: number; mp: number; charisma: boolean;
  ally: boolean;      // befriended stranger (status 1), not an original recruit
  petrified: boolean; // turned to stone (status 2) — incapacitated until cured
}
export interface BootOptions {
  mount: HTMLElement;
  engine: CaveEngine;
  tiles: Map<string, TileArt>;
  party: ViewPartyMember[];
  tileAR: number;
  partyColor?: string; // marker colour (hex)
  multiplayer?: boolean; // tints per-party markers (e.g. secret doors) with partyColor when true
  onQuit?: () => void; // when set, the HUD "Quit" delegates here instead of the built-in confirm (multiplayer)
}
export function boot(opts: BootOptions): Promise<{
  dispose(): void;
  refresh(): void;
  setParty(party: ViewPartyMember[]): void;
  setOtherParties(list: { color: string; col: number; row: number; level: number }[]): void;
  focusArea(a: { col: number; row: number; level: number }): void;
}>;
