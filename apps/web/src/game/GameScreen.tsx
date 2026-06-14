import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { GS_PLAYING } from "@sorcerers-cave/engine";
import { useCaveGame } from "./useCaveGame";
import { CaveCanvas } from "../view/CaveCanvas";
import { PartySelect } from "./PartySelect";
import { GameOverScreen } from "./GameOverScreen";
import { EncounterPanel } from "./EncounterPanel";

export default function GameScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const newGame = useMutation(api.game.newGame);
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const { engine, loading, state, dispatch } = useCaveGame(gameId);

  useEffect(() => { if (!isLoading && !isAuthenticated) void signIn("anonymous"); }, [isLoading, isAuthenticated, signIn]);

  if (isLoading) return <p>Connecting…</p>;
  if (!isAuthenticated) return <p>Signing in…</p>;

  if (!gameId) {
    return <PartySelect onConfirm={async (picks) => setGameId(await newGame({ seed: Date.now(), picks }))} />;
  }
  if (loading || !engine || !state) return <p>Loading cave…</p>;

  if (state.gs !== GS_PLAYING) return <GameOverScreen state={state} onNewGame={() => setGameId(null)} />;

  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas key={gameId} engine={engine} state={state} />
      <EncounterPanel state={state} dispatch={dispatch} />
    </div>
  );
}
