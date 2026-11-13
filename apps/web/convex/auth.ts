import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * The Password provider's `profile` gate. It runs for every flow, before the flow branch, so it is the one
 * place that closes the door: only "signIn" is allowed (no sign-up, reset or verification), and the account
 * id is the lower-cased username (the library keys accounts on `email`; here it holds a username).
 * Roles are never read from params: accounts and roles come only from the internal seed in admin.ts.
 */
export function passwordProfile(params: Record<string, unknown>): { email: string } {
  if (params.flow !== "signIn") throw new Error("Invalid credentials");
  const raw = params.email;
  if (typeof raw !== "string" || !raw.trim()) throw new Error("Invalid credentials");
  return { email: normalizeUsername(raw) };
}

// Players sign in anonymously (games persist per device, no signup friction). Admins sign in with a
// username and password at /login; their accounts are seeded from the CLI, not self-service.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous, Password({ profile: (params) => passwordProfile(params) })],
});
