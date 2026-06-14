import { useCallback, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { GS_PLAYING, type GameAction, type GameEvent } from "@sorcerers-cave/engine";
import { useCaveGame } from "./useCaveGame";
import { CaveCanvas } from "../view/CaveCanvas";
import { SplashScreen } from "./SplashScreen";
import { PartySelect } from "./PartySelect";
import { PartyPanel } from "./PartyPanel";
import { GameOverScreen } from "./GameOverScreen";
import type { LeaderboardRow } from "./HighScores";
import { EncounterPanel } from "./EncounterPanel";
import { ExplorePanel } from "./ExplorePanel";
import { DiceRoll } from "./DiceRoll";
import { rollFromEvents, type RollView } from "./rollView";
import { NoticeModal } from "./NoticeModal";
import { eventNotices, type Notice } from "./eventNotices";

export default function GameScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const newGame = useMutation(api.game.newGame);
  const saveScore = useMutation(api.highScores.save);
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const [started, setStarted] = useState(false); // dismissed the splash
  const [showParty, setShowParty] = useState(false); // expanded party panel
  const { engine, loading, state, color, dispatch } = useCaveGame(gameId);
  // The dice overlay lives here (not in EncounterPanel) so a fatal round's roll
  // still shows even though game-over swaps the panel out for GameOverScreen.
  const [roll, setRoll] = useState<RollView | null>(null);
  // Notices for panel-dispatched outcomes that aren't dice rolls (artifact effects, etc.).
  const [notices, setNotices] = useState<Notice[] | null>(null);
  // Leaderboard for the post-game screen; only subscribed once a game has ended.
  const gameOver = !!state && state.gs !== GS_PLAYING;
  const leaderboard = useQuery(api.highScores.list, gameOver ? {} : "skip") as
    | LeaderboardRow[]
    | undefined;

  const dispatchWithRolls = useCallback(
    async (action: GameAction) => {
      const res = await dispatch(action);
      const events = (res as { events?: GameEvent[] } | null)?.events ?? [];
      const view = rollFromEvents(events);
      // A dice view (reaction / chest / combat) already summarises the outcome; otherwise
      // surface any silent-event notices (artifact effects, lulled dragons, …).
      if (view) setRoll(view);
      else {
        const ns = eventNotices(events);
        if (ns.length) setNotices(ns);
      }
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
    return <PartySelect onConfirm={async (picks, color) => setGameId(await newGame({ seed: Date.now(), picks, color }))} />;
  }
  if (loading || !engine || !state) return <p>Loading cave…</p>;

  // Rendered on top of whatever screen is showing, so it survives a game-over transition.
  const overlay = roll ? (
    <DiceRoll title={roll.title} lanes={roll.lanes} message={roll.message} tone={roll.tone} onContinue={() => setRoll(null)} />
  ) : null;

  if (state.gs !== GS_PLAYING) {
    return (
      <>
        <GameOverScreen
          state={state}
          onNewGame={() => { setRoll(null); setGameId(null); }}
          onSaveScore={(name) => saveScore({ gameId, name })}
          leaderboard={leaderboard}
        />
        {overlay}
      </>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas key={gameId} engine={engine} state={state} color={color} onPartyClick={() => setShowParty(true)} />
      <EncounterPanel state={state} dispatch={dispatchWithRolls} />
      <ExplorePanel state={state} dispatch={dispatchWithRolls} />
      {showParty && <PartyPanel state={state} dispatch={dispatch} onClose={() => setShowParty(false)} />}
      {overlay}
      {notices && <NoticeModal notices={notices} onClose={() => setNotices(null)} />}
    </div>
  );
}
