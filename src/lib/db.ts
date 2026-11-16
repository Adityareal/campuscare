import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
/** Anything that can run queries: the root client or an interactive transaction. */
export type DbLike = Db | Tx;

const globalForDb = globalThis as unknown as { __campuscareDb?: Db; __campuscarePg?: PGlite };

/**
 * DATABASE_URL forms:
 *   pglite:./.pglite   in-process Postgres persisted to a local directory (development)
 *   pglite:memory      in-process, in-memory Postgres (tests)
 *   postgresql://...   a real Postgres server (pilot / production)
 */
function openClient(url: string): { client: Db; pg: PGlite | null } {
  if (url.startsWith("pglite:")) {
    const target = url.slice("pglite:".length);
    // Resolved at runtime only; the comment stops the bundler tracing the whole project from here.
    const pg = target === "memory" ? new PGlite() : new PGlite(path.resolve(/* turbopackIgnore: true */ process.cwd(), target));
    return { client: new PrismaClient({ adapter: new PrismaPGlite(pg) }), pg };
  }
  return { client: new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }), pg: null };
}

export function createDbClient(url = process.env.DATABASE_URL ?? "pglite:./.pglite"): Db {
  return openClient(url).client;
}

/** The client is created on first use, never at import time, so build workers that import a
 * route module do not each open the PGlite data directory. */
export function getDb(): Db {
  if (!globalForDb.__campuscareDb) {
    const { client, pg } = openClient(process.env.DATABASE_URL ?? "pglite:./.pglite");
    globalForDb.__campuscareDb = client;
    globalForDb.__campuscarePg = pg ?? undefined;
  }
  return globalForDb.__campuscareDb;
}

export function setDbForTesting(client: Db): void {
  globalForDb.__campuscareDb = client;
}

/** Disconnects the shared client and shuts down an in-process PGlite cleanly (scripts only). */
export async function closeDb(): Promise<void> {
  const client = globalForDb.__campuscareDb;
  const pg = globalForDb.__campuscarePg;
  globalForDb.__campuscareDb = undefined;
  globalForDb.__campuscarePg = undefined;
  if (client) await client.$disconnect();
  if (pg && !pg.closed) await pg.close();
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const client = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
