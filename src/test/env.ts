/**
 * Test environment defaults. Import this first in every test file so modules that read the
 * environment (field encryption, the clock guard, the database URL) see test values.
 * A fixed key keeps ciphertext reproducible across runs; it protects nothing real.
 */
const env = process.env as Record<string, string | undefined>;

env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
env.NODE_ENV ??= "test";
// Never let a test fall back to the development database directory.
env.DATABASE_URL ??= "pglite:memory";

export const TEST_FIELD_ENCRYPTION_KEY = env.FIELD_ENCRYPTION_KEY;
