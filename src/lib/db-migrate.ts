import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";

/** Bookkeeping table for migrations applied by this runner (PGlite development and tests). */
const LEDGER = "_campuscare_migrations";

export const DEFAULT_MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma", "migrations");

/**
 * Applies every `prisma/migrations/<name>/migration.sql` that has not been applied yet, in name
 * order. Each migration runs in its own transaction together with its ledger row, so a failing
 * migration leaves no partial schema behind and is retried on the next run.
 * Returns the names applied by this call.
 */
export async function applyMigrations(pg: PGlite, dir: string = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
  await pg.exec(
    `CREATE TABLE IF NOT EXISTS "${LEDGER}" ("name" TEXT PRIMARY KEY, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  const done = await pg.query<{ name: string }>(`SELECT "name" FROM "${LEDGER}"`);
  const applied = new Set(done.rows.map((r) => r.name));

  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isDirectory() && existsSync(path.join(dir, e.name, "migration.sql")))
    .map((e) => e.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const ran: string[] = [];
  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = await readFile(path.join(dir, name, "migration.sql"), "utf8");
    await pg.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(`INSERT INTO "${LEDGER}" ("name") VALUES ($1)`, [name]);
    });
    ran.push(name);
  }
  return ran;
}
