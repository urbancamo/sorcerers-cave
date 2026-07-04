import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import type { PartyState, MpGameState, GameState } from "@sorcerers-cave/engine";
type GameStateLike = GameState;
import { api } from "./_generated/api";
import { actionNarration } from "./multiplayer";
import schema from "./schema";

const P = (over: Partial<PartyState> = {}) => ({ level: 1, treasures: [], ...over } as unknown as PartyState);

test("actionNarration summarises the significant outcomes of a completed action", () => {
  expect(actionNarration({ type: "attack" }, [{ type: "strangerKilled", creatureId: 10 }], P(), P())).toEqual(["defeated a Dragon"]);
  expect(actionNarration({ type: "test" }, [{ type: "strangersJoined", count: 2 }], P(), P())).toEqual(["befriended 2 strangers"]);
  // takeTreasure emits no event — the pickup is read from the before-state's chamber treasures.
  expect(actionNarration({ type: "takeTreasure", ti: 0, mi: 0 }, [], P({ treasures: [1] }), P())).toEqual(["claimed the Gold"]);
  expect(actionNarration({ type: "takeTreasure", ti: 0, mi: 0 }, [], P({ treasures: [3] }), P())).toEqual(["found the Magic Sword"]);
  // level changes come from the before/after party states.
  expect(actionNarration({ type: "move", dir: 6 }, [], P({ level: 1 }), P({ level: 2 }))).toEqual(["descended to level 2"]);
  expect(actionNarration({ type: "move", dir: 5 }, [], P({ level: 2 }), P({ level: 1 }))).toEqual(["ascended to level 1"]);
  expect(actionNarration({ type: "withdraw" }, [], P(), P())).toEqual(["withdrew from an encounter"]);
  expect(actionNarration({ type: "move", dir: 1 }, [{ type: "enteredSpecial", special: 2 }], P(), P())).toEqual(["entered the Deep Pool"]);
  expect(actionNarration({ type: "move", dir: 1 }, [{ type: "crossedSpecial", special: 3 }], P(), P())).toEqual(["crossed the Viper Pit"]);
  // multiple outcomes in one round are returned as separate fragments (the caller joins them).
  expect(actionNarration({ type: "fightOn" }, [
    { type: "strangerKilled", creatureId: 10 },
    { type: "memberDied", creatureId: 0 },
  ], P(), P())).toEqual(["defeated a Dragon", "lost Hero"]);
  // a quiet move (no level change, no events) says nothing.
  expect(actionNarration({ type: "move", dir: 1 }, [], P(), P())).toEqual([]);
});

const modules = import.meta.glob("./**/*.*s");

async function asUser(t: ReturnType<typeof convexTest>) {
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  return t.withIdentity({ subject: `${userId}|session` });
}

test("createMultiplayer seats the host with a code, party name and colour", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { gameId, code } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Bold Few", color: "green" });
  expect(code).toMatch(/^[A-Z]{4}$/);
  const lob = await host.query(api.multiplayer.lobby, { code });
  expect(lob?.gameId).toBe(gameId);
  expect(lob?.lobby).toBe("open");
  expect(lob?.isHost).toBe(true);
  expect(lob?.youSeat).toBe(0);
  expect(lob?.seats).toEqual([
    expect.objectContaining({ seat: 0, partyName: "Bold Few", color: "green", ready: false, isHost: true, isYou: true }),
  ]);
  expect(lob?.takenColors).toEqual(["green"]);
});

test("createMultiplayer requires a party name", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  await expect(host.mutation(api.multiplayer.createMultiplayer, { partyName: "   ", color: "green" })).rejects.toThrow();
});

test("a second player joins by code into the next seat", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  const p2 = await asUser(t);
  const res = await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  expect(res.ok).toBe(true);
  const lob = await p2.query(api.multiplayer.lobby, { code });
  expect(lob?.seats.map((s) => s.partyName)).toEqual(["Alpha", "Beta"]);
  expect(lob?.youSeat).toBe(1);
  expect(lob?.isHost).toBe(false);
});

