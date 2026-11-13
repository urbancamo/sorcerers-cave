import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { GS_PLAYING, HAZARD_TRAP, legalActions, scoreGame, tutorialAt, unpackCoord, type GameAction, type GameEvent, type GameState } from "@sorcerers-cave/engine";
import { useCaveGame } from "./useCaveGame";
import { useLocalGame } from "./useLocalGame";
import { TutorialCoach } from "../tutorial/TutorialCoach";
import { TutorialParty } from "../tutorial/TutorialParty";
import { TUTORIAL_SCRIPT } from "../tutorial/script";
import { inProgress, loadProgress, saveProgress } from "../tutorial/progress";
import { initialTutorial, matchesBeat, tutorialReduce, wantedBeat, type TutorialEvent } from "../tutorial/runner";
import { CaveCanvas, type CaveApi } from "../view/CaveCanvas";
import { SplashScreen } from "./SplashScreen";
import { PartySelect } from "./PartySelect";
import { GameOverScreen } from "./GameOverScreen";
import { EncounterPanel } from "./EncounterPanel";
import { TrapChoice } from "./TrapChoice";
import { LeaderChoice } from "./LeaderChoice";
import { QuarrelChoice } from "./QuarrelChoice";
import { ExplorePanel } from "./ExplorePanel";
import { FightSurface } from "./FightSurface";
import { RevisedFightSurface } from "./RevisedFightSurface";
import { useManifestCards, useManifestArt } from "../data/useManifestCards";
import { DiceRoll } from "./DiceRoll";
import { rollFromEvents, type RollView } from "./rollView";
import { eventNotices, type Notice } from "./eventNotices";
import { useDispatchWithRolls } from "./useDispatchWithRolls";
import { showFightSurface } from "./fightGate";
import { AutoHideRightPanels } from "./shell/AutoHideRightPanels";
import { NoticeModal } from "./NoticeModal";
import { FeatCelebration } from "./FeatCelebration";
import { SorcererTerms, type DestinationPicker } from "./SorcererTerms";
import { TeleportEffect } from "./TeleportEffect";
import { DeadEndSwapBadge, announceDeadEndSwaps } from "./DeadEndSwapBadge";
import { SaveGameModal } from "./SaveGameModal";
import { GameLogModal } from "./GameLogModal";
import { BugReportModal } from "./BugReportModal";
import { captureGameWindow } from "./screenshot";
import type { GameLog } from "./gameLog";
import { MultiplayerSetup } from "./MultiplayerSetup";
import { MultiplayerLobby } from "./MultiplayerLobby";
import { ReplayView, type ReplayBundle } from "./ReplayView";
import { goldenBundle } from "./goldenGame";
import { clearTestGameHandoff, peekTestGameHandoff } from "./testHandoff";
import { TestControlsPanel } from "./TestControlsPanel";
import { TitleBar } from "./shell/TitleBar";
import { CardPanel, type Selected } from "./shell/CardPanel";
import { InventoryPanel } from "./shell/InventoryPanel";
import { ItemActions } from "./shell/ItemActions";
import { FloorTreasureActions } from "./shell/FloorTreasureActions";
import { useOfferOnPickup } from "./shell/useOfferOnPickup";
import { arrivalSelection } from "./shell/areaSelection";
import { SibylNote } from "./shell/SibylNote";
import { medusaSelection } from "./shell/medusaSelection";
import { SibylLook } from "./SibylLook";
import { memberLabels } from "./memberLabels";
import { inventoryRows, givenItemAt } from "./inventory";
import { viewParty } from "../view/viewParty";
import { PartyList } from "./shell/PartyList";
import { SettingsPanel } from "./shell/SettingsPanel";
import { sameSelection } from "./shell/sameSelection";
import { ExitPanel } from "./shell/ExitPanel";
import { useDismissOutside } from "./shell/useDismissOutside";
import { describeArea, readVerbose, writeVerbose } from "../data/areaText";
import { readAutoRoll, writeAutoRoll } from "./autoRoll";
import { HelpPanel } from "./shell/HelpPanel";
import { HelpProvider } from "../manual/HelpContext";
import type { HelpScreen } from "../manual";
import { toggleLeft, toggleRight, type LeftSlot, type RightSlot } from "./shell/shellState";
import { useOpenPartyOnce } from "./shell/useOpenPartyOnce";

