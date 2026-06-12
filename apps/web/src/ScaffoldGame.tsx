import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

export default function ScaffoldGame() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const newGame = useMutation(api.game.newGame);
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const game = useQuery(api.game.get, gameId ? { id: gameId } : "skip");

  // Anonymous sign-in once, on first load.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) void signIn("anonymous");
  }, [isLoading, isAuthenticated, signIn]);

  if (isLoading) return <p>Connecting…</p>;
  if (!isAuthenticated) return <p>Signing in…</p>;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        className="rounded bg-amber-700 px-4 py-2 font-semibold"
        onClick={async () => setGameId(await newGame({ seed: Date.now() }))}
      >
        New game
      </button>
      {game && (
        <p data-testid="game-state">
          game {gameId} — turn {game.state.turn}, seed {game.state.seed}
        </p>
      )}
    </div>
  );
}
