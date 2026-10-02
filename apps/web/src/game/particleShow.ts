// The particle show behind the Sorcerer's fall (FeatParticles.tsx paints it): arcane energy streams off the
// falling card — violet turning to gold — gold embers rise afterwards, and three firework bursts crown it.
// Pure simulation (no DOM, no clock, no Math.random) so the timeline is testable and repeatable; the
// component only feeds it frame times and paints the result. Canvas convention: +y is down.

export type Rng = () => number;
export type ParticleKind = "arcane" | "ember" | "spark";
export interface Particle { kind: ParticleKind; x: number; y: number; vx: number; vy: number; age: number; life: number; size: number }
export interface Show { particles: Particle[]; t: number; burstsDone: number; arcaneCarry: number; emberCarry: number }

export const MAX_PARTICLES = 700;
/** Seconds into the show. Arcane energy while the card shakes and falls, embers as it settles, bursts last. */
export const ARCANE_FROM = 0.5, ARCANE_TO = 2.2, ARCANE_RATE = 260; // particles per second
export const EMBER_FROM = 1.8, EMBER_TO = 5.5, EMBER_RATE = 70;
export const BURST_TIMES = [2.4, 3.2, 4.0];
const BURST_SPARKS = 110;
const SPARK_GRAVITY = 320, SPARK_DRAG = 0.3; // px/s², 1/s

export const createShow = (): Show => ({ particles: [], t: 0, burstsDone: 0, arcaneCarry: 0, emberCarry: 0 });

/** Finished once everything that will ever be emitted has been, and the last particle has burned out. */
export const isDone = (s: Show): boolean =>
  s.t > EMBER_TO && s.burstsDone >= BURST_TIMES.length && s.particles.length === 0;

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const add = (s: Show, p: Particle) => { if (s.particles.length < MAX_PARTICLES) s.particles.push(p); };
/** How many particles a window [t0, t1] earns from a stream that runs over [from, to] at `rate`/s. */
const earned = (t0: number, t1: number, from: number, to: number, rate: number) =>
  Math.max(0, Math.min(t1, to) - Math.max(t0, from)) * rate;

/** Advance the show by `dt` seconds: emit what the timeline calls for, then move and age the particles. */
export function tick(s: Show, dt: number, size: { w: number; h: number }, origin: { x: number; y: number }, rng: Rng): void {
  const t0 = s.t, t1 = s.t + dt;

  // Arcane energy: sprays from the card in every direction, lifting slightly.
  s.arcaneCarry += earned(t0, t1, ARCANE_FROM, ARCANE_TO, ARCANE_RATE);
  for (; s.arcaneCarry >= 1; s.arcaneCarry -= 1) {
    const a = between(rng, 0, Math.PI * 2), sp = between(rng, 60, 220);
    add(s, { kind: "arcane", x: origin.x + between(rng, -40, 40), y: origin.y + between(rng, -60, 60),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, age: 0, life: between(rng, 0.8, 1.4), size: between(rng, 2.5, 5) });
  }

  // Embers: gold, slow, rising from around the card.
  s.emberCarry += earned(t0, t1, EMBER_FROM, EMBER_TO, EMBER_RATE);
  for (; s.emberCarry >= 1; s.emberCarry -= 1) {
    add(s, { kind: "ember", x: origin.x + between(rng, -140, 140), y: origin.y + between(rng, 20, 140),
      vx: between(rng, -20, 20), vy: -between(rng, 30, 90), age: 0, life: between(rng, 2, 3.4), size: between(rng, 2, 4) });
  }

  // Firework bursts: a radial spray at a random spot in the upper middle of the screen.
  while (s.burstsDone < BURST_TIMES.length && BURST_TIMES[s.burstsDone]! <= t1) {
    const bx = between(rng, size.w * 0.2, size.w * 0.8), by = between(rng, size.h * 0.15, size.h * 0.55);
    for (let i = 0; i < BURST_SPARKS; i++) {
      const a = between(rng, 0, Math.PI * 2), sp = between(rng, 120, 320);
      add(s, { kind: "spark", x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: between(rng, 0.9, 1.5), size: between(rng, 2.5, 4.5) });
    }
    s.burstsDone += 1;
  }

  // Move and age; drop the dead.
  const drag = Math.exp(-SPARK_DRAG * dt);
  for (const p of s.particles) {
    if (p.kind === "spark") { p.vy += SPARK_GRAVITY * dt; p.vx *= drag; p.vy *= drag; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.age += dt;
  }
  s.particles = s.particles.filter((p) => p.age < p.life);
  s.t = t1;
}

/** CSS colour for a particle: arcane energy turns violet → gold over its life; embers and sparks are gold;
 *  all fade out as they die. */
export function particleColor(p: Particle): string {
  const r = Math.min(1, p.age / p.life);
  const alpha = Math.pow(1 - r, 0.8).toFixed(2);
  // Violet (295°) → magenta → red → orange → gold (408° = 48°): the long way round the wheel, which avoids
  // the blue/green a straight 295 → 48 blend would pass through.
  if (p.kind === "arcane") return `hsla(${((295 + (408 - 295) * r) % 360).toFixed(0)}, 92%, 66%, ${alpha})`;
  if (p.kind === "ember") return `hsla(42, 92%, 62%, ${alpha})`;
  return `hsla(46, 96%, 72%, ${alpha})`;
}