test("join rejects taken colour, taken name, and unknown code", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  const p2 = await asUser(t);
  expect((await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "green" })).reason).toBe("color_taken");
  expect((await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "alpha", color: "blue" })).reason).toBe("name_taken");
  expect((await p2.mutation(api.multiplayer.joinByCode, { code: "ZZZZ", partyName: "Beta", color: "blue" })).reason).toBe("not_found");
});

test("join is idempotent for an already-seated player", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  const again = await host.mutation(api.multiplayer.joinByCode, { code, partyName: "Whatever", color: "red" });
  expect(again).toEqual({ ok: true, gameId });
  const lob = await host.query(api.multiplayer.lobby, { code });
  expect(lob?.seats.length).toBe(1); // no duplicate seat
});

test("the lobby fills to four and then rejects as full", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "A", color: "green" });
  for (const [name, color] of [["B", "blue"], ["C", "yellow"], ["D", "red"]] as const) {
    const p = await asUser(t);
    expect((await p.mutation(api.multiplayer.joinByCode, { code, partyName: name, color })).ok).toBe(true);
  }
  const p5 = await asUser(t);
  // colours are exhausted too, but the seat-count guard reports full
  expect((await p5.mutation(api.multiplayer.joinByCode, { code, partyName: "E", color: "green" })).reason).toBe("full");
});

test("colour and ready can be changed; colour clash is rejected", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  expect((await p2.mutation(api.multiplayer.setColor, { gameId, color: "green" })).reason).toBe("color_taken");
  expect((await p2.mutation(api.multiplayer.setColor, { gameId, color: "red" })).ok).toBe(true);
  await p2.mutation(api.multiplayer.setReady, { gameId, ready: true });
  const lob = await p2.query(api.multiplayer.lobby, { code });
  expect(lob?.seats.find((s) => s.partyName === "Beta")).toMatchObject({ color: "red", ready: true });
});

test("startGame is host-only, needs two players, and locks the lobby", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  expect((await host.mutation(api.multiplayer.startGame, { gameId })).reason).toBe("need_players"); // only the host
  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  await expect(p2.mutation(api.multiplayer.startGame, { gameId })).rejects.toThrow(/host/); // non-host blocked
  expect((await host.mutation(api.multiplayer.startGame, { gameId })).ok).toBe(true);
  const lob = await host.query(api.multiplayer.lobby, { code });
  expect(lob?.lobby).toBe("started");
  // joins are refused once started
  const p3 = await asUser(t);
  expect((await p3.mutation(api.multiplayer.joinByCode, { code, partyName: "Gamma", color: "yellow" })).reason).toBe("started");
});

test("the host leaving promotes the next seat", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  await host.mutation(api.multiplayer.leaveSeat, { gameId });
  const lob = await p2.query(api.multiplayer.lobby, { code });
  expect(lob?.seats.map((s) => s.partyName)).toEqual(["Beta"]);
  expect(lob?.isHost).toBe(true); // Beta promoted to host
});

test("startGame builds the shared game state and opens the party draft", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  await host.mutation(api.multiplayer.startGame, { gameId });

  const gs = await host.query(api.multiplayer.gameState, { gameId });
  expect(gs?.phase).toBe("partySelect");
  expect(gs?.draft?.budget).toBe(6);
  expect(gs?.draft?.remaining[5]).toBe(6); // six Men in the fresh pack
  expect(typeof gs?.currentPicker).toBe("number");
  expect(gs?.parties.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
  // a non-member gets nothing
  const outsider = await asUser(t);
  expect(await outsider.query(api.multiplayer.gameState, { gameId })).toBeNull();
});

