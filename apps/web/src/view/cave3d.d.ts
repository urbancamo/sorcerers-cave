import type { CaveEngine } from "./ports";
import type { TileArt } from "../data/manifest";

export interface ViewPartyMember {
  sig: string; name: string; lead?: boolean; items: string[];
  fs: number; mp: number; charisma: boolean;
}
export interface BootOptions {
  mount: HTMLElement;
  engine: CaveEngine;
  tiles: Map<string, TileArt>;
  party: ViewPartyMember[];
  tileAR: number;
}
export function boot(opts: BootOptions): Promise<() => void>;
