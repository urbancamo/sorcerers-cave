import { useEffect, useRef } from "react";
import type { CaveEngine } from "./ports";
import type { GameState } from "@sorcerers-cave/engine";
import { loadManifest, indexTilesById } from "../data/manifest";
import { boot } from "./cave3d";
import { viewParty } from "./viewParty";
import { CaveHud } from "./CaveHud";

const TILE_AR = 1728 / 1210; // all tiles are 1728×1210 landscape (manifest)

/** Mounts the vanilla Three.js renderer, booted from the injected engine adapter. */
export function CaveCanvas({ engine, state }: { engine: CaveEngine; state: GameState }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const { tiles } = await loadManifest();
      if (cancelled) return;
      dispose = await boot({
        mount,
        engine,
        tiles: indexTilesById(tiles),
        party: viewParty(state),
        tileAR: TILE_AR,
      });
    })();
    return () => {
      cancelled = true;
      dispose?.();
    };
    // Boot once per engine instance; live updates flow through the adapter the renderer already holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  return <CaveHud mountRef={mountRef} />;
}