test("the party draft is turn-based and transitions to play after the last pick", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  await host.mutation(api.multiplayer.startGame, { gameId });

  const userBySeat = [host, p2]; // seats compacted to 0 (host), 1 (p2)
  const firstSeat = (await host.query(api.multiplayer.gameState, { gameId }))!.currentPicker!;
  const secondSeat = firstSeat === 0 ? 1 : 0;

  // the seat whose turn it isn't can't pick
  expect((await userBySeat[secondSeat]!.mutation(api.multiplayer.pickParty, { gameId, picks: [5] })).reason).toBe("not_your_pick");
  // the current picker drafts, then the other — last pick begins play
  expect((await userBySeat[firstSeat]!.mutation(api.multiplayer.pickParty, { gameId, picks: [5] })).ok).toBe(true);
  const mid = await host.query(api.multiplayer.gameState, { gameId });
  expect(mid?.phase).toBe("partySelect");
  expect(mid?.draft?.remaining[5]).toBe(5); // one Man taken from the shared pack
  expect((await userBySeat[secondSeat]!.mutation(api.multiplayer.pickParty, { gameId, picks: [0] })).phase).toBe("playing");

  const playing = await host.query(api.multiplayer.gameState, { gameId });
  expect(playing?.phase).toBe("playing");
  expect(playing?.parties.every((p) => p.members.length > 0)).toBe(true);
  expect(typeof playing?.currentSeat).toBe("number");
});

async function reachPlaying(t: ReturnType<typeof convexTest>) {
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  await host.mutation(api.multiplayer.startGame, { gameId });
  const userBySeat = [host, p2];
  for (let i = 0; i < 2; i++) {
    const picker = (await host.query(api.multiplayer.gameState, { gameId }))!.currentPicker!;
    await userBySeat[picker]!.mutation(api.multiplayer.pickParty, { gameId, picks: [5] }); // each drafts a Man
  }
  return { gameId, userBySeat };
}

test("gameState projection exposes live per-party stats (depth, turns, kills)", async () => {
  const t = convexTest(schema, modules);
  const { gameId, userBySeat } = await reachPlaying(t);
  const gs = (await userBySeat[0]!.query(api.multiplayer.gameState, { gameId }))!;
  for (const p of gs.parties) {
    expect(typeof p.depth).toBe("number");
    expect(typeof p.turns).toBe("number");
    expect(typeof p.kills).toBe("number");
  }
});

test("playView gives the seat its own render view + whose turn; act is turn-gated", async () => {
  const t = convexTest(schema, modules);
  const { gameId, userBySeat } = await reachPlaying(t);

  const pv = (await userBySeat[0]!.query(api.multiplayer.playView, { gameId }))!;
  expect(pv.state.party.map((m: { creatureId: number }) => m.creatureId)).toEqual([5]); // seat 0's own party
  expect(pv.state.areas.length).toBeGreaterThan(0); // the shared cave
  expect(pv.parties).toHaveLength(2);
  const current = pv.currentSeat;
  const other = current === 0 ? 1 : 0;
  expect(((await userBySeat[current]!.query(api.multiplayer.playView, { gameId }))!).yourTurn).toBe(true);
  expect(((await userBySeat[other]!.query(api.multiplayer.playView, { gameId }))!).yourTurn).toBe(false);

  // the seat whose turn it isn't is blocked
  expect((await userBySeat[other]!.mutation(api.multiplayer.act, { gameId, action: { type: "endTurn" } })).events).toEqual([{ type: "blocked" }]);
  // the active seat passes → turn moves on
  await userBySeat[current]!.mutation(api.multiplayer.act, { gameId, action: { type: "endTurn" } });
  expect((await userBySeat[0]!.query(api.multiplayer.playView, { gameId }))!.currentSeat).toBe(other);
});

test("act accepts a takeTreasure action (its `ti` field must pass the validator)", async () => {
  const t = convexTest(schema, modules);
  const { gameId, userBySeat } = await reachPlaying(t);
  const current = (await userBySeat[0]!.query(api.multiplayer.playView, { gameId }))!.currentSeat;
  // No treasure underfoot yet, so this resolves to a blocked no-op — the point is it must NOT
  // throw an argument-validation error for the `ti` field (regression: pickup was unresponsive).
  const res = await userBySeat[current]!.mutation(api.multiplayer.act, { gameId, action: { type: "takeTreasure", ti: 0, mi: 0 } });
  expect(res.events).toEqual([{ type: "blocked" }]);
});

