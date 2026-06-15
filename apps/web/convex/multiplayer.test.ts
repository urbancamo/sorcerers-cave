import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

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
