import { useEffect, useRef } from "react";
import type { CaveEngine } from "./ports";
import type { GameState } from "@sorcerers-cave/engine";
import { loadManifest, indexTilesById, type CardArt } from "../data/manifest";
import { boot } from "./cave3d";
import { viewParty } from "./viewParty";
import { CaveHud } from "./CaveHud";
import { partyColorHex, type PartyColor } from "../game/partyColors";

const TILE_AR = 1728 / 1210; // all tiles are 1728×1210 landscape (manifest)

/** Mounts the vanilla Three.js renderer, booted from the injected engine adapter. */
export function CaveCanvas({ engine, state, color }: { engine: CaveEngine; state: GameState; color: PartyColor }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const ctrl = useRef<{ dispose(): void; refresh(): void; setParty(p: ReturnType<typeof viewParty>): void } | null>(null);
  const cardsRef = useRef<CardArt[]>([]); // small-card art for resolving carried items in the roster
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    void (async () => {
      const { tiles, cards } = await loadManifest();
      if (cancelled) return;
      cardsRef.current = cards;
      ctrl.current = await boot({
        mount,
        engine,
        tiles: indexTilesById(tiles),
        party: viewParty(state, cards),
        tileAR: TILE_AR,
        partyColor: partyColorHex(colorRef.current),
      });
    })();
    return () => {
      cancelled = true;
      ctrl.current?.dispose();
      ctrl.current = null;
    };
    // Boot once per engine instance; live updates flow through the adapter the renderer already holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Panel-driven resolution mutates engine state outside the renderer's own doMove,
  // so re-sync the scene (roster after a join/death, exit markers, HUD, floor cards) on state change.
  useEffect(() => {
    ctrl.current?.setParty(viewParty(state, cardsRef.current));
    ctrl.current?.refresh();
  }, [state]);

  return <CaveHud mountRef={mountRef} />;
}
