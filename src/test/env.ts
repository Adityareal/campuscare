/**
 * Test environment defaults. Import this first in every test file so modules that read the
 * environment (field encryption, the clock guard, the database URL) see test values.
 * A fixed key keeps ciphertext reproducible across runs; it protects nothing real.
 */
const env = process.env as Record<string, string | undefined>;

env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
env.NODE_ENV ??= "test";
// Never let a test touch the real database: point DATABASE_URL at the throwaway in-memory one
// (set by global-setup.ts), or at an unreachable address if that is missing.
env.DATABASE_URL = env.TEST_MONGO_URI ?? "mongodb://127.0.0.1:1/never-used";
delete env.MONGODB_URI;

export const TEST_FIELD_ENCRYPTION_KEY = env.FIELD_ENCRYPTION_KEY;
