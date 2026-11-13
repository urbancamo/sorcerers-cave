/** A fresh, unguessable invite token: a random UUID. It goes in the link and nowhere else. */
export const newToken = (): string => crypto.randomUUID();

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The SHA-256 of a token, hex-encoded: the only form that is stored, so a leaked database does not leak working links. */
export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
