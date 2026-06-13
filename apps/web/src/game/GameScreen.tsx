import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useCaveGame } from "./useCaveGame";
import { MoveList } from "./MoveList";

export default function GameScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const newGame = useMutation(api.game.newGame);
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const { engine, loading } = useCaveGame(gameId);

  useEffect(() => { if (!isLoading && !isAuthenticated) void signIn("anonymous"); }, [isLoading, isAuthenticated, signIn]);

  if (isLoading) return <p>Connecting…</p>;
  if (!isAuthenticated) return <p>Signing in…</p>;

  if (!gameId) {
    return (
      <button
        className="rounded bg-amber-700 px-4 py-2 font-semibold"
        onClick={async () => setGameId(await newGame({ seed: Date.now(), picks: [0] }))}
      >
        New game (Hero)
      </button>
    );
  }
  if (loading || !engine) return <p>Loading cave…</p>;

  const s = engine.state();
  return (
    <div className="flex flex-col items-center gap-3" data-testid="game-screen">
      <p>Turn {s.turn} · Level {s.level} · {engine.current.name} · {s.placed} placed · {s.deckLeft} in deck</p>
      <MoveList moves={engine.openMoves()} onMove={(dir) => engine.tryMove(dir)} />
    </div>
  );
}
