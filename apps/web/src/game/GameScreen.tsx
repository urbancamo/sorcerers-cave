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
import { SaveGameModal } from "./SaveGameModal";
import { eventNotices, type Notice } from "./eventNotices";
import { MULTIPLAYER_ENABLED } from "./featureFlags";
import { MultiplayerSetup } from "./MultiplayerSetup";
import { MultiplayerLobby } from "./MultiplayerLobby";

export default function GameScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const newGame = useMutation(api.game.newGame);
  const saveGame = useMutation(api.game.save);
  const resumeByCode = useMutation(api.game.resumeByCode);
  const saveScore = useMutation(api.highScores.save);
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const [started, setStarted] = useState(false); // dismissed the splash
  const [showParty, setShowParty] = useState(false); // expanded party panel
  const [savedCode, setSavedCode] = useState<string | null>(null); // shows the save modal when set
  // Multiplayer flow (behind the production-off feature flag): create/join setup → reactive lobby.
  const [mp, setMp] = useState<{ view: "create" | "join" } | { view: "lobby"; code: string } | null>(null);
  // The dice overlay lives here (not in EncounterPanel) so a fatal round's roll
  // still shows even though game-over swaps the panel out for GameOverScreen.
  const [roll, setRoll] = useState<RollView | null>(null);
  // Notices for panel-dispatched outcomes that aren't dice rolls (artifact effects, etc.).
  const [notices, setNotices] = useState<Notice[] | null>(null);
  // Dice rolled by a move (e.g. ghouls fighting each member on entry) surface here too.
  const onMoveResolved = useCallback((events: GameEvent[]) => {
    const view = rollFromEvents(events);
    if (view) setRoll(view);
  }, []);
  const { engine, loading, state, color, dispatch } = useCaveGame(gameId, onMoveResolved);
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

  // Return to the splash screen, clearing all in-game overlays and the current game binding.
  const goHome = useCallback(() => {
    setRoll(null); setNotices(null); setSavedCode(null); setShowParty(false); setGameId(null); setStarted(false);
  }, []);

  // Save from the HUD: the state is already authoritative in Convex, so this just surfaces the
  // four-letter code (modal) and, on dismiss, returns to the menu.
  const handleSave = useCallback(async () => {
    if (!gameId) return;
    setSavedCode(await saveGame({ id: gameId }));
  }, [gameId, saveGame]);

  // Resume from the splash by code: look it up, claim it, and drop straight into the loaded game.
  const handleResume = useCallback(async (code: string): Promise<boolean> => {
    const id = await resumeByCode({ code });
    if (!id) return false;
    setGameId(id);
    setStarted(true);
    return true;
  }, [resumeByCode]);

  useEffect(() => { if (!isLoading && !isAuthenticated) void signIn("anonymous"); }, [isLoading, isAuthenticated, signIn]);

  if (isLoading) return <p>Connecting…</p>;
  if (!isAuthenticated) return <p>Signing in…</p>;

  // Multiplayer (flag-gated): create/join setup, then the reactive lobby.
  if (mp) {
    if (mp.view === "lobby") {
      return <MultiplayerLobby code={mp.code} onExit={() => setMp(null)} />;
    }
    return (
      <MultiplayerSetup
        mode={mp.view}
        onEnterLobby={(code) => setMp({ view: "lobby", code })}
        onCancel={() => setMp(null)}
      />
    );
  }

  if (!started) {
    return (
      <SplashScreen
        onStartSolitaire={() => setStarted(true)}
        onResume={handleResume}
        onStartMultiplayer={MULTIPLAYER_ENABLED ? () => setMp({ view: "create" }) : undefined}
        onJoinMultiplayer={MULTIPLAYER_ENABLED ? () => setMp({ view: "join" }) : undefined}
      />
    );
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
          // Return to the splash screen (the home / high-scores entry), not straight to party select.
          onNewGame={() => { setRoll(null); setNotices(null); setGameId(null); setStarted(false); }}
          onSaveScore={(name) => saveScore({ gameId, name })}
          leaderboard={leaderboard}
        />
        {overlay}
      </>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas key={gameId} engine={engine} state={state} color={color} onPartyClick={() => setShowParty(true)} onSave={handleSave} />
      <EncounterPanel state={state} dispatch={dispatchWithRolls} />
      <ExplorePanel state={state} dispatch={dispatchWithRolls} />
      {showParty && <PartyPanel state={state} dispatch={dispatch} onClose={() => setShowParty(false)} />}
      {overlay}
      {notices && <NoticeModal notices={notices} onClose={() => setNotices(null)} />}
      {savedCode && <SaveGameModal code={savedCode} onClose={goHome} />}
    </div>
  );
}
