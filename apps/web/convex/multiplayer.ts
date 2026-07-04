import { mutation, query, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id, Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { uniqueCode } from "./game";
import { buildMpGame, choosePartyFor, mpReduce, partyView, fogFilter, distantFights, zombiePostSweep, repairTurnFlow, mpScore, occupants, areaInteractionMask, expireTrade, expirePvp, expireUnionProposal, pvpView, PVP_WINDOW_MS, CREATURES, TREASURES, PARTY_BUDGET, type MpGameState, type MpAction, type PartyState, type GameEvent } from "@sorcerers-cave/engine";

// Permissive action shape; the engine (mpReduce) enforces semantics. Includes the lobby-level endTurn.
const mpActionValidator = v.object({
  type: v.string(),
  dir: v.optional(v.number()),
  idx: v.optional(v.number()),
  ti: v.optional(v.number()),   // takeTreasure: which chamber treasure
  mi: v.optional(v.number()),
  from: v.optional(v.number()),
  to: v.optional(v.number()),
  artifact: v.optional(v.number()),
  target: v.optional(v.number()),
  borne: v.optional(v.boolean()), // setBorne: bear vs stow a Sword/Staff/Ring
  // Trade-session baskets (I-5): treasure ids + party member indices offered.
  treasure: v.optional(v.array(v.number())),
  members: v.optional(v.array(v.number())),
  // PvP session layout (I-9/I-10): member ids are "seat:idx" strings.
  line: v.optional(v.array(v.string())),
  engagements: v.optional(v.array(v.object({ attackers: v.array(v.string()), defenders: v.array(v.string()) }))),
  backers: v.optional(v.array(v.object({ caster: v.string(), at: v.number() }))),
  // resolveRound: the player's pairing for one fight round (front/background/strangers per match).
  matches: v.optional(v.array(v.object({
    front: v.array(v.number()),
    backers: v.array(v.number()),
    strangers: v.array(v.number()),
  }))),
  // Union lifecycle (I-6/I-7): proposeUnion{commander,invited}, respondUnion{accept},
  // allocateRecruit{recruit,to} (`to` and `members` are shared with the fields above).
  commander: v.optional(v.number()),
  invited: v.optional(v.array(v.number())),
  accept: v.optional(v.boolean()),
  recruit: v.optional(v.number()),
});

/** Trade offers wait 60 s on the other side before expiring (spec §1.3). */
const TRADE_WINDOW_MS = 60_000;
/** A union invitee gets 60 s to answer; silence is refusal (spec I-6, §1.3). */
const UNION_WINDOW_MS = 60_000;
/** A seat is "present" if its player row pinged within this window (pauses timeouts, spec §1.3). */
const PRESENCE_FRESH_MS = 30_000;

// Multiplayer lobby (Phase 1), the multi-party game state + turn-based party draft (Phase 2/3).
// Inert until the client's production-off feature flag exposes it.
const SELECTABLE = [0, 1, 2, 3, 4, 5, 6, 7]; // creature ids with a selection value

const COLORS = ["green", "blue", "yellow", "red"] as const;
const colorV = v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red"));
const MAX_SEATS = 4;
const NAME_MAX = 24;
const MSG_MAX = 280;

const cleanName = (n: string) => n.trim().slice(0, NAME_MAX);

// Game variants (M7, plan WS-6): the zombies option (spec I-15) and fog-of-war-lite (plan ⑦).
const variantsV = v.object({ zombies: v.optional(v.boolean()), fogLite: v.optional(v.boolean()), concurrent: v.optional(v.boolean()) });

// How a finished party's outcome reads in the broadcast feed (keyed by terminal SeatStatus).
const OUTCOME_VERB: Record<string, string> = {
  wiped: "perished in the cave", left: "escaped the cave", quit: "abandoned the expedition",
};

const cname = (id: number) => CREATURES[id]?.name ?? "stranger";
const tname = (id: number) => TREASURES[id]?.name ?? "treasure";
// Special-area names (SPECIAL_* in engine data/areaCards), for enter/cross narration.
const SPECIAL_NAME: Record<number, string> = { 1: "Gateway", 2: "Deep Pool", 3: "Viper Pit", 4: "Tomb", 5: "Great Hall" };
const sname = (id: number) => SPECIAL_NAME[id] ?? "special area";

/**
 * Concise narration of a just-completed action — the significant outcomes other parties should see
 * (defeats, befriendings, pickups, descents, …). Returns fragments without the party name; the
 * caller prepends it. Most lines come straight from the engine events; treasure pickup and
 * level changes are read from the before/after party states (those actions emit no event).
 */
export function actionNarration(action: MpAction, events: GameEvent[], before: PartyState, after: PartyState): string[] {
  const frags: string[] = [];
  const has = (t: GameEvent["type"]) => events.some((e) => e.type === t);
  for (const e of events) {
    switch (e.type) {
      case "strangerKilled": frags.push(`defeated a ${cname(e.creatureId)}`); break;
      case "annihilated": frags.push(`annihilated a ${cname(e.creatureId)}`); break;
      case "strangersJoined": frags.push(e.count === 1 ? "befriended a stranger" : `befriended ${e.count} strangers`); break;
      case "memberDied": frags.push(`lost ${cname(e.creatureId)}`); break;
      case "spectreSlew": frags.push(`lost ${cname(e.creatureId)} to a Spectre`); break;
      case "deathPrevented": frags.push("cheated death"); break;
      case "chestOpened": frags.push("opened a treasure chest"); break;
      case "artifactUsed": frags.push(`used the ${tname(e.artifact)}`); break;
      case "rubyTaken": frags.push("seized the Lost Ruby"); break;
      case "dragonsLulled": frags.push(e.count === 1 ? "charmed a dragon" : `charmed ${e.count} dragons`); break;
      case "vipersLulled": frags.push("charmed the vipers"); break;
      case "secretDoorRevealed": frags.push("found a secret door"); break;
      case "enteredSpecial": frags.push(`entered the ${sname(e.special)}`); break;
      case "crossedSpecial": frags.push(`crossed the ${sname(e.special)}`); break;
      case "trapSprung": frags.push(`fell through a trap to level ${e.level}`); break;
      case "mutinied": frags.push("was struck by mutiny"); break;
    }
  }
  if (action.type === "takeTreasure" && !has("rubyTaken")) {
    const id = before.treasures[action.ti];
    if (id !== undefined) frags.push(`${TREASURES[id]?.kind === "artifact" ? "found" : "claimed"} the ${tname(id)}`);
  }
  if (action.type === "move" && !has("trapSprung") && after.level !== before.level) {
    frags.push(after.level > before.level ? `descended to level ${after.level}` : `ascended to level ${after.level}`);
  }
  if (action.type === "withdraw") frags.push("withdrew from an encounter");
  if (action.type === "retreat") frags.push("retreated from the fight");
  return frags;
}

/** Post an auto-narrated game event attributed to a seat (so it toasts to the OTHER players). */
async function postAction(ctx: MutationCtx, gameId: Id<"games">, seat: number, partyName: string, color: Doc<"players">["color"], text: string, at: number) {
  await ctx.db.insert("messages", { gameId, seat, partyName, color, text, kind: "action", createdAt: at });
}

/** All seats in a game, ordered by seat index. */
async function seatsOf(ctx: QueryCtx, gameId: Id<"games">): Promise<Doc<"players">[]> {
  const rows = await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
  return rows.sort((a, b) => a.seat - b.seat);
}

/** The caller's seat in a game (or null). */
async function mySeat(ctx: MutationCtx, gameId: Id<"games">, userId: Id<"users">): Promise<Doc<"players"> | null> {
  const rows = await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
  return rows.find((p) => p.userId === userId) ?? null;
}

async function postSystem(ctx: MutationCtx, gameId: Id<"games">, text: string, at: number) {
  await ctx.db.insert("messages", { gameId, seat: null, partyName: "", color: null, text, createdAt: at });
}

/** Create a multiplayer game: the host takes seat 0 with a required party name + colour.
 *  `variants` (M7) may be set here and/or toggled in the open lobby via setVariants. */
export const createMultiplayer = mutation({
  args: { partyName: v.string(), color: colorV, variants: v.optional(variantsV) },
  handler: async (ctx, { partyName, color, variants }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const name = cleanName(partyName);
    if (!name) throw new Error("Party name is required");
    const code = await uniqueCode(ctx);
    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      ownerId: userId, hostId: userId, code, mode: "multi", lobby: "open", maxSeats: MAX_SEATS,
      state: null, status: "active", createdAt: now, updatedAt: now,
      ...(variants ? { variants } : {}),
    });
    await ctx.db.insert("players", { gameId, userId, seat: 0, partyName: name, color, ready: false, lastSeen: now });
    await postSystem(ctx, gameId, `${name} created the game`, now);
    return { gameId, code };
  },
});