test("a finished party is recorded to the multiplayer high-score table, kept apart from solo", async () => {
  const t = convexTest(schema, modules);
  const { gameId, userBySeat } = await reachPlaying(t);

  // The active seat abandons its expedition → that party reaches a terminal state.
  const current = (await userBySeat[0]!.query(api.multiplayer.playView, { gameId }))!.currentSeat;
  await userBySeat[current]!.mutation(api.multiplayer.act, { gameId, action: { type: "quit" } });

  // Its result is written to the shared high-score table, tagged multi and grouped by game code.
  const rows = await t.run((ctx) => ctx.db.query("highScores").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ mode: "multi", name: current === 0 ? "Alpha" : "Beta" });
  expect(rows[0]!.gameCode).toMatch(/^[A-Z]{4}$/);
  expect(typeof rows[0]!.score).toBe("number");

  // The per-party score is also surfaced in the finished-game projection.
  const finishedParty = (await userBySeat[0]!.query(api.multiplayer.gameState, { gameId }))!
    .parties.find((p) => p.seat === current);
  expect(finishedParty?.status).toBe("quit");
  expect(typeof finishedParty?.score).toBe("number");

  // The solo leaderboard ignores multiplayer entries.
  expect(await userBySeat[0]!.query(api.highScores.list, {})).toEqual([]);

  // The outcome is broadcast to the other player still in the cave (as a seat-attributed action
  // line, so it toasts on their screen but not the quitter's).
  const other = current === 0 ? 1 : 0;
  const feed = await userBySeat[other]!.query(api.multiplayer.messages, { gameId });
  const quitterName = current === 0 ? "Alpha" : "Beta";
  expect(feed.some((m) => m.kind === "action" && m.seat === current && m.partyName === quitterName && m.text.includes("abandoned the expedition"))).toBe(true);
});

test("playView still returns a state once the whole game is finished", async () => {
  const t = convexTest(schema, modules);
  const { gameId, userBySeat } = await reachPlaying(t);
  // Both seats quit → every seat terminal → phase flips to "finished".
  for (let i = 0; i < 2; i++) {
    const cur = (await userBySeat[0]!.query(api.multiplayer.playView, { gameId }))?.currentSeat;
    if (cur === null || cur === undefined) break;
    await userBySeat[cur]!.mutation(api.multiplayer.act, { gameId, action: { type: "quit" } });
  }
  const gs = await userBySeat[0]!.query(api.multiplayer.gameState, { gameId });
  expect(gs?.phase).toBe("finished");
  const pv = await userBySeat[0]!.query(api.multiplayer.playView, { gameId });
  expect(pv).not.toBeNull();
  expect(pv!.yourTurn).toBe(false);
});

test("spectateView returns any seat's composed view to a member, and nothing to outsiders", async () => {
  const t = convexTest(schema, modules);
  const { gameId, userBySeat } = await reachPlaying(t);
  const sv = await userBySeat[0]!.query(api.multiplayer.spectateView, { gameId, seat: 1 });
  expect(sv?.seat).toBe(1);
  expect(sv?.state.party.map((m: { creatureId: number }) => m.creatureId)).toEqual([5]); // seat 1's own party
  const outsider = await asUser(t);
  expect(await outsider.query(api.multiplayer.spectateView, { gameId, seat: 0 })).toBeNull();
});

test("chat is membership-gated and includes system lines", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  await p2.mutation(api.multiplayer.sendMessage, { gameId, text: "  hello cave  " });

  const feed = await host.query(api.multiplayer.messages, { gameId });
  expect(feed.map((m) => m.text)).toEqual(["Alpha created the game", "Beta joined", "hello cave"]);
  expect(feed[2]).toMatchObject({ partyName: "Beta", color: "blue", seat: 1 });
  expect(feed[0]!.seat).toBeNull(); // system line

  // a non-member sees nothing and cannot post
  const outsider = await asUser(t);
  expect(await outsider.query(api.multiplayer.messages, { gameId })).toEqual([]);
  await expect(outsider.mutation(api.multiplayer.sendMessage, { gameId, text: "intruder" })).rejects.toThrow();
});

