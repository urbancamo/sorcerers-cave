// Multiplayer is under active development and MUST NOT be exposed in production until complete and
// approved (see docs/requirements/2026-06-15-multiplayer-plan.html §1). It is ON in local dev and
// OFF in any built/deployed bundle, unless explicitly enabled with VITE_MULTIPLAYER=1 (never set in
// production). The splash entry points stay disabled whenever this is false.
export const MULTIPLAYER_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_MULTIPLAYER === "1";
