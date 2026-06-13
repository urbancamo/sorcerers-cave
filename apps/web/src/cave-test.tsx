import ReactDOM from "react-dom/client";
import { newGame } from "@sorcerers-cave/engine";
import type { CaveEngine } from "./view/ports";
import { createCaveAdapter } from "./view/engineAdapter";
import { loadManifest } from "./data/manifest";
import { CaveCanvas } from "./view/CaveCanvas";

// Build a purely client-side adapter (no Convex) so the renderer can be exercised standalone.
async function main() {
  const { tiles, cards } = await loadManifest();
  const state = newGame(20260613, [5, 6]); // Man + Woman, a valid party
  // No-op onAction: createCaveAdapter's tryMove already advances its internal
  // mirror optimistically, so the standalone harness needs no server plumbing.
  const adapter: CaveEngine = createCaveAdapter(state, { tiles, cards }, {
    onAction: () => {},
  });
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <CaveCanvas engine={adapter} state={state} />,
  );
}
void main();