// ---- M3: trade sessions over Convex (spec I-5, §1.3 windows) ----------------------------------

/** Seat two players into a PLAYING game with hand-set parties co-located on the Gateway. */
async function playingPair(t: ReturnType<typeof convexTest>) {
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, { partyName: "Alpha", color: "green" });
  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  await host.mutation(api.multiplayer.startGame, { gameId });
  // Draft in pick order (whoever is current picks first).
  const gs1 = await host.query(api.multiplayer.gameState, { gameId });
  const firstPicker = gs1!.currentPicker!;
  const seatOf = async (u: typeof host) => (await u.query(api.multiplayer.gameState, { gameId }))!.youSeat;
  const bySeat: Record<number, typeof host> = { [await seatOf(host)]: host, [await seatOf(p2)]: p2 };
  await bySeat[firstPicker]!.mutation(api.multiplayer.pickParty, { gameId, picks: [5] }); // a Man
  const gs2 = await host.query(api.multiplayer.gameState, { gameId });
  await bySeat[gs2!.currentPicker!]!.mutation(api.multiplayer.pickParty, { gameId, picks: [6] }); // a Woman
  // Hand both parties a tradable item, directly in the stored state.
  await t.run(async (ctx) => {
    const game = await ctx.db.get(gameId);
    const mp = game!.state as MpGameState;
    mp.parties[0]!.party[0]!.treasure.push(1); // seat 0: Gold
    mp.parties[1]!.party[0]!.treasure.push(7); // seat 1: Talisman
    await ctx.db.patch(gameId, { state: mp });
  });
  return { t, host, p2, gameId, bySeat };
}

test("a full trade: propose → baskets → both confirm → atomic swap (I-5)", async () => {
  const t = convexTest(schema, modules);
  const { host, p2, gameId, bySeat } = await playingPair(t);
  const seat0 = bySeat[0]!, seat1 = bySeat[1]!;

  await seat0.mutation(api.multiplayer.act, { gameId, action: { type: "proposeTrade", to: 1 } });
  let v0 = await seat0.query(api.multiplayer.playView, { gameId });
  expect(v0?.session?.kind).toBe("trade");
  expect(v0?.session?.window?.seat).toBe(1); // waiting on the other side

  await seat0.mutation(api.multiplayer.act, { gameId, action: { type: "updateBasket", treasure: [1], members: [] } });
  await seat1.mutation(api.multiplayer.act, { gameId, action: { type: "updateBasket", treasure: [7], members: [] } });
  await seat0.mutation(api.multiplayer.act, { gameId, action: { type: "confirmTrade" } });
  await seat1.mutation(api.multiplayer.act, { gameId, action: { type: "confirmTrade" } });

  v0 = await seat0.query(api.multiplayer.playView, { gameId });
  const v1 = await seat1.query(api.multiplayer.playView, { gameId });
  expect(v0?.session).toBeNull(); // committed — session closed
  expect((v0?.state as GameStateLike).party[0]!.treasure).toContain(7); // Gold ↔ Talisman swapped
  expect((v1?.state as GameStateLike).party[0]!.treasure).toContain(1);

  // A non-participant (none here) / the outsider never sees a session either way.
  const outsider = await asUser(t);
  expect(await outsider.query(api.multiplayer.playView, { gameId })).toBeNull();
});

test("an overdue trade window expires via the lazy backstop on the next mutation (§1.3)", async () => {
  const t = convexTest(schema, modules);
  const { gameId, bySeat } = await playingPair(t);
  const seat0 = bySeat[0]!, seat1 = bySeat[1]!;
  await seat0.mutation(api.multiplayer.act, { gameId, action: { type: "proposeTrade", to: 1 } });

  // Force the deadline into the past AND the awaited seat's presence stale (else it would extend).
  await t.run(async (ctx) => {
    const game = (await ctx.db.query("games").collect()).find((g) => g._id === gameId)!;
    const mp = game.state as MpGameState;
    (mp.session as { window: { deadline: number } }).window.deadline = Date.now() - 120_000;
    await ctx.db.patch(gameId, { state: mp });
    for (const p of await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect()) {
      await ctx.db.patch(p._id, { lastSeen: Date.now() - 600_000 });
    }
  });

  // Any later action settles the overdue window first: the offer has expired (declined).
  await seat1.mutation(api.multiplayer.act, { gameId, action: { type: "endTurn" } });
  const v = await seat0.query(api.multiplayer.playView, { gameId });
  expect(v?.session).toBeNull();
});

