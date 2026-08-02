const STORAGE_KEY = "scv-test-secret";

/**
 * The Test Mode magic-string secret (§Test Mode), read from the URL's `?test=` parameter and
 * remembered in sessionStorage so it survives an in-app navigation or reload without needing the
 * param on every request. Returns null when neither is present. This value is never validated
 * client-side — it is only ever compared server-side, in Convex's `startTestGame` mutation, against
 * an environment variable that is never bundled into this client build.
 */
export function getTestSecret(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("test");
  if (fromUrl) {
    sessionStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(STORAGE_KEY);
}
