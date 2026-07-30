import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { GS_PLAYING, type GameAction, type GameEvent, type GameState } from "@sorcerers-cave/engine";
import { useCaveGame } from "./useCaveGame";
import { CaveCanvas } from "../view/CaveCanvas";
import { SplashScreen } from "./SplashScreen";
import { PartySelect } from "./PartySelect";
import { PartyPanel } from "./PartyPanel";
import { GameOverScreen } from "./GameOverScreen";
import { EncounterPanel } from "./EncounterPanel";
import { ExplorePanel } from "./ExplorePanel";
import { FightSurface } from "./FightSurface";
import { useManifestCards } from "../data/useManifestCards";
import { DiceRoll } from "./DiceRoll";
import { rollFromEvents, type RollView } from "./rollView";
import { eventNotices, type Notice } from "./eventNotices";
import { useDispatchWithRolls } from "./useDispatchWithRolls";
import { showFightSurface } from "./fightGate";
import { NoticeModal } from "./NoticeModal";
import { SaveGameModal } from "./SaveGameModal";
import { GameLogModal } from "./GameLogModal";
import type { GameLog } from "./gameLog";
import { MULTIPLAYER_ENABLED } from "./featureFlags";
import { MultiplayerSetup } from "./MultiplayerSetup";
import { MultiplayerLobby } from "./MultiplayerLobby";
import { ReplayView, type ReplayBundle } from "./ReplayView";

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
  const [showLog, setShowLog] = useState(false); // shows the game-log download modal when true
  // Multiplayer flow (behind the production-off feature flag): create/join setup → reactive lobby.
  const [mp, setMp] = useState<{ view: "create" | "join" } | { view: "lobby"; code: string } | null>(null);
  // The dice overlay lives in useDispatchWithRolls (not in EncounterPanel) so a fatal round's
  // roll still shows even though game-over swaps the panel out for GameOverScreen. Its `pending`
  // bridges the subscription-vs-mutation race: it gates FightSurface below so a hostile
  // reaction's fight screen can never appear before its reaction roll.
  // Dice AND notices from a move (ghouls on entry, a mutiny in the drawn chamber, …) surface
  // here, held against the engine's mid-action snapshot when a relocation (trap fall, whirlpool
  // drag) interrupted the move — so events present against the room they happened in, not the
  // landing tile (SC-4-43, docs/bugs/ZTNU-log.json). Ref because useCaveGame must be called
  // before the roll hook that owns holdMove.
  const onHoldMoveRef = useRef<(mid: GameState | null, view: RollView | null, ns: Notice[]) => void>(() => {});
  const fightShownRef = useRef(false); // FightSurface already on screen (see gate below)
  const onMoveResolved = useCallback((events: GameEvent[], midState?: GameState) => {
    const view = rollFromEvents(events);
    const ns = eventNotices(events);
    if (view || ns.length) onHoldMoveRef.current(midState ?? null, view, ns);
  }, []);
  // Bug fix (HQTZ-log.json): refuse a canvas-initiated move while a previous one's dice/notice is
  // still presenting — otherwise the Convex round-trip for THIS move can resolve after the player
  // has already moved again, and its notice pops up over the wrong (later) tile. NOT just `holding`:
  // `holding` is `pending || heldState !== null`, but a canvas move's own `holdMove(mid, view, ns)`
  // only sets `heldState` when `mid` (SC-4-43's relocation snapshot) is non-null — an ORDINARY
  // move's notice (no relocation involved, e.g. entering a Whirlpool without being dragged down)
  // sets `notices` alone, leaving `holding` false while the modal is still up. Ref for the same
  // reason as onHoldMoveRef: useCaveGame runs before useDispatchWithRolls owns this state.
  const presentingRef = useRef(false);
  const canActRef = useRef(() => !presentingRef.current);
  const { engine, loading, state, color, code, dispatch, present } = useCaveGame(gameId, onMoveResolved, canActRef.current);
  // Presentation hold (see useDispatchWithRolls): the pre-action snapshot stays on screen —
  // canvas, panels, everything — until the die roll completes. getSnapshot reads a ref so the
  // capture always sees the freshest authoritative state without re-creating the callback.
  const stateRef = useRef<GameState | null>(state);
  stateRef.current = state;
  const getSnapshot = useCallback(() => stateRef.current, []);
  const { roll, notices, holding, heldState, dispatchWithRolls, holdMove, clearRoll, clearNotices } = useDispatchWithRolls(dispatch, getSnapshot);
  onHoldMoveRef.current = holdMove;
  presentingRef.current = holding || !!roll || !!notices;
  const cards = useManifestCards();
  const gameOver = !!state && state.gs !== GS_PLAYING;
  // The finished game's move log, for the post-game .txt / .log downloads (fetched only at game over).
  const gameLog = useQuery(api.game.log, gameOver && gameId ? { id: gameId } : "skip") as GameLog | null | undefined;

  // Return to the splash screen, clearing all in-game overlays and the current game binding.
  const goHome = useCallback(() => {
    clearRoll(); clearNotices(); setSavedCode(null); setShowParty(false); setGameId(null); setStarted(false);
  }, [clearRoll, clearNotices]);

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

  // Replay from the splash by code (§RB-3-3): fetch the shareable bundle once (no subscription —
  // a replay is a fixed record) and open the read-only viewer, or explain why we can't.
  const convex = useConvex();
  const [replayBundle, setReplayBundle] = useState<ReplayBundle | null>(null);
  const handleReplay = useCallback(async (code: string): Promise<string | null> => {
    const bundle = (await convex.query(api.game.replayByCode, { code })) as ReplayBundle | null;
    if (!bundle) return "No replayable game found with that code.";
    if (!bundle.replayable) return "This game predates full logging and cannot be replayed.";
    setReplayBundle(bundle);
    return null;
  }, [convex]);

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

  // The read-only replay viewer — entered from the splash or a high-score detail (this check
  // precedes every game surface, so it also overlays the game-over screen; never a live game).
  if (replayBundle) {
    return <ReplayView bundle={replayBundle} onExit={() => setReplayBundle(null)} />;
  }

  if (!started) {
    return (
      <SplashScreen
        onStartSolitaire={() => setStarted(true)}
        onResume={handleResume}
        onReplay={handleReplay}
        onStartMultiplayer={MULTIPLAYER_ENABLED ? () => setMp({ view: "create" }) : undefined}
        onJoinMultiplayer={MULTIPLAYER_ENABLED ? () => setMp({ view: "join" }) : undefined}
      />
    );
  }
  if (!gameId) {
    return (
      <PartySelect
        kitToggle
        onBack={() => setStarted(false)}
        onConfirm={async (picks, color, variants) => setGameId(await newGame({ seed: Date.now(), picks, color, variants }))}
      />
    );
  }
  if (loading || !engine || !state) return <p>Loading cave…</p>;

  // What the player SEES: the held pre-action snapshot while a roll is in flight or showing,
  // the live authoritative state otherwise. The 3D scene mirrors it too (render-phase sync,
  // before CaveCanvas's effects run — same guarantee useCaveGame's old inline sync gave).
  const displayState = holding && heldState ? heldState : state;
  present(displayState);

  // Fight-surface gate (see fightGate.ts): defer the INITIAL mount while a roll is in flight
  // or showing; once shown, mid-fight dispatches must not unmount it. Ref bookkeeping happens
  // during render, mirroring the present() sync above.
  const fightVisible = showFightSurface(displayState.phase === "fight", holding, fightShownRef.current);
  fightShownRef.current = fightVisible;

  // Rendered on top of whatever screen is showing, so it survives a game-over transition.
  const overlay = roll ? (
    <DiceRoll title={roll.title} lanes={roll.lanes} message={roll.message} tone={roll.tone} onContinue={clearRoll} />
  ) : null;

  if (displayState.gs !== GS_PLAYING) {
    return (
      <>
        <GameOverScreen
          state={displayState}
          // Return to the splash screen (the home / high-scores entry), not straight to party select.
          onNewGame={() => { clearRoll(); clearNotices(); setGameId(null); setStarted(false); }}
          onSaveScore={(name) => saveScore({ gameId, name })}
          log={gameLog ?? null}
          code={code ?? gameLog?.game.code ?? null}
          onReplay={handleReplay}
        />
        {overlay}
      </>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas key={gameId} engine={engine} state={displayState} color={color} code={code ?? undefined} onPartyClick={() => setShowParty(true)} onSave={handleSave} onLog={() => setShowLog(true)} />
      <EncounterPanel state={displayState} dispatch={dispatchWithRolls} />
      {fightVisible && cards && <FightSurface state={displayState} dispatch={dispatchWithRolls} cards={cards} />}
      <ExplorePanel state={displayState} dispatch={dispatchWithRolls} />
      {showParty && <PartyPanel state={displayState} dispatch={dispatch} onClose={() => setShowParty(false)} />}
      {overlay}
      {notices && <NoticeModal notices={notices} onClose={clearNotices} />}
      {savedCode && <SaveGameModal code={savedCode} onClose={goHome} />}
      {showLog && <GameLogModal gameId={gameId} onClose={() => setShowLog(false)} />}
    </div>
  );
}
