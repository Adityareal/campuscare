import "@/test/env";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "@/lib/db-migrate";

describe("applyMigrations", () => {
  let pg: PGlite;
  let dir: string;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
    dir = mkdtempSync(path.join(tmpdir(), "campuscare-migrations-"));
    mkdirSync(path.join(dir, "002_second"));
    writeFileSync(path.join(dir, "002_second", "migration.sql"), "ALTER TABLE things ADD COLUMN label TEXT;");
    mkdirSync(path.join(dir, "001_first"));
    writeFileSync(path.join(dir, "001_first", "migration.sql"), "CREATE TABLE things (id INT PRIMARY KEY);");
    // A folder without migration.sql and a stray file are ignored.
    mkdirSync(path.join(dir, "003_empty"));
    writeFileSync(path.join(dir, "migration_lock.toml"), 'provider = "postgresql"');
  });

  afterAll(async () => {
    await pg.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("applies migrations in name order and records them", async () => {
    expect(await applyMigrations(pg, dir)).toEqual(["001_first", "002_second"]);
    const ledger = await pg.query<{ name: string }>('SELECT "name" FROM "_campuscare_migrations" ORDER BY "name"');
    expect(ledger.rows.map((r) => r.name)).toEqual(["001_first", "002_second"]);
    const cols = await pg.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'things' ORDER BY column_name");
    expect(cols.rows.map((r) => r.column_name)).toEqual(["id", "label"]);
  });

  it("skips migrations already applied", async () => {
    expect(await applyMigrations(pg, dir)).toEqual([]);
  });

  it("rolls back a failing migration so it is retried later", async () => {
    mkdirSync(path.join(dir, "004_broken"));
    writeFileSync(path.join(dir, "004_broken", "migration.sql"), "CREATE TABLE broken (id INT); SELECT * FROM missing_table;");
    await expect(applyMigrations(pg, dir)).rejects.toThrow();
    const broken = await pg.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'broken'");
    expect(broken.rows).toHaveLength(0);
    const ledger = await pg.query<{ name: string }>('SELECT "name" FROM "_campuscare_migrations" WHERE "name" = \'004_broken\'');
    expect(ledger.rows).toHaveLength(0);
  });

  it("applies the project's migrations to an empty database", async () => {
    const fresh = new PGlite();
    try {
      await fresh.waitReady;
      const applied = await applyMigrations(fresh);
      expect(applied.length).toBeGreaterThan(0);
      const tables = await fresh.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('AuditLog', 'ConsentRecord', 'Alert')",
      );
      expect(tables.rows.map((r) => r.table_name).sort()).toEqual(["Alert", "AuditLog", "ConsentRecord"]);
    } finally {
      await fresh.close();
    }
  });
});
