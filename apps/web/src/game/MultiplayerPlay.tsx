import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { GS_PLAYING, type GameAction, type GameEvent, type GameState } from "@sorcerers-cave/engine";
import { createCaveAdapter, type CaveAdapter } from "../view/engineAdapter";
import { loadManifest } from "../data/manifest";
import type { ArtTables } from "../view/projection";
import { CaveCanvas } from "../view/CaveCanvas";
import { EncounterPanel } from "./EncounterPanel";
import { ExplorePanel } from "./ExplorePanel";
import { PartyPanel } from "./PartyPanel";
import { DiceRoll } from "./DiceRoll";
import { rollFromEvents, type RollView } from "./rollView";
import { NoticeModal } from "./NoticeModal";
import { eventNotices, type Notice } from "./eventNotices";
import { ChatPanel } from "./ChatPanel";
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

  useEffect(() => { void loadManifest().then(setArt); }, []);

  const adapterRef = useRef<CaveAdapter | null>(null);
  const syncedRef = useRef<GameState | null>(null);
  const yourTurnRef = useRef(false);

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
  const currentName = view.parties.find((p) => p.seat === view.currentSeat)?.name ?? "…";
  const banner = terminal
    ? "Your expedition has ended — watching the others."
    : yourTurn ? "Your turn — explore!" : `Waiting for ${currentName}…`;

  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas key={gameId} engine={engine} state={state} color={myColor} onPartyClick={() => setShowParty(true)} />
      <div className={"scv-turn-banner" + (yourTurn ? " you" : "")}>{banner}</div>
      {yourTurn && <EncounterPanel state={state} dispatch={dispatch} />}
      {yourTurn && <ExplorePanel state={state} dispatch={dispatch} />}
      {showParty && <PartyPanel state={state} dispatch={dispatch} onClose={() => setShowParty(false)} />}
      {roll && <DiceRoll title={roll.title} lanes={roll.lanes} message={roll.message} tone={roll.tone} onContinue={() => setRoll(null)} />}
      {notices && <NoticeModal notices={notices} onClose={() => setNotices(null)} />}
      <div className={"scv-mp-chatdock" + (showChat ? " open" : "")}>
        <button className="scv-mp-chattoggle" onClick={() => setShowChat((s) => !s)}>{showChat ? "Hide chat ▾" : "Chat ▸"}</button>
        {showChat && <ChatPanel gameId={gameId} />}
      </div>
      <button className="scv-mp-leave" onClick={onExit}>Leave</button>
    </div>
  );
}