/** Public lobby view by code — drives the join screen and the lobby for everyone, reactively. */
export const lobby = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const callerId = await getAuthUserId(ctx);
    const c = code.trim().toUpperCase();
    const game = await ctx.db.query("games").withIndex("by_code", (q) => q.eq("code", c)).first();
    if (!game || game.mode !== "multi") return null;
    const seats = await seatsOf(ctx, game._id);
    return {
      gameId: game._id,
      code: game.code,
      lobby: game.lobby ?? "open",
      maxSeats: game.maxSeats ?? MAX_SEATS,
      variants: game.variants ?? null, // M7 game variants — host toggles, everyone sees chips
      takenColors: seats.map((p) => p.color),
      youSeat: callerId ? seats.find((p) => p.userId === callerId)?.seat ?? null : null,
      isHost: callerId === game.hostId,
      seats: seats.map((p) => ({
        seat: p.seat,
        partyName: p.partyName,
        color: p.color,
        ready: p.ready,
        isHost: p.userId === game.hostId,
        isYou: !!callerId && p.userId === callerId,
      })),
    };
  },
});

/**
 * Join a multiplayer lobby by code. Returns a tagged result rather than throwing for expected
 * conditions (full / name or colour taken / started). Idempotent if already seated.
 */
export const joinByCode = mutation({
  args: { code: v.string(), partyName: v.string(), color: colorV },
  handler: async (ctx, { code, partyName, color }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const c = code.trim().toUpperCase();
    const game = await ctx.db.query("games").withIndex("by_code", (q) => q.eq("code", c)).first();
    if (!game || game.mode !== "multi") return { ok: false as const, reason: "not_found" };

    const seats = await seatsOf(ctx, game._id);
    const mine = seats.find((p) => p.userId === userId);
    if (mine) return { ok: true as const, gameId: game._id }; // already seated → rejoin

    if ((game.lobby ?? "open") !== "open") return { ok: false as const, reason: "started" };
    if (seats.length >= (game.maxSeats ?? MAX_SEATS)) return { ok: false as const, reason: "full" };
    const name = cleanName(partyName);
    if (!name) return { ok: false as const, reason: "name_required" };
    if (seats.some((p) => p.partyName.toLowerCase() === name.toLowerCase())) return { ok: false as const, reason: "name_taken" };
    if (seats.some((p) => p.color === color)) return { ok: false as const, reason: "color_taken" };

    const used = new Set(seats.map((p) => p.seat));
    let seat = 0;
    while (used.has(seat)) seat += 1; // lowest free seat (leaves can free a slot)
    const now = Date.now();
    await ctx.db.insert("players", { gameId: game._id, userId, seat, partyName: name, color, ready: false, lastSeen: now });
    await postSystem(ctx, game._id, `${name} joined`, now);
    return { ok: true as const, gameId: game._id };
  },
});

