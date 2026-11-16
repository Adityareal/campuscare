/**
 * Rebuilds the local PGlite database from scratch: deletes the data directory, applies every
 * migration and, when prisma/seed.ts exists, loads the demo data.
 *
 *   npm run db:reset
 *
 * Only ever touches a local PGlite directory. A real Postgres URL, or the in-memory test
 * database, is refused.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../src/lib/db-migrate";

function resolveTarget(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("pglite:")) {
    throw new Error('db:reset only works on a local PGlite database. Set DATABASE_URL to "pglite:./.pglite".');
  }
  const target = url.slice("pglite:".length);
  if (!target || target === "memory") {
    throw new Error("db:reset needs a PGlite directory, not the in-memory database.");
  }
  const cwd = process.cwd();
  const resolved = path.resolve(cwd, target);
  const rel = path.relative(cwd, resolved);
  // Refuse anything that would delete the project itself or a directory outside it.
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Refusing to delete ${resolved}: the PGlite directory must be inside the project.`);
  }
  return resolved;
}

async function main(): Promise<void> {
  const target = resolveTarget();
  await rm(target, { recursive: true, force: true });
  console.log(`[db:reset] removed ${target}`);

  const pg = new PGlite(target);
  try {
    await pg.waitReady;
    const applied = await applyMigrations(pg);
    console.log(`[db:reset] applied ${applied.length} migration(s)${applied.length ? `: ${applied.join(", ")}` : ""}`);
  } finally {
    await pg.close();
  }

  const seedPath = path.resolve(process.cwd(), "prisma", "seed.ts");
  if (!existsSync(seedPath)) {
    console.log("[db:reset] prisma/seed.ts not found, skipping demo data.");
    return;
  }
  const mod = (await import(pathToFileURL(seedPath).href)) as { seed?: () => Promise<void> };
  if (typeof mod.seed !== "function") {
    console.log("[db:reset] prisma/seed.ts does not export seed(), skipping demo data.");
    return;
  }
  // The seed opens its own client on DATABASE_URL; close it afterwards so the directory lock is released.
  const { getDb } = await import("../src/lib/db");
  try {
    await mod.seed();
    console.log("[db:reset] demo data loaded.");
  } finally {
    await getDb().$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(`[db:reset] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
