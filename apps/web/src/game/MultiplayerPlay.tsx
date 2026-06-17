import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { GS_PLAYING, unpackCoord, type GameAction, type GameEvent, type GameState } from "@sorcerers-cave/engine";
import { createCaveAdapter, type CaveAdapter } from "../view/engineAdapter";
import { loadManifest } from "../data/manifest";
import type { ArtTables } from "../view/projection";
import { CaveCanvas, type OtherPartyToken } from "../view/CaveCanvas";
import { EncounterPanel } from "./EncounterPanel";
import { ExplorePanel } from "./ExplorePanel";
import { PartyPanel } from "./PartyPanel";
import { DiceRoll } from "./DiceRoll";
import { rollFromEvents, type RollView } from "./rollView";
import { NoticeModal } from "./NoticeModal";
import { eventNotices, type Notice } from "./eventNotices";
import { ChatPanel } from "./ChatPanel";
import { GameOverScreen } from "./GameOverScreen";
import { ScoreboardPanel } from "./ScoreboardPanel";
import { DEFAULT_PARTY_COLOR, type PartyColor } from "./partyColors";

/**
 * Shared-cave play for the viewing seat: renders the existing 3D cave from this party's composed
 * GameState, turn-gated (controls only on your turn), with a turn banner and docked chat. The map
 * grows reactively as other parties explore. (Multi-token rendering of other parties is a follow-up.)
 */