export const setPartyName = mutation({
  args: { gameId: v.id("games"), partyName: v.string() },
  handler: async (ctx, { gameId, partyName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    const name = cleanName(partyName);
    if (!name) return { ok: false as const, reason: "name_required" };
    const seats = await seatsOf(ctx, gameId);
    if (seats.some((p) => p._id !== me._id && p.partyName.toLowerCase() === name.toLowerCase())) {
      return { ok: false as const, reason: "name_taken" };
    }
    await ctx.db.patch(me._id, { partyName: name });
    return { ok: true as const };
  },
});

export const setColor = mutation({
  args: { gameId: v.id("games"), color: colorV },
  handler: async (ctx, { gameId, color }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    const seats = await seatsOf(ctx, gameId);
    if (seats.some((p) => p._id !== me._id && p.color === color)) return { ok: false as const, reason: "color_taken" };
    await ctx.db.patch(me._id, { color });
    return { ok: true as const };
  },
});

/** Host-only, open-lobby-only: choose the game variants (M7). Fixed for good once the game starts
 *  (startGame hands them to buildMpGame; the engine reads them from state.variants thereafter). */
export const setVariants = mutation({
  args: { gameId: v.id("games"), variants: variantsV },
  handler: async (ctx, { gameId, variants }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) return { ok: false as const, reason: "host_only" };
    if ((game.lobby ?? "open") !== "open") return { ok: false as const, reason: "started" };
    await ctx.db.patch(gameId, { variants, updatedAt: Date.now() });
    return { ok: true as const };
  },
});

export const setReady = mutation({
  args: { gameId: v.id("games"), ready: v.boolean() },
  handler: async (ctx, { gameId, ready }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    await ctx.db.patch(me._id, { ready });
  },
});

