import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
type Roles = ("SYSTEM" | "USER" | "ANALYTICS" | "TEST")[];
type T = ReturnType<typeof convexTest>;

async function asUser(t: T, roles?: Roles) {
  const userId = await t.run((ctx) => ctx.db.insert("users", roles ? { roles } : {}));
  return { as: t.withIdentity({ subject: `${userId}|session` }), userId };
}

// A started two-party multiplayer game, its chat, and its two leaderboard entries.
async function seedMulti(t: T) {
  return t.run(async (ctx) => {
    const u1 = await ctx.db.insert("users", {});
    const u2 = await ctx.db.insert("users", {});
    const gameId = await ctx.db.insert("games", {
      state: { parties: [{ name: "Rude Name", color: "green" }, { name: "Polite", color: "blue" }], turn: 3 },
      status: "active", mode: "multi", code: "ABCD", createdAt: 0, updatedAt: 0,
    });
    const p0 = await ctx.db.insert("players", { gameId, userId: u1, seat: 0, partyName: "Rude Name", color: "green", ready: true, lastSeen: 0 });
    const p1 = await ctx.db.insert("players", { gameId, userId: u2, seat: 1, partyName: "Polite", color: "blue", ready: true, lastSeen: 0 });
    await ctx.db.insert("messages", { gameId, seat: 0, partyName: "Rude Name", color: "green", text: "hello", createdAt: 1 });
    await ctx.db.insert("messages", { gameId, seat: 1, partyName: "Polite", color: "blue", text: "hi", createdAt: 2 });
    await ctx.db.insert("messages", { gameId, seat: null, partyName: "", color: null, text: "Rude Name joined", createdAt: 3 });
    const hs = (name: string) => ctx.db.insert("highScores", {
      gameId, name, partyName: name, mode: "multi", gameCode: "ABCD", score: 10, outcome: 1, party: [], state: {}, createdAt: 5,
    });
    return { gameId, p0, p1, h0: await hs("Rude Name"), h1: await hs("Polite") };
  });
}
async function seedSolo(t: T, name = "Offensive") {
  return t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", { state: {}, status: "finished", createdAt: 0, updatedAt: 0 });
    return ctx.db.insert("highScores", { gameId, name, score: 10, outcome: 1, party: [], state: {}, createdAt: 5 });
  });
}

