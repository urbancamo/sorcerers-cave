import { useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css"; // global tokens + menu/encounter styles, so the harness matches the real app
import { newGame, reduce, type GameAction, type GameState } from "@sorcerers-cave/engine";
import { createCaveAdapter } from "./view/engineAdapter";
import { loadManifest } from "./data/manifest";
import { CaveCanvas } from "./view/CaveCanvas";
import { EncounterPanel } from "./game/EncounterPanel";
import type { ArtTables } from "./view/projection";

function Harness({ art }: { art: ArtTables }) {
  const [state, setState] = useState<GameState>(() => newGame(20260614, [5, 6]));
  // One adapter; apply() advances the shared mirror and re-syncs the adapter (idempotent for moves).
  const [adapter] = useState(() =>
    createCaveAdapter(state, art, { onAction: (a: GameAction) => apply(a) }),
  );
  function apply(a: GameAction) {
    setState((s) => { const next = reduce(s, a).state; adapter.sync(next); return next; });
  }
  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas engine={adapter} state={state} />
      <EncounterPanel state={state} dispatch={apply} />
    </div>
  );
}

void (async () => {
  const { tiles, cards } = await loadManifest();
  ReactDOM.createRoot(document.getElementById("root")!).render(<Harness art={{ tiles, cards }} />);
})();
