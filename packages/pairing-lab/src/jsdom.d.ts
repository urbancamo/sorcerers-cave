// Minimal types for the part of jsdom the viewer tests use (the full @types/jsdom is not in the offline package store).
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: { runScripts?: "dangerously" | "outside-only"; pretendToBeVisual?: boolean; url?: string });
    readonly window: Window & typeof globalThis;
  }
}
