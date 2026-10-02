import { useEffect, useRef } from "react";
import { createShow, tick, isDone, particleColor } from "./particleShow";

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** The Sorcerer's-fall particle show (featParticles.ts) painted on a canvas that fills its positioned
 *  parent, behind the celebration panel. It runs once, stops by itself when the last spark burns out, and is
 *  cancelled on unmount. Draws nothing at all under prefers-reduced-motion, or if there is no 2D context. */
export function FeatParticles() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = prefersReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const show = createShow();
    const size = { w: 0, h: 0 };
    let raf = 0;
    let last: number | null = null;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      size.w = canvas.clientWidth; size.h = canvas.clientHeight;
      canvas.width = Math.round(size.w * dpr); canvas.height = Math.round(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener("resize", fit);

    const loop = (ms: number) => {
      const dt = last === null ? 0 : Math.min(0.05, (ms - last) / 1000); // a stalled tab must not fast-forward the show
      last = ms;
      tick(show, dt, size, { x: size.w / 2, y: size.h * 0.42 }, Math.random);
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.globalCompositeOperation = "lighter"; // overlapping sparks add up to a glow
      for (const p of show.particles) {
        // A soft halo (wider, faint) under a bright core, so each spark glows rather than just dots.
        const col = particleColor(p);
        ctx.beginPath(); ctx.fillStyle = col.replace(/, ([\d.]+)\)$/, (_, a) => `, ${(Number(a) * 0.22).toFixed(2)})`);
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = col;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      raf = isDone(show) ? 0 : requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); };
  }, [reduce]);

  if (reduce) return null;
  return <canvas ref={ref} className="scv-feat-particles" aria-hidden="true" data-testid="feat-particles" />;
}
