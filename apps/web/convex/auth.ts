import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";

// Anonymous-only for the solitaire release: games persist per device with no
// signup friction. Add email/OAuth providers here when multiplayer arrives.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous],
});
