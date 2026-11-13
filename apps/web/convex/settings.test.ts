import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { asUser } from "./game.test";

const modules = import.meta.glob("./**/*.*s");

describe("settings.get", () => {
  test("Multiplayer is OFF until someone turns it on, and anyone (even signed out) can read that", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.settings.get, {})).toEqual({ multiplayerEnabled: false });
    const { as } = await asUser(t);
    expect(await as.query(api.settings.get, {})).toEqual({ multiplayerEnabled: false });
  });
});

describe("settings.setOptions", () => {
  test("a SYSTEM user turns Multiplayer on and off again, and the same single row is kept", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t, ["SYSTEM"]);
    await as.mutation(api.settings.setOptions, { multiplayerEnabled: true });
    expect(await t.query(api.settings.get, {})).toEqual({ multiplayerEnabled: true });
    await as.mutation(api.settings.setOptions, { multiplayerEnabled: false });
    expect(await t.query(api.settings.get, {})).toEqual({ multiplayerEnabled: false });
    expect(await t.run((ctx) => ctx.db.query("systemSettings").collect())).toHaveLength(1);
  });
  test("only SYSTEM may change it: other roles, anonymous players and signed-out callers are refused", async () => {
    const t = convexTest(schema, modules);
    for (const roles of [["USER"], ["ANALYTICS"], ["TEST"], []] as const) {
      const { as } = await asUser(t, [...roles]);
      await expect(as.mutation(api.settings.setOptions, { multiplayerEnabled: true })).rejects.toThrow(/Forbidden/);
    }
    await expect(t.mutation(api.settings.setOptions, { multiplayerEnabled: true })).rejects.toThrow();
    expect(await t.query(api.settings.get, {})).toEqual({ multiplayerEnabled: false });
  });
});
