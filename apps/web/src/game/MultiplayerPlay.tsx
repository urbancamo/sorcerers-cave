import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { GS_PLAYING, unpackCoord, type GameAction, type GameEvent, type GameState } from "@sorcerers-cave/engine";
import { createCaveAdapter, type CaveAdapter } from "../view/engineAdapter";
import { TradeModal } from "./TradeModal";
import { UnionPanel, type UnionView } from "./UnionPanel";
import { PvpFightSurface, type PvpUiAction, type PvpView } from "./PvpFightSurface";
import { loadManifest } from "../data/manifest";
import type { ArtTables } from "../view/projection";
import { CaveCanvas, type OtherPartyToken } from "../view/CaveCanvas";
import { EncounterPanel } from "./EncounterPanel";
import { ExplorePanel } from "./ExplorePanel";
import { FightSurface } from "./FightSurface";
import { useManifestCards } from "../data/useManifestCards";
import { PartyPanel } from "./PartyPanel";
import { DiceRoll } from "./DiceRoll";
import { rollFromEvents, type RollView } from "./rollView";
import { NoticeModal } from "./NoticeModal";
import { eventNotices, type Notice } from "./eventNotices";
import { ChatPanel } from "./ChatPanel";
import { GameOverScreen } from "./GameOverScreen";
import { ScoreboardPanel } from "./ScoreboardPanel";
import { SpectateView } from "./SpectateView";
import { DEFAULT_PARTY_COLOR, PARTY_COLOR_HEX, type PartyColor } from "./partyColors";

/**
 * Shared-cave play for the viewing seat: renders the existing 3D cave from this party's composed
 * GameState, turn-gated (controls only on your turn), with a turn banner and docked chat. The map
 * grows reactively as other parties explore. (Multi-token rendering of other parties is a follow-up.)
 */