/** Leave the lobby. If the host leaves, the next seat is promoted; an empty lobby is finished. */
export const leaveSeat = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) return;
    const game = await ctx.db.get(gameId);
    const now = Date.now();
    await ctx.db.delete(me._id);
    await postSystem(ctx, gameId, `${me.partyName} left`, now);
    if (game && game.hostId === userId) {
      const rest = await seatsOf(ctx, gameId);
      if (rest.length === 0) await ctx.db.patch(gameId, { lobby: "finished", updatedAt: now });
      else await ctx.db.patch(gameId, { hostId: rest[0]!.userId, updatedAt: now });
    }
  },
});

/** Host locks the lobby and starts: seats are compacted to 0..n-1, the shared multi-party game state
 *  is built (random play order, party-selection phase), and stored on the game. */
export const startGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host may start");
    if ((game.lobby ?? "open") !== "open") return { ok: false as const, reason: "already_started" };
    const seats = await seatsOf(ctx, gameId);
    if (seats.length < 2) return { ok: false as const, reason: "need_players" };

    const now = Date.now();
    // Compact seats to a contiguous 0..n-1 (leaves can leave gaps) so engine party indices line up.
    for (let i = 0; i < seats.length; i++) {
      if (seats[i]!.seat !== i) await ctx.db.patch(seats[i]!._id, { seat: i });
    }
    const mp = buildMpGame(now, seats.map((p, i) => ({ seat: i, color: p.color, name: p.partyName })), game.variants ?? undefined);
    await ctx.db.patch(gameId, { lobby: "started", state: mp, updatedAt: now });
    await postSystem(ctx, gameId, "The game has started — choose your parties", now);
    return { ok: true as const };
  },
});

/** Draft a party in turn (Phase 3). Turn-gated to the current picker; depletes the shared pack and,
 *  after the last pick, transitions the game to the playing phase. */
export const pickParty = mutation({
  args: { gameId: v.id("games"), picks: v.array(v.number()) },
  handler: async (ctx, { gameId, picks }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    const game = await ctx.db.get(gameId);
    const mp = game?.state as MpGameState | null;
    if (!game || game.mode !== "multi" || !mp) return { ok: false as const, reason: "not_multi" };

    const res = choosePartyFor(mp, me.seat, picks);
    if (!res.ok) return { ok: false as const, reason: res.reason ?? "invalid" };
    const now = Date.now();
    await ctx.db.patch(gameId, { state: res.state, updatedAt: now });
    await postSystem(ctx, gameId, `${me.partyName} chose their party`, now);
    if (res.state.phase === "playing") await postSystem(ctx, gameId, "All parties chosen — into the cave!", now + 1);
    return { ok: true as const, phase: res.state.phase };
  },
});

/**
 * Membership-gated projection of a multi game for the client — never the raw cave (which would leak
 * the shuffled deck order). Drives the draft (Phase 3) and, later, play.
 */
export const gameState = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const callerId = await getAuthUserId(ctx);
    const game = await ctx.db.get(gameId);
    if (!game || game.mode !== "multi") return null;
    const seats = await seatsOf(ctx, gameId);
    const me = callerId ? seats.find((p) => p.userId === callerId) : null;
    if (!me) return null; // not a member

    const mp = game.state as MpGameState | null;
    if (!mp) return { phase: "lobby" as const, youSeat: me.seat };

    const remaining: Record<number, number> = {};
    if (mp.phase === "partySelect") {
      for (const id of SELECTABLE) remaining[id] = mp.cave.smallPack.filter((c) => c === 100 + id).length;
    }
    return {
      phase: mp.phase,
      youSeat: me.seat,
      currentPicker: mp.phase === "partySelect" ? mp.pickOrder[mp.active]! : null,
      currentSeat: mp.phase === "playing" ? mp.order[mp.active]! : null,
      turnCount: mp.turnCount,
      parties: mp.parties.map((p) => ({
        seat: p.seat, name: p.name, color: p.color, status: p.status,
        zombie: p.zombie === true, // M7 zombies option — the scoreboard's "risen" badge
        members: p.party.map((m) => m.creatureId),
        // running/final score per party (the engine computes it from the party's state)
        score: p.party.length ? mpScore(mp, p.seat) : 0, // bounty-split aware (I-19)
        depth: p.level, turns: p.turn, kills: p.kills ?? 0, // live scoreboard stats
      })),
      draft: mp.phase === "partySelect" ? { remaining, budget: PARTY_BUDGET } : null,
    };
  },
});

/**
 * The viewing seat's render view during play: a single-party GameState (shared cave ⊕ your party,
 * decks included for optimistic moves), plus whose turn it is and every party's position/colour for
 * the multi-token map. Membership-gated; null unless the game is in the playing phase.
 */