// ---- M5: unions over Convex (spec I-6/I-7, §1.3 windows) ---------------------------------------

test("a union proposal is projected to the invitee with the reaction window (I-6)", async () => {
  const t = convexTest(schema, modules);
  const { gameId, bySeat } = await playingPair(t);
  const seat0 = bySeat[0]!, seat1 = bySeat[1]!;

  // Seat 0 proposes a union under its own command, inviting seat 1 (both start on the Gateway).
  await seat0.mutation(api.multiplayer.act, { gameId, action: { type: "proposeUnion", commander: 0, invited: [1] } });

  const v1 = (await seat1.query(api.multiplayer.playView, { gameId }))!;
  expect(v1.session?.kind).toBe("unionProposal");
  expect(v1.session?.window?.seat).toBe(1);       // the answer is awaited from the invitee
  expect(v1.yourUnion).toBeNull();                // nothing formed yet
  const v0 = (await seat0.query(api.multiplayer.playView, { gameId }))!;
  expect(v0.session?.kind).toBe("unionProposal"); // the proposer is a participant too
});

test("respondUnion accept forms the union for both seats; leaveUnion returns them to null (I-6/I-7)", async () => {
  const t = convexTest(schema, modules);
  const { gameId, bySeat } = await playingPair(t);
  const seat0 = bySeat[0]!, seat1 = bySeat[1]!;

  await seat0.mutation(api.multiplayer.act, { gameId, action: { type: "proposeUnion", commander: 0, invited: [1] } });
  await seat1.mutation(api.multiplayer.act, { gameId, action: { type: "respondUnion", accept: true } });

  const u0 = (await seat0.query(api.multiplayer.playView, { gameId }))!.yourUnion;
  const u1 = (await seat1.query(api.multiplayer.playView, { gameId }))!.yourUnion;
  expect(u0).toMatchObject({ commander: 0, commanderName: "Alpha", youAreCommander: true, dissolved: false });
  expect(u1).toMatchObject({ commander: 0, commanderName: "Alpha", youAreCommander: false });
  expect(u1!.members.map((m: { seat: number }) => m.seat)).toEqual([0, 1]);
  expect((await seat0.query(api.multiplayer.playView, { gameId }))!.session).toBeNull(); // handshake closed

  // Formation is narrated to the table as a system line.
  const feed = await seat0.query(api.multiplayer.messages, { gameId });
  expect(feed.some((m) => m.seat === null && /formed a union under Alpha/.test(m.text))).toBe(true);

  // The subordinate leaves — a two-member union dissolves entirely; both are independent again.
  await seat1.mutation(api.multiplayer.act, { gameId, action: { type: "leaveUnion" } });
  expect((await seat0.query(api.multiplayer.playView, { gameId }))!.yourUnion).toBeNull();
  expect((await seat1.query(api.multiplayer.playView, { gameId }))!.yourUnion).toBeNull();
  const after = await seat0.query(api.multiplayer.messages, { gameId });
  expect(after.some((m) => m.seat === null && /Beta left the union/.test(m.text))).toBe(true);
});

// --- M7 game variants: the zombies option (spec I-15) & fog-of-war-lite (plan ⑦) ----------------