export function MultiplayerPlay({ gameId, onExit }: { gameId: Id<"games">; onExit: () => void }) {
  const view = useQuery(api.multiplayer.playView, { gameId });
  const cards = useManifestCards();
  const actMut = useMutation(api.multiplayer.act);
  const [art, setArt] = useState<ArtTables | null>(null);
  const [roll, setRoll] = useState<RollView | null>(null);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [showParty, setShowParty] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showQuit, setShowQuit] = useState(false); // HUD "Quit" → leave-to-menu confirm
  const [spectateSeat, setSpectateSeat] = useState<number | null>(null); // following a party's screen
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
      if (m.seat === view?.youSeat) continue; // skip only your own lines
      if (m.seat === null) pushToast(m.text, "turn"); // system lines: session outcomes, unions, rises
      else if (m.kind === "action") pushToast(`${m.partyName} ${m.text}`, "chat");
      else pushToast(`${m.partyName}: ${m.text}`, "chat");
    }
  }, [chatFeed, pushToast, view?.youSeat]);

  // Fog-of-war-lite fight hint (plan ⑦ item 4): playView counts rival commands currently fighting
  // (no location, no fortunes). Toast the 0→N transition — "a visual/audio hint that a fight is
  // occurring … but again, no details".
  const prevFightsRef = useRef(0);
  useEffect(() => {
    const n = view?.distantFights ?? 0;
    if (prevFightsRef.current === 0 && n > 0) pushToast("⚔ Steel rings somewhere in the deep…", "turn");
    prevFightsRef.current = n;
  }, [view?.distantFights, pushToast]);

  useEffect(() => { void loadManifest().then(setArt); }, []);

  // Battle-outcome beat for BOTH sides (spec I-10): the resolving dispatcher already sees the dice,
  // but the passive participant (and both sides on a timer-resolved round) would only notice the
  // fight surface vanish. When a PvP session involving you ends and no dice/notice dialog of your
  // own is up, announce the outcome from your own state's transition.
  const wasInPvpRef = useRef<{ rivals: number[] } | null>(null);
  useEffect(() => {
    const sess = view?.session;
    const inPvp = sess?.kind === "pvp";
    if (wasInPvpRef.current && !inPvp && view) {
      const meNow = view.parties.find((p) => p.seat === view.youSeat);
      const st = view.state as GameState;
      // Judge the outcome by what became of the RIVAL command, not only by whether spoils appeared
      // — a wiped rival with empty pockets leaves no pickup, but it is still a victory.
      const rivalParties = view.parties.filter((p) => wasInPvpRef.current!.rivals.includes(p.seat));
      const rivalFell = rivalParties.length > 0 && rivalParties.every((p) => p.status !== "exploring" || p.zombie === true);
      const rivalRose = rivalFell && rivalParties.some((p) => p.zombie === true);
      const rivalNames = rivalParties.map((p) => p.name).join(" + ");
      const fell = rivalParties.length > 1 ? "have fallen" : "has fallen";
      setNotices((open) => {
        if (open) return open; // the dispatcher's own dice/notices carry the outcome already
        if (meNow && meNow.status !== "exploring") {
          return [{ text: "Defeat — your party was destroyed in the battle.", tone: "bad" }];
        }
        if (meNow?.zombie) {
          return [{ text: "Your party fell in battle — and rises again as the dead…", tone: "bad" }];
        }
        if (rivalFell) {
          const spoils = st.phase === "pickup" ? " Gather the spoils from the floor." : "";
          const rising = rivalRose ? " …and something stirs among the corpses." : "";
          return [{ text: `Victory — ${rivalNames} ${fell} in battle!${spoils}${rising}`, tone: "good" }];
        }
        if (st.phase === "pickup") {
          return [{ text: "Victory! Your rival is broken — gather the spoils from the floor.", tone: "good" }];
        }
        return [{ text: "The battle has ended.", tone: "neutral" }];
      });
    }
    wasInPvpRef.current = inPvp && view && sess
      ? { rivals: sess.attacker.includes(view.youSeat) ? [...sess.defender] : [...sess.attacker] }
      : null;
  }, [view]);

  const adapterRef = useRef<CaveAdapter | null>(null);
  const syncedRef = useRef<GameState | null>(null);
  const yourTurnRef = useRef(false);

  const state = (view?.state as GameState | undefined) ?? null;
  yourTurnRef.current = !!view?.yourTurn;

  // Bind/reconcile the adapter during render (so the renderer reads the latest snapshot).
  if (art && state) {
    if (!adapterRef.current) {
      adapterRef.current = createCaveAdapter(state, art, {
        // Renderer-initiated actions (moves) — surface any dice they roll (e.g. ghouls fighting each
        // member on entry) as a DiceRoll, since these don't go through the panel dispatch path.
        onAction: (a) => {
          void actMut({ gameId, action: a }).then((res) => {
            const v = rollFromEvents((res as { events?: GameEvent[] } | null)?.events ?? []);
            if (v) setRoll(v);
          });
        },
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

  // Following another party (or your own, read-only): render their screen until "Back to Standings".
  if (spectateSeat !== null) {
    return <SpectateView gameId={gameId} seat={spectateSeat} onBack={() => setSpectateSeat(null)} />;
  }

  const engine = adapterRef.current;
  const me = view.parties.find((p) => p.seat === view.youSeat);
  const myColor = (me?.color as PartyColor) ?? DEFAULT_PARTY_COLOR;
  const terminal = state.gs !== GS_PLAYING;
  const yourTurn = view.yourTurn && !terminal;
  // Concurrent mode has no table turn, so "no current seat" no longer implies the game ended —
  // use the explicit phase (with the old heuristic as a fallback for mid-flight games).
  const concurrent = view.concurrent === true;
  const gameOver = view.gamePhase ? view.gamePhase === "finished" : (!concurrent && view.currentSeat === null);
  // Permanent turn marker (left of Depth): whose turn is in progress (or free exploration).
  const currentParty = view.parties.find((p) => p.seat === view.currentSeat);
  const turnLabel = gameOver ? "Game over"
    : concurrent ? (yourTurn ? "Explore freely" : "…")
    : yourTurn ? "You" : (currentParty?.name ?? "…");
  const turnColor = currentParty ? PARTY_COLOR_HEX[currentParty.color as PartyColor] : undefined;
  // Don't pop the scoreboard over the final combat roll / death notice from your last action —
  // wait until that outcome dialog is dismissed (otherwise a wipe hides how it happened).
  const outcomeDialogOpen = roll !== null || notices !== null;
  const showScoreboard = ((terminal || gameOver) || peeking) && !outcomeDialogOpen;

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

  // Awareness (spec I-1/I-3): rivals standing on YOUR tile, live from playView. Interaction is
  // opt-in and never forced — the chip offers Trade (I-5) when the area mask allows.
  const here = (view.hereSeats ?? [])
    .map((s: number) => view.parties.find((p) => p.seat === s))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const tradeSession = view.session && view.session.kind === "trade" ? view.session : null;
  const tradePartner = tradeSession
    ? view.parties.find((p) => p.seat === (tradeSession.a === view.youSeat ? tradeSession.b : tradeSession.a))
    : null;
  // Zombie seats (M7): the risen can't trade or join the living — hide those affordances (the
  // engine blocks them anyway); Attack stays, a zombie party is exactly a PvP spoiler.
  const meZombie = !!me?.zombie;
  const canOfferTrade = !terminal && !meZombie && state.phase === "explore" && !view.session && !view.areaMask?.fightInProgress;
  // The PvP fight (spec I-9/I-10): playView only projects the session to its participants, so its
  // presence IS your participation. Non-participants get nothing (the no-detail hint is areaMask-side).
  const pvpSession = view.session && view.session.kind === "pvp" ? view.session : null;
  const canDeclareAttack = !terminal && state.phase === "explore" && !view.session;
  // Union surfaces (spec I-6/I-7): the formation handshake and your union, both playView-projected.
  const unionProposal = view.session && view.session.kind === "unionProposal" ? view.session : null;
  const yourUnion = (view.yourUnion ?? null) as UnionView | null;
  const canProposeUnion = !terminal && !meZombie && state.phase === "explore" && !view.session && !yourUnion;
  // Guarded loot (spec I-8/I-4): a rival rear-guard stands on your tile — its treasure is not free.
  const guards = view.detachmentsHere ?? [];

  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas key={gameId} engine={engine} state={state} color={myColor} onPartyClick={() => setShowParty(true)} onQuit={() => setShowQuit(true)} otherParties={otherParties} multiplayer turnLabel={turnLabel} turnColor={turnColor} />
      {here.length > 0 && !terminal && (
        <div className="scv-mp-here" data-testid="also-here">
          <span className="scv-mp-here-cap">Also here:</span>
          {here.map((p) => (
            <span key={p.seat} className="scv-mp-here-chip" style={{ borderColor: PARTY_COLOR_HEX[p.color as PartyColor] }}>
              <i style={{ background: PARTY_COLOR_HEX[p.color as PartyColor] }} />{p.name}
              {p.zombie && <em className="scv-mp-risen" title="This party walks as the dead (§Zombies)">risen</em>}
              {canOfferTrade && !p.zombie && (
                <button
                  className="scv-mp-here-act"
                  title={`Offer ${p.name} a trade`}
                  onClick={() => void dispatch({ type: "proposeTrade", to: p.seat } as unknown as GameAction)}
                >
                  Trade
                </button>
              )}
              {canDeclareAttack && (
                <button
                  className="scv-mp-here-act"
                  disabled={!view.areaMask?.pvpLegal}
                  title={view.areaMask?.pvpLegal ? `Attack ${p.name} (§I-9)` : (view.areaMask?.reason ?? undefined)}
                  onClick={() => void dispatch({ type: "declareAttack", to: p.seat } as unknown as GameAction)}
                >
                  Attack
                </button>
              )}
              {canProposeUnion && !p.zombie && (
                <button
                  className="scv-mp-here-act"
                  title={`Propose a union with ${p.name} under your command (§I-6)`}
                  onClick={() => void dispatch({ type: "proposeUnion", commander: view.youSeat, invited: [p.seat] } as unknown as GameAction)}
                >
                  Unite
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {guards.length > 0 && !terminal && (
        <div className="scv-mp-guard" data-testid="guard-ribbon">
          Treasure here is guarded by {guards.map((d) => `${d.name} (${d.count})`).join(", ")}
        </div>
      )}
      {(unionProposal || yourUnion) && !terminal && (
        <UnionPanel
          proposal={unionProposal}
          union={yourUnion}
          youSeat={view.youSeat}
          parties={view.parties}
          dispatch={{
            respondUnion: (accept) => void dispatch({ type: "respondUnion", accept } as unknown as GameAction),
            leaveUnion: () => void dispatch({ type: "leaveUnion" } as unknown as GameAction),
            dissolveUnion: () => void dispatch({ type: "dissolveUnion" } as unknown as GameAction),
            allocateRecruit: (recruit, to) => void dispatch({ type: "allocateRecruit", recruit, to } as unknown as GameAction),
          }}
        />
      )}
      {pvpSession && (
        <PvpFightSurface
          session={pvpSession}
          pvp={(view.pvp ?? null) as PvpView | null}
          youSeat={view.youSeat}
          parties={view.parties}
          yourState={state}
          dispatch={(a: PvpUiAction) => void dispatch(a as unknown as GameAction)}
        />
      )}
      {tradeSession && tradePartner && (
        <TradeModal
          session={tradeSession}
          youSeat={view.youSeat}
          yourState={state}
          otherName={tradePartner.name}
          dispatch={{
            updateBasket: (treasure, members) => void dispatch({ type: "updateBasket", treasure, members } as unknown as GameAction),
            confirm: () => void dispatch({ type: "confirmTrade" } as unknown as GameAction),
            cancel: () => void dispatch({ type: "cancelTrade" } as unknown as GameAction),
          }}
        />
      )}
      <div className="scv-mp-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={"scv-mp-toast" + (t.tone === "you" ? " you" : t.tone === "chat" ? " chat" : "")}>{t.text}</div>
        ))}
      </div>
      {yourTurn && <EncounterPanel state={state} dispatch={dispatch} />}
      {yourTurn && state.phase === "fight" && cards && <FightSurface state={state} dispatch={dispatch} cards={cards} />}
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
      {/* Active players can peek at the standings; terminal/finished players land here by default. */}
      {!showScoreboard && !terminal && !gameOver && (
        <button className="scv-mp-standings" onClick={() => setPeeking(true)}>Standings ▣</button>
      )}
      {showScoreboard && (
        <div className="scv-sb-overlay">
          <ScoreboardPanel
            gameId={gameId}
            frozen={gameOver}
            onRowClick={(seat) => setSpectateSeat(seat)}
            onResume={peeking ? () => setPeeking(false) : undefined}
            onSpectate={(terminal || gameOver) ? () => setSpectateSeat(view.youSeat) : undefined}
            onViewMyRun={terminal && !gameOver ? () => setShowMyRun(true) : undefined}
            onQuit={(terminal && !gameOver) ? onExit : undefined}
            onBackToMenu={gameOver ? onExit : undefined}
          />
        </div>
      )}
      {/* Personal score breakdown (no save form — the result is auto-recorded server-side). */}
      {showMyRun && (
        <div className="scv-mp-finishoverlay">
          <GameOverScreen state={state} onNewGame={() => setShowMyRun(false)} newGameLabel="← Back to Standings" />
        </div>
      )}
    </div>
  );
}