export const playView = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const callerId = await getAuthUserId(ctx);
    const game = await ctx.db.get(gameId);
    if (!game || game.mode !== "multi") return null;
    const seats = await seatsOf(ctx, gameId);
    const me = callerId ? seats.find((p) => p.userId === callerId) : null;
    if (!me) return null;
    const mp = game.state as MpGameState | null;
    if (!mp || (mp.phase !== "playing" && mp.phase !== "finished")) return null;

    const current = mp.phase === "playing" ? mp.order[mp.active]! : null;
    const yourArea = mp.parties[me.seat]!.partyArea;
    // Your union (active OR the dissolved residue awaiting the ally-allocation handshake, I-6/I-7),
    // projected to names/colours so the HUD chip and allocation modal need no second lookup.
    const yu = (mp.unions ?? []).find((u) => u.members.includes(me.seat)) ?? null;
    return {
      // Fog-of-war-lite (M7, plan ⑦): under the variant the served render state masks every area
      // this seat has never entered (fogFilter) — pawns and cave shape stay, detail goes. The
      // authoritative rules run on the FULL state inside act/mpReduce, so the filter leaks no
      // agency, only information.
      state: mp.variants?.fogLite === true ? fogFilter(mp, me.seat) : partyView(mp, me.seat),
      youSeat: me.seat,
      // Concurrent exploration (M6, plan ①): there is no table turn — every free seat's thread is
      // live. currentSeat null tells the HUD to show "free exploration" instead of a name.
      concurrent: mp.concurrent === true,
      gamePhase: mp.phase,
      currentSeat: mp.concurrent === true ? null : current,
      yourTurn: mp.concurrent === true
        ? mp.phase === "playing" && mp.parties[me.seat]!.status === "exploring"
        : current === me.seat,
      parties: mp.parties.map((p) => ({
        seat: p.seat, name: p.name, color: p.color, status: p.status,
        zombie: p.zombie === true, // M7: the "risen" badge on chips and rosters
        partyArea: p.partyArea, level: p.level,
      })),
      // The no-detail fight hint (plan ⑦ item 4): how many rival commands are fighting right now
      // — the client toasts "steel rings somewhere in the deep" on the 0→N transition.
      distantFights: distantFights(mp, me.seat),
      variants: mp.variants ?? null,
      // Awareness (spec I-1/I-3): who shares your tile, and what interaction is legal here right now.
      hereSeats: occupants(mp, yourArea).filter((s) => s !== me.seat),
      areaMask: areaInteractionMask(mp, yourArea),
      // The active interaction session — projected only to its participants (others see null).
      // Non-participants co-located with a PvP fight get only the no-detail hint via areaMask.
      // A union proposal's participants are the commander + everyone invited or already accepted.
      session: mp.session && (
        ("a" in mp.session && (mp.session.a === me.seat || mp.session.b === me.seat)) ||
        (mp.session.kind === "pvp" && (mp.session.attacker.includes(me.seat) || mp.session.defender.includes(me.seat))) ||
        (mp.session.kind === "unionProposal" &&
          (mp.session.commander === me.seat || mp.session.invited.includes(me.seat) || mp.session.accepted.includes(me.seat)))
      ) ? mp.session : null,
      // Your union (I-6/I-7) — null when independent. `recruits[i].name` indexes the allocation
      // handshake's recruit ids; `alloc` is the pending same-(recruit,to) confirm state.
      yourUnion: yu ? {
        id: yu.id,
        commander: yu.commander,
        commanderName: mp.parties[yu.commander]!.name,
        youAreCommander: yu.commander === me.seat,
        members: yu.members.map((s) => ({ seat: s, name: mp.parties[s]!.name, color: mp.parties[s]!.color })),
        recruits: yu.recruits.map((r) => ({
          name: CREATURES[mp.parties[r.seat]!.party[r.partyIdx]?.creatureId ?? -1]?.name ?? "ally",
        })),
        dissolved: !!yu.dissolved,
        alloc: yu.alloc ?? null,
      } : null,
      // Rival rear-guards standing on YOUR tile (spec I-8/I-4): their loot here is guarded.
      detachmentsHere: (mp.detachments ?? [])
        .filter((d) => d.area === yourArea && d.ownerSeat !== me.seat)
        .map((d) => ({
          seat: d.ownerSeat,
          name: mp.parties[d.ownerSeat]!.name,
          color: mp.parties[d.ownerSeat]!.color,
          count: d.members.length,
        })),
      // Per-engagement strength preview for the fight surface (participants only).
      pvp: mp.session?.kind === "pvp" && (mp.session.attacker.includes(me.seat) || mp.session.defender.includes(me.seat))
        ? pvpView(mp.session, mp)
        : null,
      // Secret-door knowledge (I-18): coords of secret-stair ends this seat may use / may share.
      youKnowDoors: mp.parties[me.seat]!.knownDoors ?? [],
    };
  },
});

