import { useCallback, useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { GS_PLAYING, type GameAction, type GameEvent } from "@sorcerers-cave/engine";
import { useCaveGame } from "./useCaveGame";
import { CaveCanvas } from "../view/CaveCanvas";
import { SplashScreen } from "./SplashScreen";
import { PartySelect } from "./PartySelect";
import { GameOverScreen } from "./GameOverScreen";
import { EncounterPanel } from "./EncounterPanel";
import { DiceRoll } from "./DiceRoll";
import { rollFromEvents, type RollView } from "./rollView";

export default function GameScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const newGame = useMutation(api.game.newGame);
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const [started, setStarted] = useState(false); // dismissed the splash
  const { engine, loading, state, dispatch } = useCaveGame(gameId);
  // The dice overlay lives here (not in EncounterPanel) so a fatal round's roll
  // still shows even though game-over swaps the panel out for GameOverScreen.
  const [roll, setRoll] = useState<RollView | null>(null);

  const dispatchWithRolls = useCallback(
    async (action: GameAction) => {
      const res = await dispatch(action);
      const view = rollFromEvents((res as { events?: GameEvent[] } | null)?.events ?? []);
      if (view) setRoll(view);
      return res;
    },
    [dispatch],
  );

  useEffect(() => { if (!isLoading && !isAuthenticated) void signIn("anonymous"); }, [isLoading, isAuthenticated, signIn]);

  if (isLoading) return <p>Connecting…</p>;
  if (!isAuthenticated) return <p>Signing in…</p>;

  if (!started) {
    return <SplashScreen onStartSolitaire={() => setStarted(true)} />;
  }
  if (!gameId) {
    return <PartySelect onConfirm={async (picks) => setGameId(await newGame({ seed: Date.now(), picks }))} />;
  }
  if (loading || !engine || !state) return <p>Loading cave…</p>;

  // Rendered on top of whatever screen is showing, so it survives a game-over transition.
  const overlay = roll ? (
    <DiceRoll title={roll.title} lanes={roll.lanes} message={roll.message} tone={roll.tone} onContinue={() => setRoll(null)} />
  ) : null;

  if (state.gs !== GS_PLAYING) {
    return (
      <>
        <GameOverScreen state={state} onNewGame={() => { setRoll(null); setGameId(null); }} />
        {overlay}
      </>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas key={gameId} engine={engine} state={state} />
      <EncounterPanel state={state} dispatch={dispatchWithRolls} />
      {overlay}
    </div>
  );
}
