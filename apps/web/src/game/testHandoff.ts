// The admin Testing tab starts (or restores) a Test Mode game, then opens the game screen at "/" on it.
// The game's id rides in sessionStorage for that one navigation. It is not a secret: the server still
// checks that the signed-in admin owns the game. Storage can be blocked, so every access is guarded.
const KEY = 'scv.testGame';

export function setTestGameHandoff(id: string): void {
  try { sessionStorage.setItem(KEY, id); } catch { /* ignore: the admin lands on the splash instead */ }
}

/** The pending game id, left in place so a re-run of the caller's initialiser (StrictMode) sees it too. */
export function peekTestGameHandoff(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function clearTestGameHandoff(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
