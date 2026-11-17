import "@/test/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAudit, verifyAuditChain } from "@/lib/audit";
import { systemActor } from "@/lib/actor";
import { MAX_ATTEMPTS, runTx } from "@/lib/db";
import { createTestDb, type TestDb } from "@/test/db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe("append-only extension", () => {
  it("blocks every AuditLog write except create", async () => {
    await recordAudit(t.db, systemActor("seed", "inst-x"), { action: "a.b", entityType: "T" });
    const row = await t.db.auditLog.findFirstOrThrow();
    for (const op of [
      () => t.db.auditLog.update({ where: { id: row.id }, data: { action: "x" } }),
      () => t.db.auditLog.updateMany({ data: { action: "x" } }),
      () => t.db.auditLog.delete({ where: { id: row.id } }),
      () => t.db.auditLog.deleteMany(),
    ]) {
      await expect(op()).rejects.toThrow(/AuditLog is append-only/);
    }
    expect(await t.db.auditLog.count()).toBe(1);
  });

  it("blocks ConsentRecord updates but not deletes (as the old trigger did)", async () => {
    await t.db.consentPolicy.create({ data: { version: "v1", effectiveAt: new Date(), contentHash: "h" } });
    const rec = await t.db.consentRecord.create({
      data: { userId: "u", institutionId: "i", policyVersion: "v1", scope: "CORE_PROCESSING", decision: "GRANTED", locale: "en", source: "t" },
    });
    await expect(t.db.consentRecord.update({ where: { id: rec.id }, data: { decision: "WITHDRAWN" } })).rejects.toThrow(/ConsentRecord is append-only/);
    await expect(t.db.consentRecord.deleteMany({ where: { id: rec.id } })).resolves.toMatchObject({ count: 1 });
  });
});

describe("runTx on a real replica set", () => {
  it("re-runs a transaction that lost a forced write conflict", async () => {
    const inst = await t.db.institution.create({ data: { name: "Before", slug: "conflict", city: "c", emailDomain: "d" } });
    let attempts = 0;
    await runTx(async (tx) => {
      attempts += 1;
      // Read inside the transaction so its snapshot is fixed, then change the same document
      // outside it (first attempt only). The transaction's own write then conflicts: P2034.
      await tx.institution.findUniqueOrThrow({ where: { id: inst.id } });
      if (attempts === 1) await t.db.institution.update({ where: { id: inst.id }, data: { city: "outside" } });
      await tx.institution.update({ where: { id: inst.id }, data: { name: "Inside" } });
    }, t.db);
    expect(attempts).toBe(2);
    expect(await t.db.institution.findUniqueOrThrow({ where: { id: inst.id } })).toMatchObject({ name: "Inside", city: "outside" });
  });

  it("10 concurrent appends on one chain all succeed and the chain verifies", async () => {
    const actor = systemActor("seed", "inst-y");
    await Promise.all(Array.from({ length: 10 }, (_, i) => recordAudit(t.db, actor, { action: `n.${i}`, entityType: "T" })));
    const rows = await t.db.auditLog.findMany({ where: { chain: "inst-y" }, orderBy: { seq: "asc" } });
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(rows.map((r) => r.action)).size).toBe(10);
    expect(await verifyAuditChain(t.db, "inst-y")).toEqual({ ok: true, checked: 10, brokenAtSeq: null });
    expect(await t.db.auditHead.findUniqueOrThrow({ where: { id: "inst-y" } })).toMatchObject({ seq: 10, hash: rows[9]?.hash });
  });
  it("retries a real (chain, seq) unique violation, but not a duplicate on another model", async () => {
    const base = { chain: "inst-z", seq: 1, action: "a", entityType: "T", prevHash: "p" };
    await t.db.auditLog.create({ data: { ...base, hash: "h1" } });
    let audit = 0;
    await expect(runTx(async (tx) => { audit += 1; await tx.auditLog.create({ data: { ...base, hash: "h2" } }); }, t.db)).rejects.toMatchObject({ code: "P2002" });
    expect(audit).toBe(MAX_ATTEMPTS);

    await t.db.institution.create({ data: { name: "A", slug: "dup", city: "c", emailDomain: "d" } });
    let other = 0;
    await expect(runTx(async (tx) => { other += 1; await tx.institution.create({ data: { name: "B", slug: "dup", city: "c", emailDomain: "d" } }); }, t.db)).rejects.toMatchObject({ code: "P2002" });
    expect(other).toBe(1);
  });
});