/**
 * Read-only render view of ANY seat's party (membership-gated) — lets a player follow along with
 * another party's screen from the scoreboard. Beginner ruleset: the whole cave is visible to all,
 * so this leaks nothing the scoreboard doesn't already show.
 */
export const spectateView = query({
  args: { gameId: v.id("games"), seat: v.number() },
  handler: async (ctx, { gameId, seat }) => {
    const userId = await getAuthUserId(ctx);
    const game = await ctx.db.get(gameId);
    if (!game || game.mode !== "multi") return null;
    const seats = await seatsOf(ctx, gameId);
    if (!userId || !seats.some((p) => p.userId === userId)) return null; // members only
    const mp = game.state as MpGameState | null;
    if (!mp || (mp.phase !== "playing" && mp.phase !== "finished")) return null;
    if (seat < 0 || seat >= mp.parties.length) return null;
    return {
      // Under fog-of-war-lite you follow THAT seat's screen — served with that seat's own fog,
      // so spectating never reveals more of the cave than the followed party has seen.
      state: mp.variants?.fogLite === true ? fogFilter(mp, seat) : partyView(mp, seat),
      seat,
      name: mp.parties[seat]!.name,
      color: mp.parties[seat]!.color,
      parties: mp.parties.map((p) => ({
        seat: p.seat, name: p.name, color: p.color, status: p.status,
        zombie: p.zombie === true,
        partyArea: p.partyArea, level: p.level,
      })),
    };
  },
});

/**
 * Announce the end of a PvP battle to the whole table (spec I-10: "there needs to be feedback to
 * both sides of the outcome"). One system line per battle end, whatever ended it — a wipe, a
 * retreat, a truce, or a timer-resolved round (action null on the expiry path). The participants
 * additionally get an outcome notice client-side; this line is the shared record in chat/toasts.
 */
async function narratePvpEnd(
  ctx: MutationCtx, gameId: Id<"games">,
  before: MpGameState, after: MpGameState, action: MpAction | null, now: number,
): Promise<void> {
  const sess = before.session;
  if (sess?.kind !== "pvp" || after.session?.kind === "pvp") return; // no battle ended here
  const names = (seats: number[]) => seats.map((x) => before.parties[x]!.name).join(" + ");
  const att = sess.attacker, def = sess.defender;
  const wiped = (seats: number[]) => seats.every((x) => after.parties[x]!.status !== "exploring" || after.parties[x]!.zombie === true);
  if (wiped(def)) await postSystem(ctx, gameId, `⚔ ${names(att)} defeated ${names(def)} in battle — the spoils lie where they fell`, now);
  else if (wiped(att)) await postSystem(ctx, gameId, `⚔ ${names(def)} defeated ${names(att)} in battle — the spoils lie where they fell`, now);
  else if (action?.type === "pvpRetreat") await postSystem(ctx, gameId, `⚔ The battle broke off — one side fled the field`, now);
  else if (action?.type === "pvpAcceptStop") await postSystem(ctx, gameId, `⚔ ${names(att)} and ${names(def)} ended their battle by agreement`, now);
  else await postSystem(ctx, gameId, `⚔ The battle between ${names(att)} and ${names(def)} is over`, now);
}

/**
 * Record every party that transitioned OUT of "exploring" between two states to the multiplayer
 * high-score table (§8.4), with the bounty-split-aware score (I-19), and broadcast the outcome.
 * Called from `act` AND from the window auto-resolve paths — a party wiped by an expired PvP
 * deployment (or annihilated when the Sorcerer falls to a timer-resolved round) must be recorded
 * exactly like one wiped by a player's action.
 */
async function recordTerminals(
  ctx: MutationCtx, gameId: Id<"games">, game: Doc<"games">,
  before: MpGameState, after: MpGameState, now: number,
): Promise<void> {
  const rows = await seatsOf(ctx, gameId);
  for (const p of after.parties) {
    const was = before.parties[p.seat]?.status;
    if (was !== "exploring" || p.status === "exploring") continue;
    const row = rows.find((r) => r.seat === p.seat);
    const view = partyView(after, p.seat);
    const score = mpScore(after, p.seat); // bounty-split aware; a wipe scores 0
    await ctx.db.insert("highScores", {
      gameId, ownerId: row?.userId, name: p.name,
      score, outcome: view.gs, party: view.party, state: view, createdAt: now,
      mode: "multi", gameCode: game.code, partyName: p.name,
    });
    const verb = OUTCOME_VERB[p.status] ?? "finished";
    if (row) await postAction(ctx, gameId, p.seat, p.name, row.color, `${verb} (score ${score})`, now);
  }
}

