import "@/test/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAudit, verifyAuditChain } from "@/lib/audit";
import { systemActor } from "@/lib/actor";
import { runTx } from "@/lib/db";
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
  it("re-runs a transaction that lost a write conflict, and concurrent audit appends keep one chain", async () => {
    const actor = systemActor("seed", "inst-y");
    let attempts = 0;
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        runTx((tx) => {
          attempts += 1;
          return recordAudit(tx, actor, { action: `n.${i}`, entityType: "T" });
        }, t.db),
      ),
    );
    expect(results).toHaveLength(3);
    expect(attempts).toBeGreaterThan(3); // at least one transaction lost a conflict and was re-run
    expect(await verifyAuditChain(t.db, "inst-y")).toEqual({ ok: true, checked: 3, brokenAtSeq: null });
    expect((await t.db.auditHead.findUniqueOrThrow({ where: { id: "inst-y" } })).seq).toBe(3);
  });

  it("retries a real (chain, seq) unique violation, but not a duplicate on another model", async () => {
    const base = { chain: "inst-z", seq: 1, action: "a", entityType: "T", prevHash: "p" };
    await t.db.auditLog.create({ data: { ...base, hash: "h1" } });
    let audit = 0;
    await expect(runTx(async (tx) => { audit += 1; await tx.auditLog.create({ data: { ...base, hash: "h2" } }); }, t.db)).rejects.toMatchObject({ code: "P2002" });
    expect(audit).toBe(3);

    await t.db.institution.create({ data: { name: "A", slug: "dup", city: "c", emailDomain: "d" } });
    let other = 0;
    await expect(runTx(async (tx) => { other += 1; await tx.institution.create({ data: { name: "B", slug: "dup", city: "c", emailDomain: "d" } }); }, t.db)).rejects.toMatchObject({ code: "P2002" });
    expect(other).toBe(1);
  });
});

