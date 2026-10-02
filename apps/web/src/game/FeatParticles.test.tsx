import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FeatParticles } from "./FeatParticles";

// jsdom has no 2D canvas: stub a recording context, and drive requestAnimationFrame by hand.
const ctx = () => ({
  setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  fillStyle: "", globalCompositeOperation: "",
});
let c: ReturnType<typeof ctx>;
let frames: Map<number, FrameRequestCallback>;
let nextId: number;

beforeEach(() => {
  c = ctx();
  frames = new Map(); nextId = 1;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(c as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { const id = nextId++; frames.set(id, cb); return id; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => { frames.delete(id); }));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Run the pending frame callback at time `ms`. */
const frame = (ms: number) => { const [id, cb] = [...frames][0]!; frames.delete(id); cb(ms); };

describe("FeatParticles", () => {
  it("paints a particle show onto an aria-hidden canvas, frame by frame", () => {
    const { container } = render(<FeatParticles />);
    const canvas = container.querySelector("canvas")!;
    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    frame(0);                      // first frame sets the clock
    expect(c.clearRect).toHaveBeenCalled();
    expect(c.arc).not.toHaveBeenCalled();   // nothing is emitted in the opening moments
    for (let ms = 50; ms <= 1500; ms += 50) frame(ms);
    expect(c.arc).toHaveBeenCalled();       // the arcane stream has started
    expect(c.fill).toHaveBeenCalled();
  });

  it("stops animating when it is removed", () => {
    const { unmount } = render(<FeatParticles />);
    frame(0);
    expect(frames.size).toBe(1); // the next frame is queued
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("draws nothing at all under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
    const { container } = render(<FeatParticles />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(frames.size).toBe(0);
  });

  it("copes with a browser that gives no 2D context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(() => render(<FeatParticles />)).not.toThrow();
    expect(frames.size).toBe(0);
  });
});