/**
 * Reaction-window plumbing (spec §1.3). Whenever a session (re)arms a window we schedule the
 * auto-default at its deadline (cancelling any prior job); a lazy check at the top of every mutation
 * is the belt-and-braces backstop if a scheduled job is lost. Presence-aware: an awaited seat whose
 * lastSeen is fresh gets the window extended rather than defaulted (they're here, just thinking).
 */
async function settleOverdueSession(
  ctx: MutationCtx, gameId: Id<"games">, game: Doc<"games">, mp: MpGameState, now: number,
): Promise<MpGameState> {
  const w = mp.session?.window;
  if (!w || now < w.deadline) return mp;
  const seats = await seatsOf(ctx, gameId);
  const awaited = seats.find((p) => p.seat === w.seat);
  const extendMs =
    mp.session?.kind === "pvp" ? PVP_WINDOW_MS :
    mp.session?.kind === "unionProposal" ? UNION_WINDOW_MS : TRADE_WINDOW_MS;
  if (awaited && now - awaited.lastSeen < PRESENCE_FRESH_MS) {
    // Present but pondering — extend rather than default (spec §1.3 presence pause).
    const extended: MpGameState = {
      ...mp, session: { ...mp.session!, window: { ...w, deadline: now + extendMs } },
    };
    await ctx.db.patch(gameId, { state: extended, updatedAt: now });
    await armSessionJob(ctx, gameId, extended, now);
    return extended;
  }
  // Auto-default per session kind (§1.3): a trade offer expires (declined); a PvP layout auto-deploys
  // strongest-fights-strongest and the round resolves — a stalled side never blocks the fight.
  if (mp.session?.kind === "pvp") {
    const { state: expired, fired } = expirePvp(mp, now, PVP_WINDOW_MS);
    if (fired) {
      // The auto-resolved round bypassed mpReduce, so run the zombies sweep here too (M7): a wiped
      // living command rises, a zombie victor's floor reclaim is stripped back to the tile.
      const { state: swept, risen } = zombiePostSweep(expired);
      // The auto-resolve bypassed mpReduce's wrapper: repair a parked cursor / all-terminal state.
      const after = repairTurnFlow(swept);
      await ctx.db.patch(gameId, { state: after, updatedAt: now });
      await postSystem(ctx, gameId, "The round was fought on — the delay forfeited the deployment", now);
      for (const s of risen) await postSystem(ctx, gameId, `${after.parties[s]!.name} rise from the dead…`, now);
      // A timer-resolved round can wipe a command (or annihilate zombies): record those terminals
      // here — the act-path recorder only sees transitions caused by the player's own action.
      await narratePvpEnd(ctx, gameId, mp, after, null, now);
      await recordTerminals(ctx, gameId, game, mp, after, now);
      await armSessionJob(ctx, gameId, after, now);
      return after;
    }
    return expired;
  }
  // A union proposal's overdue invitee auto-refuses (spec I-6, §1.3); the window may walk on to
  // the next invitee, so re-arm the job for any window that remains.
  if (mp.session?.kind === "unionProposal") {
    const { state: after, fired } = expireUnionProposal(mp, now, UNION_WINDOW_MS);
    if (fired) {
      await ctx.db.patch(gameId, { state: after, updatedAt: now });
      await postSystem(ctx, gameId, "A union invitation lapsed — silence is refusal", now);
      await armSessionJob(ctx, gameId, after, now);
    }
    return after;
  }
  const { state: after, fired } = expireTrade(mp, now);
  if (fired) {
    await ctx.db.patch(gameId, { state: after, updatedAt: now });
    await postSystem(ctx, gameId, "The trade offer expired", now);
  }
  return after;
}

/** (Re)schedule the auto-default job for the active session's window; cancel any stale job first. */
async function armSessionJob(ctx: MutationCtx, gameId: Id<"games">, mp: MpGameState, now: number): Promise<void> {
  const game = await ctx.db.get(gameId);
  if (game?.sessionJobId) {
    try { await ctx.scheduler.cancel(game.sessionJobId); } catch { /* already ran/cancelled */ }
  }
  const w = mp.session?.window;
  const jobId = w
    ? await ctx.scheduler.runAfter(Math.max(0, w.deadline - now), internal.multiplayer.resolveOverdue, { gameId })
    : undefined;
  await ctx.db.patch(gameId, { sessionJobId: jobId });
}

