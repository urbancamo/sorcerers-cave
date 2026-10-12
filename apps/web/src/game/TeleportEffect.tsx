import { useEffect, useRef, useState } from "react";
import { FeatParticles, prefersReducedMotion } from "./FeatParticles";

// The Sorcerer's teleport timeline, in ms: rising arcane particles over the cave where the party stands, then a slow fade
// to black (the words about his magic on the black); the party moves and the camera cuts to the destination while it is
// black, held for a beat so the token's move has finished; then a slow fade up on the destination, with the particles
// rising there too. The fades are long and eased, never a flash (light sensitivity).
export const TELEPORT_PARTICLES_MS = 2600;                                  // particles before the fade begins
export const TELEPORT_FADE_MS = 2000;                                       // each fade, to black and back up
export const TELEPORT_PEAK_MS = TELEPORT_PARTICLES_MS + TELEPORT_FADE_MS;   // fully black: the party moves now
export const TELEPORT_HOLD_MS = 800;                                        // held black, so the move settles unseen
export const TELEPORT_END_MS = TELEPORT_PEAK_MS + TELEPORT_HOLD_MS + TELEPORT_FADE_MS + 700;   // the second particles have played out
const PARTICLE_SPEED = 2;                                                    // the fall's show, twice as fast, so each fits its window

/** The Sorcerer's teleport (see the timeline above). `onPeak` fires at full black, when the game state moves the
 *  party underneath; `onDone` fires when it has played out. Under prefers-reduced-motion it is just the words over a
 *  still dark backdrop, with the same two callbacks and no particles. */
export function TeleportEffect({ onPeak, onDone }: { onPeak: () => void; onDone: () => void }) {
  const reduce = prefersReducedMotion();
  const peak = useRef(onPeak), done = useRef(onDone);
  peak.current = onPeak; done.current = onDone;
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => peak.current(), reduce ? 250 : TELEPORT_PEAK_MS);
    const t2 = setTimeout(() => done.current(), reduce ? 900 : TELEPORT_END_MS);
    const t3 = setTimeout(() => setArrived(true), TELEPORT_PEAK_MS + TELEPORT_HOLD_MS);   // the destination's particles start as the fade up does
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [reduce]);

  const veil = reduce ? undefined : {
    animation: `scv-tpfx-in ${TELEPORT_FADE_MS}ms ease-in-out ${TELEPORT_PARTICLES_MS}ms both, scv-tpfx-out ${TELEPORT_FADE_MS}ms ease-in-out ${TELEPORT_PEAK_MS + TELEPORT_HOLD_MS}ms forwards`,
  };
  return (
    <div className={"scv-tpfx" + (reduce ? " reduced" : "")} role="status" aria-live="polite" data-testid="teleport-effect">
      {!reduce && (arrived
        ? <FeatParticles key="arrival" speed={PARTICLE_SPEED} bursts={false} />
        : <FeatParticles key="departure" speed={PARTICLE_SPEED} bursts={false} />)}
      <div className="scv-tpfx-veil" style={veil}>
        <p className="scv-tpfx-text">The Sorcerer's magic carries you away…</p>
      </div>
    </div>
  );
}
