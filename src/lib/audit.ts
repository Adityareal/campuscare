import { db as rootDb, getDb, type DbLike } from "@/lib/db";
import { actorId, actorRole, type Actor } from "@/lib/actor";
import { now } from "@/lib/clock";
import { sha256, stableStringify } from "@/lib/crypto";

export const AUDIT_GENESIS = "0".repeat(64);

/** Metadata must never contain clinical content or free text: ids, codes and counts only. */
export type AuditMetadata = Record<string, string | number | boolean | null>;

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: AuditMetadata;
  /** Defaults to the actor's institution; platform-level events use the "platform" chain. */
  institutionId?: string | null;
};

type HashFields = {
  chain: string;
  seq: number;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: AuditMetadata | null;
  createdAt: string;
  prevHash: string;
};

export function computeAuditHash(f: HashFields): string {
  return sha256(stableStringify(f));
}

export async function recordAudit(client: DbLike, actor: Actor, input: AuditInput): Promise<void> {
  // The per-chain lock below only holds inside a transaction. Writes through the root client
  // get their own transaction; writes through a transaction client join the caller's.
  // (Prisma 7 transaction clients also expose $transaction, so identity is the reliable test.)
  if (client === rootDb || client === getDb()) {
    await rootDb.$transaction((tx) => appendAudit(tx, actor, input));
    return;
  }
  await appendAudit(client, actor, input);
}

async function appendAudit(client: DbLike, actor: Actor, input: AuditInput): Promise<void> {
  const chain = input.institutionId ?? actor.institutionId ?? "platform";
  // Serialise writers per chain so two concurrent entries cannot share a predecessor.
  await client.$executeRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${chain}))) AS chain_lock`;
  const last = await client.auditLog.findFirst({
    where: { chain },
    orderBy: { seq: "desc" },
    select: { seq: true, hash: true },
  });
  const fields: HashFields = {
    chain,
    seq: (last?.seq ?? 0) + 1,
    actorId: actorId(actor),
    actorRole: actorRole(actor),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    createdAt: now().toISOString(),
    prevHash: last?.hash ?? AUDIT_GENESIS,
  };
  await client.auditLog.create({
    data: {
      ...fields,
      metadata: fields.metadata ?? undefined,
      createdAt: new Date(fields.createdAt),
      hash: computeAuditHash(fields),
    },
  });
}

export type ChainVerification = { ok: boolean; checked: number; brokenAtSeq: number | null };

/** Recomputes every hash in a chain. Detects edits made by anyone who bypassed the
 * append-only trigger (for example with superuser access to the database). */
export async function verifyAuditChain(client: DbLike, chain: string): Promise<ChainVerification> {
  const rows = await client.auditLog.findMany({ where: { chain }, orderBy: { seq: "asc" } });
  let prevHash = AUDIT_GENESIS;
  let expectedSeq = 1;
  for (const row of rows) {
    const recomputed = computeAuditHash({
      chain: row.chain,
      seq: row.seq,
      actorId: row.actorId,
      actorRole: row.actorRole,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: (row.metadata as AuditMetadata | null) ?? null,
      createdAt: row.createdAt.toISOString(),
      prevHash: row.prevHash,
    });
    if (row.seq !== expectedSeq || row.prevHash !== prevHash || row.hash !== recomputed) {
      return { ok: false, checked: rows.length, brokenAtSeq: row.seq };
    }
    prevHash = row.hash;
    expectedSeq += 1;
  }
  return { ok: true, checked: rows.length, brokenAtSeq: null };
}