describe("high-score names", () => {
  test("the tab lists recent entries without the stored game", async () => {
    const t = convexTest(schema, modules);
    const id = await seedSolo(t);
    const { as } = await asUser(t, ["SYSTEM"]);
    const rows = await as.query(api.adminNames.highScores, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ _id: id, name: "Offensive", score: 10, mode: "solo" });
    expect(rows[0]).not.toHaveProperty("state");
  });

  test("rename changes the name, trims it, and leaves a trace", async () => {
    const t = convexTest(schema, modules);
    const id = await seedSolo(t);
    const { as, userId } = await asUser(t, ["SYSTEM"]);
    await as.mutation(api.adminNames.renameHighScore, { id, name: "  Gandalf " });
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("Gandalf");
    const log = await t.run((ctx) => ctx.db.query("nameAudit").collect());
    expect(log).toMatchObject([{ kind: "highScore", targetId: id, before: "Offensive", after: "Gandalf", byUserId: userId }]);
    expect(await as.query(api.adminNames.audit, {})).toMatchObject([{ before: "Offensive", after: "Gandalf" }]);
  });

  test("clear replaces it with Anonymous", async () => {
    const t = convexTest(schema, modules);
    const id = await seedSolo(t);
    const { as } = await asUser(t, ["SYSTEM"]);
    await as.mutation(api.adminNames.clearHighScore, { id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("Anonymous");
  });

  test("an empty or over-long name is refused, and nothing changes or is logged", async () => {
    const t = convexTest(schema, modules);
    const id = await seedSolo(t);
    const { as } = await asUser(t, ["SYSTEM"]);
    await expect(as.mutation(api.adminNames.renameHighScore, { id, name: "   " })).rejects.toThrow(/cannot be empty/);
    await expect(as.mutation(api.adminNames.renameHighScore, { id, name: "x".repeat(41) })).rejects.toThrow(/at most 40/);
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("Offensive");
    expect(await t.run((ctx) => ctx.db.query("nameAudit").collect())).toEqual([]);
  });

  test("renaming to the same name is a no-op with no audit row", async () => {
    const t = convexTest(schema, modules);
    const id = await seedSolo(t, "Same");
    const { as } = await asUser(t, ["SYSTEM"]);
    await as.mutation(api.adminNames.renameHighScore, { id, name: "Same" });
    expect(await t.run((ctx) => ctx.db.query("nameAudit").collect())).toEqual([]);
  });
});

describe("party names", () => {
  test("the tab lists parties with the others in their game", async () => {
    const t = convexTest(schema, modules);
    const { p0 } = await seedMulti(t);
    const { as } = await asUser(t, ["SYSTEM"]);
    const rows = await as.query(api.adminNames.parties, {});
    expect(rows.find((r) => r._id === p0)).toMatchObject({ partyName: "Rude Name", seat: 0, withParties: ["Polite"] });
  });

  test("rename changes the seat, the game's copy, that party's chat lines and its leaderboard entry, and nothing of the other party's", async () => {
    const t = convexTest(schema, modules);
    const { gameId, p0, p1, h0, h1 } = await seedMulti(t);
    const { as } = await asUser(t, ["SYSTEM"]);
    await as.mutation(api.adminNames.renameParty, { playerId: p0, name: "The Bold" });
    expect((await t.run((ctx) => ctx.db.get(p0)))?.partyName).toBe("The Bold");
    expect((await t.run((ctx) => ctx.db.get(p1)))?.partyName).toBe("Polite");
    const game = await t.run((ctx) => ctx.db.get(gameId));
    expect((game?.state as { parties: { name: string }[]; turn: number }).parties.map((p) => p.name)).toEqual(["The Bold", "Polite"]);
    expect((game?.state as { turn: number }).turn).toBe(3);
    const chat = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(chat.filter((m) => m.seat === 0).map((m) => m.partyName)).toEqual(["The Bold"]);
    expect(chat.filter((m) => m.seat === 1).map((m) => m.partyName)).toEqual(["Polite"]);
    expect(chat.find((m) => m.seat === null)?.text).toBe("Rude Name joined"); // history lines are left as they were written
    expect(await t.run((ctx) => ctx.db.get(h0))).toMatchObject({ name: "The Bold", partyName: "The Bold" });
    expect(await t.run((ctx) => ctx.db.get(h1))).toMatchObject({ name: "Polite", partyName: "Polite" });
    expect(await t.run((ctx) => ctx.db.query("nameAudit").collect())).toMatchObject([{ kind: "partyName", before: "Rude Name", after: "The Bold" }]);
  });

  test("another party in the game cannot be given the same name (any case)", async () => {
    const t = convexTest(schema, modules);
    const { p0 } = await seedMulti(t);
    const { as } = await asUser(t, ["SYSTEM"]);
    await expect(as.mutation(api.adminNames.renameParty, { playerId: p0, name: "polite" })).rejects.toThrow(/already has that name/);
    await expect(as.mutation(api.adminNames.renameParty, { playerId: p0, name: "x".repeat(25) })).rejects.toThrow(/at most 24/);
  });

  test("clear gives a standard name, numbered if that is taken, and never an empty one", async () => {
    const t = convexTest(schema, modules);
    const { p0, p1 } = await seedMulti(t);
    const { as } = await asUser(t, ["SYSTEM"]);
    await as.mutation(api.adminNames.clearParty, { playerId: p0 });
    expect((await t.run((ctx) => ctx.db.get(p0)))?.partyName).toBe("Party");
    await as.mutation(api.adminNames.clearParty, { playerId: p1 });
    expect((await t.run((ctx) => ctx.db.get(p1)))?.partyName).toBe("Party 2");
  });

  test("a game that has not started (no state yet) is renamed without error", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t, ["SYSTEM"]);
    const { p } = await t.run(async (ctx) => {
      const u = await ctx.db.insert("users", {});
      const gameId = await ctx.db.insert("games", { state: null, status: "active", mode: "multi", code: "WXYZ", createdAt: 0, updatedAt: 0 });
      return { p: await ctx.db.insert("players", { gameId, userId: u, seat: 0, partyName: "Lobby", color: "red", ready: false, lastSeen: 0 }) };
    });
    await as.mutation(api.adminNames.renameParty, { playerId: p, name: "Renamed" });
    expect((await t.run((ctx) => ctx.db.get(p)))?.partyName).toBe("Renamed");
  });
});

describe("who may use it", () => {
  test("only SYSTEM: other roles, anonymous players and signed-out callers are refused everywhere", async () => {
    const t = convexTest(schema, modules);
    const { p0 } = await seedMulti(t);
    const id = await seedSolo(t);
    const callers = [undefined, ["USER"], ["ANALYTICS"], ["TEST"]] as (Roles | undefined)[];
    for (const roles of callers) {
      const { as } = await asUser(t, roles);
      await expect(as.query(api.adminNames.highScores, {})).rejects.toThrow();
      await expect(as.query(api.adminNames.parties, {})).rejects.toThrow();
      await expect(as.query(api.adminNames.audit, {})).rejects.toThrow();
      await expect(as.mutation(api.adminNames.renameHighScore, { id, name: "X" })).rejects.toThrow();
      await expect(as.mutation(api.adminNames.clearHighScore, { id })).rejects.toThrow();
      await expect(as.mutation(api.adminNames.renameParty, { playerId: p0, name: "X" })).rejects.toThrow();
      await expect(as.mutation(api.adminNames.clearParty, { playerId: p0 })).rejects.toThrow();
    }
    await expect(t.mutation(api.adminNames.renameHighScore, { id, name: "X" })).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("Offensive");
  });
});
