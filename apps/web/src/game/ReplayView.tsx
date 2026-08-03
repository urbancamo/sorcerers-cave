import { useEffect, useMemo, useRef, useState } from "react";
import { replay, type GameState } from "@sorcerers-cave/engine";
import { createCaveAdapter, type CaveAdapter } from "../view/engineAdapter";
import { loadManifest } from "../data/manifest";
import type { ArtTables } from "../view/projection";
import { CaveCanvas } from "../view/CaveCanvas";
import { DEFAULT_PARTY_COLOR, type PartyColor } from "./partyColors";
import { actionLabel, describeEvent, type GameLog } from "./gameLog";

/** The `game.replayByCode` query result: the `log` bundle shape plus the `replayable` flag. */
export interface ReplayBundle {
  replayable: boolean;
  game: GameLog["game"];
  moves: GameLog["moves"];
}

/**
 * Read-only move-by-move replay of a solo game (spec §RB-4/§RB-5). The whole timeline is
 * reconstructed ONCE by the engine's replay() — one frame per move, frame 0 the initial deal — and
 * the transport just moves an index across the array, so stepping either way is O(1). The frame's
 * state is drawn by the SAME adapter + cave view as live play, bound read-only (canAct false) so
 * no movement or action affordances are offered: this can never advance a real game.
 */
export function ReplayView({ bundle, onExit }: { bundle: ReplayBundle; onExit: () => void }) {
  // bundle.replayable is guaranteed by the caller (an unreplayable code never opens the viewer).
  const frames = useMemo(
    // `bundle.game.variants` (SC-EXT-29): a kit-on game's decks only reconstruct exactly when the
    // flag rides along with seed/picks — absent (old/kit-off codes) behaves exactly as before.
    // `bundle.game.testMode` (SC-Test-1) mirrors the same threading, so a test-mode game's queued
    // overrides replay as their real effect instead of being spuriously rejected.
    () => replay(bundle.game.seed!, bundle.game.picks!, bundle.moves.map((m) => m.action), bundle.game.variants, bundle.game.testMode),
    [bundle],
  );
  const last = frames.length - 1;
  const [i, setI] = useState(0);
  const jump = (n: number) => setI(Math.max(0, Math.min(last, n))); // clamp: never out of range

  // Auto-play (RB-4-6): advance one frame per second until stopped or the timeline ends.
  // One timeout per frame (not an interval) so a manual jump mid-play simply re-arms from there.
  // 1000 ms comfortably clears the renderer's 550 ms token-move animation between steps.
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (i >= last) { setPlaying(false); return; } // the end stops playback by itself
    const t = setTimeout(() => setI(i + 1), 1000);
    return () => clearTimeout(t);
  }, [playing, i, last]);

  const [art, setArt] = useState<ArtTables | null>(null);
  useEffect(() => { void loadManifest().then(setArt); }, []);

  // Bind a read-only adapter to the current frame (SpectateView pattern): create once, sync on step.
  const frame = frames[i]!;
  const adapterRef = useRef<CaveAdapter | null>(null);
  const syncedRef = useRef<GameState | null>(null);
  if (art) {
    if (!adapterRef.current) adapterRef.current = createCaveAdapter(frame.state, art, { canAct: () => false });
    else if (syncedRef.current !== frame.state) adapterRef.current.sync(frame.state);
    syncedRef.current = frame.state;
  }

  if (!art || !adapterRef.current) return <p className="scv-mp-loading">Loading replay…</p>;

  // The transition that PRODUCED this frame: its action named against the PRE-state (so treasure/
  // member indices resolve), its events against the POST-state (gameLog.ts convention).
  const pre = i > 0 ? frames[i - 1]!.state : null;
  const color = (bundle.game.color as PartyColor | null) ?? DEFAULT_PARTY_COLOR;

  return (
    <div className="relative h-screen w-screen">
      <CaveCanvas key={`replay:${bundle.game.code}`} engine={adapterRef.current} state={frame.state} color={color} multiplayer />
      <div className="scv-spectate-banner">Replay <b>{bundle.game.code ?? ""}</b> — viewing only</div>
      <button className="scv-mp-standings" onClick={onExit}>← Exit Replay</button>

      <div className="scv-replay-transport" data-testid="replay-transport">
        <div className="scv-replay-row">
          <button className="scv-primary" onClick={() => jump(0)} disabled={i === 0} aria-label="first move">⏮ First</button>
          <button className="scv-primary" onClick={() => jump(i - 1)} disabled={i === 0} aria-label="previous move">◀ Previous</button>
          <span className="scv-replay-pos">Move {i} / {last}</span>
          {playing ? (
            <button className="scv-primary" onClick={() => setPlaying(false)} aria-label="stop playback">■ Stop</button>
          ) : (
            <button className="scv-primary" onClick={() => setPlaying(true)} disabled={i === last} aria-label="play replay">▶ Play</button>
          )}
          <button className="scv-primary" onClick={() => jump(i + 1)} disabled={i === last} aria-label="next move">Next ▶</button>
          <button className="scv-primary" onClick={() => jump(last)} disabled={i === last} aria-label="last move">Last ⏭</button>
        </div>
        <input
          type="range"
          className="scv-replay-scrub"
          min={0}
          max={last}
          value={i}
          onChange={(e) => jump(Number(e.target.value))}
          aria-label="replay position"
        />
        <div className="scv-replay-move">
          <p className="scv-replay-action">{frame.action ? actionLabel(frame.action, pre) : "Initial deal — the party stands at the Gateway"}</p>
          {frame.events.map((ev, k) => (
            <p key={k} className="scv-replay-event">→ {describeEvent(ev, frame.state)}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