test("variants are stored at creation, surfaced in the lobby, and host-toggleable until start", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, {
    partyName: "Alpha", color: "green", variants: { zombies: true },
  });
  expect((await host.query(api.multiplayer.lobby, { code }))!.variants).toEqual({ zombies: true });

  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  // Only the host may toggle; guests read the chips.
  expect((await p2.mutation(api.multiplayer.setVariants, { gameId, variants: { fogLite: true } })).reason).toBe("host_only");
  await host.mutation(api.multiplayer.setVariants, { gameId, variants: { zombies: true, fogLite: true } });
  expect((await p2.query(api.multiplayer.lobby, { code }))!.variants).toEqual({ zombies: true, fogLite: true });

  // startGame hands the variants to buildMpGame — they ride in the engine state from then on…
  await host.mutation(api.multiplayer.startGame, { gameId });
  const stored = await t.run(async (ctx) => (await ctx.db.get(gameId))!.state as MpGameState);
  expect(stored.variants).toEqual({ zombies: true, fogLite: true });
  // …and are locked once started.
  expect((await host.mutation(api.multiplayer.setVariants, { gameId, variants: {} })).reason).toBe("started");
});

test("fog-of-war-lite: playView masks areas this seat has never entered (coords kept, detail gone)", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, {
    partyName: "Alpha", color: "green", variants: { fogLite: true },
  });
  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  await host.mutation(api.multiplayer.startGame, { gameId });
  const bySeat: Record<number, typeof host> = {};
  for (const u of [host, p2]) bySeat[(await u.query(api.multiplayer.gameState, { gameId }))!.youSeat] = u;
  for (let i = 0; i < 2; i++) {
    const picker = (await host.query(api.multiplayer.gameState, { gameId }))!.currentPicker!;
    await bySeat[picker]!.mutation(api.multiplayer.pickParty, { gameId, picks: [5] });
  }
  // Drop a second, fully detailed area into the shared cave that NO seat has entered.
  await t.run(async (ctx) => {
    const game = await ctx.db.get(gameId);
    const mp = game!.state as MpGameState;
    mp.cave.areas.push({
      card: 31, coord: 15049, faceUp: true, visited: true, contents: [112, 201],
      flags: 0, indiffCount: 0, markers: [303], mirroredStairs: 64, secretDoor: 0,
    });
    await ctx.db.patch(gameId, { state: mp });
  });
  const pv = (await bySeat[0]!.query(api.multiplayer.playView, { gameId }))!;
  expect(pv.variants).toEqual({ fogLite: true });
  expect(pv.state.areas[0]!.faceUp).toBe(true); // the Gateway is in every seat's ledger
  expect(pv.state.areas[1]).toEqual({           // the unseen area: a face-down stub, coord kept
    card: 31, coord: 15049, faceUp: false, visited: false, contents: [], flags: 0, indiffCount: 0,
  });
  expect(typeof pv.distantFights).toBe("number"); // the no-detail fight hint rides along
  // Spectating serves the FOLLOWED seat's fog — no more of the cave than they have seen.
  const sv = (await bySeat[1]!.query(api.multiplayer.spectateView, { gameId, seat: 0 }))!;
  expect(sv.state.areas[1]!.faceUp).toBe(false);
  expect(sv.state.areas[1]!.contents).toEqual([]);
});

