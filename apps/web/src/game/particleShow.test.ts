import { describe, it, expect } from "vitest";
import {
  createShow, tick, isDone, particleColor,
  MAX_PARTICLES, ARCANE_FROM, EMBER_FROM, BURST_TIMES, type Particle,
} from "./particleShow";

/** Small deterministic LCG so two runs of the same show are identical. */
const seeded = (seed: number) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000); };
const SIZE = { w: 800, h: 600 };
const ORIGIN = { x: 400, y: 260 };
/** Run a show for `seconds` in fixed 50 ms steps. */
const run = (show: ReturnType<typeof createShow>, seconds: number, rng = seeded(1)) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) tick(show, 0.05, SIZE, ORIGIN, rng);
  return show;
};
const kinds = (ps: Particle[]) => new Set(ps.map((p) => p.kind));

describe("particleShow — the Sorcerer's fall", () => {
  it("is quiet at first: nothing is emitted before the arcane energy starts", () => {
    const show = run(createShow(), ARCANE_FROM - 0.1);
    expect(show.particles).toHaveLength(0);
  });

  it("streams arcane energy first, with no embers or bursts yet", () => {
    const show = run(createShow(), 1.2);
    expect(show.particles.length).toBeGreaterThan(20);
    expect(kinds(show.particles)).toEqual(new Set(["arcane"]));
    expect(1.2).toBeLessThan(EMBER_FROM);
  });

  it("launches each firework burst once, at its time, and adds embers after the arcane stream", () => {
    const show = createShow();
    run(show, BURST_TIMES[0]! - 0.1);
    expect(show.burstsDone).toBe(0);
    run(show, 0.3); // crosses the first burst
    expect(show.burstsDone).toBe(1);
    expect(show.particles.filter((p) => p.kind === "spark").length).toBeGreaterThanOrEqual(50);
    run(show, BURST_TIMES[BURST_TIMES.length - 1]! + 0.5 - show.t);
    expect(show.burstsDone).toBe(BURST_TIMES.length);
    expect(kinds(show.particles).has("ember")).toBe(true);
  });

  it("never exceeds the particle cap, however long a frame is", () => {
    const show = createShow();
    for (let i = 0; i < 400; i++) tick(show, 0.05, SIZE, ORIGIN, seeded(i + 1));
    expect(show.particles.length).toBeLessThanOrEqual(MAX_PARTICLES);
    tick(show, 5, SIZE, ORIGIN, seeded(9)); // one huge hitch
    expect(show.particles.length).toBeLessThanOrEqual(MAX_PARTICLES);
  });

  it("is deterministic for a given random source", () => {
    const a = run(createShow(), 3.4, seeded(7));
    const b = run(createShow(), 3.4, seeded(7));
    expect(a.particles).toEqual(b.particles);
  });

  it("burns out: every particle dies and the show reports done", () => {
    const show = createShow();
    expect(isDone(show)).toBe(false);
    run(show, 14);
    expect(show.particles).toHaveLength(0);
    expect(isDone(show)).toBe(true);
  });

  it("is not done while the show is still scheduled to emit, even with no live particles", () => {
    expect(isDone(createShow())).toBe(false);
    const show = createShow();
    run(show, 0.2); // nothing alive yet, but it has not started
    expect(isDone(show)).toBe(false);
  });

  it("spark bursts fall under gravity", () => {
    const show = createShow();
    run(show, BURST_TIMES[0]! + 0.05);
    const spark = show.particles.find((p) => p.kind === "spark")!;
    const vy0 = spark.vy;
    tick(show, 0.2, SIZE, ORIGIN, seeded(3));
    expect(spark.vy).toBeGreaterThan(vy0); // +y is down on a canvas
  });

  it("fades the arcane energy violet → magenta → ember-orange → gold, never through blue or green", () => {
    const hueAt = (age: number) =>
      Number(/hsla\((\d+(?:\.\d+)?),/.exec(particleColor({ kind: "arcane", x: 0, y: 0, vx: 0, vy: 0, age, life: 1, size: 3 }))![1]);
    for (let age = 0; age <= 1; age += 0.05) {
      const h = hueAt(age);
      expect(h >= 280 || h <= 70).toBe(true); // 80–270° would be green/cyan/blue
    }
  });

  it("colours the arcane energy violet when young and gold when old, fading as it dies", () => {
    const base: Particle = { kind: "arcane", x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 3 };
    const hue = (p: Particle) => Number(/hsla\((\d+(?:\.\d+)?),/.exec(particleColor(p))![1]);
    const alpha = (p: Particle) => Number(/,\s*([\d.]+)\)$/.exec(particleColor(p))![1]);
    expect(hue({ ...base, age: 0.05 })).toBeGreaterThan(240); // violet / magenta
    expect(hue({ ...base, age: 0.95 })).toBeLessThan(90);     // turned to gold
    expect(alpha({ ...base, age: 0.9 })).toBeLessThan(alpha({ ...base, age: 0.1 }));
    expect(particleColor({ ...base, kind: "ember", age: 0.5 })).toMatch(/^hsla\(4\d/); // embers are gold throughout
  });
});