// `local` plays the tutorial: the same game UI over an in-memory engine (no sign-in, saving, logging or Convex game at all).
export default function GameScreen({ local = false, resume = false, onLocalExit, onStartTutorial }: { local?: boolean; resume?: boolean; onLocalExit?: () => void; onStartTutorial?: (resume: boolean) => void } = {}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const newGame = useMutation(api.game.newGame);
  const saveGame = useMutation(api.game.save);
  const resumeByCode = useMutation(api.game.resumeByCode);
  const saveScore = useMutation(api.highScores.save);
  // The admin Testing tab starts or forks a Test Mode game, then lands here with its id left in sessionStorage.
  const [handoff] = useState(() => (local ? null : (peekTestGameHandoff() as Id<"games"> | null)));
  useEffect(() => { clearTestGameHandoff(); }, []);
  const [gameId, setGameId] = useState<Id<"games"> | null>(handoff);
  const gameKey: string | null = local ? 'tutorial' : gameId; // identifies the game on screen (a Convex id, or the local tutorial)
  const [started, setStarted] = useState(handoff !== null); // dismissed the splash
  // Thin shell slots (title bar icons). Inventory shows the party-and-treasure panel until the inventory list replaces it.
  const [leftSlot, setLeftSlot] = useState<LeftSlot>(null);
  const [rightSlot, setRightSlot] = useState<RightSlot>(null);
  // The Exit menu goes as soon as the player presses anything else (its own panel and its title-bar icon aside).
  const closeExit = useCallback(() => setRightSlot((cur) => (cur === 'exit' ? null : cur)), []);
  const hideRight = useCallback(() => setRightSlot(null), []);
  // In a fight the left list (party, or inventory in its place) can be put away so the dialog widens; it is back at the start of the next fight.
  const [fightListHidden, setFightListHidden] = useState(false);
  const showFightList = useCallback(() => setFightListHidden(false), []);
  useDismissOutside(rightSlot === 'exit', '[aria-label="Exit"]', closeExit);
  useOpenPartyOnce(gameKey, setLeftSlot); // the chosen party is on screen from the first step into the Gateway
  const [testOpen, setTestOpen] = useState(true); // the floating test panel (only exists in Test Mode), open by default, independent of the slots
  const [partyExpanded, setPartyExpanded] = useState(false); // the party list widened to show strength, magic and charisma
  const [selected, setSelected] = useState<Selected | null>(null); // what the card panel shows
  // A click on a card, tile, member or item shows it in the card panel; a second click on the SAME thing tidies the panel away again,
  // so the player need not travel to the far corner to close it (Peter, 2026-11-04 item 9).
  const pick = (next: Selected, rightNow = rightSlot, current = selected): void => {
    if (rightNow === 'card' && sameSelection(current, next)) { setSelected(null); setRightSlot(null); return; }
    setSelected(next); setRightSlot('card');
  };
  // The Sibyl's card is where her looks live. The scene re-reports "nothing selected here" on every state change (and after a peek),
  // which would close it mid-look; so while she is open, the scene's own reports are ignored until the party moves to another chamber.
  const sibylOpen = useRef<{ open: boolean; area: number }>({ open: false, area: -1 });
  sibylOpen.current.open = selected?.kind === 'member' && !!selected.member.sibyl;
  const partyAreaNow = useRef(-1);
  const [autoRoll, setAutoRoll] = useState(readAutoRoll); // skip the "Roll the dice" click on special rolls (a per-player setting)
  const [verbose, setVerbose] = useState(readVerbose); // story-voice area descriptions (a per-player setting)
  // Shows the save/restore code modal when set. `restored` distinguishes a plain save (dismiss ⇒
  // back to menu) from a just-forked Test Mode scenario (dismiss ⇒ keep playing the new game).
  const [savedCode, setSavedCode] = useState<{ code: string; restored: boolean } | null>(null);
  const [bugShot, setBugShot] = useState<Promise<Blob | null> | null>(null); // the game window, captured as the bug button is pressed
  const [bugOpen, setBugOpen] = useState(false); // the bug report form; it dispatches nothing, so it is safe to open mid-fight or mid-roll
  const [showLog, setShowLog] = useState(false); // shows the game-log download modal when true
  // The Sorcerer's teleport in flight: the area chosen. The effect plays first and the action is dispatched at its
  // peak, when the screen is black (see TeleportEffect).
  const [teleportTo, setTeleportTo] = useState<number | null>(null);
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
    announceDeadEndSwaps(events); // Test Mode badge; its own state, so no GameScreen re-render
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
  // Both session hooks run on every render (hooks cannot be conditional); the one not in use is idle (null id / no game).
  // The tutorial's step machine and its lock: only the action the coach is asking for gets through (see tutorial/runner.ts).
  // A returning player picks up where they left off: the saved step, and the game rebuilt by replaying the route to that point.
  const [resumeFrom] = useState(() => { const p = local && resume ? loadProgress() : null; return inProgress(p) ? p : null; });
  const makeTutorial = useCallback(() => tutorialAt(resumeFrom?.cursor ?? 0), [resumeFrom]);
  const [partyDone, setPartyDone] = useState(() => resumeFrom !== null); // the tutorial's new-game screen is behind a player who resumes
  const [tut, setTut] = useState(() => (resumeFrom ? { step: resumeFrom.step, cursor: resumeFrom.cursor } : initialTutorial));
  useEffect(() => { if (local) saveProgress({ status: 'step', step: tut.step, cursor: tut.cursor }); }, [local, tut]);
  const tutRef = useRef(tut);
  const [tutHint, setTutHint] = useState<string | null>(null);
  const tutSend = useCallback((e: TutorialEvent) => { tutRef.current = tutorialReduce(TUTORIAL_SCRIPT, tutRef.current, e); setTut(tutRef.current); setTutHint(null); }, []);
  const tutGate = useCallback((a: GameAction): GameAction[] | null => {
    if (TUTORIAL_SCRIPT[tutRef.current.step]?.free) return [];
    const beat = wantedBeat(TUTORIAL_SCRIPT, tutRef.current);
    if (beat && !matchesBeat(beat, a)) console.debug('[tutorial] refused', JSON.stringify(a), 'wanted', JSON.stringify(beat.play));
    // The right button with the wrong party picked is a different mistake from the wrong button, so it is told apart.
    const wrongParty = beat?.play.type === 'deploy' && a.type === 'deploy';
    if (!beat || !matchesBeat(beat, a)) { setTutHint(wrongParty ? 'Put all three forward: the Woman Hero, the Dwarf and the Priest. Select the one that is missing, then press the button again.' : beat ? 'Not that one: follow the highlighted control.' : TUTORIAL_SCRIPT[tutRef.current.step]?.kind === 'ui' ? 'Press the highlighted button first.' : 'Press Continue first.'); return null; }
    tutSend({ type: 'played' });
    return beat.before ?? [];
  }, [tutSend]);
  // The Home button and the party list's expand arrow are not game actions: the tutorial just notices them being pressed.
  useEffect(() => {
    if (!local) return;
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.('#snapBtn')) tutSend({ type: 'ui', name: 'home' });
      else if (el?.closest?.('.scv-pl-expand')) tutSend({ type: 'ui', name: 'party-expand' });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [local, tutSend]);
  // Step 11 asks the player to read the Witch's and the Ring's cards on the card panel: notice each one being shown.
  const cardsSeen = useRef(new Set<string>());
  const convexSession = useCaveGame(local ? null : gameId, onMoveResolved, canActRef.current);
  const localSession = useLocalGame(local ? makeTutorial : null, onMoveResolved, canActRef.current, tutGate);
  const { engine, loading, state, color, code, dispatch, present } = local ? localSession : convexSession;
  // Presentation hold (see useDispatchWithRolls): the pre-action snapshot stays on screen —
  // canvas, panels, everything — until the die roll completes. getSnapshot reads a ref so the
  // capture always sees the freshest authoritative state without re-creating the callback.
  const stateRef = useRef<GameState | null>(state);
  stateRef.current = state;
  const getSnapshot = useCallback(() => stateRef.current, []);
  const { roll, notices, celebration, clearCelebration, holding, heldState, dispatchWithRolls, holdMove, clearRoll, clearNotices } = useDispatchWithRolls(
    // A fall or descent that happens outside a canvas move (the Trap, dealt with last, after the Ghouls fight) drops the party a level with no
    // move animation: home the camera on the new tile when it lands, as the Home button would, so only the party's level is shown.
    async (a: GameAction) => {
      const res = await dispatch(a);
      const events = (res as { events?: GameEvent[] } | null)?.events;
      if (events?.some((e) => e.type === "trapSprung")) caveApi.current?.snapOnArrival();
      // Descending the Chasm is likewise not a canvas move: home the camera so only the new level is shown.
      if (a.type === "descendChasm" && !events?.some((e) => e.type === "blocked")) caveApi.current?.snapOnArrival();
      return res;
    },
    getSnapshot,
  );
  onHoldMoveRef.current = holdMove;
  presentingRef.current = holding || !!roll || !!notices;
  const cards = useManifestCards();
  const caveApi = useRef<CaveApi | null>(null);
  useEffect(() => {
    if (!local || selected?.kind !== 'card') return;
    if (/witch/i.test(selected.card.name)) cardsSeen.current.add('witch');
    if (/\bring\b/i.test(selected.card.name)) cardsSeen.current.add('ring');
    if (cardsSeen.current.size === 2) tutSend({ type: 'ui', name: 'cards-seen' });
  }, [local, selected, tutSend]);
  // Treasure on offer: put the first piece on the card panel, where its "Give to" choices are, and re-offer as pieces are taken.
  // (Declared here, before the early returns, because it is a hook; `state` can still be null at this point.)
  const onShow = holding && heldState ? heldState : state;
  partyAreaNow.current = onShow?.partyArea ?? -1;
  useEffect(() => { if (selected?.kind === 'member' && selected.member.sibyl) sibylOpen.current.area = partyAreaNow.current; }, [selected]);
  // Giving an item hands it to another member; keep its card open, now on its new holder, so it can be wielded straight away.
  useEffect(() => {
    if (selected?.kind !== 'item' || !selected.giving || !onShow) return;
    const at = givenItemAt(onShow, selected.giving.to, selected.giving.before);
    if (!at) return;
    const from = viewParty(onShow, cards ?? []).find((v) => v.label === memberLabels(onShow.party)[at.mi]);
    const item = from?.items[at.idx];
    if (from && item) setSelected({ kind: 'item', item, from, at });
  }, [selected, onShow, cards]);
  useOfferOnPickup(!!onShow && onShow.phase === 'pickup' && !holding && onShow.treasures.length > 0, `${onShow?.partyArea}:${onShow?.treasures.join(',')}`, () => {
    const piece = engine?.current.treasure[0];
    if (!piece) return;
    setSelected({ kind: 'card', card: piece, where: engine!.current.name });
    setRightSlot((cur) => cur ?? 'card');
  });
  const pickDestination = useCallback<DestinationPicker>((o) => caveApi.current?.setPicker(o), []);
  // The Sorcerer's teleport. Once the destination is chosen the camera settles on the party's own chamber (the particles
  // rise there); at full black the party is moved and the camera cuts to the destination (after the view has taken the
  // move, so the cut is the last thing to happen), so the fade up finds the destination steady.
  const chamberAt = (i: number) => { const { level, x, y } = unpackCoord(displayState.areas[i]!.coord); return { col: x, row: y, level }; };
  const startTeleport = (area: number) => {
    caveApi.current?.frameArea(chamberAt(displayState.partyArea));
    setTeleportTo(area);
  };
  const arriveAt = (area: number) => {
    dispatchWithRolls({ type: "spareSorcerer", area });
    const to = chamberAt(area);
    setTimeout(() => caveApi.current?.frameArea(to, true), 300);
  };
  const art = useManifestArt(); // tile + card art, for the Sorcerer's teleport map
  // Arriving at a special chamber with nothing on its floor: show the chamber on the card panel. This runs after the scene (a child) has
  // reported its own selection for the arrival, so it is the last word; a chamber with cards keeps the scene's own first card.
  useEffect(() => {
    if (!engine || !onShow || holding) return;
    const here = engine.current;
    if (here.strangers.length > 0 || here.treasure.length > 0) return;
    const arrival = arrivalSelection(onShow, here, art?.tiles ?? []);
    if (arrival) { setSelected(arrival); setRightSlot((cur) => cur ?? 'card'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- offered once per arrival (the area), not on every state change
  }, [onShow?.partyArea, holding]);
  // The Medusa pause is a must-act choice, so show her card while it lasts (she is a marker, not a stranger, so the scene may not).
  useEffect(() => {
    if (!engine || !onShow || holding) return;
    const medusa = medusaSelection(onShow, art?.cards ?? [], engine.current.name);
    if (medusa) { setSelected(medusa); setRightSlot((cur) => cur ?? 'card'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per pause, not on every state change
  }, [onShow?.phase === 'medusa', onShow?.partyArea, holding]);
  // Whether the welcome page offers Multiplayer is a site option a SYSTEM user sets in the admin panel (default OFF; shown only once it is known to be ON).
  const multiplayerEnabled = useQuery(api.settings.get)?.multiplayerEnabled === true;
  const gameOver = !!state && state.gs !== GS_PLAYING;
  // The finished game's move log, for the post-game .txt / .log downloads (fetched only at game over).
  const gameLog = useQuery(api.game.log, gameOver && gameId && !local ? { id: gameId } : "skip") as GameLog | null | undefined;

  // Return to the splash screen, clearing all in-game overlays and the current game binding.
  const goHome = useCallback(() => {
    clearRoll(); clearNotices(); setSavedCode(null); setPartyExpanded(false); setLeftSlot(null); setRightSlot(null); setSelected(null); setTestOpen(false);
    setGameId(null); setStarted(false);
  }, [clearRoll, clearNotices]);

  // Save from the HUD (or the Test Mode panel): the state is already authoritative in Convex, so
  // this just surfaces the four-letter code (modal) and, on dismiss, returns to the menu.
  const handleSave = useCallback(async () => {
    if (!gameId) return;
    setSavedCode({ code: await saveGame({ id: gameId }), restored: false });
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
    // The bundled searched games (codes like K001, no backend involved) are checked before Convex.
    const golden = await goldenBundle(code);
    if (golden) { setReplayBundle(golden); return null; }
    const bundle = (await convex.query(api.game.replayByCode, { code })) as ReplayBundle | null;
    if (!bundle) return "No replayable game found with that code.";
    if (!bundle.replayable) return "This game predates full logging and cannot be replayed.";
    setReplayBundle(bundle);
    return null;
  }, [convex]);

  // Copy the save/restore modal's game as a paste-able { game, moves } JSON bundle (game.log) — a
  // more directly useful bug-report artifact for an AI reader than the human-oriented replay view.
  const handleCopyDebugBundle = useCallback(async () => {
    if (!gameId) return;
    const log = await convex.query(api.game.log, { id: gameId });
    await navigator.clipboard?.writeText(JSON.stringify(log));
  }, [convex, gameId]);

  useEffect(() => { if (!local && !isLoading && !isAuthenticated) void signIn("anonymous"); }, [local, isLoading, isAuthenticated, signIn]);

  if (!local && isLoading) return <p>Connecting…</p>;
  if (!local && !isAuthenticated) return <p>Signing in…</p>;

  // Multiplayer (flag-gated): create/join setup, then the reactive lobby.
  if (mp && !local) {
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

  // The tutorial begins on the new-game screen, as a real game does.
  if (local && !partyDone) {
    return <TutorialParty onDone={() => setPartyDone(true)} onSkip={() => { saveProgress({ status: 'skipped' }); onLocalExit?.(); }} onExit={() => onLocalExit?.()} />;
  }
  if (!local && !started) {
    return (
      <SplashScreen
        onStartSolitaire={() => setStarted(true)}
        onStartTutorial={onStartTutorial}
        onResume={handleResume}
        onReplay={handleReplay}
        onStartMultiplayer={multiplayerEnabled ? () => setMp({ view: "create" }) : undefined}
        onJoinMultiplayer={multiplayerEnabled ? () => setMp({ view: "join" }) : undefined}
      />
    );
  }
  if (!local && !gameId) {
    return (
      <PartySelect
        kitToggle
        sibylToggle
        onBack={() => setStarted(false)}
        onConfirm={async (picks, color, variants) => {
          setGameId(await newGame({ seed: Date.now(), picks, color, variants }));
        }}
      />
    );
  }
  if (loading || !engine || !state) return <p>Loading cave…</p>;

  // What the player SEES: the held pre-action snapshot while a roll is in flight or showing,
  // the live authoritative state otherwise. The 3D scene mirrors it too (render-phase sync,
  // before CaveCanvas's effects run — same guarantee useCaveGame's old inline sync gave).
  const displayState = holding && heldState ? heldState : state;
  // Pass the SAME "presenting" value `presentingRef` was just set to (line above) as an explicit,
  // render-synchronous override — closes the race where a later render's body flips
  // `presentingRef.current` before an earlier render's deferred CaveCanvas effect reads it via
  // `engine.openMoves()`'s `acting()` check (bug: exit markers stuck empty after a Deep Pool
  // crossing notice, even though the move itself had already resolved).
  present(displayState, !presentingRef.current);

  // Fight-surface gate (see fightGate.ts): defer the INITIAL mount while a roll is in flight
  // or showing; once shown, mid-fight dispatches must not unmount it. Ref bookkeeping happens
  // during render, mirroring the present() sync above.
  const fightVisible = showFightSurface(displayState.phase === "fight", holding, fightShownRef.current);
  fightShownRef.current = fightVisible;

  // Rendered on top of whatever screen is showing, so it survives a game-over transition.
  // A notable feat (dragon kill, the Sorcerer, the Ruby, the Elixir) gets its own celebration AFTER the
  // result it follows (the hook only offers it once the roll and notices are dismissed).
  const overlay = roll ? (
    <DiceRoll title={roll.title} lanes={roll.lanes} message={roll.message} tone={roll.tone} stakes={roll.stakes} hazard={roll.hazard} cards={cards ?? []} partyLeft={!!displayState.variants?.combatRevision} onContinue={clearRoll} />
  ) : celebration ? (
    <FeatCelebration view={celebration} cards={cards ?? []} onContinue={clearCelebration} />
  ) : null;

  if (displayState.gs !== GS_PLAYING) {
    return (
      <>
        <GameOverScreen
          state={displayState}
          // Return to the splash screen (the home / high-scores entry), not straight to party select.
          onNewGame={() => { if (local) { onLocalExit?.(); return; } clearRoll(); clearNotices(); setGameId(null); setStarted(false); }}
          onSaveScore={displayState.testMode || !gameId ? undefined : (name) => saveScore({ gameId, name })}
          log={gameLog ?? null}
          code={code ?? gameLog?.game.code ?? null}
          onReplay={handleReplay}
        />
        {overlay}
      </>
    );
  }

  // Where the card panel's item sits in the party (a mini-card click knows only the member and the item).
  const itemAt = selected?.kind === 'item'
    ? (selected.at ?? { mi: memberLabels(displayState.party).indexOf(selected.from.label), idx: selected.from.items.indexOf(selected.item) })
    : null;
  const sibylLooks = legalActions(displayState).filter((a): a is Extract<GameAction, { type: "examineArea" }> => a.type === "examineArea");
  // Every stranger and treasure card in the chamber the party stands in (the strip on a floor card).
  const floorCards = engine ? [...engine.current.strangers, ...engine.current.treasure] : undefined;
  const itemLive = itemAt && itemAt.mi >= 0 && itemAt.idx >= 0 ? itemAt : null;

  const inventoryPanel = (
    <InventoryPanel rows={inventoryRows(displayState)}
          selected={selected?.kind === 'item' ? (selected.at ?? null) : null}
          onSelect={(row) => {
            const from = viewParty(displayState, cards ?? []).find((v) => v.label === row.carrier);
            const item = from?.items[row.idx];
            if (from && item) pick({ kind: 'item', item, from, at: { mi: row.mi, idx: row.idx } });
          }} />
  );

  // What the player is doing now, so the Help panel can lead with the topics for it.
  const helpScreens: HelpScreen[] = fightVisible ? [displayState.fight?.rev ? 'fight-revised' : 'fight']
    : displayState.phase === 'encounter' ? ['encounter'] : displayState.phase === 'pickup' ? ['pickup'] : displayState.phase === 'trap' ? ['trap'] : displayState.phase === 'sorcerer' ? ['sorcerer'] : ['explore'];

  return (
    <HelpProvider variants={displayState.variants}>
    <div className="relative h-screen w-screen scv-shell-root">
      <CaveCanvas key={gameKey} onReady={(api) => { caveApi.current = api; }} engine={engine} state={displayState} canAct={!presentingRef.current} color={color} code={code ?? undefined}
        // A card on the floor opens the card panel unless Settings or the test panel holds the slot; a click on a card or
        // party member always takes the slot. No card on the floor closes it again.
        shell={{
          left: fightVisible ? null : leftSlot, right: rightSlot,
          onSelectCard: (card, where, explicit) => {
            if (!explicit && sibylOpen.current.open && sibylOpen.current.area === partyAreaNow.current) return;
            if (card && explicit) { pick({ kind: 'card', card, where }); return; } // the player clicked this card: a second click closes it
            // Nothing on the floor of a special chamber: show the chamber itself (see arrivalSelection) instead of closing the panel.
            const arrival = !card && engine ? arrivalSelection(displayState, engine.current, art?.tiles ?? []) : null;
            setSelected(card ? { kind: 'card', card, where } : arrival);
            setRightSlot((cur) => (card ? (explicit ? 'card' : (cur ?? 'card')) : arrival ? (cur ?? 'card') : (cur === 'card' ? null : cur)));
          },
          onSelectMember: (member) => pick({ kind: 'member', member }),
          onSelectArea: (area, file, rot) => {
            const at = displayState.areas.findIndex((pa) => { const c = unpackCoord(pa.coord); return c.level === area.level && c.x === area.col && c.y === area.row; });
            if (at >= 0) pick({ kind: 'area', index: at, name: area.name, file, rot });
          },
        }} />
      <TitleBar left={fightVisible ? (fightListHidden ? null : leftSlot === 'inventory' ? 'inventory' : 'party') : leftSlot} right={rightSlot} testMode={!local && !!displayState.testMode} testOpen={testOpen} onTest={() => setTestOpen((o) => !o)} bugOpen={bugOpen} onBug={() => { if (!bugOpen) setBugShot(captureGameWindow()); setBugOpen((o) => !o); }}
                // In a fight the list is always showing: Party returns to it, Inventory swaps it out and back.
                onLeft={(p) => {
                  if (!fightVisible) { setLeftSlot((cur) => toggleLeft(cur, p)); return; }
                  // In a fight the icon of the list that is showing puts it away; the other icon (or either, once it is away) brings it back.
                  const showing = fightListHidden ? null : leftSlot === 'inventory' ? 'inventory' : 'party';
                  if (showing === p) setFightListHidden(true); else { setFightListHidden(false); setLeftSlot(p); }
                }} onRight={(p) => setRightSlot((cur) => toggleRight(cur, p))} />
      {rightSlot === 'card' && selected && (
        <CardPanel selected={selected} floor={floorCards} onFloor={(card) => selected.kind === 'card' && setSelected({ kind: 'card', card, where: selected.where })} onAward={(award, from) => setSelected({ kind: 'award', award, from })} areaText={selected.kind === 'area' ? describeArea(displayState, selected.index, verbose) : undefined} onMember={(member) => setSelected({ kind: 'member', member })}
                   onItem={(item, from) => setSelected({ kind: 'item', item, from })}
                   actions={selected.kind === 'card' && !holding ? <><FloorTreasureActions state={displayState} dispatch={dispatchWithRolls} card={selected.card} /><SibylNote state={displayState} card={selected.card} /></>
                   : selected.kind === 'item' && itemLive ? <ItemActions state={displayState} mi={itemLive.mi} idx={itemLive.idx}
                       dispatch={(a) => { if (a.type === 'moveTreasure') setSelected({ ...selected, giving: { to: a.to, before: displayState.party[a.to]?.treasure.length ?? 0 } }); dispatchWithRolls(a); }} />
                   // The Sibyl's free look is reachable only from her own card, and never prompted.
                   : selected.kind === 'member' && selected.member.sibyl && sibylLooks.length > 0
                     ? <SibylLook state={displayState} actions={sibylLooks} dispatch={dispatchWithRolls} tools={{ pick: pickDestination, peek: (a) => caveApi.current?.peekTile(a) }} />
                     : undefined} />
      )}
      {rightSlot === 'help' && <HelpPanel screens={helpScreens} flags={displayState.variants} />}
      {rightSlot === 'settings' && <SettingsPanel verbose={verbose} onVerbose={(on) => { setVerbose(on); writeVerbose(on); }} autoRoll={autoRoll} onAutoRoll={(on) => { setAutoRoll(on); writeAutoRoll(on); }} state={displayState} code={code ?? undefined} kitActive={!!displayState.variants?.extensionKit} onLog={() => setShowLog(true)} />}
      {rightSlot === 'exit' && <ExitPanel onSave={local ? undefined : handleSave} onAbandon={() => (local ? onLocalExit?.() : engine.quit())} />}
      {/* The encounter/treasure bar and the explore actions bar can both be showing (a pickup with the crypt to enter); the dock stacks them. */}
      <div className="scv-enc-dock">
        <EncounterPanel state={displayState} dispatch={dispatchWithRolls} leaveOnMove />
        <ExplorePanel state={displayState} dispatch={dispatchWithRolls} />
      </div>
      <AutoHideRightPanels fighting={fightVisible} hide={hideRight} onStart={showFightList} />
      {fightVisible && cards && <FightSurface state={displayState} dispatch={dispatchWithRolls} cards={cards} />}
      {fightVisible && cards && <RevisedFightSurface state={displayState} dispatch={dispatchWithRolls} cards={cards} inventory={leftSlot === 'inventory' ? inventoryPanel : undefined} listHidden={fightListHidden}
                                                  onMember={(member) => pick({ kind: 'member', member })} />}
      {!local && displayState.testMode && <TestControlsPanel state={displayState} dispatch={dispatchWithRolls} onSave={handleSave} open={testOpen} />}
      {!local && displayState.testMode && <DeadEndSwapBadge />}
      {!fightVisible && leftSlot === 'party' && (
        <PartyList members={viewParty(displayState, cards ?? [])} expanded={partyExpanded} onToggleExpand={() => setPartyExpanded((e) => !e)}
                   onSelect={(member) => pick({ kind: 'member', member })} />
      )}
      {!fightVisible && leftSlot === 'inventory' && inventoryPanel}
      {displayState.phase === "trap" && !holding && !overlay && !notices && (
        <TrapChoice traps={displayState.areas[displayState.partyArea]?.contents.filter((c) => c === 300 + HAZARD_TRAP).length || 1} dispatch={(a) => {
          // A deliberate fall drops the party a level outside doMove's animation, so home the camera on the
          // new tile when it lands — the same hand-off the Sorcerer's teleport uses.
          if (a.type === "fallThroughTrap") caveApi.current?.snapOnArrival();
          dispatchWithRolls(a);
        }} />
      )}
      {displayState.phase === "leader" && !holding && !overlay && !notices && (
        <LeaderChoice state={displayState} dispatch={dispatchWithRolls} />
      )}
      {displayState.phase === "quarrel" && !holding && !overlay && !notices && (
        <QuarrelChoice state={displayState} dispatch={dispatchWithRolls} />
      )}
      {displayState.phase === "sorcerer" && !holding && !overlay && !notices && teleportTo === null && art && (
        <SorcererTerms state={displayState} art={art} dispatch={dispatchWithRolls} onTeleport={startTeleport} setPicker={pickDestination} />
      )}
      {teleportTo !== null && (
        <TeleportEffect
          onPeak={() => arriveAt(teleportTo)}
          onDone={() => setTeleportTo(null)}
        />
      )}
      {overlay}
      {notices && !roll && <NoticeModal notices={notices} cards={cards ?? []} onClose={clearNotices} />}   {/* after the dice: the outcome they explain (e.g. a trap fall) is told once the player has continued */}
      {savedCode && (
        <SaveGameModal
          code={savedCode.code}
          heading={savedCode.restored ? "Scenario restored" : "Game saved"}
          message={savedCode.restored ? "New code for this forked scenario:" : "Note your game code to resume later:"}
          closeLabel={savedCode.restored ? "Continue playing" : "Back to menu"}
          onClose={savedCode.restored ? () => setSavedCode(null) : goHome}
          onViewReplay={() => { const c = savedCode.code; setSavedCode(null); void handleReplay(c); }}
          onCopyDebugBundle={handleCopyDebugBundle}
        />
      )}
      {local && TUTORIAL_SCRIPT[tut.step] && !overlay && !notices && (
        <TutorialCoach step={TUTORIAL_SCRIPT[tut.step]!} index={tut.step} total={TUTORIAL_SCRIPT.length} cave={caveApi.current} hint={tutHint} score={state ? scoreGame(state) : 0}
                       onContinue={() => (TUTORIAL_SCRIPT[tut.step]!.free ? (saveProgress({ status: 'done' }), onLocalExit?.()) : (TUTORIAL_SCRIPT[tut.step]!.resetView && document.getElementById('snapBtn')?.click(), tutSend({ type: 'continue' })))}
                       onBack={tut.step > 0 && TUTORIAL_SCRIPT[tut.step - 1]!.kind === 'info' ? () => tutSend({ type: 'back' }) : undefined}
                       onSkip={() => { saveProgress({ status: 'skipped' }); onLocalExit?.(); }} />
      )}
      {bugOpen && gameId && <BugReportModal gameId={gameId} screenshot={bugShot} onClose={() => setBugOpen(false)} />}
      {showLog && gameId && <GameLogModal gameId={gameId} onClose={() => setShowLog(false)} />}
    </div>
    </HelpProvider>
  );
}
