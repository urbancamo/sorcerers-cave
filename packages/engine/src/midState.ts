// Pre-outcome presentation snapshot (SC-4-43). `reduce` runs synchronously, so one module-level scratch is enough: it is cleared at the
// start of every `reduce` and drained into the result's `midState` at the end. Kept out of reduce.ts so hazards.ts can stage a snapshot too.
import type { GameState } from "./state";

let pending: GameState | null = null;

/** Stage a snapshot, replacing any staged earlier (a relocation shows the room as it stood when the party left it). */
export function setMidState(state: GameState): void { pending = structuredClone(state); }

/** Stage a snapshot only if none is staged yet: a dice roll's backdrop is the room BEFORE its outcome, even when something later (a Trap) relocates. */
export function stageMidStateOnce(state: GameState): void { if (pending === null) pending = structuredClone(state); }

export function clearMidState(): void { pending = null; }

/** Take and clear the staged snapshot. */
export function takeMidState(): GameState | null { const s = pending; pending = null; return s; }