test("a PvP wipe caused by window auto-resolve records the loser's high score (I-19/§8.4 fix)", async () => {
  const t = convexTest(schema, modules);
  const { gameId, bySeat } = await playingPair(t);
  // Rig a decided fight: seat 0's Giant (FS 7) vs seat 1's lone Dwarf (FS 1) — the Giant's total
  // (7 + d6 ≥ 8) always beats the Dwarf's (1 + d6 ≤ 7), so the auto-resolved round wipes seat 1
  // regardless of dice. The session sits at defenderLine with its window long overdue.
  await t.run(async (ctx) => {
    const game = await ctx.db.get(gameId);
    const mp = game!.state as MpGameState;
    mp.parties[0]!.party = [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }];
    mp.parties[1]!.party = [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [] }];
    mp.session = {
      kind: "pvp", area: 0, attacker: [0], defender: [1], round: 1, activeSide: "attacker",
      surprise: 0, stage: "defenderLine", defenderLine: [], engagements: [],
      attackerBackers: [], defenderBackers: [],
      window: { seat: 1, deadline: Date.now() - 120_000, kind: "pvpLayout" },
      stopProposedBy: null, drops: [],
    } as unknown as MpGameState["session"];
    await ctx.db.patch(gameId, { state: mp });
    for (const p of await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect()) {
      await ctx.db.patch(p._id, { lastSeen: Date.now() - 600_000 }); // stale: no presence extension
    }
  });

  // Each firing auto-defaults ONE stage (every stage gets its own window, §1.3): defender line →
  // attacker engage → defender casters → resolve. Rewind the fresh window and fire until settled.
  for (let i = 0; i < 4; i++) {
    const open = await t.run(async (ctx) => {
      const game = await ctx.db.get(gameId);
      const mp = game!.state as MpGameState;
      if (!mp.session) return false;
      (mp.session as { window: { deadline: number } | null }).window = {
        ...(mp.session as { window: { seat: number; kind: string } }).window ?? { seat: 1, kind: "pvpLayout" },
        deadline: Date.now() - 120_000,
      } as never;
      await ctx.db.patch(gameId, { state: mp });
      return true;
    });
    if (!open) break;
    // Any mutation triggers the lazy settle; the caller's own action being blocked is irrelevant.
    await bySeat[0]!.mutation(api.multiplayer.act, { gameId, action: { type: "endTurn" } });
  }

  const { wiped, scores } = await t.run(async (ctx) => {
    const game = await ctx.db.get(gameId);
    const mp = game!.state as MpGameState;
    const rows = await ctx.db.query("highScores").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
    return { wiped: mp.parties[1]!.status, scores: rows.map((r) => ({ name: r.partyName, mode: r.mode })) };
  });
  expect(wiped).toBe("wiped");
  expect(scores).toContainEqual({ name: "Beta", mode: "multi" }); // the timer-wiped party IS recorded
});

test("the concurrent variant frees both seats to act at once (M6 wiring, plan ①)", async () => {
  const t = convexTest(schema, modules);
  const host = await asUser(t);
  const { code, gameId } = await host.mutation(api.multiplayer.createMultiplayer, {
    partyName: "Alpha", color: "green", variants: { concurrent: true },
  });
  const p2 = await asUser(t);
  await p2.mutation(api.multiplayer.joinByCode, { code, partyName: "Beta", color: "blue" });
  await host.mutation(api.multiplayer.startGame, { gameId });
  const gs1 = await host.query(api.multiplayer.gameState, { gameId });
  const seatOf = async (u: typeof host) => (await u.query(api.multiplayer.gameState, { gameId }))!.youSeat;
  const bySeat: Record<number, typeof host> = { [await seatOf(host)]: host, [await seatOf(p2)]: p2 };
  await bySeat[gs1!.currentPicker!]!.mutation(api.multiplayer.pickParty, { gameId, picks: [5] });
  const gs2 = await host.query(api.multiplayer.gameState, { gameId });
  await bySeat[gs2!.currentPicker!]!.mutation(api.multiplayer.pickParty, { gameId, picks: [6] });

  // No table turn: BOTH threads are live, and the HUD gets the explicit signals.
  const v0 = await bySeat[0]!.query(api.multiplayer.playView, { gameId });
  const v1 = await bySeat[1]!.query(api.multiplayer.playView, { gameId });
  expect(v0?.concurrent).toBe(true);
  expect(v0?.currentSeat).toBeNull();
  expect(v0?.gamePhase).toBe("playing");
  expect(v0?.yourTurn).toBe(true);
  expect(v1?.yourTurn).toBe(true); // simultaneously — the whole point

  // And both can actually act back-to-back with no hand-off (moves off the Gateway).
  const a = await bySeat[0]!.mutation(api.multiplayer.act, { gameId, action: { type: "move", dir: 3 } });
  const b = await bySeat[1]!.mutation(api.multiplayer.act, { gameId, action: { type: "move", dir: 1 } });
  expect((a as { events: { type: string }[] }).events).not.toContainEqual({ type: "blocked" });
  expect((b as { events: { type: string }[] }).events).not.toContainEqual({ type: "blocked" });
});
