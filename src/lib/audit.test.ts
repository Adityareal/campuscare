import "@/test/env";
import { afterEach, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "@/lib/actor";
import { AUDIT_GENESIS, computeAuditHash, recordAudit, verifyAuditChain, type AuditMetadata } from "@/lib/audit";
import { setClock } from "@/lib/clock";
import type { DbLike } from "@/lib/db";

type Row = {
  id: string;
  chain: string;
  seq: number;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: AuditMetadata | null;
  createdAt: Date;
  prevHash: string;
  hash: string;
};

/** The few AuditLog and AuditHead operations recordAudit and verifyAuditChain use, backed by memory. */
function fakeClient(rows: Row[] = []) {
  const bySeq = (a: Row, b: Row) => a.seq - b.seq;
  const heads = new Map<string, { id: string; seq: number; hash: string }>();
  const client = {
    auditHead: {
      findUnique: async ({ where }: { where: { id: string } }) => heads.get(where.id) ?? null,
      create: async ({ data }: { data: { id: string; seq: number; hash: string } }) => {
        heads.set(data.id, { ...data });
        return data;
      },
      updateMany: async ({ where, data }: { where: { id: string; seq: number }; data: { seq: number; hash: string } }) => {
        const head = heads.get(where.id);
        if (!head || head.seq !== where.seq) return { count: 0 };
        Object.assign(head, data);
        return { count: 1 };
      },
    },
    auditLog: {
      findFirst: async ({ where }: { where: { chain: string } }) => {
        const last = rows.filter((r) => r.chain === where.chain).sort(bySeq).at(-1);
        return last ? { seq: last.seq, hash: last.hash } : null;
      },
      findMany: async ({ where }: { where: { chain: string } }) => rows.filter((r) => r.chain === where.chain).sort(bySeq),
      create: async ({ data }: { data: Omit<Row, "id" | "metadata"> & { metadata?: AuditMetadata } }) => {
        const row: Row = { ...data, id: `row-${rows.length + 1}`, metadata: data.metadata ?? null };
        rows.push(row);
        return row;
      },
    },
  };
  return { rows, heads, client: client as unknown as DbLike };
}

const counsellor: UserActor = { kind: "user", userId: "u1", role: "COUNSELLOR", institutionId: "inst-1", name: "Asha", locale: "en" };

const fields = {
  chain: "inst-1",
  seq: 1,
  actorId: "u1",
  actorRole: "COUNSELLOR",
  action: "case.view",
  entityType: "Case",
  entityId: "c1",
  metadata: { studentId: "s1", count: 2 } as AuditMetadata,
  createdAt: "2026-11-15T06:00:00.000Z",
  prevHash: AUDIT_GENESIS,
};

afterEach(() => setClock(null));

describe("computeAuditHash", () => {
  it("is deterministic and independent of metadata key order", () => {
    const h = computeAuditHash(fields);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computeAuditHash({ ...fields })).toBe(h);
    expect(computeAuditHash({ ...fields, metadata: { count: 2, studentId: "s1" } })).toBe(h);
  });

  it("changes when any field changes", () => {
    const h = computeAuditHash(fields);
    expect(computeAuditHash({ ...fields, seq: 2 })).not.toBe(h);
    expect(computeAuditHash({ ...fields, action: "case.close" })).not.toBe(h);
    expect(computeAuditHash({ ...fields, metadata: null })).not.toBe(h);
    expect(computeAuditHash({ ...fields, prevHash: "1".repeat(64) })).not.toBe(h);
  });
});

describe("recordAudit and verifyAuditChain", () => {
  it("chains entries per chain and verifies them", async () => {
    setClock(new Date("2026-11-15T06:00:00.000Z"));
    const { rows, client } = fakeClient();
    await recordAudit(client, counsellor, { action: "case.view", entityType: "Case", entityId: "c1", metadata: { studentId: "s1" } });
    await recordAudit(client, systemActor("risk-engine", "inst-1"), { action: "alert.create", entityType: "Alert", entityId: "a1" });
    await recordAudit(client, counsellor, { action: "tenant.event", entityType: "Institution", institutionId: "platform" });

    const chain = rows.filter((r) => r.chain === "inst-1");
    expect(chain.map((r) => r.seq)).toEqual([1, 2]);
    expect(chain[0]?.prevHash).toBe(AUDIT_GENESIS);
    expect(chain[1]?.prevHash).toBe(chain[0]?.hash);
    expect(chain[1]?.actorId).toBeNull();
    expect(chain[1]?.actorRole).toBe("SYSTEM:risk-engine");
    expect(chain[0]?.createdAt.toISOString()).toBe("2026-11-15T06:00:00.000Z");
    expect(rows.find((r) => r.chain === "platform")?.seq).toBe(1);

    expect(await verifyAuditChain(client, "inst-1")).toEqual({ ok: true, checked: 2, brokenAtSeq: null });
    expect(await verifyAuditChain(client, "platform")).toEqual({ ok: true, checked: 1, brokenAtSeq: null });
  });

  it("keeps the chain head in step with the last row", async () => {
    setClock(new Date("2026-11-15T06:00:00.000Z"));
    const { rows, heads, client } = fakeClient();
    await recordAudit(client, counsellor, { action: "case.view", entityType: "Case" });
    await recordAudit(client, counsellor, { action: "case.view", entityType: "Case" });
    expect(heads.get("inst-1")).toEqual({ id: "inst-1", seq: 2, hash: rows[1]?.hash });
  });

  it("an empty chain verifies", async () => {
    const { client } = fakeClient();
    expect(await verifyAuditChain(client, "nothing")).toEqual({ ok: true, checked: 0, brokenAtSeq: null });
  });

  it("detects an edited row, a broken link and a missing row", async () => {
    setClock(new Date("2026-11-15T06:00:00.000Z"));
    const build = async () => {
      const f = fakeClient();
      for (const id of ["c1", "c2", "c3"]) await recordAudit(f.client, counsellor, { action: "case.view", entityType: "Case", entityId: id });
      return f;
    };

    const edited = await build();
    edited.rows[1]!.action = "case.close";
    expect(await verifyAuditChain(edited.client, "inst-1")).toMatchObject({ ok: false, brokenAtSeq: 2 });

    const relinked = await build();
    relinked.rows[2]!.prevHash = AUDIT_GENESIS;
    expect(await verifyAuditChain(relinked.client, "inst-1")).toMatchObject({ ok: false, brokenAtSeq: 3 });

    const removed = await build();
    removed.rows.splice(1, 1);
    expect(await verifyAuditChain(removed.client, "inst-1")).toMatchObject({ ok: false, brokenAtSeq: 3 });
  });
});
