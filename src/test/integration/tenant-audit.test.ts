import "@/test/env";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { UserActor } from "@/lib/actor";
import { verifyAuditChain } from "@/lib/audit";
import { setClock } from "@/lib/clock";
import { acknowledgeAlert, closeAlert, getAlertDetail, reviewAlert } from "@/lib/services/alerts";
import { studentInTenant } from "@/lib/services/access";
import { addCaseNote, closeCase, getCaseDetail } from "@/lib/services/cases";
import { requestHelp } from "@/lib/services/help";
import { actorFor, createTestDb, grantConsent, makeInstitution, makeUser, TEST_START, type TestDb } from "@/test/db";
import { expectDomainError } from "@/test/expect";

let t: TestDb;
let firstId: string;
let secondId: string;
let ownCounsellor: UserActor;
let otherCounsellor: UserActor;
let otherClinician: UserActor;
let studentId: string;
let alertId: string;
let caseId: string;

beforeAll(async () => {
  t = await createTestDb();
  setClock(TEST_START);
  firstId = (await makeInstitution({ name: "First University" })).id;
  secondId = (await makeInstitution({ name: "Second University" })).id;
  ownCounsellor = actorFor(await makeUser("COUNSELLOR", firstId));
  otherCounsellor = actorFor(await makeUser("COUNSELLOR", secondId));
  otherClinician = actorFor(await makeUser("CLINICIAN", secondId));

  const student = await makeUser("STUDENT", firstId);
  studentId = student.id;
  await grantConsent(student.id, firstId, ["CORE_PROCESSING", "CARE_TEAM_REVIEW"]);
  caseId = (await requestHelp(actorFor(student), { type: "URGENT_SUPPORT" })).caseId;
  alertId = (await t.db.alert.findFirstOrThrow({ where: { studentId } })).id;
});
afterAll(async () => {
  setClock(null);
  await t.close();
});
beforeEach(() => setClock(TEST_START));
afterEach(() => setClock(null));

describe("tenant isolation", () => {
  it("a counsellor of another institution gets NOT_FOUND for the alert", async () => {
    await expectDomainError(getAlertDetail(otherCounsellor, alertId), "NOT_FOUND");
    await expectDomainError(acknowledgeAlert(otherCounsellor, alertId), "NOT_FOUND");
    await expectDomainError(reviewAlert(otherCounsellor, alertId, { decision: "OUTREACH", feedback: null, note: "Reaching out to the student today." }), "NOT_FOUND");
    await expectDomainError(closeAlert(otherClinician, alertId), "NOT_FOUND");
    const alert = await t.db.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(alert.status).toBe("NEW");
  });

  it("a counsellor of another institution gets NOT_FOUND for the case", async () => {
    await expectDomainError(getCaseDetail(otherCounsellor, caseId), "NOT_FOUND");
    await expectDomainError(addCaseNote(otherCounsellor, caseId, "This should never be stored."), "NOT_FOUND");
    await expectDomainError(closeCase(otherCounsellor, caseId), "NOT_FOUND");
    expect(await t.db.caseEvent.count({ where: { caseId, actorId: otherCounsellor.userId } })).toBe(0);
  });

  it("a counsellor of another institution gets NOT_FOUND for the student", async () => {
    await expectDomainError(studentInTenant(t.db, otherCounsellor, studentId), "NOT_FOUND");
  });

  it("the same records are found by the student's own care team", async () => {
    const detail = await getAlertDetail(ownCounsellor, alertId);
    expect(detail.id).toBe(alertId);
    expect((await getCaseDetail(ownCounsellor, caseId)).id).toBe(caseId);
    expect((await studentInTenant(t.db, ownCounsellor, studentId)).id).toBe(studentId);
  });

  it("refused cross-tenant attempts leave nothing in the other institution's audit chain", async () => {
    expect(await t.db.auditLog.count({ where: { chain: secondId } })).toBe(0);
  });
});

describe("audit log", () => {
  it("rejects UPDATE and DELETE at the database", async () => {
    const before = await t.db.auditLog.count({ where: { chain: firstId } });
    expect(before).toBeGreaterThan(0);
    await expect(t.db.auditLog.updateMany({ where: { chain: firstId }, data: { action: "tampered" } })).rejects.toThrow();
    await expect(t.db.auditLog.deleteMany({ where: { chain: firstId } })).rejects.toThrow();
    await expect(t.pg.query(`UPDATE "AuditLog" SET "action" = 'tampered' WHERE "chain" = $1`, [firstId])).rejects.toThrow(/append-only/);
    await expect(t.pg.query(`DELETE FROM "AuditLog" WHERE "chain" = $1`, [firstId])).rejects.toThrow(/append-only/);
    expect(await t.db.auditLog.count({ where: { chain: firstId } })).toBe(before);
    expect(await t.db.auditLog.count({ where: { action: "tampered" } })).toBe(0);
  });

  it("verifyAuditChain passes on real entries", async () => {
    const result = await verifyAuditChain(t.db, firstId);
    expect(result.ok).toBe(true);
    expect(result.brokenAtSeq).toBeNull();
    expect(result.checked).toBe(await t.db.auditLog.count({ where: { chain: firstId } }));
    expect(result.checked).toBeGreaterThanOrEqual(3);
  });

  it("audit metadata holds ids and codes, never typed text", async () => {
    const rows = await t.db.auditLog.findMany({ where: { chain: firstId } });
    for (const r of rows) {
      for (const v of Object.values((r.metadata ?? {}) as Record<string, unknown>)) {
        expect(["string", "number", "boolean"].includes(typeof v) || v === null).toBe(true);
        if (typeof v === "string") expect(v.length).toBeLessThan(80);
      }
    }
  });
});
