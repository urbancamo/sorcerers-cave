const AUTO_ROLL_KEY = 'scv-auto-roll';

/** Whether the player has chosen to skip the "Roll the dice" click and see special-roll dice tumble at once.
 *  Storage can be blocked, so it falls back to off (the player rolls). */
export function readAutoRoll(): boolean {
  try { return localStorage.getItem(AUTO_ROLL_KEY) === '1'; } catch { return false; }
}

export function writeAutoRoll(on: boolean): void {
  try { localStorage.setItem(AUTO_ROLL_KEY, on ? '1' : '0'); } catch { /* storage unavailable — the choice lasts this session */ }
}
