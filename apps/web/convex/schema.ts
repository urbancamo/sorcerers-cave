import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// RBAC roles for the hidden admin panel (/login). SYSTEM implies every other role (see roles.ts).
// Roles are only ever written by the internal seed in admin.ts, never from a client argument.
export const roleValidator = v.union(v.literal("SYSTEM"), v.literal("USER"), v.literal("ANALYTICS"), v.literal("TEST"));

export default defineSchema({
  ...authTables,
  // The auth library's users table plus `roles` (optional so anonymous players and old rows validate).
  // Its `email` and `phone` indexes must be kept: the library's account lookups use them.
  users: defineTable({
    ...authTables.users.validator.fields,
    roles: v.optional(v.array(roleValidator)),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  games: defineTable({
    ownerId: v.optional(v.id("users")),
    // Short, human-typable resume handle: four uppercase letters, unique across games. Optional so
    // games created before this feature still validate; every new game is allocated one.
    code: v.optional(v.string()),
    // Initial conditions of the game. With the gameEvents action log, `seed` + `picks` let the engine's
    // replay() reconstruct the whole game from scratch (move-by-move). Optional so rows created before
    // this feature still validate — their downloaded log notes the initial conditions are unavailable.
    seed: v.optional(v.number()),
    picks: v.optional(v.array(v.number())),
    state: v.any(), // serialized engine GameState (engine owns the shape; Milestone B)
    status: v.union(v.literal("active"), v.literal("finished")),
    // party marker colour (optional for games created before colours existed); multiplayer will
    // use this to reserve colours already taken in a shared game.
    color: v.optional(v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red"))),
    // --- Multiplayer (Phase 1) — all optional so existing solo rows still validate. ---
    mode: v.optional(v.union(v.literal("solo"), v.literal("multi"))),
    hostId: v.optional(v.id("users")),        // the creator; only the host may start the game
    lobby: v.optional(v.union(v.literal("open"), v.literal("started"), v.literal("finished"))),
    maxSeats: v.optional(v.number()),
    // The scheduled reaction-window job for the active interaction session (spec §1.3) — cancelled
    // and re-armed whenever the session's window changes; also covered by a lazy overdue check.
    sessionJobId: v.optional(v.id("_scheduled_functions")),
    // Game variants (M7, plan WS-6), chosen in the lobby BEFORE the engine state exists (state is
    // null until startGame) — hence a games field, handed into buildMpGame at start and riding in
    // state.variants from then on. Absent = a plain game.
    // `extensionKit` (SC-EXT-29, design US-01/§1.1) reuses this same field for SOLO games too: set
    // once at `game.newGame` (mirroring the immutable `seed`/`picks` initial conditions) rather than
    // via a lobby, and threaded into `replay()` by `game.log`/`replayByCode`/`highScores.log` so a
    // kit-on game's saved code reconstructs the exact 101/90-card decks it was dealt from. Absent
    // ⇒ kit-off (old codes/saves decode unchanged — SC-EXT-1 byte-identity).
    // `sibyl` (SC-SIB-1) is player-chosen like `extensionKit` — set at `game.newGame` / the MP lobby and
    // threaded into `replay()` so a Sibyl game's saved code reconstructs the exact pile it was dealt from.
    // `forcedRedraw` (§6.3.2, Dead End rule): solo-only, stamped server-side by `game.ts`'s
    // `withForcedRedraw` from a Convex-only env var — never accepted from a client argument, since
    // it affects scoring difficulty and must stay out of the leaderboard's normal comparison.
    variants: v.optional(v.object({ zombies: v.optional(v.boolean()), fogLite: v.optional(v.boolean()), concurrent: v.optional(v.boolean()), extensionKit: v.optional(v.boolean()), forcedRedraw: v.optional(v.boolean()), sorcererTeleport: v.optional(v.boolean()), trapRules: v.optional(v.boolean()), sibyl: v.optional(v.boolean()), strangerLevel: v.optional(v.string()), combatRevision: v.optional(v.boolean()) })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_code", ["code"])
    // Live-game lookups for the admin analytics: active games, newest activity first, without reading every game.
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),
  // Analytics summary, one row per finished solo game or per finished multiplayer party (seat). Written when a game
  // reaches a terminal state, so the admin panel never has to read the big `games.state` blobs. Test Mode games are
  // never recorded. Unlike `highScores` (escaped solo games only) this holds deaths and quits too.
  gameStats: defineTable({
    gameId: v.id("games"),
    seat: v.number(), // 0 for a solo game
    mode: v.union(v.literal("solo"), v.literal("multi")),
    outcome: v.union(v.literal("escaped"), v.literal("dead"), v.literal("quit")),
    score: v.number(),
    turn: v.number(),
    deepestLevel: v.number(),
    areas: v.number(),
    dragonKills: v.number(),
    membersLost: v.number(), // party members dead or turned to stone
    partySize: v.number(), // members at the end, including any recruited
    picks: v.optional(v.array(v.number())), // the starting party (solo only)
    extensionKit: v.boolean(),
    sibyl: v.boolean(),
    seatCount: v.optional(v.number()), // multiplayer: parties in the cave
    finishedAt: v.number(), // approximate for rows backfilled from before this table existed
  })
    .index("by_finishedAt", ["finishedAt"])
    .index("by_outcome_and_finishedAt", ["outcome", "finishedAt"])
    .index("by_game_and_seat", ["gameId", "seat"]),
  // Admin users who have been invited but have not set a password yet. The user row and login are created when the
  // invite is redeemed (convex/invites.ts), so a pending user is only a row here. Only a hash of the link's token is
  // stored: the link itself is shown to the admin once, when it is issued.
  invites: defineTable({
    username: v.string(),
    roles: v.array(roleValidator),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_username", ["username"]),
  // Running totals over every recorded game (one row, key "all"), kept in step with gameStats so headline figures
  // never need a table scan.
  gameStatsTotals: defineTable({
    key: v.literal("all"),
    games: v.number(), solo: v.number(), multi: v.number(),
    escaped: v.number(), dead: v.number(), quit: v.number(),
    escapedScoreSum: v.number(),
  }).index("by_key", ["key"]),
  // Multiplayer seats — one row per player in a multi game (Phase 1).
  players: defineTable({
    gameId: v.id("games"),
    userId: v.id("users"),
    seat: v.number(),        // 0–3, stable index
    partyName: v.string(),   // required identity (1–24 chars, unique within a game)
    color: v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red")),
    ready: v.boolean(),
    lastSeen: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_user", ["userId"]),
  // Multiplayer chat / broadcast feed (Phase 1). seat=null for system lines.
  messages: defineTable({
    gameId: v.id("games"),
    seat: v.union(v.number(), v.null()),
    partyName: v.string(),
    color: v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red"), v.null()),
    text: v.string(),
    createdAt: v.number(),
    // "action" = an auto-narrated game event (defeat, pickup, descend…) attributed to a seat;
    // absent for player chat and seat=null system lines.
    kind: v.optional(v.literal("action")),
  }).index("by_game", ["gameId", "createdAt"]),
  gameEvents: defineTable({
    gameId: v.id("games"),
    seq: v.number(),
    action: v.any(),
    events: v.any(),
    // Only on a decision that was asked of an external stranger level (stage 6.5): the level asked, and how long its answer (or the
    // fallback in its place) took. The logged action names `standard` when it fell back, so the level is kept here for the report.
    strategyId: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
  }).index("by_game", ["gameId", "seq"]).index("by_strategyId", ["strategyId"]),
  // In-game bug reports. Stored first, then forwarded to a GitHub issue by `bugReport.createIssue`
  // (spec .agent-os/specs/2026-11-09-bug-report-tool). `contact` stays here — the issue is public.
  bugReports: defineTable({
    ownerId: v.id("users"),
    gameId: v.optional(v.id("games")),
    // Denormalised at submit time so the row stays readable if the game is later removed.
    code: v.optional(v.string()),
    testMode: v.boolean(),
    description: v.string(),
    expected: v.optional(v.string()),
    category: v.union(v.literal("rules"), v.literal("display"), v.literal("crash"), v.literal("other")),
    contact: v.optional(v.string()),
    client: v.object({ userAgent: v.string(), viewport: v.string(), build: v.string() }),
    // The game-window screenshot the player chose to attach (Convex file storage); linked from the issue body.
    screenshotId: v.optional(v.id("_storage")),
    // pending: waiting for (or retrying) the GitHub call; created: issue exists; failed: gave up.
    status: v.union(v.literal("pending"), v.literal("created"), v.literal("failed")),
    attempts: v.number(),
    issueNumber: v.optional(v.number()),
    issueUrl: v.optional(v.string()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_and_created", ["ownerId", "createdAt"]).index("by_status", ["status"]),
  // Global, shared leaderboard. `party` and `state` keep the full final snapshot so the
  // attributes behind a score can be inspected later.
  // Site-wide options a SYSTEM user sets in the admin panel's System tab. One row, found with `.first()`; an option left unset
  // (or no row at all) reads as its default. New options are added here as further optional fields.
  systemSettings: defineTable({
    // Is Multiplayer mode offered on the welcome page? Absent or false: no (the default).
    multiplayerEnabled: v.optional(v.boolean()),
  }),
  highScores: defineTable({
    gameId: v.id("games"),
    ownerId: v.optional(v.id("users")),
    name: v.string(),
    score: v.number(),
    outcome: v.number(), // GS_* (escaped / dead / quit)
    party: v.any(), // final party array (full member attributes + carried treasure)
    state: v.any(), // full final engine state, for deeper analysis
    createdAt: v.number(),
    // Multiplayer results (§8.4): a finished party's entry, kept separate from solo records.
    mode: v.optional(v.union(v.literal("solo"), v.literal("multi"))),
    gameCode: v.optional(v.string()),  // the four-letter code (group a multi game's parties)
    partyName: v.optional(v.string()),
    // Extension kit (SC-EXT-29, design US-01): labels a kit-on game's leaderboard entry. Set from
    // the final state's `variants.extensionKit` at `highScores.save` (solo) and `recordTerminals`
    // (multi); absent on every pre-kit row (reads as kit-off, same as everywhere else).
    extensionKit: v.optional(v.boolean()),
    // Dead End rule (§6.3.2, "forced redraw"): labels a game recorded while the rescue variant was
    // active — set from `state.variants.forcedRedraw` at `highScores.save` (solo-only; the flag
    // never reaches multiplayer). Segments the leaderboard exactly like `extensionKit` does, since a
    // rescued run isn't comparable to one that could still soft-lock.
    forcedRedraw: v.optional(v.boolean()),
    // The Sibyl (SC-SIB-9): labels an entry from a game dealt with the optional Sibyl card. Set from the
    // final state's `variants.sibyl` at `highScores.save` (solo) and `recordTerminals` (multi); absent on
    // every older row (reads as Sibyl-off). Segments the leaderboard like `extensionKit` does.
    sibyl: v.optional(v.boolean()),
    // Multiplayer only: how many seats shared the cave — treasure is split, so the count is the
    // context a reader needs to judge the score. Absent on rows recorded before 2026-07-28.
    seatCount: v.optional(v.number()),
    // The deepest level of any tile placed on the final map ("lowest level reached"). Older rows lack it until
    // `highScores.backfillMaxDepth` has run; `list` derives it from `state` meanwhile.
    maxDepth: v.optional(v.number()),
  })
    .index("by_game", ["gameId"])
    .index("by_score", ["score"]),
});