export function MultiplayerPlay({ gameId, onExit }: { gameId: Id<"games">; onExit: () => void }) {
  const view = useQuery(api.multiplayer.playView, { gameId });
  const actMut = useMutation(api.multiplayer.act);
  const [art, setArt] = useState<ArtTables | null>(null);
  const [roll, setRoll] = useState<RollView | null>(null);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [showParty, setShowParty] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showQuit, setShowQuit] = useState(false); // HUD "Quit" → leave-to-menu confirm
  const [spectating, setSpectating] = useState(false); // terminal/finished: scrim hidden, roaming the cave
  const [peeking, setPeeking] = useState(false);       // active player opened the standings
  const [showMyRun, setShowMyRun] = useState(false);   // personal GameOverScreen sub-modal

  // Unread-chat marker: count messages that arrive while the dock is closed. Existing history is
  // treated as read on first load; opening the dock (or new lines arriving while it's open) clears it.
  const chatFeed = useQuery(api.multiplayer.messages, { gameId });
  const [seenCount, setSeenCount] = useState(0);
  const chatInited = useRef(false);
  useEffect(() => {
    if (chatFeed === undefined) return;
    if (!chatInited.current) { chatInited.current = true; setSeenCount(chatFeed.length); return; }
    if (showChat) setSeenCount(chatFeed.length);
  }, [chatFeed, showChat]);
  const unreadChat = !showChat && (chatFeed?.length ?? 0) > seenCount;

  // Transient toasts (turn changes + mirrored chat), shown under the depth bar for 3s each.
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: "turn" | "you" | "chat" }[]>([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback((text: string, tone: "turn" | "you" | "chat") => {
    const id = ++toastIdRef.current;
    setToasts((ts) => [...ts, { id, text, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3000);
  }, []);

  // Announce each turn change as a toast (suppressed once your own run has ended).
  const prevSeatRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (!view || view.currentSeat === prevSeatRef.current) return;
    prevSeatRef.current = view.currentSeat;
    if ((view.state as GameState).gs !== GS_PLAYING) return;
    if (view.yourTurn) pushToast("Your turn — explore!", "you");
    else pushToast(`${view.parties.find((p) => p.seat === view.currentSeat)?.name ?? "…"}'s turn`, "turn");
  }, [view, pushToast]);

  // Mirror feed activity from other players as toasts (existing history is not replayed): chat
  // messages and auto-narrated game events (defeats, pickups, descents, finishes, …).
  const toastedCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (chatFeed === undefined) return;
    if (toastedCountRef.current === null) { toastedCountRef.current = chatFeed.length; return; }
    if (chatFeed.length <= toastedCountRef.current) return;
    const fresh = chatFeed.slice(toastedCountRef.current);
    toastedCountRef.current = chatFeed.length;
    for (const m of fresh) {
      if (m.seat === null || m.seat === view?.youSeat) continue; // skip system lines and your own
      if (m.kind === "action") pushToast(`${m.partyName} ${m.text}`, "chat");
      else pushToast(`${m.partyName}: ${m.text}`, "chat");
    }
  }, [chatFeed, pushToast, view?.youSeat]);

  useEffect(() => { void loadManifest().then(setArt); }, []);

  const adapterRef = useRef<CaveAdapter | null>(null);
  const syncedRef = useRef<GameState | null>(null);
  const yourTurnRef = useRef(false);
  const focusApiRef = useRef<{ focusArea: (a: { col: number; row: number; level: number }) => void } | null>(null);

  const state = (view?.state as GameState | undefined) ?? null;
  yourTurnRef.current = !!view?.yourTurn;

  // Bind/reconcile the adapter during render (so the renderer reads the latest snapshot).
  if (art && state) {
    if (!adapterRef.current) {
      adapterRef.current = createCaveAdapter(state, art, {
        onAction: (a) => { void actMut({ gameId, action: a }); },
        canAct: () => yourTurnRef.current,
      });
    } else if (syncedRef.current !== state) {
      adapterRef.current.sync(state);
    }
    syncedRef.current = state;
  }

  const dispatch = useCallback(async (action: GameAction) => {
    const res = await actMut({ gameId, action });
    const events = (res as { events?: GameEvent[] } | null)?.events ?? [];
    const v = rollFromEvents(events);
    if (v) setRoll(v);
    else { const ns = eventNotices(events); if (ns.length) setNotices(ns); }
    return res;
  }, [actMut, gameId]);

  if (view === undefined || view === null || !art || !state || !adapterRef.current) {
    return <p className="scv-mp-loading">Loading cave…</p>;
  }

  const engine = adapterRef.current;
  const me = view.parties.find((p) => p.seat === view.youSeat);
  const myColor = (me?.color as PartyColor) ?? DEFAULT_PARTY_COLOR;
  const terminal = state.gs !== GS_PLAYING;
  const yourTurn = view.yourTurn && !terminal;
  const gameOver = view.currentSeat === null; // playView reports no current seat once finished
  // Don't pop the scoreboard over the final combat roll / death notice from your last action —
  // wait until that outcome dialog is dismissed (otherwise a wipe hides how it happened).
  const outcomeDialogOpen = roll !== null || notices !== null;
  const showScoreboard = ((terminal || gameOver) ? !spectating : peeking) && !outcomeDialogOpen;

  // Drop into the read-only cave and fly the camera to that party's current area.
  const focusSeat = (seat: number) => {
    setPeeking(false);
    setSpectating(true);
    const p = view.parties.find((q) => q.seat === seat);
    const area = p ? state.areas[p.partyArea] : undefined;
    if (area) { const c = unpackCoord(area.coord); focusApiRef.current?.focusArea({ col: c.x, row: c.y, level: c.level }); }
  };

  // Other active parties' pins on the shared map (positions read from the shared areas).
  const otherParties: OtherPartyToken[] = view.parties
    .filter((p) => p.seat !== view.youSeat && p.status === "exploring")
    .map((p) => {
      const area = state.areas[p.partyArea];
      if (!area) return null;
      const c = unpackCoord(area.coord);
      return { color: p.color, col: c.x, row: c.y, level: c.level };
    })
    .filter((x): x is OtherPartyToken => x !== null);

  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas key={gameId} engine={engine} state={state} color={myColor} onPartyClick={() => setShowParty(true)} onQuit={() => setShowQuit(true)} otherParties={otherParties} onReady={(apiRef) => { focusApiRef.current = apiRef; }} multiplayer />
      <div className="scv-mp-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={"scv-mp-toast" + (t.tone === "you" ? " you" : t.tone === "chat" ? " chat" : "")}>{t.text}</div>
        ))}
      </div>
      {yourTurn && <EncounterPanel state={state} dispatch={dispatch} />}
      {yourTurn && <ExplorePanel state={state} dispatch={dispatch} />}
      {showParty && <PartyPanel state={state} dispatch={dispatch} onClose={() => setShowParty(false)} />}
      {roll && <DiceRoll title={roll.title} lanes={roll.lanes} message={roll.message} tone={roll.tone} onContinue={() => setRoll(null)} />}
      {notices && <NoticeModal notices={notices} onClose={() => setNotices(null)} />}
      <div className={"scv-mp-chatdock" + (showChat ? " open" : "")}>
        <button className={"scv-mp-chattoggle" + (unreadChat ? " unread" : "")} onClick={() => setShowChat((s) => !s)}>
          {showChat ? "Hide chat ▾" : "Chat ▸"}
          {unreadChat && <span className="scv-mp-unread" aria-label="unread messages" />}
        </button>
        {showChat && <ChatPanel gameId={gameId} />}
      </div>
      {/* HUD "Quit" → leave to the menu (party stays) or abandon the expedition (party forsaken to the Cave). */}
      {showQuit && (
        <div className="scv-mp-modal" role="dialog" aria-modal="true">
          <div className="scv-mp-modal-card">
            <h3 className="scv-hd">Leave the game?</h3>
            <p className="scv-muted">
              Leaving to the menu keeps your party in the game — rejoin any time with the code.
              Abandoning forsakes your party to the Cave: they do not escape, your final score is tallied, and the others are told.
            </p>
            <div className="scv-mp-modal-actions">
              <button className="scv-primary" onClick={() => { setShowQuit(false); onExit(); }}>Leave to menu</button>
              <button
                className="scv-primary danger"
                disabled={!yourTurn}
                title={yourTurn ? undefined : "You can only abandon on your turn"}
                onClick={() => { setShowQuit(false); void dispatch({ type: "quit" }); }}
              >
                Abandon the expedition
              </button>
              <button className="scv-primary ghost" onClick={() => setShowQuit(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Active players can peek at standings; terminal/finished players land here by default. */}
      {!showScoreboard && !terminal && !gameOver && (
        <button className="scv-mp-standings" onClick={() => setPeeking(true)}>Standings ▣</button>
      )}
      {(terminal || gameOver) && spectating && (
        <button className="scv-mp-standings" onClick={() => setSpectating(false)}>Standings ▣</button>
      )}
      {showScoreboard && (
        <div className="scv-sb-overlay">
          <ScoreboardPanel
            gameId={gameId}
            frozen={gameOver}
            onRowClick={(seat) => focusSeat(seat)}
            onResume={peeking ? () => setPeeking(false) : undefined}
            onSpectate={(terminal || gameOver) ? () => setSpectating(true) : undefined}
            onViewMyRun={terminal && !gameOver ? () => setShowMyRun(true) : undefined}
            onQuit={(terminal && !gameOver) ? onExit : undefined}
            onBackToMenu={gameOver ? onExit : undefined}
          />
        </div>
      )}
      {/* Personal score breakdown (no save form — the result is auto-recorded server-side). */}
      {showMyRun && (
        <div className="scv-mp-finishoverlay" onClick={() => setShowMyRun(false)}>
          <GameOverScreen state={state} onNewGame={onExit} />
        </div>
      )}
    </div>
  );
}
