import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // One in-memory MongoDB replica set for the run; each integration file uses its own database.
    globalSetup: ["src/test/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
