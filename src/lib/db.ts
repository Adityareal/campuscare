import { Prisma, PrismaClient } from "@prisma/client";

/**
 * MongoDB has no triggers, so the append-only rules that the Postgres migration enforced in the
 * database are enforced here. Every client the app builds goes through this extension.
 *   AuditLog:      no update, upsert or delete of any kind.
 *   ConsentRecord: no update or upsert (a withdrawal is a new row). Deletes stay allowed, as the
 *                  old trigger only blocked UPDATE; deleting a user removes their consent rows.
 * Raw commands and the mongo shell are not covered. Anyone with direct database credentials can
 * still edit rows; verifyAuditChain exists to detect that.
 */
const BLOCKED: Record<"auditLog" | "consentRecord", ReadonlySet<string>> = {
  auditLog: new Set(["update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]),
  consentRecord: new Set(["update", "updateMany", "updateManyAndReturn", "upsert"]),
};

function appendOnly(model: keyof typeof BLOCKED, label: string) {
  return {
    async $allOperations({ operation, args, query }: { operation: string; args: unknown; query: (a: never) => Promise<unknown> }) {
      if (BLOCKED[model].has(operation)) throw new Error(`${label} is append-only: ${operation} is not permitted`);
      return query(args as never);
    },
  };
}

function extend(client: PrismaClient) {
  return client.$extends({
    name: "append-only",
    query: {
      auditLog: appendOnly("auditLog", "AuditLog"),
      consentRecord: appendOnly("consentRecord", "ConsentRecord"),
    },
  });
}

export type Db = ReturnType<typeof extend>;
export type Tx = Omit<Db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
/** Anything that can run queries: the root client or an interactive transaction. */
export type DbLike = Db | Tx;

const globalForDb = globalThis as unknown as { __campuscareDb?: Db };

/** The Atlas connection string. DATABASE_URL wins; MONGODB_URI is what the Atlas integration may set. */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!url) throw new Error("DATABASE_URL (or MONGODB_URI) is not set. Point it at the MongoDB Atlas database.");
  return url;
}

export function createDbClient(url: string = databaseUrl()): Db {
  return extend(new PrismaClient({ datasourceUrl: url }));
}

/** The client is created on first use, never at import time, so build workers that import a
 * route module do not each open a connection pool. */
export function getDb(): Db {
  globalForDb.__campuscareDb ??= createDbClient();
  return globalForDb.__campuscareDb;
}

export function setDbForTesting(client: Db): void {
  globalForDb.__campuscareDb = client;
}

/** Disconnects the shared client (scripts and tests only). */
export async function closeDb(): Promise<void> {
  const client = globalForDb.__campuscareDb;
  globalForDb.__campuscareDb = undefined;
  if (client) await client.$disconnect();
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const client = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});

// ---------- Transactions ----------

const MAX_ATTEMPTS = 3;

/** A transaction lost a write conflict. MongoDB aborts the loser, so the whole thing is re-run. */
function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/** A unique violation on the audit chain (two writers picked the same seq) is retryable. Any
 * other unique violation, such as a duplicate email at sign-up, is the caller's to handle. */
function isAuditChainCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const where = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return /AuditLog|AuditHead/.test(where);
}

/**
 * Runs an interactive transaction and re-runs the whole callback, up to 3 attempts, when it
 * lost a write conflict (P2034) or collided on the audit chain. The callback must therefore be
 * safe to run again: keep side effects outside the database in the caller, after it returns.
 */
export async function runTx<R>(fn: (tx: Tx) => Promise<R>, client: Db = getDb()): Promise<R> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await client.$transaction((tx) => fn(tx as Tx));
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !(isWriteConflict(error) || isAuditChainCollision(error))) throw error;
    }
  }
}