/** Scheduled auto-default: fires at a window's deadline (the lazy check covers lost jobs). */
export const resolveOverdue = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    const mp = game?.state as MpGameState | null;
    if (!game || !mp) return;
    await settleOverdueSession(ctx, gameId, game, mp, Date.now());
  },
});

/** Apply one action in a multiplayer game, turn-gated by the engine. Persists the new shared state. */
export const act = mutation({
  args: { gameId: v.id("games"), action: mpActionValidator },
  handler: async (ctx, { gameId, action }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    const game = await ctx.db.get(gameId);
    let mp = game?.state as MpGameState | null;
    if (!game || game.mode !== "multi" || !mp) return { events: [{ type: "blocked" }] };

    const now = Date.now();
    // Lazy backstop: settle any overdue reaction window before the action lands (spec §1.3).
    mp = await settleOverdueSession(ctx, gameId, game, mp, now);

    const { state, events } = mpReduce(mp, me.seat, action as MpAction, now, TRADE_WINDOW_MS);
    const blocked = events.length === 1 && events[0]!.type === "blocked";
    if (blocked) return { events };

    await ctx.db.patch(gameId, { state, updatedAt: now });
    // Re-arm (or clear) the window job whenever the session state may have changed.
    if ((mp.session ?? null) !== (state.session ?? null)) await armSessionJob(ctx, gameId, state, now);
    await narratePvpEnd(ctx, gameId, mp, state, action as MpAction, now);

    // Narrate the completed action to the other parties (toasted on their screens).
    const frags = actionNarration(action as MpAction, events, mp.parties[me.seat]!, state.parties[me.seat]!);
    if (frags.length) await postAction(ctx, gameId, me.seat, me.partyName, me.color, frags.join(", "), now);

    // Union / rear-guard system lines (I-6/I-7/I-8) — terse, like the lobby's system feed.
    const kind = (action as MpAction).type;
    if (kind === "respondUnion") {
      // The final acceptance is what actually forms the union — announce it once, then.
      const formed = (state.unions ?? []).find((u) => !u.dissolved && !(mp.unions ?? []).some((b) => b.id === u.id));
      if (formed) {
        const names = formed.members.map((s) => state.parties[s]!.name).join(", ");
        await postSystem(ctx, gameId, `${names} formed a union under ${state.parties[formed.commander]!.name}`, now);
      }
    } else if (kind === "leaveUnion" || kind === "refuseMove") {
      await postSystem(ctx, gameId, `${me.partyName} left the union`, now);
    } else if (kind === "dissolveUnion") {
      await postSystem(ctx, gameId, `${me.partyName} dissolved the union`, now);
    } else if (kind === "divideParty") {
      await postSystem(ctx, gameId, `${me.partyName} posted a rear-guard`, now);
    }

    // Zombies option (M7): announce the risen — a wipe under the variant is NOT terminal, the
    // seat walks again (auto-rise, no prompt; the flag flip is the tell).
    for (const p of state.parties) {
      if (p.zombie === true && mp.parties[p.seat]!.zombie !== true) {
        await postSystem(ctx, gameId, `${p.name} rise from the dead…`, now);
      }
    }

    // Record every party that just reached a terminal state (§8.4) — see recordTerminals.
    await recordTerminals(ctx, gameId, game, mp, state, now);
    return { events };
  },
});

/** Post a chat message (membership-gated). */
export const sendMessage = mutation({
  args: { gameId: v.id("games"), text: v.string() },
  handler: async (ctx, { gameId, text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    const body = text.trim().slice(0, MSG_MAX);
    if (!body) return;
    await ctx.db.insert("messages", {
      gameId, seat: me.seat, partyName: me.partyName, color: me.color, text: body, createdAt: Date.now(),
    });
  },
});

/** Chat + system feed, oldest-first (membership-gated). */
export const messages = query({
  args: { gameId: v.id("games"), limit: v.optional(v.number()) },
  handler: async (ctx, { gameId, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
    if (!rows.some((p) => p.userId === userId)) return []; // not a member
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .order("desc")
      .take(limit ?? 100);
    return recent.reverse().map((m) => ({
      _id: m._id, seat: m.seat, partyName: m.partyName, color: m.color, text: m.text, createdAt: m.createdAt, kind: m.kind,
    }));
  },
});

export { COLORS };
