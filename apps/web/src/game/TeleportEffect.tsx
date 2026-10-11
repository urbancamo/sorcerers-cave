import { useEffect, useRef } from "react";
import { FeatParticles, prefersReducedMotion } from "./FeatParticles";

// When, in ms, the white flash peaks (the moment the party actually moves) and when the effect has played out.
export const TELEPORT_PEAK_MS = 1500;
export const TELEPORT_END_MS = 3200;

/** The Sorcerer's teleport: the cave darkens, a violet vortex spins up and draws in, rings contract round the
 *  party, sparks stream, and a flash whites out the screen — at which moment `onPeak` fires (the game state moves
 *  the party underneath) — then it clears to reveal the new place. `onDone` fires when it has played out. Under
 *  prefers-reduced-motion it is a short fade with the same two callbacks. */
export function TeleportEffect({ onPeak, onDone }: { onPeak: () => void; onDone: () => void }) {
  const reduce = prefersReducedMotion();
  const peak = useRef(onPeak), done = useRef(onDone);
  peak.current = onPeak; done.current = onDone;

  useEffect(() => {
    const t1 = setTimeout(() => peak.current(), reduce ? 250 : TELEPORT_PEAK_MS);
    const t2 = setTimeout(() => done.current(), reduce ? 900 : TELEPORT_END_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reduce]);

  return (
    <div className={"scv-tpfx" + (reduce ? " reduced" : "")} role="status" aria-live="polite" data-testid="teleport-effect">
      <div className="scv-tpfx-vortex" />
      <div className="scv-tpfx-ring r1" />
      <div className="scv-tpfx-ring r2" />
      <div className="scv-tpfx-ring r3" />
      <div className="scv-tpfx-core" />
      <p className="scv-tpfx-text">The Sorcerer's magic carries you away…</p>
      {!reduce && <FeatParticles />}
      <div className="scv-tpfx-flash" />
    </div>
  );
}
