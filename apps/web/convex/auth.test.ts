import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

// Anonymous sign-in mints JWTs, which needs the deployment's signing keys (not
// available inside convex-test). The live sign-in flow is verified in the
// browser round-trip (Task 7). Here we assert the @convex-dev/auth tables are
// merged into the schema, so games can reference a real `users` row by ownerId.
test("auth tables are present in the schema", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) => ctx.db.insert("users", { name: "anon" }));
  const user = await t.run((ctx) => ctx.db.get(id));
  expect(user?.name).toBe("anon");
});
