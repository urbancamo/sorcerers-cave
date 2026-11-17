// The mouse scheme for the 3D cave (Peter's request): the original OrbitControls layout, or the tabletop layout of Tabletop Simulator and
// Baldur's Gate. The choice lives in this browser only. Touch gestures are the same in both.
//
//   classic   left drag orbit · middle wheel zoom · right drag pan · click selects
//   tabletop  left click selects (left drag does nothing to the camera) · right drag orbit · middle drag pan · wheel zoom
export type MouseMode = 'classic' | 'tabletop';

const MOUSE_MODE_KEY = 'scv-mouse-mode';
export const MOUSE_MODE_EVENT = 'scv-mouse-mode';

// three.js MOUSE.ROTATE = 0, DOLLY = 1, PAN = 2; -1 is "no action".
const ROTATE = 0, DOLLY = 1, PAN = 2, NONE = -1;
export const mouseButtonsFor = (mode: MouseMode): { LEFT: number; MIDDLE: number; RIGHT: number } =>
  mode === 'tabletop' ? { LEFT: NONE, MIDDLE: PAN, RIGHT: ROTATE } : { LEFT: ROTATE, MIDDLE: DOLLY, RIGHT: PAN };

/** The saved choice; classic when nothing is saved or storage is blocked. */
export function readMouseMode(): MouseMode {
  try { return localStorage.getItem(MOUSE_MODE_KEY) === 'tabletop' ? 'tabletop' : 'classic'; } catch { return 'classic'; }
}

/** Save the choice and tell a running cave view, so it changes at once. */
export function writeMouseMode(mode: MouseMode): void {
  try { localStorage.setItem(MOUSE_MODE_KEY, mode); } catch { /* storage unavailable — the choice lasts this session */ }
  window.dispatchEvent(new CustomEvent(MOUSE_MODE_EVENT, { detail: mode }));
}

// Zoom speed for the wheel and pinch. Set on request to 5, 10 and 15 (the cave first shipped with 1.7).
export type ZoomSpeed = 'slow' | 'medium' | 'fast';
const ZOOM_SPEED_KEY = 'scv-zoom-speed';
export const ZOOM_SPEED_EVENT = 'scv-zoom-speed';
export const ZOOM_SPEED_VALUE: Record<ZoomSpeed, number> = { slow: 5, medium: 10, fast: 15 };

/** The saved choice; medium when nothing is saved or storage is blocked. */
export function readZoomSpeed(): ZoomSpeed {
  try { const v = localStorage.getItem(ZOOM_SPEED_KEY); return v === 'slow' || v === 'fast' ? v : 'medium'; } catch { return 'medium'; }
}

/** Save the choice and tell a running cave view, so it changes at once. */
export function writeZoomSpeed(speed: ZoomSpeed): void {
  try { localStorage.setItem(ZOOM_SPEED_KEY, speed); } catch { /* storage unavailable — the choice lasts this session */ }
  window.dispatchEvent(new CustomEvent(ZOOM_SPEED_EVENT, { detail: speed }));
}
