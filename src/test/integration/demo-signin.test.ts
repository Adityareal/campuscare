import "@/test/env";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { signInAsDemoPersona } from "@/lib/auth/signin";
import { DEMO_PERSONAS } from "@/lib/demo";
import { createTestDb, type TestDb } from "@/test/db";

const env = process.env as Record<string, string | undefined>;
const saved = env.CAMPUSCARE_DEPLOYMENT;

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
afterEach(() => {
  if (saved === undefined) delete env.CAMPUSCARE_DEPLOYMENT;
  else env.CAMPUSCARE_DEPLOYMENT = saved;
});

describe("demo sign-in", () => {
  it.each([undefined, "", "pilot", "production", "junk"])("is refused when CAMPUSCARE_DEPLOYMENT is %s", async (value) => {
    if (value === undefined) delete env.CAMPUSCARE_DEPLOYMENT;
    else env.CAMPUSCARE_DEPLOYMENT = value;
    const persona = DEMO_PERSONAS[0];
    await expect(signInAsDemoPersona(persona.key)).rejects.toThrow(/Demo sign-in is not available/);
    expect(await t.db.session.count()).toBe(0);
  });
});
